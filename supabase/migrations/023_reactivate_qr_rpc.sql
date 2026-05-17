
-- ============================================
-- 023: QR 재활성화 RPC 함수
-- ============================================

CREATE OR REPLACE FUNCTION public.reactivate_qr(
  p_user_email text,
  p_qr_id uuid
)
RETURNS TABLE (
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  old_status text,
  new_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_qr_org_id uuid;
  v_qr_status text;
  v_qr_uuid text;
  v_qr_product_name text;
  v_org_name text;
BEGIN
  -- 1. 사용자 정보
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  -- 2. 권한 확인: super_admin, hq만 재활성화 가능
  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '재활성화 권한이 없습니다. 관리자에게 문의하세요.';
  END IF;

  -- 3. QR 코드 조회
  SELECT q.owner_org_id, q.status, q.uuid, q.product_name
  INTO v_qr_org_id, v_qr_status, v_qr_uuid, v_qr_product_name
  FROM public.qr_codes q WHERE q.id = p_qr_id LIMIT 1;

  IF v_qr_org_id IS NULL THEN
    RAISE EXCEPTION 'QR 코드를 찾을 수 없습니다.';
  END IF;

  -- 4. 재활성화 가능 상태 확인
  IF v_qr_status NOT IN ('INACTIVE', 'PENDING') THEN
    RAISE EXCEPTION '재활성화할 수 없는 상태입니다. 현재 상태: %', v_qr_status;
  END IF;

  -- 5. 조직명
  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id LIMIT 1;

  -- 6. QR 상태를 ACTIVE로 변경
  UPDATE public.qr_codes SET status = 'ACTIVE' WHERE id = p_qr_id;

  -- 7. 이동 대기 중인 요청이 있으면 취소
  UPDATE public.qr_transfer_requests
  SET status = 'REJECTED', approved_at = NOW(), approved_by = v_user_id
  WHERE qr_id = p_qr_id AND status = 'PENDING';

  -- 8. 타임라인 기록
  INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
  VALUES (p_qr_id, '재활성화 (' || v_qr_status || ' → ACTIVE)', v_user_id, COALESCE(v_org_name, ''));

  -- 9. 결과 반환
  qr_id := p_qr_id;
  qr_uuid := v_qr_uuid;
  qr_product_name := v_qr_product_name;
  old_status := v_qr_status;
  new_status := 'ACTIVE';
  RETURN NEXT;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reactivate_qr(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_qr(text, uuid) TO anon;
