-- ============================================
-- QR 목록 조회 RPC 함수 (RLS 우회)
-- SECURITY DEFINER로 실행되므로 RLS 정책을 우회함
-- ============================================

-- 기존 함수 삭제 (반환 타입 변경 시 필요)
DROP FUNCTION IF EXISTS public.get_qr_list(text);

-- QR 목록 조회 RPC 함수
CREATE OR REPLACE FUNCTION public.get_qr_list(p_user_email text)
RETURNS TABLE (
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  qr_status text,
  qr_parent_qr_id uuid
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

  -- super_admin: 모든 최상위 QR 조회
  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id
    FROM public.qr_codes q
    WHERE q.status = 'ACTIVE' AND q.parent_qr_id IS NULL
    ORDER BY q.created_at DESC
    LIMIT 50;

  -- hq, branch, sub_branch: 자기 조직 + 하위 조직의 최상위 QR 조회
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id
    FROM public.qr_codes q
    WHERE q.status = 'ACTIVE' 
      AND q.parent_qr_id IS NULL
      AND q.owner_org_id IN (
        SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
        UNION SELECT v_org_id
      )
    ORDER BY q.created_at DESC
    LIMIT 50;

  -- office, employee: 자기 조직의 최상위 QR만
  ELSE
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id
    FROM public.qr_codes q
    WHERE q.status = 'ACTIVE' 
      AND q.parent_qr_id IS NULL
      AND q.owner_org_id = v_org_id
    ORDER BY q.created_at DESC
    LIMIT 50;
  END IF;

  RETURN;
END;
$$;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.get_qr_list(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qr_list(text) TO anon;
