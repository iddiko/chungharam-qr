-- ============================================
-- Custom Claims 자동 설정 트리거
-- users 테이블 변경 시 auth.users의 app_metadata에 role, org_id 설정
-- ============================================

-- 트리거 함수 생성
CREATE OR REPLACE FUNCTION public.handle_custom_claims()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- auth.users의 app_metadata 업데이트
  UPDATE auth.users
  SET raw_app_meta = jsonb_set(
    jsonb_set(
      COALESCE(raw_app_meta, '{}'::jsonb),
      '{role}',
      to_jsonb(NEW.role)
    ),
    '{org_id}',
    to_jsonb(NEW.org_id)
  )
  WHERE id = (
    SELECT id FROM auth.users WHERE email = NEW.email LIMIT 1
  );
  RETURN NEW;
END;
$$;

-- 트리거 생성
DROP TRIGGER IF EXISTS on_user_change ON public.users;
CREATE TRIGGER on_user_change
  AFTER INSERT OR UPDATE OF role, org_id ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_custom_claims();

-- ============================================
-- 기존 사용자들의 custom claims 일괄 설정
-- ============================================
UPDATE auth.users u
SET raw_app_meta = jsonb_set(
  jsonb_set(
    COALESCE(u.raw_app_meta, '{}'::jsonb),
    '{role}',
    to_jsonb(usr.role)
  ),
  '{org_id}',
  to_jsonb(usr.org_id)
)
FROM public.users usr
WHERE usr.email = u.email;
