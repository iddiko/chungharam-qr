-- ============================================
-- 012_invitation_system.sql
-- 초대 기반 회원가입 시스템
-- ============================================

-- ============================================
-- 1. user_invitations 테이블 생성
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'hq', 'branch', 'sub_branch', 'office', 'employee')),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED')),
  invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.user_invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_org_id ON public.user_invitations(org_id);

-- RLS 활성화
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- RLS 정책: super_admin, hq만 조회/생성 가능
CREATE POLICY "Super admin and HQ can view invitations" ON public.user_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email()
      AND u.role IN ('super_admin', 'hq')
    )
  );

CREATE POLICY "Super admin and HQ can create invitations" ON public.user_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email()
      AND u.role IN ('super_admin', 'hq')
    )
  );

CREATE POLICY "Super admin and HQ can update invitations" ON public.user_invitations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email()
      AND u.role IN ('super_admin', 'hq')
    )
  );

-- 만료된 초대 자동 처리 함수 (cron 또는 수동 실행)
CREATE OR REPLACE FUNCTION public.expire_invitations()
RETURNS void AS $$
BEGIN
  UPDATE public.user_invitations
  SET status = 'EXPIRED'
  WHERE status = 'PENDING' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.expire_invitations() TO authenticated;

-- ============================================
-- 2. 초대 생성 RPC 함수
-- ============================================
CREATE OR REPLACE FUNCTION public.create_invitation(
  p_user_email text,
  p_invitee_email text,
  p_invitee_name text,
  p_invitee_role text,
  p_invitee_org_id uuid
)
RETURNS TABLE (
  invitation_id uuid,
  invitation_token text,
  invitee_email text,
  invitee_name text,
  invitee_role text,
  org_name text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_org_id uuid;
  v_new_id uuid;
  v_token text;
  v_org_name text;
BEGIN
  -- 1. 호출자 권한 확인
  SELECT u.id, u.role, u.org_id INTO v_user_id, v_role, v_org_id
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '초대 권한이 없습니다. (super_admin, hq만 가능)';
  END IF;

  -- 2. HQ는 자기 하위 조직에만 초대 가능
  IF v_role = 'hq' THEN
    IF p_invitee_org_id != v_org_id AND p_invitee_org_id NOT IN (
      SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c
    ) THEN
      RAISE EXCEPTION '자기 하위 조직에만 초대할 수 있습니다.';
    END IF;
  END IF;

  -- 3. 이미 가입된 사용자인지 확인
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.email = p_invitee_email) THEN
    RAISE EXCEPTION '이미 가입된 이메일입니다.';
  END IF;

  -- 4. 대기 중인 초대가 있는지 확인
  IF EXISTS (
    SELECT 1 FROM public.user_invitations
    WHERE email = p_invitee_email AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION '이미 대기 중인 초대가 있습니다.';
  END IF;

  -- 5. 조직명 조회
  SELECT o.name INTO v_org_name
  FROM public.organizations o WHERE o.id = p_invitee_org_id LIMIT 1;

  -- 6. 초대 생성
  INSERT INTO public.user_invitations (email, name, role, org_id, invited_by)
  VALUES (p_invitee_email, p_invitee_name, p_invitee_role, p_invitee_org_id, v_user_id)
  RETURNING id, token INTO v_new_id, v_token;

  invitation_id := v_new_id;
  invitation_token := v_token;
  invitee_email := p_invitee_email;
  invitee_name := p_invitee_name;
  invitee_role := p_invitee_role;
  org_name := COALESCE(v_org_name, '');
  expires_at := (NOW() + INTERVAL '7 days');
  RETURN NEXT;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invitation(text, text, text, text, uuid) TO authenticated;

-- ============================================
-- 3. 초대 목록 조회 RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.get_invitations(p_user_email text)
RETURNS TABLE (
  invitation_id uuid,
  invitee_email text,
  invitee_name text,
  invitee_role text,
  org_name text,
  status text,
  invited_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_org_id uuid;
BEGIN
  SELECT u.role, u.org_id INTO v_role, v_org_id
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT i.id, i.email, i.name, i.role, o.name, i.status, i.invited_at, i.expires_at
    FROM public.user_invitations i
    LEFT JOIN public.organizations o ON o.id = i.org_id
    ORDER BY i.invited_at DESC;
  ELSIF v_role = 'hq' THEN
    RETURN QUERY
    SELECT i.id, i.email, i.name, i.role, o.name, i.status, i.invited_at, i.expires_at
    FROM public.user_invitations i
    LEFT JOIN public.organizations o ON o.id = i.org_id
    WHERE i.org_id = v_org_id
       OR i.org_id IN (SELECT c.org_id FROM public.get_all_child_orgs(v_org_id) c)
    ORDER BY i.invited_at DESC;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitations(text) TO authenticated;

-- ============================================
-- 4. 초대 취소 RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.cancel_invitation(
  p_user_email text,
  p_invitation_id uuid
)
RETURNS TABLE (result text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  SELECT u.role INTO v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '취소 권한이 없습니다.';
  END IF;

  SELECT i.status INTO v_status
  FROM public.user_invitations i WHERE i.id = p_invitation_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION '초대를 찾을 수 없습니다.';
  END IF;

  IF v_status != 'PENDING' THEN
    RAISE EXCEPTION '대기 중인 초대만 취소할 수 있습니다.';
  END IF;

  UPDATE public.user_invitations SET status = 'CANCELLED' WHERE id = p_invitation_id;

  result := 'CANCELLED';
  RETURN NEXT;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_invitation(text, uuid) TO authenticated;

-- ============================================
-- 5. 토큰으로 초대 정보 조회 (회원가입 페이지에서 사용)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token text)
RETURNS TABLE (
  invitation_id uuid,
  invitee_email text,
  invitee_name text,
  invitee_role text,
  org_id uuid,
  org_name text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 만료 처리
  UPDATE public.user_invitations
  SET status = 'EXPIRED'
  WHERE status = 'PENDING' AND expires_at < NOW();

  RETURN QUERY
  SELECT i.id, i.email, i.name, i.role, i.org_id, o.name, i.status, i.expires_at
  FROM public.user_invitations i
  LEFT JOIN public.organizations o ON o.id = i.org_id
  WHERE i.token = p_token AND i.status = 'PENDING'
  LIMIT 1;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO authenticated;

-- ============================================
-- 6. 초대 수락 - users 테이블에 자동 생성
-- ============================================
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token text,
  p_auth_user_id uuid
)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  user_email text,
  user_role text,
  org_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_org_name text;
BEGIN
  -- 1. 만료 처리
  UPDATE public.user_invitations
  SET status = 'EXPIRED'
  WHERE status = 'PENDING' AND expires_at < NOW();

  -- 2. 초대 조회
  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token = p_token AND status = 'PENDING'
  LIMIT 1;

  IF v_invitation IS NULL THEN
    RAISE EXCEPTION '유효하지 않거나 만료된 초대입니다.';
  END IF;

  -- 3. 이미 users에 존재하는지 확인
  IF EXISTS (SELECT 1 FROM public.users WHERE email = v_invitation.email) THEN
    RAISE EXCEPTION '이미 가입된 사용자입니다.';
  END IF;

  -- 4. users 테이블에 생성 (id = auth user id)
  INSERT INTO public.users (id, org_id, role, name, email)
  VALUES (p_auth_user_id, v_invitation.org_id, v_invitation.role, v_invitation.name, v_invitation.email);

  -- 5. 초대 상태 업데이트
  UPDATE public.user_invitations
  SET status = 'ACCEPTED', accepted_at = NOW()
  WHERE id = v_invitation.id;

  -- 6. 조직명 조회
  SELECT o.name INTO v_org_name
  FROM public.organizations o WHERE o.id = v_invitation.org_id;

  user_id := p_auth_user_id;
  user_name := v_invitation.name;
  user_email := v_invitation.email;
  user_role := v_invitation.role;
  org_name := COALESCE(v_org_name, '');
  RETURN NEXT;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid) TO authenticated;
