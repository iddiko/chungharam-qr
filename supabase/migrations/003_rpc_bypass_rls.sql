-- ============================================
-- RLS 무한 재귀 우회용 RPC 함수
-- SECURITY DEFINER로 실행되므로 RLS 정책을 우회함
-- ============================================

CREATE OR REPLACE FUNCTION public.get_current_user_info(user_email text)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  role text,
  name text,
  email text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.org_id, u.role, u.name, u.email, u.created_at
  FROM public.users u
  WHERE u.email = user_email
  LIMIT 1;
END;
$$;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.get_current_user_info(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_info(text) TO anon;
