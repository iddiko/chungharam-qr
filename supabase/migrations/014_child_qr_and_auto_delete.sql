-- ============================================
-- 014_child_qr_and_auto_delete.sql
-- 자식 QR 생성 + 자동 삭제 정책
-- ============================================

-- ============================================
-- 1. 자식 QR 생성 RPC
--    영업점에서 부모 QR에 연결된 자식 QR 생성
-- ============================================
CREATE OR REPLACE FUNCTION public.create_child_qr(
  p_user_email text,
  p_parent_qr_uuid text,
  p_product_name text
)
RETURNS TABLE (
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  parent_qr_uuid text,
  owner_org_name text,
  qr_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_parent_qr_id uuid;
  v_parent_org_id uuid;
  v_parent_status text;
  v_new_qr_id uuid;
  v_new_uuid text;
  v_org_name text;
BEGIN
  -- 1. 사용자 정보
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  -- 2. 자식 QR 생성 권한: office, employee, hq, super_admin
  IF v_role NOT IN ('super_admin', 'hq', 'office', 'employee') THEN
    RAISE EXCEPTION '자식 QR 생성 권한이 없습니다.';
  END IF;

  -- 3. 부모 QR 조회
  SELECT q.id, q.owner_org_id, q.status
  INTO v_parent_qr_id, v_parent_org_id, v_parent_status
  FROM public.qr_codes q WHERE q.uuid = p_parent_qr_uuid LIMIT 1;

  IF v_parent_qr_id IS NULL THEN
    RAISE EXCEPTION '부모 QR 코드를 찾을 수 없습니다.';
  END IF;

  -- 4. 부모 QR은 반드시 자기 조직 소유
  IF v_role != 'super_admin' AND v_parent_org_id != v_org_id THEN
    RAISE EXCEPTION '자기 조직의 QR만 부모로 지정할 수 있습니다.';
  END IF;

  -- 5. 부모 QR이 ACTIVE 상태인지 확인
  IF v_parent_status != 'ACTIVE' THEN
    RAISE EXCEPTION '활성 상태의 QR만 부모로 지정할 수 있습니다. 현재 상태: %', v_parent_status;
  END IF;

  -- 6. 자식 QR UUID 생성
  v_new_uuid := 'C-' || substr(gen_random_uuid()::text, 1, 12);

  -- 7. 자식 QR 생성
  INSERT INTO public.qr_codes (uuid, parent_qr_id, product_name, owner_org_id, status)
  VALUES (v_new_uuid, v_parent_qr_id, p_product_name, v_org_id, 'ACTIVE')
  RETURNING id, uuid INTO v_new_qr_id, v_new_uuid;

  -- 8. 조직명
  SELECT o.name INTO v_org_name
  FROM public.organizations o WHERE o.id = v_org_id;

  -- 9. 타임라인
  INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
  VALUES (v_new_qr_id, '자식 QR 생성', v_user_id, COALESCE(v_org_name, ''));

  -- 10. 결과 반환
  qr_id := v_new_qr_id;
  qr_uuid := v_new_uuid;
  qr_product_name := p_product_name;
  parent_qr_uuid := p_parent_qr_uuid;
  owner_org_name := COALESCE(v_org_name, '');
  qr_status := 'ACTIVE';
  RETURN NEXT;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_child_qr(text, text, text) TO authenticated;

-- ============================================
-- 2. 자동 삭제 정책 설정 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS public.auto_delete_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL CHECK (table_name IN ('qr_timeline', 'installations', 'commission_records', 'qr_transfer_requests')),
  retention_months INTEGER NOT NULL DEFAULT 3 CHECK (retention_months IN (3, 6)),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  last_run_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT unique_table_setting UNIQUE (table_name)
);

-- RLS 활성화
ALTER TABLE public.auto_delete_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin and HQ can manage auto_delete_settings" ON public.auto_delete_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email()
      AND u.role IN ('super_admin', 'hq')
    )
  );

CREATE POLICY "All authenticated can view auto_delete_settings" ON public.auto_delete_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- 기본 설정
INSERT INTO public.auto_delete_settings (table_name, retention_months, is_enabled) VALUES
  ('qr_timeline', 6, false),
  ('installations', 6, false),
  ('commission_records', 3, false),
  ('qr_transfer_requests', 3, false)
ON CONFLICT (table_name) DO NOTHING;

-- ============================================
-- 3. 자동 삭제 실행 함수 (수동 또는 cron에서 호출)
-- ============================================
CREATE OR REPLACE FUNCTION public.run_auto_delete()
RETURNS TABLE (
  table_name text,
  deleted_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_count bigint;
BEGIN
  FOR v_rec IN
    SELECT table_name, retention_months
    FROM public.auto_delete_settings
    WHERE is_enabled = true
  LOOP
    v_count := 0;

    IF v_rec.table_name = 'qr_timeline' THEN
      DELETE FROM public.qr_timeline
      WHERE created_at < NOW() - (v_rec.retention_months || ' months')::interval;
      GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSIF v_rec.table_name = 'installations' THEN
      DELETE FROM public.installations
      WHERE installed_at < NOW() - (v_rec.retention_months || ' months')::interval;
      GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSIF v_rec.table_name = 'commission_records' THEN
      DELETE FROM public.commission_records
      WHERE created_at < NOW() - (v_rec.retention_months || ' months')::interval;
      GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSIF v_rec.table_name = 'qr_transfer_requests' THEN
      DELETE FROM public.qr_transfer_requests
      WHERE requested_at < NOW() - (v_rec.retention_months || ' months')::interval;
      GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;

    -- 마지막 실행 시간 업데이트
    UPDATE public.auto_delete_settings
    SET last_run_at = NOW()
    WHERE table_name = v_rec.table_name;

    table_name := v_rec.table_name;
    deleted_count := v_count;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_auto_delete() TO authenticated;

-- ============================================
-- 4. 자동 삭제 설정 조회 RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.get_auto_delete_settings(p_user_email text)
RETURNS TABLE (
  id uuid,
  table_name text,
  retention_months integer,
  is_enabled boolean,
  last_run_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT u.role INTO v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '자동 삭제 설정 조회 권한이 없습니다.';
  END IF;

  RETURN QUERY
  SELECT ads.id, ads.table_name, ads.retention_months, ads.is_enabled, ads.last_run_at
  FROM public.auto_delete_settings ads
  ORDER BY ads.table_name;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_auto_delete_settings(text) TO authenticated;

-- ============================================
-- 5. 자동 삭제 설정 업데이트 RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.update_auto_delete_setting(
  p_user_email text,
  p_table_name text,
  p_retention_months integer,
  p_is_enabled boolean
)
RETURNS TABLE (result text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_user_id uuid;
BEGIN
  SELECT u.id, u.role INTO v_user_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '자동 삭제 설정 변경 권한이 없습니다.';
  END IF;

  UPDATE public.auto_delete_settings
  SET retention_months = p_retention_months,
      is_enabled = p_is_enabled,
      updated_at = NOW(),
      updated_by = v_user_id
  WHERE table_name = p_table_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION '설정을 찾을 수 없습니다: %', p_table_name;
  END IF;

  result := 'UPDATED';
  RETURN NEXT;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_auto_delete_setting(text, text, integer, boolean) TO authenticated;
