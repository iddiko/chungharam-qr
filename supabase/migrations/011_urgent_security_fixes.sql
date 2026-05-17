-- ============================================
-- 011_urgent_security_fixes.sql
-- 1단계 긴급 보안/버그 수정
-- ============================================

-- ============================================
-- 1. qr_transfer_requests.status에 RECEIVED 추가
--    (receive_qr_transfer RPC에서 RECEIVED로 업데이트하지만 CHECK 제약에 없어서 에러 발생)
-- ============================================

-- 기존 CHECK 제약 삭제 후 재생성
ALTER TABLE public.qr_transfer_requests
  DROP CONSTRAINT IF EXISTS qr_transfer_requests_status_check;

ALTER TABLE public.qr_transfer_requests
  ADD CONSTRAINT qr_transfer_requests_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'RECEIVED'));

-- ============================================
-- 2. RPC 함수에서 anon 권한 제거
--    (함수가 존재하지 않을 수 있으므로 DO 블록으로 안전하게 처리)
-- ============================================

DO $$
DECLARE
  r RECORD;
BEGIN
  -- 모든 public 스키마 함수에서 anon 권한 제거
  FOR r IN
    SELECT p.oid::regprocedure AS func_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.func_signature);
    EXCEPTION WHEN OTHERS THEN
      -- 함수가 존재하지 않거나 권한이 없으면 무시
      RAISE NOTICE 'Skipping: %', r.func_signature;
    END;
  END LOOP;
END;
$$;

-- ============================================
-- 3. Storage 버킷 정책 - 인증된 사용자만 업로드/조회 가능
-- ============================================

-- 기존 "Anyone" 정책 삭제
DROP POLICY IF EXISTS "Anyone can upload installation images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view installation images" ON storage.objects;

-- 인증된 사용자만 업로드 가능
CREATE POLICY "Authenticated users can upload installation images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'installations' AND auth.role() = 'authenticated');

-- 인증된 사용자만 조회 가능
CREATE POLICY "Authenticated users can view installation images" ON storage.objects
  FOR SELECT USING (bucket_id = 'installations' AND auth.role() = 'authenticated');

-- ============================================
-- 4. Supabase Auth 설정 - 공개 가입 차단
--    (이 설정은 Supabase Dashboard > Authentication > Settings에서도 변경 가능)
--    여기서는 RPC로 확인만 수행
-- ============================================

-- 참고: Auth 설정은 SQL로 직접 변경할 수 없음
-- 반드시 Supabase Dashboard에서 변경 필요:
-- Authentication > Settings > Email Auth > "Enable email signups" = OFF
-- 또는 초대 전용 모드 활성화
