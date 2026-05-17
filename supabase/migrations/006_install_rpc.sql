-- ============================================
-- 설치 관리 RPC 함수 (RLS 우회)
-- SECURITY DEFINER로 실행되므로 RLS 정책을 우회함
-- ============================================

-- 기존 함수 삭제
DROP FUNCTION IF EXISTS public.get_install_list(text);
DROP FUNCTION IF EXISTS public.create_installation(text, text, text, numeric, numeric);

-- 설치 목록 조회 RPC 함수
CREATE OR REPLACE FUNCTION public.get_install_list(p_user_email text)
RETURNS TABLE (
  install_id uuid,
  qr_uuid text,
  qr_product_name text,
  image_url text,
  latitude numeric,
  longitude numeric,
  installer_name text,
  installer_org_name text,
  installed_at timestamptz,
  qr_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
BEGIN
  -- 사용자 정보 조회
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u
  WHERE u.email = p_user_email
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- super_admin: 모든 설치 기록 조회
  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT i.id, q.uuid, q.product_name, i.image_url, i.latitude, i.longitude,
           u.name, o.name, i.installed_at, q.status
    FROM public.installations i
    JOIN public.qr_codes q ON q.id = i.qr_id
    JOIN public.users u ON u.id = i.installed_by
    JOIN public.organizations o ON o.id = u.org_id
    ORDER BY i.installed_at DESC
    LIMIT 100;

  -- hq, branch, sub_branch: 자기 조직 + 하위 조직의 설치 기록
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    RETURN QUERY
    SELECT i.id, q.uuid, q.product_name, i.image_url, i.latitude, i.longitude,
           u.name, o.name, i.installed_at, q.status
    FROM public.installations i
    JOIN public.qr_codes q ON q.id = i.qr_id
    JOIN public.users u ON u.id = i.installed_by
    JOIN public.organizations o ON o.id = u.org_id
    WHERE q.owner_org_id IN (
      SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
      UNION SELECT v_org_id
    )
    ORDER BY i.installed_at DESC
    LIMIT 100;

  -- office, employee: 자기 조직의 설치 기록만
  ELSE
    RETURN QUERY
    SELECT i.id, q.uuid, q.product_name, i.image_url, i.latitude, i.longitude,
           u.name, o.name, i.installed_at, q.status
    FROM public.installations i
    JOIN public.qr_codes q ON q.id = i.qr_id
    JOIN public.users u ON u.id = i.installed_by
    JOIN public.organizations o ON o.id = u.org_id
    WHERE q.owner_org_id = v_org_id
    ORDER BY i.installed_at DESC
    LIMIT 100;
  END IF;

  RETURN;
END;
$$;

-- 설치 등록 RPC 함수
CREATE OR REPLACE FUNCTION public.create_installation(
  p_user_email text,
  p_qr_uuid text,
  p_image_url text,
  p_latitude numeric,
  p_longitude numeric
)
RETURNS TABLE (
  install_id uuid,
  qr_uuid text,
  qr_product_name text,
  qr_status text
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
  v_org_name text;
  v_new_install_id uuid;
BEGIN
  -- 1. 사용자 정보 조회
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u
  WHERE u.email = p_user_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  -- 2. QR 코드 조회
  SELECT q.id, q.owner_org_id, q.status, q.product_name
  INTO v_qr_id, v_qr_org_id, v_qr_status, v_qr_product_name
  FROM public.qr_codes q
  WHERE q.uuid = p_qr_uuid
  LIMIT 1;

  IF v_qr_id IS NULL THEN
    RAISE EXCEPTION 'QR 코드를 찾을 수 없습니다.';
  END IF;

  -- 3. QR 상태 확인 (RECEIVED 상태만 설치 가능)
  IF v_qr_status != 'RECEIVED' THEN
    RAISE EXCEPTION '설치할 수 없는 QR 상태입니다. 현재 상태: %', v_qr_status;
  END IF;

  -- 4. 권한 확인
  -- super_admin: 모든 QR 설치 가능
  -- hq, branch, sub_branch: 자기 조직 + 하위 조직의 QR
  -- office, employee: 자기 조직의 QR만
  IF v_role != 'super_admin' THEN
    IF v_role IN ('hq', 'branch', 'sub_branch') THEN
      IF v_qr_org_id != v_org_id AND NOT EXISTS (
        SELECT 1 FROM public.get_all_child_orgs(v_org_id) c
        WHERE c.org_id = v_qr_org_id
      ) THEN
        RAISE EXCEPTION '해당 QR의 설치 권한이 없습니다.';
      END IF;
    ELSE
      IF v_qr_org_id != v_org_id THEN
        RAISE EXCEPTION '해당 QR의 설치 권한이 없습니다.';
      END IF;
    END IF;
  END IF;

  -- 5. 조직명 조회
  SELECT o.name INTO v_org_name
  FROM public.organizations o
  WHERE o.id = v_org_id
  LIMIT 1;

  v_org_name := COALESCE(v_org_name, '');

  -- 6. 설치 정보 저장
  INSERT INTO public.installations (qr_id, image_url, latitude, longitude, installed_by)
  VALUES (v_qr_id, p_image_url, p_latitude, p_longitude, v_user_id)
  RETURNING id INTO v_new_install_id;

  -- 7. QR 상태를 INSTALLED로 변경
  UPDATE public.qr_codes
  SET status = 'INSTALLED'
  WHERE id = v_qr_id;

  -- 8. 타임라인 기록
  INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
  VALUES (v_qr_id, '설치 완료', v_user_id, v_org_name);

  -- 9. 결과 반환
  install_id := v_new_install_id;
  qr_uuid := p_qr_uuid;
  qr_product_name := v_qr_product_name;
  qr_status := 'INSTALLED';
  RETURN NEXT;

  RETURN;
END;
$$;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.get_install_list(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_install_list(text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_installation(text, text, text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_installation(text, text, text, numeric, numeric) TO anon;
