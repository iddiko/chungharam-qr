
-- ============================================
-- 016_migrate_to_ltree.sql
-- 기존 RPC 함수들을 ltree 기반으로 전환
-- 순서: RLS 정책 교체 → 함수 재작성 → anon 권한 제거
-- ============================================

-- ============================================
-- 0. 공통 헬퍼: 사용자 조직 경로 조회 함수
--    RLS 정책과 RPC에서 공통으로 사용
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_org_path()
RETURNS ltree
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT o.path FROM public.organizations o
  JOIN public.users u ON u.org_id = o.id
  WHERE u.email = auth.email()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_org_path() TO authenticated;

-- ============================================
-- 1. RLS 정책을 ltree 기반으로 교체
--    (기존 get_accessible_orgs_by_email() 의존 정책을 먼저 삭제 후 재생성)
-- ============================================

-- 1-1. organizations RLS 정책 교체
DROP POLICY IF EXISTS "HQ Branch SubBranch can view organizations" ON public.organizations;
DROP POLICY IF EXISTS "Super admin can do anything on organizations" ON public.organizations;

CREATE POLICY "Super admin can do anything on organizations" ON public.organizations
  FOR ALL USING (
    auth.jwt()->>'role' = 'super_admin'
  );

CREATE POLICY "HQ Branch SubBranch can view organizations" ON public.organizations
  FOR SELECT USING (
    path <@ public.get_user_org_path()
  );

-- 1-2. qr_codes RLS 정책 교체
DROP POLICY IF EXISTS "HQ Branch SubBranch can create QR codes" ON public.qr_codes;
DROP POLICY IF EXISTS "HQ Branch SubBranch can view QR codes" ON public.qr_codes;
DROP POLICY IF EXISTS "Super admin can do anything on qr_codes" ON public.qr_codes;
DROP POLICY IF EXISTS "Office Employee can create QR codes" ON public.qr_codes;
DROP POLICY IF EXISTS "Office Employee can view QR codes" ON public.qr_codes;

CREATE POLICY "Super admin can do anything on qr_codes" ON public.qr_codes
  FOR ALL USING (auth.jwt()->>'role' = 'super_admin');

CREATE POLICY "HQ Branch SubBranch can view QR codes" ON public.qr_codes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = qr_codes.owner_org_id
        AND o.path <@ public.get_user_org_path()
    )
  );

CREATE POLICY "HQ Branch SubBranch can create QR codes" ON public.qr_codes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = qr_codes.owner_org_id
        AND o.path <@ public.get_user_org_path()
    )
  );

CREATE POLICY "Office Employee can view QR codes" ON public.qr_codes
  FOR SELECT USING (
    (auth.jwt()->>'org_id')::uuid = qr_codes.owner_org_id
  );

CREATE POLICY "Office Employee can create QR codes" ON public.qr_codes
  FOR INSERT WITH CHECK (
    (auth.jwt()->>'org_id')::uuid = qr_codes.owner_org_id
  );

-- 1-3. qr_transfer_requests RLS 정책 교체
DROP POLICY IF EXISTS "HQ Branch SubBranch can view transfer requests" ON public.qr_transfer_requests;
DROP POLICY IF EXISTS "HQ Branch SubBranch can approve transfers" ON public.qr_transfer_requests;
DROP POLICY IF EXISTS "Super admin can do anything on qr_transfer_requests" ON public.qr_transfer_requests;
DROP POLICY IF EXISTS "Office Employee can view transfer requests" ON public.qr_transfer_requests;
DROP POLICY IF EXISTS "Office Employee can request transfers" ON public.qr_transfer_requests;

CREATE POLICY "Super admin can do anything on qr_transfer_requests" ON public.qr_transfer_requests
  FOR ALL USING (auth.jwt()->>'role' = 'super_admin');

CREATE POLICY "HQ Branch SubBranch can view transfer requests" ON public.qr_transfer_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = qr_transfer_requests.from_org_id AND o.path <@ public.get_user_org_path())
    OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = qr_transfer_requests.to_org_id AND o.path <@ public.get_user_org_path())
  );

CREATE POLICY "HQ Branch SubBranch can approve transfers" ON public.qr_transfer_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = qr_transfer_requests.to_org_id AND o.path <@ public.get_user_org_path())
  );

CREATE POLICY "Office Employee can view transfer requests" ON public.qr_transfer_requests
  FOR SELECT USING (
    (auth.jwt()->>'org_id')::uuid = qr_transfer_requests.from_org_id
    OR (auth.jwt()->>'org_id')::uuid = qr_transfer_requests.to_org_id
  );

CREATE POLICY "Office Employee can request transfers" ON public.qr_transfer_requests
  FOR INSERT WITH CHECK (
    (auth.jwt()->>'org_id')::uuid = qr_transfer_requests.from_org_id
  );

