-- ============================================
-- QR 목록 조회 RPC 함수 v2 (RLS 우회)
-- 모든 QR(자식 포함), 모든 상태, 조직명 포함, 검색 지원
-- ============================================

-- 기존 함수 삭제
DROP FUNCTION IF EXISTS public.get_qr_list(text);
DROP FUNCTION IF EXISTS public.get_qr_list(text, text, text);

-- QR 목록 조회 RPC 함수 (검색 지원)
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
  -- 사용자 정보 조회
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u
  WHERE u.email = p_user_email
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- super_admin: 모든 QR 조회
  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name, q.created_at
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE (p_search IS NULL OR q.uuid ILIKE '%' || p_search || '%' OR q.product_name ILIKE '%' || p_search || '%')
      AND (p_status IS NULL OR q.status = p_status)
    ORDER BY q.created_at DESC
    LIMIT 500;

  -- hq, branch, sub_branch: 자기 조직 + 하위 조직의 QR 조회
  ELSIF v_role IN ('hq', 'branch', 'sub_branch') THEN
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name, q.created_at
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.owner_org_id IN (
      SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
      UNION SELECT v_org_id
    )
    AND (p_search IS NULL OR q.uuid ILIKE '%' || p_search || '%' OR q.product_name ILIKE '%' || p_search || '%')
    AND (p_status IS NULL OR q.status = p_status)
    ORDER BY q.created_at DESC
    LIMIT 500;

  -- office, employee: 자기 조직의 QR만
  ELSE
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, q.parent_qr_id, q.owner_org_id, o.name, q.created_at
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.owner_org_id = v_org_id
    AND (p_search IS NULL OR q.uuid ILIKE '%' || p_search || '%' OR q.product_name ILIKE '%' || p_search || '%')
    AND (p_status IS NULL OR q.status = p_status)
    ORDER BY q.created_at DESC
    LIMIT 500;
  END IF;

  RETURN;
END;
$$;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.get_qr_list(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qr_list(text, text, text) TO anon;
