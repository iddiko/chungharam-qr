-- ============================================
-- 013_commission_system.sql
-- 수수료(Commission) 분배 시스템
-- ============================================

-- ============================================
-- 1. 수수료 설정 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS public.commission_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_type TEXT NOT NULL CHECK (org_type IN ('super_admin', 'hq', 'branch', 'sub_branch', 'office', 'employee')),
  commission_type TEXT NOT NULL CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value NUMERIC NOT NULL CHECK (commission_value >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,

  -- 각 조직 타입별 하나의 활성 설정만 허용
  CONSTRAINT unique_active_org_type UNIQUE (org_type, is_active)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_commission_settings_org_type ON public.commission_settings(org_type);
CREATE INDEX IF NOT EXISTS idx_commission_settings_active ON public.commission_settings(is_active);

-- RLS 활성화
ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;

-- RLS 정책
CREATE POLICY "Super admin and HQ can manage commission settings" ON public.commission_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email()
      AND u.role IN ('super_admin', 'hq')
    )
  );

CREATE POLICY "All authenticated users can view commission settings" ON public.commission_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- 2. 수수료 지급 기록 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS public.commission_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID REFERENCES public.qr_codes(id) ON DELETE SET NULL ON UPDATE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  org_type TEXT NOT NULL,
  commission_type TEXT NOT NULL CHECK (commission_type IN ('percentage', 'fixed')),
  commission_rate NUMERIC NOT NULL,
  sale_amount NUMERIC NOT NULL DEFAULT 0,
  commission_amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'CANCELLED')),
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_commission_records_qr_id ON public.commission_records(qr_id);
CREATE INDEX IF NOT EXISTS idx_commission_records_org_id ON public.commission_records(org_id);
CREATE INDEX IF NOT EXISTS idx_commission_records_status ON public.commission_records(status);
CREATE INDEX IF NOT EXISTS idx_commission_records_created_at ON public.commission_records(created_at);

-- RLS 활성화
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;

-- RLS 정책
CREATE POLICY "Super admin can do anything on commission_records" ON public.commission_records
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY "HQ can view all commission_records" ON public.commission_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email()
      AND u.role IN ('hq', 'super_admin')
    )
  );

CREATE POLICY "Users can view own org commission_records" ON public.commission_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email()
      AND u.org_id = public.commission_records.org_id
    )
  );

-- ============================================
-- 3. 기본 수수료 설정 (시드 데이터)
-- ============================================
INSERT INTO public.commission_settings (org_type, commission_type, commission_value, is_active) VALUES
  ('hq', 'percentage', 10.0, true),
  ('branch', 'percentage', 8.0, true),
  ('sub_branch', 'percentage', 7.0, true),
  ('office', 'percentage', 5.0, true),
  ('employee', 'percentage', 3.0, true)
ON CONFLICT (org_type, is_active) DO NOTHING;