-- 1-4. sales RLS 정책 교체
DROP POLICY IF EXISTS "HQ Branch SubBranch can view sales" ON public.sales;
DROP POLICY IF EXISTS "HQ Branch SubBranch can create sales" ON public.sales;
DROP POLICY IF EXISTS "Super admin can do anything on sales" ON public.sales;
DROP POLICY IF EXISTS "Office Employee can view sales" ON public.sales;
DROP POLICY IF EXISTS "Office Employee can create sales" ON public.sales;

CREATE POLICY "Super admin can do anything on sales" ON public.sales
  FOR ALL USING (auth.jwt()->>'role' = 'super_admin');

CREATE POLICY "HQ Branch SubBranch can view sales" ON public.sales
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = sales.org_id AND o.path <@ public.get_user_org_path())
  );

CREATE POLICY "HQ Branch SubBranch can create sales" ON public.sales
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = sales.org_id AND o.path <@ public.get_user_org_path())
  );

CREATE POLICY "Office Employee can view sales" ON public.sales
  FOR SELECT USING (
    (auth.jwt()->>'org_id')::uuid = sales.org_id
  );

CREATE POLICY "Office Employee can create sales" ON public.sales
  FOR INSERT WITH CHECK (
    (auth.jwt()->>'org_id')::uuid = sales.org_id
  );

-- ============================================
-- 2. 이제 get_accessible_orgs_by_email() 안전하게 교체 가능
-- ============================================
DROP FUNCTION IF EXISTS public.get_accessible_orgs_by_email();

