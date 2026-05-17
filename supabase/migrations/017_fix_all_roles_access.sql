
-- ============================================
-- 017_fix_all_roles_access.sql
-- 모든 역할(본사/지사/지점/영업점/영업사원)이 정상 작동하도록 수정
-- ============================================

-- ============================================
-- 1. organizations RLS — office/employee도 자기 조직 조회 가능하도록 정책 추가
-- ============================================
DROP POLICY IF EXISTS "Office Employee can view organizations" ON public.organizations;

CREATE POLICY "Office Employee can view organizations" ON public.organizations
  FOR SELECT USING (
    organizations.path <@ public.get_user_org_path()
  );

-- ============================================
-- 2. installations RLS 정책 추가 (기존에 없으면 생성)
-- ============================================
DROP POLICY IF EXISTS "Office Employee can view installations" ON public.installations;
DROP POLICY IF EXISTS "HQ Branch SubBranch can view installations" ON public.installations;
DROP POLICY IF EXISTS "HQ Branch SubBranch can create installations" ON public.installations;

-- office/employee: 자기 조직의 QR에 대한 설치만 조회/생성
CREATE POLICY "Office Employee can view installations" ON public.installations
  FOR SELECT USING (
    (auth.jwt()->>'org_id')::uuid = (
      SELECT owner_org_id FROM public.qr_codes WHERE id = installations.qr_id
    )
  );

-- hq/branch/sub_branch: 하위 조직의 설치 조회
CREATE POLICY "HQ Branch SubBranch can view installations" ON public.installations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.qr_codes q
      JOIN public.organizations o ON o.id = q.owner_org_id
      WHERE q.id = installations.qr_id
        AND o.path <@ public.get_user_org_path()
    )
  );

-- hq/branch/sub_branch/office: 하위 조직의 설치 생성
CREATE POLICY "HQ Branch SubBranch can create installations" ON public.installations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.qr_codes q
      JOIN public.organizations o ON o.id = q.owner_org_id
      WHERE q.id = installations.qr_id
        AND o.path <@ public.get_user_org_path()
    )
  );

-- ============================================
-- 3. get_organizations() — 모든 역할이 자기 하위 조직까지 조회 가능
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
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
    -- 본사/지사/지점/영업점: 자기 조직 + 하위 조직 모두 조회
    RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at
    FROM public.organizations o
    WHERE o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ORDER BY o.name;
  ELSE
    -- employee: 자기 조직만
    RETURN QUERY SELECT o.id, o.name, o.type, o.parent_id, o.created_at
    FROM public.organizations o WHERE o.id = v_org_id;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organizations(text) TO authenticated;

-- ============================================
-- 4. get_users() — branch/sub_branch도 하위 조직 사용자 조회 가능
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

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
    FROM public.users u LEFT JOIN public.organizations o ON o.id = u.org_id ORDER BY u.name;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
    -- 본사/지사/지점/영업점: 하위 조직의 사용자 모두 조회
    RETURN QUERY SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
    FROM public.users u LEFT JOIN public.organizations o ON o.id = u.org_id
    WHERE o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ORDER BY u.name;
  ELSE
    -- employee: 자기 조직의 사용자만
    RETURN QUERY SELECT u.id, u.email, u.name, u.role, u.org_id, o.name, o.type
    FROM public.users u LEFT JOIN public.organizations o ON o.id = u.org_id
    WHERE u.org_id = v_org_id ORDER BY u.name;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_users(text) TO authenticated;

