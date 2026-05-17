-- ============================================
-- QR 생성 RPC 함수 (RLS 우회)
-- SECURITY DEFINER로 실행되므로 RLS 정책을 우회함
-- 권한 체크는 함수 내부에서 수행
-- ============================================

-- 기존 함수 삭제 (반환 타입 변경 시 필요)
DROP FUNCTION IF EXISTS public.create_qr_codes(text, text, text, integer);

-- QR 생성 RPC 함수
CREATE OR REPLACE FUNCTION public.create_qr_codes(
  p_user_email text,
  p_product_name text,
  p_parent_qr_uuid text DEFAULT NULL,
  p_quantity integer DEFAULT 1
)
RETURNS TABLE (
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  qr_parent_qr_id uuid,
  qr_owner_org_id uuid,
  qr_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_org_name text;
  v_parent_qr_id uuid;
  v_parent_owner_org_id uuid;
  v_can_create_top_level boolean;
  v_can_create_child boolean;
  v_max_child_count integer;
  v_new_uuid text;
  v_new_qr_id uuid;
BEGIN
  -- 1. 사용자 정보 조회
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u
  WHERE u.email = p_user_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  -- 2. 권한 설정
  -- super_admin, hq: 최상위 QR 생성 가능
  -- branch, sub_branch, office, employee: 자식 QR만 생성 가능
  IF v_role = 'super_admin' OR v_role = 'hq' THEN
    v_can_create_top_level := true;
    v_can_create_child := true;
    v_max_child_count := NULL; -- 무제한
  ELSIF v_role IN ('branch', 'sub_branch') THEN
    v_can_create_top_level := false;
    v_can_create_child := true;
    v_max_child_count := NULL; -- 무제한
  ELSIF v_role = 'office' THEN
    v_can_create_top_level := false;
    v_can_create_child := true;
    v_max_child_count := 50; -- 변경 가능
  ELSIF v_role = 'employee' THEN
    v_can_create_top_level := false;
    v_can_create_child := true;
    v_max_child_count := 10; -- 변경 가능
  ELSE
    RAISE EXCEPTION 'QR 생성 권한이 없습니다.';
  END IF;

  -- 3. 부모 QR 처리
  IF p_parent_qr_uuid IS NOT NULL AND p_parent_qr_uuid != '' THEN
    -- 자식 QR 생성 권한 확인
    IF NOT v_can_create_child THEN
      RAISE EXCEPTION '자식 QR 생성 권한이 없습니다.';
    END IF;

    -- 부모 QR 조회
    SELECT q.id, q.owner_org_id INTO v_parent_qr_id, v_parent_owner_org_id
    FROM public.qr_codes q
    WHERE q.uuid = p_parent_qr_uuid
    LIMIT 1;

    IF v_parent_qr_id IS NULL THEN
      RAISE EXCEPTION '부모 QR을 찾을 수 없습니다.';
    END IF;

    -- 부모 QR 소유권 확인 (자기 조직 또는 하위 조직)
    IF v_parent_owner_org_id != v_org_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = v_parent_owner_org_id
        AND o.parent_id = v_org_id
      ) AND NOT EXISTS (
        SELECT 1 FROM public.get_all_child_orgs(v_org_id) c
        WHERE c.org_id = v_parent_owner_org_id
      ) THEN
        RAISE EXCEPTION '부모 QR의 소유권이 없습니다.';
      END IF;
    END IF;
  ELSE
    -- 최상위 QR 생성 권한 확인
    IF NOT v_can_create_top_level THEN
      RAISE EXCEPTION '최상위 QR 생성 권한이 없습니다. 부모 QR을 선택해주세요.';
    END IF;
  END IF;

  -- 4. 수량 제한 확인
  IF v_max_child_count IS NOT NULL AND p_quantity > v_max_child_count THEN
    RAISE EXCEPTION '생성 수량 제한을 초과했습니다. 최대 %개까지 생성 가능합니다.', v_max_child_count;
  END IF;

  -- 5. 조직명 조회 (타임라인용)
  SELECT o.name INTO v_org_name
  FROM public.organizations o
  WHERE o.id = v_org_id
  LIMIT 1;

  v_org_name := COALESCE(v_org_name, '');

  -- 6. QR 코드 생성
  FOR i IN 1..p_quantity LOOP
    v_new_uuid := 'QR-' || extract(epoch from now())::text || '-' || substr(md5(random()::text), 1, 9);

    INSERT INTO public.qr_codes (uuid, product_name, parent_qr_id, owner_org_id, status)
    VALUES (v_new_uuid, p_product_name, v_parent_qr_id, v_org_id, 'ACTIVE')
    RETURNING id INTO v_new_qr_id;

    -- 타임라인 기록
    INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
    VALUES (v_new_qr_id, 'QR 생성', v_user_id, v_org_name);

    -- 결과 반환
    qr_id := v_new_qr_id;
    qr_uuid := v_new_uuid;
    qr_product_name := p_product_name;
    qr_parent_qr_id := v_parent_qr_id;
    qr_owner_org_id := v_org_id;
    qr_status := 'ACTIVE';
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.create_qr_codes(text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_qr_codes(text, text, text, integer) TO anon;