CREATE OR REPLACE FUNCTION public.get_accessible_orgs_by_email()
RETURNS TABLE (org_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = auth.email() LIMIT 1;

  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT id AS org_id FROM public.organizations;
  ELSE
    RETURN QUERY SELECT id AS org_id FROM public.organizations
    WHERE path <@ (SELECT path FROM public.organizations WHERE id = v_org_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accessible_orgs_by_email() TO authenticated;

-- ============================================
-- 3. get_all_child_orgs() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.get_all_child_orgs(UUID);

CREATE OR REPLACE FUNCTION public.get_all_child_orgs(parent_org_id UUID)
RETURNS TABLE (org_id UUID)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id AS org_id FROM public.organizations
  WHERE path <@ (SELECT path FROM public.organizations WHERE id = parent_org_id)
    AND id != parent_org_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_child_orgs(UUID) TO authenticated;

-- ============================================
-- 4. get_qr_list() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.get_qr_list(text, text, text);

CREATE OR REPLACE FUNCTION public.get_qr_list(
  p_user_email text,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  qr_status text,
  qr_parent_qr_id uuid,
  qr_owner_org_id uuid,
  org_name text,
  qr_created_at timestamptz
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
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name, q.created_at
    FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE (p_search IS NULL OR q.uuid ILIKE '%' || p_search || '%' OR q.product_name ILIKE '%' || p_search || '%')
      AND (p_status IS NULL OR q.status = p_status)
    ORDER BY q.created_at DESC LIMIT 500;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name, q.created_at
    FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
      AND (p_search IS NULL OR q.uuid ILIKE '%' || p_search || '%' OR q.product_name ILIKE '%' || p_search || '%')
      AND (p_status IS NULL OR q.status = p_status)
    ORDER BY q.created_at DESC LIMIT 500;
  ELSE
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name, q.created_at
    FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.owner_org_id = v_org_id
      AND (p_search IS NULL OR q.uuid ILIKE '%' || p_search || '%' OR q.product_name ILIKE '%' || p_search || '%')
      AND (p_status IS NULL OR q.status = p_status)
    ORDER BY q.created_at DESC LIMIT 500;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_qr_list(text, text, text) TO authenticated;

-- ============================================
-- 5. get_qr_all_list() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.get_qr_all_list(text);

CREATE OR REPLACE FUNCTION public.get_qr_all_list(p_user_email text)
RETURNS TABLE (
  qr_id uuid, qr_uuid text, qr_product_name text, qr_status text,
  qr_parent_qr_id uuid, qr_owner_org_id uuid, org_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid; v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name
    FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    ORDER BY q.created_at DESC LIMIT 200;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    RETURN QUERY SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name
    FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ORDER BY q.created_at DESC LIMIT 200;
  ELSE
    RETURN QUERY SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name
    FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.owner_org_id = v_org_id
    ORDER BY q.created_at DESC LIMIT 200;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_qr_all_list(text) TO authenticated;

-- ============================================
-- 6. get_install_list() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.get_install_list(text);

CREATE OR REPLACE FUNCTION public.get_install_list(p_user_email text)
RETURNS TABLE (
  install_id uuid, qr_uuid text, qr_product_name text, image_url text,
  latitude numeric, longitude numeric, installer_name text,
  installer_org_name text, installed_at timestamptz, qr_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid; v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT i.id, q.uuid, q.product_name, i.image_url, i.latitude, i.longitude,
    u.name, o.name, i.installed_at, q.status
    FROM public.installations i
    JOIN public.qr_codes q ON q.id = i.qr_id
    JOIN public.users u ON u.id = i.installed_by
    JOIN public.organizations o ON o.id = u.org_id
    ORDER BY i.installed_at DESC LIMIT 100;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    RETURN QUERY SELECT i.id, q.uuid, q.product_name, i.image_url, i.latitude, i.longitude,
    u.name, o.name, i.installed_at, q.status
    FROM public.installations i
    JOIN public.qr_codes q ON q.id = i.qr_id
    JOIN public.users u ON u.id = i.installed_by
    JOIN public.organizations o ON o.id = u.org_id
    JOIN public.organizations qo ON qo.id = q.owner_org_id
    WHERE qo.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ORDER BY i.installed_at DESC LIMIT 100;
  ELSE
    RETURN QUERY SELECT i.id, q.uuid, q.product_name, i.image_url, i.latitude, i.longitude,
    u.name, o.name, i.installed_at, q.status
    FROM public.installations i
    JOIN public.qr_codes q ON q.id = i.qr_id
    JOIN public.users u ON u.id = i.installed_by
    JOIN public.organizations o ON o.id = u.org_id
    WHERE q.owner_org_id = v_org_id
    ORDER BY i.installed_at DESC LIMIT 100;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_install_list(text) TO authenticated;

-- ============================================
-- 7. create_installation() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.create_installation(text, text, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.create_installation(
  p_user_email text, p_qr_uuid text, p_image_url text,
  p_latitude numeric, p_longitude numeric
)
RETURNS TABLE (install_id uuid, qr_uuid text, qr_product_name text, qr_status text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid; v_org_id uuid; v_role text;
  v_qr_id uuid; v_qr_org_id uuid; v_qr_status text; v_qr_product_name text;
  v_org_name text; v_new_install_id uuid;
BEGIN
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.'; END IF;

  SELECT q.id, q.owner_org_id, q.status, q.product_name
  INTO v_qr_id, v_qr_org_id, v_qr_status, v_qr_product_name
  FROM public.qr_codes q WHERE q.uuid = p_qr_uuid LIMIT 1;
  IF v_qr_id IS NULL THEN RAISE EXCEPTION 'QR 코드를 찾을 수 없습니다.'; END IF;
  IF v_qr_status != 'RECEIVED' THEN RAISE EXCEPTION '설치할 수 없는 QR 상태입니다. 현재 상태: %', v_qr_status; END IF;

  IF v_role != 'super_admin' THEN
    IF v_role IN ('hq', 'branch', 'sub_branch') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = v_qr_org_id AND o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
      ) THEN RAISE EXCEPTION '해당 QR의 설치 권한이 없습니다.'; END IF;
    ELSE
      IF v_qr_org_id != v_org_id THEN RAISE EXCEPTION '해당 QR의 설치 권한이 없습니다.'; END IF;
    END IF;
  END IF;

  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
  v_org_name := COALESCE(v_org_name, '');

  INSERT INTO public.installations (qr_id, image_url, latitude, longitude, installed_by)
  VALUES (v_qr_id, p_image_url, p_latitude, p_longitude, v_user_id) RETURNING id INTO v_new_install_id;

  UPDATE public.qr_codes SET status = 'INSTALLED' WHERE id = v_qr_id;
  INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
  VALUES (v_qr_id, '설치 완료', v_user_id, v_org_name);

  install_id := v_new_install_id; qr_uuid := p_qr_uuid;
  qr_product_name := v_qr_product_name; qr_status := 'INSTALLED';
  RETURN NEXT; RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_installation(text, text, text, numeric, numeric) TO authenticated;

-- ============================================
-- 8. create_qr_codes() — ltree 기반 + anon 제거
-- ============================================
DROP FUNCTION IF EXISTS public.create_qr_codes(text, text, text, integer);

CREATE OR REPLACE FUNCTION public.create_qr_codes(
  p_user_email text, p_product_name text,
  p_parent_qr_uuid text DEFAULT NULL, p_quantity integer DEFAULT 1
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
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.'; END IF;

  IF v_role IN ('super_admin', 'hq') THEN
    v_can_create_top_level := true; v_can_create_child := true; v_max_child_count := NULL;
  ELSIF v_role IN ('branch', 'sub_branch') THEN
    v_can_create_top_level := false; v_can_create_child := true; v_max_child_count := NULL;
  ELSIF v_role = 'office' THEN
    v_can_create_top_level := false; v_can_create_child := true; v_max_child_count := 50;
  ELSIF v_role = 'employee' THEN
    v_can_create_top_level := false; v_can_create_child := true; v_max_child_count := 10;
  ELSE RAISE EXCEPTION 'QR 생성 권한이 없습니다.';
  END IF;

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
    IF NOT v_can_create_top_level THEN RAISE EXCEPTION '최상위 QR 생성 권한이 없습니다. 부모 QR을 선택해주세요.'; END IF;
  END IF;

  IF v_max_child_count IS NOT NULL AND p_quantity > v_max_child_count THEN
    RAISE EXCEPTION '생성 수량 제한을 초과했습니다. 최대 %개까지 생성 가능합니다.', v_max_child_count;
  END IF;

  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;
  v_org_name := COALESCE(v_org_name, '');

  FOR i IN 1..p_quantity LOOP
    v_new_uuid := 'QR-' || extract(epoch from now())::text || '-' || substr(md5(random()::text), 1, 9);
    INSERT INTO public.qr_codes (uuid, product_name, parent_qr_id, owner_org_id, status)
    VALUES (v_new_uuid, p_product_name, v_parent_qr_id, v_org_id, 'ACTIVE') RETURNING id INTO v_new_qr_id;
    INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
    VALUES (v_new_qr_id, 'QR 생성', v_user_id, v_org_name);
    qr_id := v_new_qr_id; qr_uuid := v_new_uuid; qr_product_name := p_product_name;
    qr_parent_qr_id := v_parent_qr_id; qr_owner_org_id := v_org_id; qr_status := 'ACTIVE';
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_qr_codes(text, text, text, integer) TO authenticated;

-- ============================================
-- 9. get_organizations() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.get_organizations(text);

CREATE OR REPLACE FUNCTION public.get_organizations(p_user_email text)
RETURNS TABLE (id uuid, name text, type text, parent_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_org_id uuid; v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at
    FROM public.organizations o ORDER BY o.name;
  ELSIF v_role = 'hq' THEN
    RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at
    FROM public.organizations o
    WHERE o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ORDER BY o.name;
  ELSE
    RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at
    FROM public.organizations o WHERE o.id = v_org_id;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organizations(text) TO authenticated;

-- ============================================
-- 10. get_users() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.get_users(text);

CREATE OR REPLACE FUNCTION public.get_users(p_user_email text)
RETURNS TABLE (id uuid, email text, name text, role text, org_id uuid, org_name text, org_type text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_org_id uuid; v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;
  IF v_role NOT IN ('super_admin', 'hq') THEN RAISE EXCEPTION '사용자 조회 권한이 없습니다.'; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
    FROM public.users u LEFT JOIN public.organizations o ON o.id = u.org_id ORDER BY u.name;
  ELSIF v_role = 'hq' THEN
    RETURN QUERY SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
    FROM public.users u LEFT JOIN public.organizations o ON o.id = u.org_id
    WHERE o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ORDER BY u.name;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_users(text) TO authenticated;

-- ============================================
-- 11. get_dashboard_stats() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.get_dashboard_stats(text);

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_email text)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid; v_role text;
  v_total_orgs int := 0; v_total_users int := 0; v_total_qrs int := 0;
  v_total_sales bigint := 0; v_pending_transfers int := 0; v_installed int := 0;
  v_sub_branch_count int := 0; v_office_count int := 0;
  v_child_org_ids uuid[]; v_recent_qrs json; v_pending_transfer_list json;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_org_id IS NULL THEN RETURN '{}'::json; END IF;

  IF v_role = 'super_admin' THEN
    SELECT count(*) INTO v_total_orgs FROM public.organizations;
    SELECT count(*) INTO v_total_users FROM public.users;
    SELECT count(*) INTO v_total_qrs FROM public.qr_codes;
    SELECT COALESCE(sum(amount), 0) INTO v_total_sales FROM public.sales;
    SELECT count(*) INTO v_pending_transfers FROM public.qr_transfer_requests WHERE status = 'PENDING';
    SELECT count(*) INTO v_installed FROM public.installations;
    SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_recent_qrs
    FROM (SELECT q.id, q.uuid, q.product_name, q.status, q.created_at, o.name as org_name
          FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
          ORDER BY q.created_at DESC LIMIT 10) q;
    SELECT json_agg(t ORDER BY t.requested_at DESC) INTO v_pending_transfer_list
    FROM (SELECT t.id, t.status, t.requested_at, fo.name as from_org_name, to2.name as to_org_name, q.product_name as qr_product_name
          FROM public.qr_transfer_requests t
          LEFT JOIN public.organizations fo ON fo.id = t.from_org_id
          LEFT JOIN public.organizations to2 ON to2.id = t.to_org_id
          LEFT JOIN public.qr_codes q ON q.id = t.qr_id
          WHERE t.status = 'PENDING' ORDER BY t.requested_at DESC LIMIT 10) t;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    SELECT array_agg(c.org_id) INTO v_child_org_ids FROM public.get_all_child_orgs(v_org_id) c;
    v_child_org_ids := array_append(v_child_org_ids, v_org_id);
    SELECT count(*) INTO v_total_orgs FROM public.organizations WHERE id = ANY(v_child_org_ids);
    SELECT count(*) INTO v_total_users FROM public.users WHERE org_id = ANY(v_child_org_ids);
    SELECT count(*) INTO v_total_qrs FROM public.qr_codes WHERE owner_org_id = ANY(v_child_org_ids);
    SELECT COALESCE(sum(amount), 0) INTO v_total_sales FROM public.sales WHERE org_id = ANY(v_child_org_ids);
    SELECT count(*) INTO v_pending_transfers FROM public.qr_transfer_requests
      WHERE status = 'PENDING' AND (from_org_id = ANY(v_child_org_ids) OR to_org_id = ANY(v_child_org_ids));
    SELECT count(*) INTO v_installed FROM public.installations WHERE org_id = ANY(v_child_org_ids);
    SELECT count(*) INTO v_sub_branch_count FROM public.organizations WHERE parent_id = ANY(v_child_org_ids) AND type = 'sub_branch';
    SELECT count(*) INTO v_office_count FROM public.organizations WHERE parent_id = ANY(v_child_org_ids) AND type = 'office';
    SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_recent_qrs
    FROM (SELECT q.id, q.uuid, q.product_name, q.status, q.created_at, o.name as org_name
          FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
          WHERE q.owner_org_id = ANY(v_child_org_ids) ORDER BY q.created_at DESC LIMIT 10) q;
    SELECT json_agg(t ORDER BY t.requested_at DESC) INTO v_pending_transfer_list
    FROM (SELECT t.id, t.status, t.requested_at, fo.name as from_org_name, to2.name as to_org_name, q.product_name as qr_product_name
          FROM public.qr_transfer_requests t
          LEFT JOIN public.organizations fo ON fo.id = t.from_org_id
          LEFT JOIN public.organizations to2 ON to2.id = t.to_org_id
          LEFT JOIN public.qr_codes q ON q.id = t.qr_id
          WHERE t.status = 'PENDING' AND (t.from_org_id = ANY(v_child_org_ids) OR t.to_org_id = ANY(v_child_org_ids))
          ORDER BY t.requested_at DESC LIMIT 10) t;
  ELSE
    SELECT count(*) INTO v_total_qrs FROM public.qr_codes WHERE owner_org_id = v_org_id;
    SELECT COALESCE(sum(amount), 0) INTO v_total_sales FROM public.sales WHERE org_id = v_org_id;
    SELECT count(*) INTO v_pending_transfers FROM public.qr_transfer_requests
      WHERE status = 'PENDING' AND (from_org_id = v_org_id OR to_org_id = v_org_id);
    SELECT count(*) INTO v_installed FROM public.installations WHERE org_id = v_org_id;
    SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_recent_qrs
    FROM (SELECT q.id, q.uuid, q.product_name, q.status, q.created_at, o.name as org_name
          FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
          WHERE q.owner_org_id = v_org_id ORDER BY q.created_at DESC LIMIT 10) q;
    SELECT json_agg(t ORDER BY t.requested_at DESC) INTO v_pending_transfer_list
    FROM (SELECT t.id, t.status, t.requested_at, fo.name as from_org_name, to2.name as to_org_name, q.product_name as qr_product_name
          FROM public.qr_transfer_requests t
          LEFT JOIN public.organizations fo ON fo.id = t.from_org_id
          LEFT JOIN public.organizations to2 ON to2.id = t.to_org_id
          LEFT JOIN public.qr_codes q ON q.id = t.qr_id
          WHERE t.status = 'PENDING' AND (t.from_org_id = v_org_id OR t.to_org_id = v_org_id)
          ORDER BY t.requested_at DESC LIMIT 10) t;
  END IF;

  RETURN json_build_object(
    'totalOrgs', v_total_orgs, 'totalUsers', v_total_users, 'totalQRs', v_total_qrs,
    'totalSales', v_total_sales, 'pendingTransfers', v_pending_transfers,
    'installedCount', v_installed, 'subBranchCount', v_sub_branch_count,
    'officeCount', v_office_count, 'recentQRs', COALESCE(v_recent_qrs, '[]'::json),
    'pendingTransferList', COALESCE(v_pending_transfer_list, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(text) TO authenticated;

-- ============================================
-- 12. get_sales_list() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.get_sales_list(text);

CREATE OR REPLACE FUNCTION public.get_sales_list(p_user_email text)
RETURNS TABLE (
  id uuid, org_id uuid, qr_id uuid, amount numeric, sale_date timestamptz,
  customer_name text, notes text, created_by uuid, created_at timestamptz,
  org_name text, qr_product_name text, qr_uuid text, creator_name text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_org_id uuid; v_role text; v_child_org_ids uuid[];
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT s.id, s.org_id, s.qr_id, s.amount, s.sale_date, s.customer_name, s.notes,
    s.created_by, s.created_at, o.name, q.product_name, q.uuid, u.name
    FROM public.sales s LEFT JOIN public.organizations o ON o.id = s.org_id
    LEFT JOIN public.qr_codes q ON q.id = s.qr_id LEFT JOIN public.users u ON u.id = s.created_by
    ORDER BY s.sale_date DESC;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    SELECT array_agg(c.org_id) INTO v_child_org_ids FROM public.get_all_child_orgs(v_org_id) c;
    v_child_org_ids := array_append(v_child_org_ids, v_org_id);
    RETURN QUERY SELECT s.id, s.org_id, s.qr_id, s.amount, s.sale_date, s.customer_name, s.notes,
    s.created_by, s.created_at, o.name, q.product_name, q.uuid, u.name
    FROM public.sales s LEFT JOIN public.organizations o ON o.id = s.org_id
    LEFT JOIN public.qr_codes q ON q.id = s.qr_id LEFT JOIN public.users u ON u.id = s.created_by
    WHERE s.org_id = ANY(v_child_org_ids) ORDER BY s.sale_date DESC;
  ELSE
    RETURN QUERY SELECT s.id, s.org_id, s.qr_id, s.amount, s.sale_date, s.customer_name, s.notes,
    s.created_by, s.created_at, o.name, q.product_name, q.uuid, u.name
    FROM public.sales s LEFT JOIN public.organizations o ON o.id = s.org_id
    LEFT JOIN public.qr_codes q ON q.id = s.qr_id LEFT JOIN public.users u ON u.id = s.created_by
    WHERE s.org_id = v_org_id ORDER BY s.sale_date DESC;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_list(text) TO authenticated;

-- ============================================
-- 13. get_commission_records() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.get_commission_records(text);

CREATE OR REPLACE FUNCTION public.get_commission_records(p_user_email text)
RETURNS TABLE (
  id uuid, qr_uuid text, product_name text, org_name text, org_type text,
  commission_type text, commission_rate numeric, sale_amount numeric,
  commission_amount numeric, status text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_role text; v_org_id uuid;
BEGIN
  SELECT u.role, u.org_id INTO v_role, v_org_id
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT cr.id, q.uuid, q.product_name, o.name, cr.org_type,
    cr.commission_type, cr.commission_rate, cr.sale_amount, cr.commission_amount, cr.status, cr.created_at
    FROM public.commission_records cr LEFT JOIN public.qr_codes q ON q.id = cr.qr_id
    LEFT JOIN public.organizations o ON o.id = cr.org_id ORDER BY cr.created_at DESC LIMIT 200;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    RETURN QUERY SELECT cr.id, q.uuid, q.product_name, o.name, cr.org_type,
    cr.commission_type, cr.commission_rate, cr.sale_amount, cr.commission_amount, cr.status, cr.created_at
    FROM public.commission_records cr LEFT JOIN public.qr_codes q ON q.id = cr.qr_id
    LEFT JOIN public.organizations o ON o.id = cr.org_id
    WHERE o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ORDER BY cr.created_at DESC LIMIT 200;
  ELSE
    RETURN QUERY SELECT cr.id, q.uuid, q.product_name, o.name, cr.org_type,
    cr.commission_type, cr.commission_rate, cr.sale_amount, cr.commission_amount, cr.status, cr.created_at
    FROM public.commission_records cr LEFT JOIN public.qr_codes q ON q.id = cr.qr_id
    LEFT JOIN public.organizations o ON o.id = cr.org_id
    WHERE cr.org_id = v_org_id ORDER BY cr.created_at DESC LIMIT 100;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_commission_records(text) TO authenticated;

-- ============================================
-- 14. distribute_commission() — 권한 확장 (office 이상 승인 워크플로우 지원)
-- ============================================
DROP FUNCTION IF EXISTS public.distribute_commission(text, uuid, numeric);

CREATE OR REPLACE FUNCTION public.distribute_commission(
  p_user_email text, p_qr_id uuid, p_sale_amount numeric
)
RETURNS TABLE (
  org_id uuid, org_name text, org_type text,
  commission_type text, commission_rate numeric, commission_amount numeric
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_role text; v_qr_org_id uuid;
  v_current_org_id uuid; v_current_org_type text; v_current_org_name text;
  v_comm_type text; v_comm_value numeric; v_comm_amount numeric; v_total_distributed numeric := 0;
BEGIN
  SELECT u.role INTO v_role FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  -- 권한 확장: super_admin, hq, branch, sub_branch, office 모두 분배 가능 (승인 워크플로우)
  IF v_role NOT IN ('super_admin', 'hq', 'branch', 'sub_branch', 'office') THEN
    RAISE EXCEPTION '수수료 분배 권한이 없습니다.';
  END IF;

  SELECT q.owner_org_id INTO v_qr_org_id FROM public.qr_codes q WHERE q.id = p_qr_id;
  IF v_qr_org_id IS NULL THEN RAISE EXCEPTION 'QR 코드를 찾을 수 없습니다.'; END IF;

  v_current_org_id := v_qr_org_id;
  WHILE v_current_org_id IS NOT NULL LOOP
    SELECT o.type, o.name, o.parent_id INTO v_current_org_type, v_current_org_name, v_current_org_id
    FROM public.organizations o WHERE o.id = v_current_org_id;

    SELECT cs.commission_type, cs.commission_value INTO v_comm_type, v_comm_value
    FROM public.commission_settings cs WHERE cs.org_type = v_current_org_type AND cs.is_active = true LIMIT 1;

    IF v_comm_type IS NOT NULL THEN
      IF v_comm_type = 'percentage' THEN v_comm_amount := p_sale_amount * v_comm_value / 100.0;
      ELSE v_comm_amount := v_comm_value; END IF;

      INSERT INTO public.commission_records (qr_id, org_id, org_type, commission_type, commission_rate, sale_amount, commission_amount, status)
      VALUES (p_qr_id, v_current_org_id, v_current_org_type, v_comm_type, v_comm_value, p_sale_amount, v_comm_amount, 'PENDING');

      org_id := v_current_org_id; org_name := v_current_org_name; org_type := v_current_org_type;
      commission_type := v_comm_type; commission_rate := v_comm_value; commission_amount := v_comm_amount;
      RETURN NEXT; v_total_distributed := v_total_distributed + v_comm_amount;
    END IF;
    EXIT WHEN v_current_org_id IS NULL;
  END LOOP;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.distribute_commission(text, uuid, numeric) TO authenticated;

-- ============================================
-- 15. get_invitations() — ltree 기반으로 재작성
-- ============================================
DROP FUNCTION IF EXISTS public.get_invitations(text);

CREATE OR REPLACE FUNCTION public.get_invitations(p_user_email text)
RETURNS TABLE (
  invitation_id uuid, invitee_email text, invitee_name text, invitee_role text,
  org_name text, status text, invited_at timestamptz, expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_role text; v_org_id uuid;
BEGIN
  SELECT u.role, u.org_id INTO v_role, v_org_id
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT i.id, i.email, i.name, i.role, o.name, i.status, i.invited_at, i.expires_at
    FROM public.user_invitations i LEFT JOIN public.organizations o ON o.id = i.org_id ORDER BY i.invited_at DESC;
  ELSIF v_role = 'hq' THEN
    RETURN QUERY SELECT i.id, i.email, i.name, i.role, o.name, i.status, i.invited_at, i.expires_at
    FROM public.user_invitations i LEFT JOIN public.organizations o ON o.id = i.org_id
    WHERE o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ORDER BY i.invited_at DESC;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitations(text) TO authenticated;

-- ============================================
-- 16. create_invitation() — ltree 기반 권한 확인
-- ============================================
DROP FUNCTION IF EXISTS public.create_invitation(text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_invitation(
  p_user_email text, p_invitee_email text, p_invitee_name text,
  p_invitee_role text, p_invitee_org_id uuid
)
RETURNS TABLE (
  invitation_id uuid, invitation_token text, invitee_email text,
  invitee_name text, invitee_role text, org_name text, expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid; v_role text; v_org_id uuid;
  v_org_name text; v_new_id uuid; v_token text;
BEGIN
  SELECT u.id, u.role, u.org_id INTO v_user_id, v_role, v_org_id
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.'; END IF;
  IF v_role NOT IN ('super_admin', 'hq') THEN RAISE EXCEPTION '초대 권한이 없습니다.'; END IF;

  IF v_role = 'hq' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_invitee_org_id AND o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ) THEN RAISE EXCEPTION '자기 하위 조직에만 초대할 수 있습니다.'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.email = p_invitee_email) THEN
    RAISE EXCEPTION '이미 가입된 이메일입니다.'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_invitations WHERE email = p_invitee_email AND status = 'PENDING') THEN
    RAISE EXCEPTION '이미 대기 중인 초대가 있습니다.'; END IF;

  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = p_invitee_org_id LIMIT 1;
  INSERT INTO public.user_invitations (email, name, role, org_id, invited_by)
  VALUES (p_invitee_email, p_invitee_name, p_invitee_role, p_invitee_org_id, v_user_id)
  RETURNING id, token INTO v_new_id, v_token;

  invitation_id := v_new_id; invitation_token := v_token;
  invitee_email := p_invitee_email; invitee_name := p_invitee_name;
  invitee_role := p_invitee_role; org_name := COALESCE(v_org_name, '');
  expires_at := (NOW() + INTERVAL '7 days');
  RETURN NEXT; RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invitation(text, text, text, text, uuid) TO authenticated;

-- ============================================
-- 17. get_current_user_info() — anon 권한 제거
-- ============================================
DROP FUNCTION IF EXISTS public.get_current_user_info(text);

CREATE OR REPLACE FUNCTION public.get_current_user_info(user_email text)
RETURNS TABLE (id uuid, org_id uuid, role text, name text, email text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT u.id, u.org_id, u.role, u.name, u.email, u.created_at
  FROM public.users u WHERE u.email = user_email LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_user_info(text) TO authenticated;

-- ============================================
-- 18. get_qr_by_uuid() — anon 권한 제거
-- ============================================
DROP FUNCTION IF EXISTS public.get_qr_by_uuid(text);

CREATE OR REPLACE FUNCTION public.get_qr_by_uuid(p_uuid text)
RETURNS TABLE (qr_id uuid, qr_uuid text, qr_product_name text, qr_status text, qr_owner_org_id uuid, org_name text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT q.id, q.uuid, q.product_name, q.status, q.owner_org_id, o.name
  FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
  WHERE q.uuid = p_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_qr_by_uuid(text) TO authenticated;

-- ============================================
-- 19. 나머지 관리자 RPC — anon 제거
-- ============================================
-- create_organization
DROP FUNCTION IF EXISTS public.create_organization(text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.create_organization(
  p_user_email text, p_name text, p_type text, p_parent_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, name text, type text, parent_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_org_id uuid; v_role text; v_new_id uuid;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_role NOT IN ('super_admin', 'hq') THEN RAISE EXCEPTION '조직 생성 권한이 없습니다.'; END IF;
  IF v_role = 'hq' AND p_parent_id IS NULL THEN
    INSERT INTO public.organizations (name, type, parent_id) VALUES (p_name, p_type, v_org_id) RETURNING id INTO v_new_id;
  ELSE
    INSERT INTO public.organizations (name, type, parent_id) VALUES (p_name, p_type, p_parent_id) RETURNING id INTO v_new_id;
  END IF;
  RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at FROM public.organizations o WHERE o.id = v_new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, uuid) TO authenticated;

-- update_organization
DROP FUNCTION IF EXISTS public.update_organization(text, uuid, text, text, uuid);
CREATE OR REPLACE FUNCTION public.update_organization(
  p_user_email text, p_id uuid, p_name text DEFAULT NULL, p_type text DEFAULT NULL, p_parent_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, name text, type text, parent_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_role text;
BEGIN
  SELECT u.role INTO v_role FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_role NOT IN ('super_admin', 'hq') THEN RAISE EXCEPTION '조직 수정 권한이 없습니다.'; END IF;
  UPDATE public.organizations SET name = COALESCE(p_name, name), type = COALESCE(p_type, type), parent_id = COALESCE(p_parent_id, parent_id) WHERE id = p_id;
  RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at FROM public.organizations o WHERE o.id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_organization(text, uuid, text, text, uuid) TO authenticated;

-- create_user_record
DROP FUNCTION IF EXISTS public.create_user_record(uuid, text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.create_user_record(
  p_id uuid, p_email text, p_name text, p_role text, p_org_id uuid
)
RETURNS TABLE (id uuid, email text, name text, role text, org_id uuid, org_name text, org_type text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_role text;
BEGIN
  SELECT u.role INTO v_role FROM public.users u WHERE u.email = (SELECT current_setting('request.jwt.claims', true)::json->>'email') LIMIT 1;
  IF v_role NOT IN ('super_admin', 'hq') THEN RAISE EXCEPTION '사용자 생성 권한이 없습니다.'; END IF;
  INSERT INTO public.users (id, email, name, role, org_id) VALUES (p_id, p_email, p_name, p_role, p_org_id);
  RETURN QUERY SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
  FROM public.users u LEFT JOIN public.organizations o ON o.id = u.org_id WHERE u.id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_user_record(uuid, text, text, text, uuid) TO authenticated;

-- update_user_record
DROP FUNCTION IF EXISTS public.update_user_record(text, uuid, text, text, uuid);
CREATE OR REPLACE FUNCTION public.update_user_record(
  p_user_email text, p_id uuid, p_name text DEFAULT NULL, p_role text DEFAULT NULL, p_org_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, email text, name text, role text, org_id uuid, org_name text, org_type text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_role text;
BEGIN
  SELECT u.role INTO v_role FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_role NOT IN ('super_admin', 'hq') THEN RAISE EXCEPTION '사용자 수정 권한이 없습니다.'; END IF;
  UPDATE public.users SET name = COALESCE(p_name, name), role = COALESCE(p_role, role), org_id = COALESCE(p_org_id, org_id) WHERE id = p_id;
  RETURN QUERY SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
  FROM public.users u LEFT JOIN public.organizations o ON o.id = u.org_id WHERE u.id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_user_record(text, uuid, text, text, uuid) TO authenticated;

-- create_sale
DROP FUNCTION IF EXISTS public.create_sale(text, numeric, uuid, text, text);
CREATE OR REPLACE FUNCTION public.create_sale(
  p_user_email text, p_amount numeric, p_qr_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS TABLE (id uuid, amount numeric, sale_date timestamptz, org_name text, qr_product_name text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_user_id uuid; v_org_id uuid; v_role text; v_new_id uuid; v_org_name text; v_product_name text;
BEGIN
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.'; END IF;
  IF v_role NOT IN ('super_admin', 'hq', 'branch', 'sub_branch', 'office', 'employee') THEN
    RAISE EXCEPTION '매출 등록 권한이 없습니다.'; END IF;
  INSERT INTO public.sales (org_id, qr_id, amount, customer_name, notes, created_by)
  VALUES (v_org_id, p_qr_id, p_amount, p_customer_name, p_notes, v_user_id) RETURNING id INTO v_new_id;
  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id;
  SELECT q.product_name INTO v_product_name FROM public.qr_codes q WHERE q.id = p_qr_id;
  RETURN QUERY SELECT v_new_id, p_amount, NOW(), v_org_name, v_product_name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_sale(text, numeric, uuid, text, text) TO authenticated;

-- ============================================
-- 20. path 데이터 최종 확정
-- ============================================
SELECT public.update_org_path();
