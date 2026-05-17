
-- ============================================
-- 015_ltree_geography_approval_workflow.sql
-- 1. ltree 확장으로 계층 조회 O(1) 최적화
-- 2. GEOGRAPHY(Point)로 지도 시각화 성능 향상
-- 3. PENDING_APPROVAL 상태 + 승인 워크플로우 추가
-- ============================================

-- ============================================
-- 1. ltree 확장 활성화 및 조직 경로 컬럼 추가
-- ============================================
CREATE EXTENSION IF NOT EXISTS ltree;

-- organizations에 path 컬럼 추가
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS path ltree;

-- path 업데이트 함수 (재귀적으로 전체 경로 설정)
CREATE OR REPLACE FUNCTION public.update_org_path()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- 루트 조직 (parent_id IS NULL)
  UPDATE public.organizations
  SET path = text2ltree(replace(id::text, '-', '_'))
  WHERE parent_id IS NULL AND path IS NULL;

  -- 반복적으로 하위 조직 업데이트 (최대 10레벨)
  FOR i IN 1..10 LOOP
    UPDATE public.organizations c
    SET path = p.path || text2ltree(replace(c.id::text, '-', '_'))
    FROM public.organizations p
    WHERE c.parent_id = p.id
      AND p.path IS NOT NULL
      AND (c.path IS NULL OR c.path != p.path || text2ltree(replace(c.id::text, '-', '_')));
  END LOOP;
END;
$$;

-- 초기 path 데이터 생성
SELECT public.update_org_path();

-- trigger: 조직 생성/수정 시 자동으로 path 업데이트
CREATE OR REPLACE FUNCTION public.org_path_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NULL THEN
      NEW.path := text2ltree(replace(NEW.id::text, '-', '_'));
    ELSE
      SELECT path || text2ltree(replace(NEW.id::text, '-', '_')) INTO NEW.path
      FROM public.organizations WHERE id = NEW.parent_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    IF NEW.parent_id IS NULL THEN
      NEW.path := text2ltree(replace(NEW.id::text, '-', '_'));
    ELSE
      SELECT path || text2ltree(replace(NEW.id::text, '-', '_')) INTO NEW.path
      FROM public.organizations WHERE id = NEW.parent_id;
    END IF;
    -- 하위 조직 path도 갱신
    PERFORM public.update_org_path();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_path ON public.organizations;
CREATE TRIGGER trg_org_path
  BEFORE INSERT OR UPDATE OF parent_id ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.org_path_trigger();

-- ltree 인덱스 (GiST) — 하위 조직 조회 O(1)
CREATE INDEX IF NOT EXISTS idx_organizations_path_gist ON public.organizations USING gist(path);

-- ============================================
-- 2. PostGIS 확장 활성화 + QR 코드에 GEOGRAPHY(Point) 컬럼 추가
-- ============================================
-- Supabase에서 PostGIS 확장 활성화 (extensions 스키마 우선, 이미 설치된 경우 무시)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    -- extensions 스키마에 설치 시도 (Supabase 기본)
    BEGIN
      CREATE EXTENSION postgis SCHEMA extensions;
    EXCEPTION WHEN OTHERS THEN
      -- 실패 시 public 스키마에 설치
      CREATE EXTENSION postgis SCHEMA public;
    END;
  END IF;
END $$;

-- PostGIS 타입 검색 경로에 extensions 스키마 추가 (Supabase 호환)
SET search_path = public, extensions, "$user";

ALTER TABLE public.qr_codes
  ADD COLUMN IF NOT EXISTS last_scan_location geography(Point, 4326);

ALTER TABLE public.qr_codes
  ADD COLUMN IF NOT EXISTS last_scan_at timestamptz;

-- 위치 기반 인덱스 (GiST) — 지도 범위 쿼리 O(1)
CREATE INDEX IF NOT EXISTS idx_qr_codes_location_gist ON public.qr_codes USING gist(last_scan_location);

-- ============================================
-- 3. QR 상태에 PENDING_APPROVAL 추가
-- ============================================
ALTER TABLE public.qr_codes
  DROP CONSTRAINT IF EXISTS qr_codes_status_check;

ALTER TABLE public.qr_codes
  ADD CONSTRAINT qr_codes_status_check
  CHECK (status IN (
    'ACTIVE',
    'PENDING',
    'PENDING_APPROVAL',
    'APPROVED',
    'RECEIVED',
    'INSTALLED',
    'COMPLETED',
    'SETTLED',
    'REJECTED',
    'LOCKED'
  ));

-- ============================================
-- 4. 설치 승인 워크플로우 RPC
--    영업사원 스캔 → PENDING_APPROVAL → 상위 관리자 승인 → COMPLETED + 수수료 분배
-- ============================================

