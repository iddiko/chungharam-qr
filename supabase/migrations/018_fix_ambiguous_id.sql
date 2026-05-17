
-- ============================================
-- 018_fix_ambiguous_id.sql
-- RETURNS TABLE의 id 컬럼과 서브쿼리의 id가 충돌하는 문제 수정
-- "column reference 'id' is ambiguous" 에러 해결
-- ============================================

-- 1. get_organizations() 수정
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
    WHERE o.path <@ (SELECT o2.path FROM public.organizations o2 WHERE o2.id = v_org_id)
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

-- 2. get_users() 수정
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
    WHERE o.path <@ (SELECT o2.path FROM public.organizations o2 WHERE o2.id = v_org_id)
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
