-- ============================================
-- QR 이동 관리 RPC 함수 (RLS 우회)
-- 스캔 기반 이동 요청/승인 워크플로우
-- ============================================

-- 기존 함수 삭제
DROP FUNCTION IF EXISTS public.request_qr_transfer(text, text, uuid);
DROP FUNCTION IF EXISTS public.approve_qr_transfer(text, uuid, boolean);
DROP FUNCTION IF EXISTS public.receive_qr_transfer(text, uuid);
DROP FUNCTION IF EXISTS public.get_transfer_requests(text);
DROP FUNCTION IF EXISTS public.get_qr_all_list(text);

-- QR 전체 목록 조회 (자식 QR 포함)
CREATE OR REPLACE FUNCTION public.get_qr_all_list(p_user_email text)
RETURNS TABLE (
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  qr_status text,
  qr_parent_qr_id uuid,
  qr_owner_org_id uuid,
  org_name text
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
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    ORDER BY q.created_at DESC LIMIT 200;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.owner_org_id IN (
      SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
      UNION SELECT v_org_id
    )
    ORDER BY q.created_at DESC LIMIT 200;
  ELSE
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.owner_org_id = v_org_id
    ORDER BY q.created_at DESC LIMIT 200;
  END IF;

  RETURN;
END;
$$;

-- 스캔 기반 QR 이동 요청
-- 지사 소속 사용자가 본사 QR을 스캔하면 이동 요청 생성 + QR 비활성화
CREATE OR REPLACE FUNCTION public.request_qr_transfer(
  p_user_email text,
  p_qr_uuid text,
  p_to_org_id uuid
)
RETURNS TABLE (
  request_id uuid,
  qr_uuid text,
  qr_product_name text,
  from_org_name text,
  to_org_name text,
  request_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_qr_id uuid;
  v_qr_org_id uuid;
  v_qr_status text;
  v_qr_product_name text;
  v_from_org_name text;
  v_to_org_name text;
  v_existing_id uuid;
  v_new_request_id uuid;
BEGIN
  -- 1. 사용자 정보
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  -- 2. QR 코드 조회
  SELECT q.id, q.owner_org_id, q.status, q.product_name
  INTO v_qr_id, v_qr_org_id, v_qr_status, v_qr_product_name
  FROM public.qr_codes q WHERE q.uuid = p_qr_uuid LIMIT 1;

  IF v_qr_id IS NULL THEN
    RAISE EXCEPTION 'QR 코드를 찾을 수 없습니다.';
  END IF;

  -- 3. QR 상태 확인 (ACTIVE만 이동 가능)
  IF v_qr_status != 'ACTIVE' THEN
    RAISE EXCEPTION '이동 요청할 수 없는 QR 상태입니다. 현재 상태: %', v_qr_status;
  END IF;

  -- 4. 자기 조직의 QR은 이동 불가
  IF v_qr_org_id = p_to_org_id THEN
    RAISE EXCEPTION '자기 조직의 QR은 이동할 수 없습니다.';
  END IF;

  -- 5. 이미 진행 중인 요청 확인
  SELECT id INTO v_existing_id
  FROM public.qr_transfer_requests
  WHERE qr_id = v_qr_id AND status = 'PENDING'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION '이미 진행 중인 이동 요청이 있습니다.';
  END IF;

  -- 6. 조직명 조회
  SELECT o.name INTO v_from_org_name
  FROM public.organizations o WHERE o.id = v_qr_org_id LIMIT 1;
  SELECT o.name INTO v_to_org_name
  FROM public.organizations o WHERE o.id = p_to_org_id LIMIT 1;

  -- 7. 이동 요청 생성
  INSERT INTO public.qr_transfer_requests (qr_id, from_org_id, to_org_id, status, requested_by)
  VALUES (v_qr_id, v_qr_org_id, p_to_org_id, 'PENDING', v_user_id)
  RETURNING id INTO v_new_request_id;

  -- 8. QR 상태를 PENDING(비활성)으로 변경
  UPDATE public.qr_codes SET status = 'PENDING' WHERE id = v_qr_id;

  -- 9. 타임라인 기록
  INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
  VALUES (v_qr_id, '이동 요청 (비활성)', v_user_id, COALESCE(v_from_org_name, ''));

  -- 10. 결과 반환
  request_id := v_new_request_id;
  qr_uuid := p_qr_uuid;
  qr_product_name := v_qr_product_name;
  from_org_name := COALESCE(v_from_org_name, '');
  to_org_name := COALESCE(v_to_org_name, '');
  request_status := 'PENDING';
  RETURN NEXT;

  RETURN;
END;
$$;

-- QR 이동 승인/거절
-- 본사에서 승인: QR의 owner_org_id를 받는 조직으로 변경, 상태를 RECEIVED로
-- 본사에서 거절: QR 상태를 다시 ACTIVE로 복구
CREATE OR REPLACE FUNCTION public.approve_qr_transfer(
  p_user_email text,
  p_request_id uuid,
  p_approve boolean
)
RETURNS TABLE (
  request_id uuid,
  qr_uuid text,
  qr_product_name text,
  result_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_from_org_id uuid;
  v_to_org_id uuid;
  v_qr_id uuid;
  v_qr_uuid text;
  v_qr_product_name text;
  v_request_status text;
  v_org_name text;
BEGIN
  -- 1. 사용자 정보
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  -- 2. 이동 요청 조회
  SELECT t.from_org_id, t.to_org_id, t.qr_id, t.status
  INTO v_from_org_id, v_to_org_id, v_qr_id, v_request_status
  FROM public.qr_transfer_requests t WHERE t.id = p_request_id LIMIT 1;

  IF v_qr_id IS NULL THEN
    RAISE EXCEPTION '이동 요청을 찾을 수 없습니다.';
  END IF;

  IF v_request_status != 'PENDING' THEN
    RAISE EXCEPTION '이미 처리된 요청입니다.';
  END IF;

  -- 3. 권한 확인: 보낸 조직(본사)만 승인/거절 가능
  IF v_from_org_id != v_org_id AND v_role != 'super_admin' THEN
    RAISE EXCEPTION '승인/거절 권한이 없습니다.';
  END IF;

  -- 4. QR 정보 조회
  SELECT q.uuid, q.product_name INTO v_qr_uuid, v_qr_product_name
  FROM public.qr_codes q WHERE q.id = v_qr_id LIMIT 1;

  -- 5. 조직명
  SELECT o.name INTO v_org_name
  FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;

  IF p_approve THEN
    -- 승인: QR 소유권 이전 + 상태 RECEIVED
    UPDATE public.qr_codes
    SET owner_org_id = v_to_org_id, status = 'RECEIVED'
    WHERE id = v_qr_id;

    -- 이동 요청 상태 변경
    UPDATE public.qr_transfer_requests
    SET status = 'APPROVED', approved_at = NOW(), approved_by = v_user_id
    WHERE id = p_request_id;

    -- 타임라인
    INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
    VALUES (v_qr_id, '이동 승인 (소유권 이전)', v_user_id, COALESCE(v_org_name, ''));

    request_id := p_request_id;
    qr_uuid := v_qr_uuid;
    qr_product_name := v_qr_product_name;
    result_status := 'APPROVED';
  ELSE
    -- 거절: QR 상태 ACTIVE로 복구
    UPDATE public.qr_codes SET status = 'ACTIVE' WHERE id = v_qr_id;

    UPDATE public.qr_transfer_requests
    SET status = 'REJECTED', approved_at = NOW(), approved_by = v_user_id
    WHERE id = p_request_id;

    INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
    VALUES (v_qr_id, '이동 거절 (활성 복구)', v_user_id, COALESCE(v_org_name, ''));

    request_id := p_request_id;
    qr_uuid := v_qr_uuid;
    qr_product_name := v_qr_product_name;
    result_status := 'REJECTED';
  END IF;

  RETURN NEXT;
  RETURN;
END;
$$;

-- QR 수령 확인
-- 받는 조직에서 수령 확인 시 QR 상태 ACTIVE로 변경
CREATE OR REPLACE FUNCTION public.receive_qr_transfer(
  p_user_email text,
  p_request_id uuid
)
RETURNS TABLE (
  request_id uuid,
  qr_uuid text,
  qr_product_name text,
  result_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_to_org_id uuid;
  v_qr_id uuid;
  v_qr_uuid text;
  v_qr_product_name text;
  v_request_status text;
  v_org_name text;
BEGIN
  -- 1. 사용자 정보
  SELECT u.id, u.org_id INTO v_user_id, v_org_id
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  -- 2. 이동 요청 조회
  SELECT t.to_org_id, t.qr_id, t.status
  INTO v_to_org_id, v_qr_id, v_request_status
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
  FROM public.qr_codes q WHERE q.id = v_qr_id LIMIT 1;

  -- 5. QR 상태를 ACTIVE로 변경 (수령 완료)
  UPDATE public.qr_codes SET status = 'ACTIVE' WHERE id = v_qr_id;

  -- 6. 이동 요청 상태 변경
  UPDATE public.qr_transfer_requests
  SET status = 'RECEIVED'
  WHERE id = p_request_id;

  -- 7. 조직명
  SELECT o.name INTO v_org_name
  FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;

  -- 8. 타임라인
  INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
  VALUES (v_qr_id, '수령 확인 (활성)', v_user_id, COALESCE(v_org_name, ''));

  request_id := p_request_id;
  qr_uuid := v_qr_uuid;
  qr_product_name := v_qr_product_name;
  result_status := 'RECEIVED';
  RETURN NEXT;
  RETURN;
END;
$$;

-- 이동 요청 목록 조회
CREATE OR REPLACE FUNCTION public.get_transfer_requests(p_user_email text)
RETURNS TABLE (
  request_id uuid,
  qr_uuid text,
  qr_product_name text,
  from_org_name text,
  to_org_name text,
  request_status text,
  requested_at timestamptz,
  approved_at timestamptz
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
    SELECT t.id, q.uuid, q.product_name,
           fo.name, too.name, t.status, t.requested_at, t.approved_at
    FROM public.qr_transfer_requests t
    JOIN public.qr_codes q ON q.id = t.qr_id
    JOIN public.organizations fo ON fo.id = t.from_org_id
    JOIN public.organizations too ON too.id = t.to_org_id
    ORDER BY t.requested_at DESC LIMIT 100;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    RETURN QUERY
    SELECT t.id, q.uuid, q.product_name,
           fo.name, too.name, t.status, t.requested_at, t.approved_at
    FROM public.qr_transfer_requests t
    JOIN public.qr_codes q ON q.id = t.qr_id
    JOIN public.organizations fo ON fo.id = t.from_org_id
    JOIN public.organizations too ON too.id = t.to_org_id
    WHERE t.from_org_id = v_org_id
       OR t.to_org_id IN (
         SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
         UNION SELECT v_org_id
       )
    ORDER BY t.requested_at DESC LIMIT 100;
  ELSE
    RETURN QUERY
    SELECT t.id, q.uuid, q.product_name,
           fo.name, too.name, t.status, t.requested_at, t.approved_at
    FROM public.qr_transfer_requests t
    JOIN public.qr_codes q ON q.id = t.qr_id
    JOIN public.organizations fo ON fo.id = t.from_org_id
    JOIN public.organizations too ON too.id = t.to_org_id
    WHERE t.to_org_id = v_org_id
       OR t.from_org_id = v_org_id
    ORDER BY t.requested_at DESC LIMIT 100;
  END IF;

  RETURN;
END;
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION public.get_qr_all_list(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qr_all_list(text) TO anon;
GRANT EXECUTE ON FUNCTION public.request_qr_transfer(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_qr_transfer(text, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_qr_transfer(text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_qr_transfer(text, uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.receive_qr_transfer(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_qr_transfer(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_transfer_requests(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transfer_requests(text) TO anon;