-- 4-1. QR 스캔 RPC (영업사원이 현장에서 스캔)
CREATE OR REPLACE FUNCTION public.scan_qr(
  p_user_email text,
  p_qr_uuid text,
  p_latitude numeric,
  p_longitude numeric
)
RETURNS TABLE (
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  qr_status text,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_qr_id uuid;
  v_qr_org_id uuid;
  v_qr_status text;
  v_qr_product_name text;
  v_org_name text;
BEGIN
  -- 1. 사용자 정보
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  -- 2. QR 코드 조회
  SELECT q.id, q.owner_org_id, q.status, q.product_name
  INTO v_qr_id, v_qr_org_id, v_qr_status, v_qr_product_name
  FROM public.qr_codes q WHERE q.uuid = p_qr_uuid LIMIT 1;

  IF v_qr_id IS NULL THEN
    RAISE EXCEPTION 'QR 코드를 찾을 수 없습니다.';
  END IF;

  -- 3. 스캔 가능 상태 확인 (RECEIVED 또는 ACTIVE)
  IF v_qr_status NOT IN ('RECEIVED', 'ACTIVE') THEN
    RAISE EXCEPTION '스캔할 수 없는 QR 상태입니다. 현재 상태: %', v_qr_status;
  END IF;

  -- 4. 권한 확인
  IF v_role != 'super_admin' THEN
    IF v_role IN ('hq', 'branch', 'sub_branch') THEN
      IF v_qr_org_id != v_org_id AND NOT EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = v_qr_org_id AND o.path <@ (
          SELECT path FROM public.organizations WHERE id = v_org_id
        )
      ) THEN
        RAISE EXCEPTION '해당 QR의 스캔 권한이 없습니다.';
      END IF;
    ELSE
      IF v_qr_org_id != v_org_id THEN
        RAISE EXCEPTION '해당 QR의 스캔 권한이 없습니다.';
      END IF;
    END IF;
  END IF;

  -- 5. QR 위치 및 상태 업데이트
  UPDATE public.qr_codes
  SET status = 'PENDING_APPROVAL',
      last_scan_location = ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      last_scan_at = NOW()
  WHERE id = v_qr_id;

  -- 6. 조직명
  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id;

  -- 7. 타임라인 기록
  INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
  VALUES (v_qr_id, 'QR 스캔 (승인 대기)', v_user_id, COALESCE(v_org_name, ''));

  -- 8. 결과 반환
  qr_id := v_qr_id;
  qr_uuid := p_qr_uuid;
  qr_product_name := v_qr_product_name;
  qr_status := 'PENDING_APPROVAL';
  message := 'QR이 스캔되었습니다. 상위 관리자의 승인을 기다립니다.';
  RETURN NEXT;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_qr(text, text, numeric, numeric) TO authenticated;

-- 4-2. 설치 승인 RPC (상위 관리자가 승인)
CREATE OR REPLACE FUNCTION public.approve_installation(
  p_user_email text,
  p_qr_id uuid,
  p_image_url text,
  p_sale_amount numeric DEFAULT 0
)
RETURNS TABLE (
  qr_id uuid,
  qr_uuid text,
  qr_status text,
  commissions jsonb,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_qr_uuid text;
  v_qr_org_id uuid;
  v_qr_status text;
  v_qr_product_name text;
  v_org_name text;
  v_new_install_id uuid;
  v_commission_result jsonb;
BEGIN
  -- 1. 사용자 정보
  SELECT u.id, u.org_id, u.role INTO v_user_id, v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다.';
  END IF;

  -- 2. 승인 권한 확인 (office 이상만 승인 가능)
  IF v_role NOT IN ('super_admin', 'hq', 'branch', 'sub_branch', 'office') THEN
    RAISE EXCEPTION '설치 승인 권한이 없습니다. 영업사원은 승인할 수 없습니다.';
  END IF;

  -- 3. QR 코드 조회
  SELECT q.uuid, q.owner_org_id, q.status, q.product_name
  INTO v_qr_uuid, v_qr_org_id, v_qr_status, v_qr_product_name
  FROM public.qr_codes q WHERE q.id = p_qr_id;

  IF v_qr_uuid IS NULL THEN
    RAISE EXCEPTION 'QR 코드를 찾을 수 없습니다.';
  END IF;

  -- 4. PENDING_APPROVAL 상태인지 확인
  IF v_qr_status != 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION '승인 대기 상태의 QR만 승인할 수 있습니다. 현재 상태: %', v_qr_status;
  END IF;

  -- 5. 권한 확인 (ltree 기반 — 하위 조직의 QR만 승인 가능)
  IF v_role != 'super_admin' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = v_qr_org_id AND o.path <@ (
        SELECT path FROM public.organizations WHERE id = v_org_id
      )
    ) THEN
      RAISE EXCEPTION '하위 조직의 QR만 승인할 수 있습니다.';
    END IF;
  END IF;

  -- 6. 설치 정보 저장 (이미지 포함)
  INSERT INTO public.installations (qr_id, image_url, latitude, longitude, installed_by)
  SELECT q.id, p_image_url,
    ST_Y(q.last_scan_location::geometry),
    ST_X(q.last_scan_location::geometry),
    v_user_id
  FROM public.qr_codes q WHERE q.id = p_qr_id
  RETURNING id INTO v_new_install_id;

  -- 7. QR 상태를 COMPLETED로 변경
  UPDATE public.qr_codes
  SET status = 'COMPLETED'
  WHERE id = p_qr_id;

  -- 8. 조직명
  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id = v_org_id;

  -- 9. 타임라인 기록
  INSERT INTO public.qr_timeline (qr_id, action, actor_id, location)
  VALUES (p_qr_id, '설치 승인 완료', v_user_id, COALESCE(v_org_name, ''));

  -- 10. 수수료 자동 분배 (sale_amount > 0 인 경우)
  v_commission_result := '[]'::jsonb;
  IF p_sale_amount > 0 THEN
    -- 기존 distribute_commission RPC 재사용
    INSERT INTO public.commission_records (
      qr_id, org_id, org_type, commission_type, commission_rate,
      sale_amount, commission_amount, status
    )
    SELECT p_qr_id, c.org_id, c.org_type, c.commission_type, c.commission_rate,
           p_sale_amount, c.commission_amount, 'PENDING'
    FROM public.distribute_commission(p_user_email, p_qr_id, p_sale_amount) c;

    SELECT jsonb_agg(jsonb_build_object(
      'org_id', org_id, 'org_name', org_name, 'org_type', org_type,
      'commission_type', commission_type, 'commission_rate', commission_rate,
      'commission_amount', commission_amount
    )) INTO v_commission_result
    FROM public.distribute_commission(p_user_email, p_qr_id, p_sale_amount);
  END IF;

  -- 11. 결과 반환
  qr_id := p_qr_id;
  qr_uuid := v_qr_uuid;
  qr_status := 'COMPLETED';
  commissions := v_commission_result;
  message := CASE
    WHEN p_sale_amount > 0 THEN '설치가 승인되었으며 수수료가 분배되었습니다.'
    ELSE '설치가 승인되었습니다.'
  END;
  RETURN NEXT;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_installation(text, uuid, text, numeric) TO authenticated;

