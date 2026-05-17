-- ============================================
-- 관리자 RPC 함수 (조직/사용자 관리) - RLS 우회
-- ============================================

-- 1. 조직 목록 조회 RPC
DROP FUNCTION IF EXISTS public.get_organizations(text);
CREATE OR REPLACE FUNCTION public.get_organizations(p_user_email text)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  parent_id uuid,
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
    RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at
    FROM public.organizations o ORDER BY o.name;
  ELSIF v_role = 'hq' THEN
    RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at
    FROM public.organizations o
    WHERE o.id IN (
      SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
      UNION SELECT v_org_id
    )
    ORDER BY o.name;
  ELSE
    RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at
    FROM public.organizations o WHERE o.id = v_org_id;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organizations(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organizations(text) TO anon;

-- 2. 조직 생성 RPC
DROP FUNCTION IF EXISTS public.create_organization(text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.create_organization(
  p_user_email text,
  p_name text,
  p_type text,
  p_parent_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  parent_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
  v_new_id uuid;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '조직 생성 권한이 없습니다.';
  END IF;

  -- hq는 자기 조직 하위로만 생성 가능
  IF v_role = 'hq' AND p_parent_id IS NULL THEN
    INSERT INTO public.organizations (name, type, parent_id) VALUES (p_name, p_type, v_org_id) RETURNING id INTO v_new_id;
  ELSE
    INSERT INTO public.organizations (name, type, parent_id) VALUES (p_name, p_type, p_parent_id) RETURNING id INTO v_new_id;
  END IF;

  RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at
  FROM public.organizations o WHERE o.id = v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, uuid) TO anon;

-- 3. 조직 수정 RPC
DROP FUNCTION IF EXISTS public.update_organization(text, uuid, text, text, uuid);
CREATE OR REPLACE FUNCTION public.update_organization(
  p_user_email text,
  p_id uuid,
  p_name text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  parent_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT u.role INTO v_role FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '조직 수정 권한이 없습니다.';
  END IF;

  UPDATE public.organizations SET
    name = COALESCE(p_name, name),
    type = COALESCE(p_type, type),
    parent_id = COALESCE(p_parent_id, parent_id)
  WHERE id = p_id;

  RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at
  FROM public.organizations o WHERE o.id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_organization(text, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization(text, uuid, text, text, uuid) TO anon;

-- 4. 사용자 목록 조회 RPC
DROP FUNCTION IF EXISTS public.get_users(text);
CREATE OR REPLACE FUNCTION public.get_users(p_user_email text)
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  role text,
  org_id uuid,
  org_name text,
  org_type text
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

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '사용자 조회 권한이 없습니다.';
  END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
    FROM public.users u
    LEFT JOIN public.organizations o ON o.id = u.org_id
    ORDER BY u.name;
  ELSIF v_role = 'hq' THEN
    RETURN QUERY
    SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
    FROM public.users u
    LEFT JOIN public.organizations o ON o.id = u.org_id
    WHERE u.org_id IN (
      SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
      UNION SELECT v_org_id
    )
    ORDER BY u.name;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_users(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users(text) TO anon;

-- 5. 사용자 생성 RPC (users 테이블만 - Auth는 API에서 처리)
DROP FUNCTION IF EXISTS public.create_user_record(uuid, text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.create_user_record(
  p_id uuid,
  p_email text,
  p_name text,
  p_role text,
  p_org_id uuid
)
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  role text,
  org_id uuid,
  org_name text,
  org_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT u.role INTO v_role FROM public.users u WHERE u.email = (SELECT current_setting('request.jwt.claims', true)::json->>'email') LIMIT 1;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '사용자 생성 권한이 없습니다.';
  END IF;

  INSERT INTO public.users (id, email, name, role, org_id)
  VALUES (p_id, p_email, p_name, p_role, p_org_id);

  RETURN QUERY
  SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
  FROM public.users u
  LEFT JOIN public.organizations o ON o.id = u.org_id
  WHERE u.id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_record(uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_record(uuid, text, text, text, uuid) TO anon;

-- 6. 사용자 수정 RPC
DROP FUNCTION IF EXISTS public.update_user_record(text, uuid, text, text, uuid);
CREATE OR REPLACE FUNCTION public.update_user_record(
  p_user_email text,
  p_id uuid,
  p_name text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_org_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  role text,
  org_id uuid,
  org_name text,
  org_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT u.role INTO v_role FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '사용자 수정 권한이 없습니다.';
  END IF;

  UPDATE public.users SET
    name = COALESCE(p_name, name),
    role = COALESCE(p_role, role),
    org_id = COALESCE(p_org_id, org_id)
  WHERE id = p_id;

  RETURN QUERY
  SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
  FROM public.users u
  LEFT JOIN public.organizations o ON o.id = u.org_id
  WHERE u.id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_record(text, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_record(text, uuid, text, text, uuid) TO anon;

-- ============================================
-- 7. 대시보드 통계 RPC
-- ============================================
DROP FUNCTION IF EXISTS public.get_dashboard_stats(text);
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_email text)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
  v_total_orgs int := 0;
  v_total_users int := 0;
  v_total_qrs int := 0;
  v_total_sales bigint := 0;
  v_pending_transfers int := 0;
  v_installed int := 0;
  v_sub_branch_count int := 0;
  v_office_count int := 0;
  v_child_org_ids uuid[];
  v_recent_qrs json;
  v_pending_transfer_list json;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN '{}'::json;
  END IF;

  -- 권한에 따라 조회 범위 결정
  IF v_role = 'super_admin' THEN
    -- 전체 데이터
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
    FROM (SELECT t.id, t.status, t.requested_at,
                 fo.name as from_org_name, to2.name as to_org_name,
                 q.product_name as qr_product_name
          FROM public.qr_transfer_requests t
          LEFT JOIN public.organizations fo ON fo.id = t.from_org_id
          LEFT JOIN public.organizations to2 ON to2.id = t.to_org_id
          LEFT JOIN public.qr_codes q ON q.id = t.qr_id
          WHERE t.status = 'PENDING'
          ORDER BY t.requested_at DESC LIMIT 10) t;

  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    -- 하위 조직 범위
    SELECT array_agg(c.org_id) INTO v_child_org_ids
    FROM public.get_all_child_orgs(v_org_id) c;
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
          WHERE q.owner_org_id = ANY(v_child_org_ids)
          ORDER BY q.created_at DESC LIMIT 10) q;

    SELECT json_agg(t ORDER BY t.requested_at DESC) INTO v_pending_transfer_list
    FROM (SELECT t.id, t.status, t.requested_at,
                 fo.name as from_org_name, to2.name as to_org_name,
                 q.product_name as qr_product_name
          FROM public.qr_transfer_requests t
          LEFT JOIN public.organizations fo ON fo.id = t.from_org_id
          LEFT JOIN public.organizations to2 ON to2.id = t.to_org_id
          LEFT JOIN public.qr_codes q ON q.id = t.qr_id
          WHERE t.status = 'PENDING' AND (t.from_org_id = ANY(v_child_org_ids) OR t.to_org_id = ANY(v_child_org_ids))
          ORDER BY t.requested_at DESC LIMIT 10) t;

  ELSE
    -- office, employee: 자기 조직만
    SELECT count(*) INTO v_total_qrs FROM public.qr_codes WHERE owner_org_id = v_org_id;
    SELECT COALESCE(sum(amount), 0) INTO v_total_sales FROM public.sales WHERE org_id = v_org_id;
    SELECT count(*) INTO v_pending_transfers FROM public.qr_transfer_requests
      WHERE status = 'PENDING' AND (from_org_id = v_org_id OR to_org_id = v_org_id);
    SELECT count(*) INTO v_installed FROM public.installations WHERE org_id = v_org_id;

    SELECT json_agg(q ORDER BY q.created_at DESC) INTO v_recent_qrs
    FROM (SELECT q.id, q.uuid, q.product_name, q.status, q.created_at, o.name as org_name
          FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
          WHERE q.owner_org_id = v_org_id
          ORDER BY q.created_at DESC LIMIT 10) q;

    SELECT json_agg(t ORDER BY t.requested_at DESC) INTO v_pending_transfer_list
    FROM (SELECT t.id, t.status, t.requested_at,
                 fo.name as from_org_name, to2.name as to_org_name,
                 q.product_name as qr_product_name
          FROM public.qr_transfer_requests t
          LEFT JOIN public.organizations fo ON fo.id = t.from_org_id
          LEFT JOIN public.organizations to2 ON to2.id = t.to_org_id
          LEFT JOIN public.qr_codes q ON q.id = t.qr_id
          WHERE t.status = 'PENDING' AND (t.from_org_id = v_org_id OR t.to_org_id = v_org_id)
          ORDER BY t.requested_at DESC LIMIT 10) t;
  END IF;

  RETURN json_build_object(
    'totalOrgs', v_total_orgs,
    'totalUsers', v_total_users,
    'totalQRs', v_total_qrs,
    'totalSales', v_total_sales,
    'pendingTransfers', v_pending_transfers,
    'installedCount', v_installed,
    'subBranchCount', v_sub_branch_count,
    'officeCount', v_office_count,
    'recentQRs', COALESCE(v_recent_qrs, '[]'::json),
    'pendingTransferList', COALESCE(v_pending_transfer_list, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(text) TO anon;

-- ============================================
-- 8. 매출 목록 조회 RPC
-- ============================================
DROP FUNCTION IF EXISTS public.get_sales_list(text);
CREATE OR REPLACE FUNCTION public.get_sales_list(p_user_email text)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  qr_id uuid,
  amount numeric,
  sale_date timestamptz,
  customer_name text,
  notes text,
  created_by uuid,
  created_at timestamptz,
  org_name text,
  qr_product_name text,
  qr_uuid text,
  creator_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
  v_child_org_ids uuid[];
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT s.id, s.org_id, s.qr_id, s.amount, s.sale_date, s.customer_name, s.notes,
           s.created_by, s.created_at, o.name, q.product_name, q.uuid, u.name
    FROM public.sales s
    LEFT JOIN public.organizations o ON o.id = s.org_id
    LEFT JOIN public.qr_codes q ON q.id = s.qr_id
    LEFT JOIN public.users u ON u.id = s.created_by
    ORDER BY s.sale_date DESC;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    SELECT array_agg(c.org_id) INTO v_child_org_ids
    FROM public.get_all_child_orgs(v_org_id) c;
    v_child_org_ids := array_append(v_child_org_ids, v_org_id);

    RETURN QUERY
    SELECT s.id, s.org_id, s.qr_id, s.amount, s.sale_date, s.customer_name, s.notes,
           s.created_by, s.created_at, o.name, q.product_name, q.uuid, u.name
    FROM public.sales s
    LEFT JOIN public.organizations o ON o.id = s.org_id
    LEFT JOIN public.qr_codes q ON q.id = s.qr_id
    LEFT JOIN public.users u ON u.id = s.created_by
    WHERE s.org_id = ANY(v_child_org_ids)
    ORDER BY s.sale_date DESC;
  ELSE
    RETURN QUERY
    SELECT s.id, s.org_id, s.qr_id, s.amount, s.sale_date, s.customer_name, s.notes,
           s.created_by, s.created_at, o.name, q.product_name, q.uuid, u.name
    FROM public.sales s
    LEFT JOIN public.organizations o ON o.id = s.org_id
    LEFT JOIN public.qr_codes q ON q.id = s.qr_id
    LEFT JOIN public.users u ON u.id = s.created_by
    WHERE s.org_id = v_org_id
    ORDER BY s.sale_date DESC;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_list(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_list(text) TO anon;

-- ============================================
-- 9. 매출 생성 RPC
-- ============================================
DROP FUNCTION IF EXISTS public.create_sale(text, numeric, uuid, text, text);
CREATE OR REPLACE FUNCTION public.create_sale(
  p_user_email text,
  p_amount numeric,
  p_qr_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  qr_id uuid,
  amount numeric,
  sale_date timestamptz,
  customer_name text,
  notes text,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_new_id uuid;
BEGIN
  SELECT u.id, u.org_id INTO v_user_id, v_org_id
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION('사용자를 찾을 수 없습니다.');
  END IF;

  INSERT INTO public.sales (org_id, qr_id, amount, customer_name, notes, created_by)
  VALUES (v_org_id, p_qr_id, p_amount, p_customer_name, p_notes, v_user_id)
  RETURNING id INTO v_new_id;

  RETURN QUERY
  SELECT s.id, s.org_id, s.qr_id, s.amount, s.sale_date, s.customer_name, s.notes, s.created_by, s.created_at
  FROM public.sales s WHERE s.id = v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale(text, numeric, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale(text, numeric, uuid, text, text) TO anon;

-- ============================================
-- 10. 설치완료 QR 목록 조회 RPC (매출등록용)
-- ============================================
DROP FUNCTION IF EXISTS public.get_installed_qrs(text);
CREATE OR REPLACE FUNCTION public.get_installed_qrs(p_user_email text)
RETURNS TABLE (
  id uuid,
  uuid text,
  product_name text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
  v_child_org_ids uuid[];
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT q.id, q.uuid, q.product_name, q.status
    FROM public.qr_codes q WHERE q.status = 'INSTALLED' ORDER BY q.created_at DESC;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    SELECT array_agg(c.org_id) INTO v_child_org_ids
    FROM public.get_all_child_orgs(v_org_id) c;
    v_child_org_ids := array_append(v_child_org_ids, v_org_id);

    RETURN QUERY SELECT q.id, q.uuid, q.product_name, q.status
    FROM public.qr_codes q WHERE q.status = 'INSTALLED' AND q.owner_org_id = ANY(v_child_org_ids)
    ORDER BY q.created_at DESC;
  ELSE
    RETURN QUERY SELECT q.id, q.uuid, q.product_name, q.status
    FROM public.qr_codes q WHERE q.status = 'INSTALLED' AND q.owner_org_id = v_org_id
    ORDER BY q.created_at DESC;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_installed_qrs(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_installed_qrs(text) TO anon;
