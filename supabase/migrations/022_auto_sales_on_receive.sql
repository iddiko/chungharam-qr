
-- ============================================
-- 022: 수령 확인 시 자동 매출/입고/수수료 처리
-- ============================================

-- ============================================
-- 1. 입고 기록 테이블 (inventory_records)
-- ============================================
CREATE TABLE IF NOT EXISTS public.inventory_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES public.qr_codes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('INBOUND', 'OUTBOUND')),
  quantity INTEGER NOT NULL DEFAULT 1,
  from_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL ON UPDATE CASCADE,
  to_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL ON UPDATE CASCADE,
  transfer_request_id UUID REFERENCES public.qr_transfer_requests(id) ON DELETE SET NULL ON UPDATE CASCADE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_records_qr_id ON public.inventory_records(qr_id);
CREATE INDEX IF NOT EXISTS idx_inventory_records_org_id ON public.inventory_records(org_id);
CREATE INDEX IF NOT EXISTS idx_inventory_records_type ON public.inventory_records(record_type);
CREATE INDEX IF NOT EXISTS idx_inventory_records_created_at ON public.inventory_records(created_at);

ALTER TABLE public.inventory_records ENABLE ROW LEVEL SECURITY;

-- RLS: 인증된 사용자는 자기 조직 + 하위 조직의 입출고 기록 조회 가능
CREATE POLICY "Authenticated users can view inventory_records" ON public.inventory_records
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );

CREATE POLICY "Service role full access inventory_records" ON public.inventory_records
  FOR ALL USING (
    true
  );