-- 4-3. 승인 대기 QR 목록 조회 RPC
CREATE OR REPLACE FUNCTION public.get_pending_approvals(p_user_email text)
RETURNS TABLE (
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  qr_status text,
  owner_org_name text,
  scanned_at timestamptz,
  latitude numeric,
  longitude numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, o.name, q.last_scan_at,
      ST_Y(q.last_scan_location::geometry), ST_X(q.last_scan_location::geometry)
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.status = 'PENDING_APPROVAL'
    ORDER BY q.last_scan_at DESC;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, o.name, q.last_scan_at,
      ST_Y(q.last_scan_location::geometry), ST_X(q.last_scan_location::geometry)
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.status = 'PENDING_APPROVAL'
      AND o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ORDER BY q.last_scan_at DESC;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_approvals(text) TO authenticated;

-- ============================================
-- 5. 맵 데이터 집계 RPC (지도 시각화용)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_map_data(p_user_email text)
RETURNS TABLE (
  qr_id uuid,
  qr_uuid text,
  qr_product_name text,
  qr_status text,
  owner_org_name text,
  latitude numeric,
  longitude numeric,
  scanned_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
BEGIN
  SELECT u.org_id, u.role INTO v_org_id, v_role
  FROM public.users u WHERE u.email = p_user_email LIMIT 1;

  IF v_org_id IS NULL THEN RETURN; END IF;

  IF v_role = 'super_admin' THEN
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, o.name,
      ST_Y(q.last_scan_location::geometry), ST_X(q.last_scan_location::geometry),
      q.last_scan_at
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.last_scan_location IS NOT NULL
    ORDER BY q.last_scan_at DESC
    LIMIT 500;
  ELSIF v_role IN ('hq', 'branch', 'sub_branch', 'office') THEN
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, o.name,
      ST_Y(q.last_scan_location::geometry), ST_X(q.last_scan_location::geometry),
      q.last_scan_at
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.last_scan_location IS NOT NULL
      AND o.path <@ (SELECT path FROM public.organizations WHERE id = v_org_id)
    ORDER BY q.last_scan_at DESC
    LIMIT 500;
  ELSE
    RETURN QUERY
    SELECT q.id, q.uuid, q.product_name, q.status, o.name,
      ST_Y(q.last_scan_location::geometry), ST_X(q.last_scan_location::geometry),
      q.last_scan_at
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.last_scan_location IS NOT NULL
      AND q.owner_org_id = v_org_id
    ORDER BY q.last_scan_at DESC
    LIMIT 200;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_map_data(text) TO authenticated;

-- ============================================
-- 6. ltree 기반 RLS 헬퍼 함수
--    (기존 get_all_child_orgs 재귀 CTE 대체)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_org_descendant(p_ancestor_org_id uuid, p_descendant_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations desc_org
    WHERE desc_org.id = p_descendant_org_id
      AND desc_org.path <@ (
        SELECT path FROM public.organizations WHERE id = p_ancestor_org_id
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_org_descendant(uuid, uuid) TO authenticated;

-- ============================================
-- 7. 기존 path 데이터 확정 업데이트
-- ============================================
SELECT public.update_org_path();
