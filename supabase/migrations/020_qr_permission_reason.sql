
-- ============================================
-- 020: QR 권한 및 사유 시스템 업데이트
-- ============================================

-- 1. qr_codes 테이블에 reason 컬럼 추가
ALTER TABLE public.qr_codes ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT NULL;
ALTER TABLE public.qr_codes ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. create_qr_codes RPC 함수 업데이트
-- 권한 변경: branch/sub_branch QR 생성 불가, employee 사유 필수
DROP FUNCTION IF EXISTS public.create_qr_codes(text, text, text, integer);

CREATE OR REPLACE FUNCTION public.create_qr_codes(
  p_user_email text,
  p_product_name text,
  p_parent_qr_uuid text DEFAULT NULL,
  p_quantity integer DEFAULT 1,
  p_reason text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL
)
RETURNS TABLE (
  qr_id uuid, qr_uuid text, qr_product_name text,
  qr_parent_qr_id uuid, qr_owner_org_id uuid, qr_status text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid; v_org_id uuid; v_role text; v_org_name text;
  v_parent_qr_id uuid; v_parent_owner_org_id uuid;
  v_can_create_top_level boolean; v_can_create_child boolean; v_max_child_count integer;
  v_new_uuid text; v_new_qr_id uuid;
BEGIN
  -- 사용자 정보 조회
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.'; END IF;

  -- 역할별 권한 설정
  IF v_role IN ('super_admin', 'hq') THEN
    v_can_create_top_level := true; v_can_create_child := true; v_max_child_count := NULL;
  ELSIF v_role IN ('branch', 'sub_branch', 'office', 'employee') THEN
    -- 지사/지점/영업점/영업사원은 QR 생성 불가
    RAISE EXCEPTION 'QR 생성 권한이 없습니다.';
  ELSE RAISE EXCEPTION 'QR 생성 권한이 없습니다.';
  END IF;

  -- 부모 QR 처리
  IF p_parent_qr_uuid IS NOT NULL AND p_parent_qr_uuid != '' THEN
    IF NOT v_can_create_child THEN RAISE EXCEPTION '자식 QR 생성 권한이 없습니다.'; END IF;
    SELECT q.id, q.owner_org_id INTO v_parent_qr_id, v_parent_owner_org_id
    FROM public.qr_codes q WHERE q.uuid = p_parent_qr_uuid LIMIT 1;
    IF v_parent_qr_id IS NULL THEN RAISE EXCEPTION '부모 QR을 찾을 수 없습니다.'; END IF;
    IF v_parent_owner_org_id != v_org_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = v_parent_owner_org_id AND o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
      ) THEN RAISE EXCEPTION '부모 QR의 소유권이 없습니다.'; END IF;
    END IF;
  ELSE
    -- 부모 QR 없이 생성 = 최상위 QR (본사/슈퍼관리자만)
    IF NOT v_can_create_top_level THEN RAISE EXCEPTION '최상위 QR 생성 권한이 없습니다. 부모 QR을 선택해주세요.'; END IF;
  END IF;

  -- 수량 제한 검증
  IF v_max_child_count IS NOT NULL AND p_quantity > v_max_child_count THEN
    RAISE EXCEPTION '생성 수량 제한을 초과했습니다. 최대 %개까지 생성 가능합니다.', v_max_child_count;
  END IF;

  -- 조직명 조회
  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
  v_org_name := COALESCE(v_org_name, '');

  -- QR 코드 생성
  FOR i IN 1..p_quantity LOOP
    v_new_uuid := 'QR-' || extract(epoch from now())::text || '-' || substr(md5(random()::text), 1, 9);
    INSERT INTO public.qr_codes (uuid, product_name, parent_qr_id, owner_org_id, status, reason, product_id)
    VALUES (v_new_uuid, p_product_name, v_parent_qr_id, v_org_id, 'ACTIVE', p_reason, p_product_id)
    RETURNING id INTO v_new_qr_id;

    -- 타임라인 기록 (사유가 있으면 포함)
    INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
    VALUES (v_new_qr_id,
      CASE WHEN p_reason IS NOT NULL AND trim(p_reason) != ''
        THEN 'QR 생성 (사유: ' || p_reason || ')'
        ELSE 'QR 생성'
      END,
      v_user_id, v_org_name
    );

    qr_id := v_new_qr_id; qr_uuid := v_new_uuid; qr_product_name := p_product_name;
    qr_parent_qr_id := v_parent_qr_id; qr_owner_org_id := v_org_id; qr_status := 'ACTIVE';
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_qr_codes(text, text, text, integer, text, uuid) TO authenticated;