-- ============================================
-- 2. sales 테이블에 sale_type 컬럼 추가 (매출 구분)
-- ============================================
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'MANUAL'
  CHECK (sale_type IN ('MANUAL', 'TRANSFER', 'INSTALLATION'));

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS transfer_request_id UUID
  REFERENCES public.qr_transfer_requests(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- 3. receive_qr_transfer RPC 재작성
--    수령 확인 시:
--    - 받는 쪽: 입고 기록 + QR 활성화(재고)
--    - 보내는 쪽: 매출 기록 + 수수료 자동 분배
-- ============================================
DROP FUNCTION IF EXISTS public.receive_qr_transfer(text, uuid);

CREATE OR REPLACE FUNCTION public.receive_qr_transfer(
  p_user_email text,
  p_request_id uuid
)
RETURNS TABLE (
  request_id uuid,
  qr_uuid text,
  qr_product_name text,
  result_status text,
  sale_id uuid,
  inbound_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_to_org_id uuid;
  v_from_org_id uuid;
  v_qr_id uuid;
  v_qr_uuid text;
  v_qr_product_name text;
  v_request_status text;
  v_org_name text;
  v_from_org_name text;
  v_new_sale_id uuid;
  v_new_inbound_id uuid;
  v_sale_amount numeric;
  v_current_org_id uuid;
  v_current_org_type text;
  v_current_org_name text;
  v_current_parent_id uuid;
  v_comm_type text;
  v_comm_value numeric;
  v_comm_amount numeric;
BEGIN
  -- 1. 사용자 정보
  SELECT u.id, u.org_id INTO v_user_id, v_org_id
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  -- 2. 이동 요청 조회
  SELECT t.to_org_id, t.from_org_id, t.qr_id, t.status
  INTO v_to_org_id, v_from_org_id, v_qr_id, v_request_status
  FROM public.qr_transfer_requests t WHERE t.id = p_request_id LIMIT 1;

  IF v_qr_id IS NULL THEN
    RAISE EXCEPTION '이동 요청을 찾을 수 없습니다.';
  END IF;

  IF v_request_status != 'APPROVED' THEN
    RAISE EXCEPTION '승인된 요청만 수령 확인이 가능합니다.';
  END IF;

  -- 3. 권한: 받는 조직만 수령 확인
  IF v_to_org_id != v_org_id THEN
    RAISE EXCEPTION '수령 확인 권한이 없습니다.';
  END IF;

  -- 4. QR 정보
  SELECT q.uuid, q.product_name INTO v_qr_uuid, v_qr_product_name
  FROM public.qr_codes q WHERE q.id = v_qr_id;

  -- 5. 조직명
  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
  SELECT o.name INTO v_from_org_name FROM public.organizations o WHERE o.id = v_from_org_id LIMIT 1;

  -- ============================================
  -- 6. 받는 쪽: 입고 기록 생성
  -- ============================================
  INSERT INTO public.inventory_records (qr_id, org_id, record_type, quantity, from_org_id, to_org_id, transfer_request_id, notes, created_by)
  VALUES (v_qr_id, v_to_org_id, 'INBOUND', 1, v_from_org_id, v_to_org_id, p_request_id,
    '이동 수령: ' || COALESCE(v_from_org_name, '') || ' → ' || COALESCE(v_org_name, ''), v_user_id)
  RETURNING id INTO v_new_inbound_id;

  -- ============================================
  -- 7. 보내는 쪽: 출고 기록 생성
  -- ============================================
  INSERT INTO public.inventory_records (qr_id, org_id, record_type, quantity, from_org_id, to_org_id, transfer_request_id, notes, created_by)
  VALUES (v_qr_id, v_from_org_id, 'OUTBOUND', 1, v_from_org_id, v_to_org_id, p_request_id,
    '이동 출고: ' || COALESCE(v_from_org_name, '') || ' → ' || COALESCE(v_org_name, ''), v_user_id);

  -- ============================================
  -- 8. 보내는 쪽: 매출 기록 생성 (이동 매출)
  --    기본 단가는 0, 나중에 관리자가 수정 가능
  -- ============================================
  INSERT INTO public.sales (org_id, qr_id, amount, sale_date, customer_name, notes, created_by, sale_type, transfer_request_id)
  VALUES (v_from_org_id, v_qr_id, 0, NOW(), COALESCE(v_org_name, ''),
    'QR 이동 매출: ' || COALESCE(v_qr_product_name, '') || ' → ' || COALESCE(v_org_name, ''),
    v_user_id, 'TRANSFER', p_request_id)
  RETURNING id INTO v_new_sale_id;

  -- ============================================
  -- 9. 수수료 자동 분배 (보낸 조직에서부터 상위로)
  --    매출 금액이 0이면 수수료도 0이지만 구조는 생성
  -- ============================================
  v_current_org_id := v_from_org_id;
  WHILE v_current_org_id IS NOT NULL LOOP
    SELECT o.type, o.name, o.parent_id INTO v_current_org_type, v_current_org_name, v_current_parent_id
    FROM public.organizations o WHERE o.id = v_current_org_id;

    SELECT cs.commission_type, cs.commission_value INTO v_comm_type, v_comm_value
    FROM public.commission_settings cs WHERE cs.org_type = v_current_org_type AND cs.is_active = true LIMIT 1;

    IF v_comm_type IS NOT NULL THEN
      IF v_comm_type = 'percentage' THEN v_comm_amount := 0 * v_comm_value / 100.0;
      ELSE v_comm_amount := 0; END IF;

      INSERT INTO public.commission_records (qr_id, org_id, org_type, commission_type, commission_rate, sale_amount, commission_amount, status)
      VALUES (v_qr_id, v_current_org_id, v_current_org_type, v_comm_type, v_comm_value, 0, v_comm_amount, 'PENDING')
      ON CONFLICT DO NOTHING;
    END IF;

    v_current_org_id := v_current_parent_id;
  END LOOP;

  -- ============================================
  -- 10. QR 상태를 ACTIVE로 변경 (수령 완료 = 재고 활성화)
  -- ============================================
  UPDATE public.qr_codes SET status = 'ACTIVE' WHERE id = v_qr_id;

  -- 11. 이동 요청 상태 변경
  UPDATE public.qr_transfer_requests
  SET status = 'RECEIVED'
  WHERE id = p_request_id;

  -- 12. 타임라인
  INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
  VALUES (v_qr_id, '수령 확인 (입고 완료, 재고 활성화)', v_user_id, COALESCE(v_org_name, ''));

  -- 13. 결과 반환
  request_id := p_request_id;
  qr_uuid := v_qr_uuid;
  qr_product_name := v_qr_product_name;
  result_status := 'RECEIVED';
  sale_id := v_new_sale_id;
  inbound_id := v_new_inbound_id;
  RETURN NEXT;
  RETURN;
END;
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION public.receive_qr_transfer(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_qr_transfer(text, uuid) TO anon;

-- ============================================
-- 4. 입고 기록 조회 RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.get_inventory_records(
  p_user_email text,
  p_record_type text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  org_id uuid,
  org_name text,
  record_type text,
  quantity integer,
  from_org_id uuid,
  from_org_name text,
  to_org_id uuid,
  to_org_name text,
  notes text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT ir.id, ir.qr_id, q.uuid, q.product_name,
      ir.org_id, o.name, ir.record_type, ir.quantity,
      ir.from_org_id, fo.name, ir.to_org_id, too.name,
      ir.notes, ir.created_at
    FROM public.inventory_records ir
    JOIN public.qr_codes q ON q.id = ir.qr_id
    LEFT JOIN public.organizations o ON o.id = ir.org_id
    LEFT JOIN public.organizations fo ON fo.id = ir.from_org_id
    LEFT JOIN public.organizations too ON too.id = ir.to_org_id
    WHERE (p_record_type IS NULL OR ir.record_type = p_record_type)
      AND (p_date_from IS NULL OR ir.created_at >= p_date_from)
      AND (p_date_to IS NULL OR ir.created_at <= p_date_to)
    ORDER BY ir.created_at DESC
    LIMIT 500;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
    RETURN QUERY
    SELECT ir.id, ir.qr_id, q.uuid, q.product_name,
      ir.org_id, o.name, ir.record_type, ir.quantity,
      ir.from_org_id, fo.name, ir.to_org_id, too.name,
      ir.notes, ir.created_at
    FROM public.inventory_records ir
    JOIN public.qr_codes q ON q.id = ir.qr_id
    LEFT JOIN public.organizations o ON o.id = ir.org_id
    LEFT JOIN public.organizations fo ON fo.id = ir.from_org_id
    LEFT JOIN public.organizations too ON too.id = ir.to_org_id
    WHERE ir.org_id IN (
      SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
      UNION SELECT v_org_id
    )
    AND (p_record_type IS NULL OR ir.record_type = p_record_type)
    AND (p_date_from IS NULL OR ir.created_at >= p_date_from)
    AND (p_date_to IS NULL OR ir.created_at <= p_date_to)
    ORDER BY ir.created_at DESC
    LIMIT 500;
  ELSE
    RETURN QUERY
    SELECT ir.id, ir.qr_id, q.uuid, q.product_name,
      ir.org_id, o.name, ir.record_type, ir.quantity,
      ir.from_org_id, fo.name, ir.to_org_id, too.name,
      ir.notes, ir.created_at
    FROM public.inventory_records ir
    JOIN public.qr_codes q ON q.id = ir.qr_id
    LEFT JOIN public.organizations o ON o.id = ir.org_id
    LEFT JOIN public.organizations fo ON fo.id = ir.from_org_id
    LEFT JOIN public.organizations too ON too.id = ir.to_org_id
    WHERE ir.org_id = v_org_id
    AND (p_record_type IS NULL OR ir.record_type = p_record_type)
    AND (p_date_from IS NULL OR ir.created_at >= p_date_from)
    AND (p_date_to IS NULL OR ir.created_at <= p_date_to)
    ORDER BY ir.created_at DESC
    LIMIT 500;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_records(text, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_records(text, text, timestamptz, timestamptz) TO anon;

-- ============================================
-- 5. 매출 조회 RPC에 sale_type 필드 추가
-- ============================================
DROP FUNCTION IF EXISTS public.get_sales_list(text);

CREATE OR REPLACE FUNCTION public.get_sales_list(
  p_user_email text,
  p_sale_type text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  org_name text,
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  amount numeric,
  sale_date timestamptz,
  customer_name text,
  notes text,
  sale_type text,
  transfer_request_id uuid,
  created_by uuid,
  creator_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT s.id, s.org_id, o.name, s.qr_id, q.uuid, q.product_name,
      s.amount, s.sale_date, s.customer_name, s.notes,
      s.sale_type, s.transfer_request_id, s.created_by,
      u2.name, s.created_at
    FROM public.sales s
    LEFT JOIN public.organizations o ON o.id = s.org_id
    LEFT JOIN public.qr_codes q ON q.id = s.qr_id
    LEFT JOIN public.users u2 ON u2.id = s.created_by
    WHERE (p_sale_type IS NULL OR s.sale_type = p_sale_type)
      AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
      AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
    ORDER BY s.created_at DESC
    LIMIT 500;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
    RETURN QUERY
    SELECT s.id, s.org_id, o.name, s.qr_id, q.uuid, q.product_name,
      s.amount, s.sale_date, s.customer_name, s.notes,
      s.sale_type, s.transfer_request_id, s.created_by,
      u2.name, s.created_at
    FROM public.sales s
    LEFT JOIN public.organizations o ON o.id = s.org_id
    LEFT JOIN public.qr_codes q ON q.id = s.qr_id
    LEFT JOIN public.users u2 ON u2.id = s.created_by
    WHERE s.org_id IN (
      SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
      UNION SELECT v_org_id
    )
    AND (p_sale_type IS NULL OR s.sale_type = p_sale_type)
    AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
    ORDER BY s.created_at DESC
    LIMIT 500;
  ELSE
    RETURN QUERY
    SELECT s.id, s.org_id, o.name, s.qr_id, q.uuid, q.product_name,
      s.amount, s.sale_date, s.customer_name, s.notes,
      s.sale_type, s.transfer_request_id, s.created_by,
      u2.name, s.created_at
    FROM public.sales s
    LEFT JOIN public.organizations o ON o.id = s.org_id
    LEFT JOIN public.qr_codes q ON q.id = s.qr_id
    LEFT JOIN public.users u2 ON u2.id = s.created_by
    WHERE s.org_id = v_org_id
    AND (p_sale_type IS NULL OR s.sale_type = p_sale_type)
    AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
    ORDER BY s.created_at DESC
    LIMIT 500;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_list(text, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_list(text, text, timestamptz, timestamptz) TO anon;