-- ============================================
-- 4. 수수료 설정 조회 RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.get_commission_settings(p_user_email text)
RETURNS TABLE (
  id uuid,
  org_type text,
  commission_type text,
  commission_value numeric,
  is_active boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT u.role INTO v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '수수료 설정 조회 권한이 없습니다.';
  END IF;

  RETURN QUERY
  SELECT cs.id, cs.org_type, cs.commission_type, cs.commission_value, cs.is_active, cs.updated_at
  FROM public.commission_settings cs
  WHERE cs.is_active = true
  ORDER BY
    CASE cs.org_type
      WHEN 'hq' THEN 1
      WHEN 'branch' THEN 2
      WHEN 'sub_branch' THEN 3
      WHEN 'office' THEN 4
      WHEN 'employee' THEN 5
      ELSE 6
    END;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_commission_settings(text) TO authenticated;

-- ============================================
-- 5. 수수료 설정 업데이트 RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.update_commission_setting(
  p_user_email text,
  p_org_type text,
  p_commission_type text,
  p_commission_value numeric
)
RETURNS TABLE (result text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_user_id uuid;
BEGIN
  SELECT u.id, u.role INTO v_user_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '수수료 설정 변경 권한이 없습니다.';
  END IF;

  UPDATE public.commission_settings
  SET commission_type = p_commission_type,
      commission_value = p_commission_value,
      updated_at = NOW(),
      updated_by = v_user_id
  WHERE org_type = p_org_type AND is_active = true;

  IF NOT FOUND THEN
    INSERT INTO public.commission_settings (org_type, commission_type, commission_value, is_active, updated_by)
    VALUES (p_org_type, p_commission_type, p_commission_value, true, v_user_id);
  END IF;

  result := 'UPDATED';
  RETURN NEXT;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_commission_setting(text, text, text, numeric) TO authenticated;

-- ============================================
-- 6. 수수료 분배 계산 RPC (QR 설치 완료 시 호출)
--    6단계 계층에 따라 수수료를 자동 분배
-- ============================================
CREATE OR REPLACE FUNCTION public.distribute_commission(
  p_user_email text,
  p_qr_id uuid,
  p_sale_amount numeric
)
RETURNS TABLE (
  org_id uuid,
  org_name text,
  org_type text,
  commission_type text,
  commission_rate numeric,
  commission_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_qr_org_id uuid;
  v_current_org_id uuid;
  v_current_org_type text;
  v_current_org_name text;
  v_comm_type text;
  v_comm_value numeric;
  v_comm_amount numeric;
  v_total_distributed numeric := 0;
BEGIN
  -- 1. 권한 확인
  SELECT u.role INTO v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '수수료 분배 권한이 없습니다.';
  END IF;

  -- 2. QR 소유 조직 조회
  SELECT q.owner_org_id INTO v_qr_org_id
  FROM public.qr_codes q WHERE q.id = p_qr_id;

  IF v_qr_org_id IS NULL THEN
    RAISE EXCEPTION 'QR 코드를 찾을 수 없습니다.';
  END IF;

  -- 3. QR 소유 조직에서부터 상위로 올라가며 분배
  v_current_org_id := v_qr_org_id;

  WHILE v_current_org_id IS NOT NULL LOOP
    -- 조직 정보 조회
    SELECT o.type, o.name, o.parent_id
    INTO v_current_org_type, v_current_org_name, v_current_org_id
    FROM public.organizations o
    WHERE o.id = v_current_org_id;

    -- 조직 타입에 해당하는 수수료 설정 조회
    SELECT cs.commission_type, cs.commission_value
    INTO v_comm_type, v_comm_value
    FROM public.commission_settings cs
    WHERE cs.org_type = v_current_org_type AND cs.is_active = true
    LIMIT 1;

    IF v_comm_type IS NOT NULL THEN
      -- 수수료 계산
      IF v_comm_type = 'percentage' THEN
        v_comm_amount := p_sale_amount * v_comm_value / 100.0;
      ELSE
        v_comm_amount := v_comm_value;
      END IF;

      -- 수수료 기록 생성
      INSERT INTO public.commission_records (
        qr_id, org_id, org_type, commission_type, commission_rate,
        sale_amount, commission_amount, status
      ) VALUES (
        p_qr_id, v_current_org_id, v_current_org_type, v_comm_type, v_comm_value,
        p_sale_amount, v_comm_amount, 'PENDING'
      );

      -- 결과 반환
      org_id := v_current_org_id;
      org_name := v_current_org_name;
      org_type := v_current_org_type;
      commission_type := v_comm_type;
      commission_rate := v_comm_value;
      commission_amount := v_comm_amount;
      RETURN NEXT;

      v_total_distributed := v_total_distributed + v_comm_amount;
    END IF;

    -- 상위 조직으로 이동 (parent_id가 v_current_org_id에 이미 할당됨)
    EXIT WHEN v_current_org_id IS NULL;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.distribute_commission(text, uuid, numeric) TO authenticated;

-- ============================================
-- 7. 수수료 지급 기록 조회 RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.get_commission_records(p_user_email text)
RETURNS TABLE (
  id uuid,
  qr_uuid text,
  product_name text,
  org_name text,
  org_type text,
  commission_type text,
  commission_rate numeric,
  sale_amount numeric,
  commission_amount numeric,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_org_id uuid;
BEGIN
  SELECT u.role, u.org_id INTO v_role, v_org_id
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT cr.id, q.uuid, q.product_name, o.name, cr.org_type,
           cr.commission_type, cr.commission_rate, cr.sale_amount,
           cr.commission_amount, cr.status, cr.created_at
    FROM public.commission_records cr
    LEFT JOIN public.qr_codes q ON q.id = cr.qr_id
    LEFT JOIN public.organizations o ON o.id = cr.org_id
    ORDER BY cr.created_at DESC LIMIT 200;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    RETURN QUERY
    SELECT cr.id, q.uuid, q.product_name, o.name, cr.org_type,
           cr.commission_type, cr.commission_rate, cr.sale_amount,
           cr.commission_amount, cr.status, cr.created_at
    FROM public.commission_records cr
    LEFT JOIN public.qr_codes q ON q.id = cr.qr_id
    LEFT JOIN public.organizations o ON o.id = cr.org_id
    WHERE cr.org_id IN (
      SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
      UNION SELECT v_org_id
    )
    ORDER BY cr.created_at DESC LIMIT 200;
  ELSE
    RETURN QUERY
    SELECT cr.id, q.uuid, q.product_name, o.name, cr.org_type,
           cr.commission_type, cr.commission_rate, cr.sale_amount,
           cr.commission_amount, cr.status, cr.created_at
    FROM public.commission_records cr
    LEFT JOIN public.qr_codes q ON q.id = cr.qr_id
    LEFT JOIN public.organizations o ON o.id = cr.org_id
    WHERE cr.org_id = v_org_id
    ORDER BY cr.created_at DESC LIMIT 100;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_commission_records(text) TO authenticated;