-- ============================================
-- 5. get_dashboard_stats() — 모든 역할이 풍부한 대시보드 제공
-- ============================================
DROP FUNCTION IF EXISTS public.get_dashboard_stats(text);

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_email text)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid; v_role text;
  v_total_orgs int := 0; v_total_users int := 0; v_total_qrs int := 0;
  v_active_qrs int := 0; v_pending_approval_qrs int := 0;
  v_total_sales bigint := 0; v_pending_transfers int := 0; v_installed int := 0;
  v_sub_branch_count int := 0; v_office_count int := 0; v_employee_count int := 0;
  v_child_org_ids uuid[];
  v_recent_qrs json; v_pending_transfer_list json;
  v_my_org_name text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_org_id IS NULL THEN RETURN '{}'::json; END IF;

  SELECT o.name INTO v_my_org_name FROM public.organizations o WHERE o.id = v_org_id;

  IF v_role = 'super_admin' THEN
    SELECT count(*) INTO v_total_orgs FROM public.organizations;
    SELECT count(*) INTO v_total_users FROM public.users;
    SELECT count(*) INTO v_total_qrs FROM public.qr_codes;
    SELECT count(*) INTO v_active_qrs FROM public.qr_codes WHERE status = 'ACTIVE';
    SELECT count(*) INTO v_pending_approval_qrs FROM public.qr_codes WHERE status = 'PENDING_APPROVAL';
    SELECT COALESCE(sum(amount), 0) INTO v_total_sales FROM public.sales;
    SELECT count(*) INTO v_pending_transfers FROM public.qr_transfer_requests WHERE status = 'PENDING';
    SELECT count(*) INTO v_installed FROM public.installations;
    SELECT count(*) INTO v_sub_branch_count FROM public.organizations WHERE type = 'sub_branch';
    SELECT count(*) INTO v_office_count FROM public.organizations WHERE type = 'office';
    SELECT count(*) INTO v_employee_count FROM public.users WHERE role = 'employee';

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

  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
    -- 하위 조직 ID 배열 (ltree 기반)
    SELECT array_agg(c.org_id) INTO v_child_org_ids FROM public.get_all_child_orgs(v_org_id) c;
    v_child_org_ids := array_append(v_child_org_ids, v_org_id);

    SELECT count(*) INTO v_total_orgs FROM public.organizations WHERE id = ANY(v_child_org_ids);
    SELECT count(*) INTO v_total_users FROM public.users WHERE org_id = ANY(v_child_org_ids);
    SELECT count(*) INTO v_total_qrs FROM public.qr_codes WHERE owner_org_id = ANY(v_child_org_ids);
    SELECT count(*) INTO v_active_qrs FROM public.qr_codes WHERE owner_org_id = ANY(v_child_org_ids) AND status = 'ACTIVE';
    SELECT count(*) INTO v_pending_approval_qrs FROM public.qr_codes WHERE owner_org_id = ANY(v_child_org_ids) AND status = 'PENDING_APPROVAL';
    SELECT COALESCE(sum(amount), 0) INTO v_total_sales FROM public.sales WHERE org_id = ANY(v_child_org_ids);
    SELECT count(*) INTO v_pending_transfers FROM public.qr_transfer_requests
      WHERE status = 'PENDING' AND (from_org_id = ANY(v_child_org_ids) OR to_org_id = ANY(v_child_org_ids));
    SELECT count(*) INTO v_installed FROM public.installations i
      JOIN public.qr_codes q ON q.id = i.qr_id WHERE q.owner_org_id = ANY(v_child_org_ids);
    SELECT count(*) INTO v_sub_branch_count FROM public.organizations WHERE id = ANY(v_child_org_ids) AND type = 'sub_branch';
    SELECT count(*) INTO v_office_count FROM public.organizations WHERE id = ANY(v_child_org_ids) AND type = 'office';
    SELECT count(*) INTO v_employee_count FROM public.users WHERE org_id = ANY(v_child_org_ids) AND role = 'employee';

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
    -- employee: 자기 조직만
    SELECT count(*) INTO v_total_qrs FROM public.qr_codes WHERE owner_org_id = v_org_id;
    SELECT count(*) INTO v_active_qrs FROM public.qr_codes WHERE owner_org_id = v_org_id AND status = 'ACTIVE';
    SELECT COALESCE(sum(amount), 0) INTO v_total_sales FROM public.sales WHERE org_id = v_org_id;
    SELECT count(*) INTO v_pending_transfers FROM public.qr_transfer_requests
      WHERE status = 'PENDING' AND (from_org_id = v_org_id OR to_org_id = v_org_id);
    SELECT count(*) INTO v_installed FROM public.installations i
      JOIN public.qr_codes q ON q.id = i.qr_id WHERE q.owner_org_id = v_org_id;

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
    'activeQRs', v_active_qrs, 'pendingApprovalQRs', v_pending_approval_qrs,
    'totalSales', v_total_sales, 'pendingTransfers', v_pending_transfers,
    'installedCount', v_installed, 'subBranchCount', v_sub_branch_count,
    'officeCount', v_office_count, 'employeeCount', v_employee_count,
    'myOrgName', COALESCE(v_my_org_name, ''),
    'recentQRs', COALESCE(v_recent_qrs, '[]'::json),
    'pendingTransferList', COALESCE(v_pending_transfer_list, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(text) TO authenticated;

-- ============================================
-- 6. get_qr_list() — office/employee도 하위 QR 조회 가능
-- ============================================
DROP FUNCTION IF EXISTS public.get_qr_list(text, text, text);

CREATE OR REPLACE FUNCTION public.get_qr_list(
  p_user_email text, p_search text DEFAULT NULL, p_status text DEFAULT NULL
)
RETURNS TABLE (
  qr_id uuid, qr_uuid text, qr_product_name text, qr_status text,
  qr_parent_qr_id uuid, qr_owner_org_id uuid, org_name text, qr_created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_org_id uuid; v_role text;
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
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
    -- 본사/지사/지점/영업점: 하위 조직의 QR 모두 조회
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name, q.created_at
    FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
      AND (p_search IS NULL OR q.uuid ILIKE '%' || p_search || '%' OR q.product_name ILIKE '%' || p_search || '%')
      AND (p_status IS NULL OR q.status = p_status)
    ORDER BY q.created_at DESC LIMIT 500;
  ELSE
    -- employee: 자기 조직의 QR만
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
-- 7. get_qr_all_list() — office도 하위 QR 조회
-- ============================================
DROP FUNCTION IF EXISTS public.get_qr_all_list(text);

CREATE OR REPLACE FUNCTION public.get_qr_all_list(p_user_email text)
RETURNS TABLE (
  qr_id uuid, qr_uuid text, qr_product_name text, qr_status text,
  qr_parent_qr_id uuid, qr_owner_org_id uuid, org_name text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_org_id uuid; v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name
    FROM public.qr_codes q LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    ORDER BY q.created_at DESC LIMIT 200;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
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
-- 8. get_install_list() — office도 하위 설치 조회
-- ============================================
DROP FUNCTION IF EXISTS public.get_install_list(text);

CREATE OR REPLACE FUNCTION public.get_install_list(p_user_email text)
RETURNS TABLE (
  install_id uuid, qr_uuid text, qr_product_name text, image_url text,
  latitude numeric, longitude numeric, installer_name text,
  installer_org_name text, installed_at timestamptz, qr_status text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_org_id uuid; v_role text;
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
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
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
-- 9. get_sales_list() — office/employee도 매출 조회
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
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
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
-- 10. get_commission_records() — office도 수수료 조회
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
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
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
-- 11. get_invitations() — branch/sub_branch/office도 초대 조회
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
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
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
-- 12. create_invitation() — branch/sub_branch/office도 하위 조직에 초대 가능
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

  -- 권한: super_admin, hq, branch, sub_branch, office 모두 초대 가능
  IF v_role NOT IN ('super_admin', 'hq', 'branch', 'sub_branch', 'office') THEN
    RAISE EXCEPTION '초대 권한이 없습니다.';
  END IF;

  -- super_admin이 아니면 자기 하위 조직에만 초대 가능
  IF v_role != 'super_admin' THEN
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
-- 13. distribute_commission() — 무한 루프 수정 + 권한 확장
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
  v_role text; v_org_id uuid; v_qr_org_id uuid;
  v_current_org_id uuid; v_current_org_type text; v_current_org_name text; v_current_parent_id uuid;
  v_comm_type text; v_comm_value numeric; v_comm_amount numeric;
BEGIN
  SELECT u.role, u.org_id INTO v_role, v_org_id
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_role NOT IN ('super_admin', 'hq', 'branch', 'sub_branch', 'office') THEN
    RAISE EXCEPTION '수수료 분배 권한이 없습니다.';
  END IF;

  SELECT q.owner_org_id INTO v_qr_org_id FROM public.qr_codes q WHERE q.id = p_qr_id;
  IF v_qr_org_id IS NULL THEN RAISE EXCEPTION 'QR 코드를 찾을 수 없습니다.'; END IF;

  -- QR 소유 조직에서부터 상위로 올라가며 분배
  v_current_org_id := v_qr_org_id;
  WHILE v_current_org_id IS NOT NULL LOOP
    SELECT o.type, o.name, o.parent_id INTO v_current_org_type, v_current_org_name, v_current_parent_id
    FROM public.organizations o WHERE o.id = v_current_org_id;

    SELECT cs.commission_type, cs.commission_value INTO v_comm_type, v_comm_value
    FROM public.commission_settings cs WHERE cs.org_type = v_current_org_type AND cs.is_active = true LIMIT 1;

    IF v_comm_type IS NOT NULL THEN
      IF v_comm_type = 'percentage' THEN v_comm_amount := p_sale_amount * v_comm_value / 100.0;
      ELSE v_comm_amount := v_comm_value; END IF;

      INSERT INTO public.commission_records (qr_id, org_id, org_type, commission_type, commission_rate, sale_amount, commission_amount, status)
      VALUES (p_qr_id, v_current_org_id, v_current_org_type, v_comm_type, v_comm_value, p_sale_amount, v_comm_amount, 'PENDING')
      ON CONFLICT DO NOTHING;

      org_id := v_current_org_id; org_name := v_current_org_name; org_type := v_current_org_type;
      commission_type := v_comm_type; commission_rate := v_comm_value; commission_amount := v_comm_amount;
      RETURN NEXT;
    END IF;

    -- 상위 조직으로 이동 (parent_id가 NULL이면 루트, 루프 종료)
    v_current_org_id := v_current_parent_id;
  END LOOP;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.distribute_commission(text, uuid, numeric) TO authenticated;

-- ============================================
-- 14. get_transfer_requests() — office도 이동 요청 조회
-- ============================================
DROP FUNCTION IF EXISTS public.get_transfer_requests(text);

CREATE OR REPLACE FUNCTION public.get_transfer_requests(p_user_email text)
RETURNS TABLE (
  request_id uuid, qr_uuid text, qr_product_name text,
  from_org_name text, to_org_name text, status text,
  requested_at timestamptz, approved_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_org_id uuid; v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT t.id, q.uuid, q.product_name, fo.name, to2.name, t.status, t.requested_at, t.approved_at
    FROM public.qr_transfer_requests t
    JOIN public.qr_codes q ON q.id = t.qr_id
    LEFT JOIN public.organizations fo ON fo.id = t.from_org_id
    LEFT JOIN public.organizations to2 ON to2.id = t.to_org_id
    ORDER BY t.requested_at DESC;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
    RETURN QUERY
    SELECT t.id, q.uuid, q.product_name, fo.name, to2.name, t.status, t.requested_at, t.approved_at
    FROM public.qr_transfer_requests t
    JOIN public.qr_codes q ON q.id = t.qr_id
    LEFT JOIN public.organizations fo ON fo.id = t.from_org_id
    LEFT JOIN public.organizations to2 ON to2.id = t.to_org_id
    WHERE (fo.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
       OR to2.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id))
    ORDER BY t.requested_at DESC;
  ELSE
    RETURN QUERY
    SELECT t.id, q.uuid, q.product_name, fo.name, to2.name, t.status, t.requested_at, t.approved_at
    FROM public.qr_transfer_requests t
    JOIN public.qr_codes q ON q.id = t.qr_id
    LEFT JOIN public.organizations fo ON fo.id = t.from_org_id
    LEFT JOIN public.organizations to2 ON to2.id = t.to_org_id
    WHERE t.from_org_id = v_org_id OR t.to_org_id = v_org_id
    ORDER BY t.requested_at DESC;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_transfer_requests(text) TO authenticated;

-- ============================================
-- 15. path 데이터 최종 확정
-- ============================================
SELECT public.update_org_path();
