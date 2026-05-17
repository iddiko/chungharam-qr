
-- ============================================
-- 제품 관리 시스템
-- ============================================

-- 제품 테이블 생성
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT UNIQUE,  -- 제품 고유 코드 (선택)
  category TEXT,     -- 제품 카테고리
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_products_org_id ON public.products(org_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

-- RLS 활성화
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 본사 이상만 제품 등록/수정/삭제 가능
DROP POLICY IF EXISTS "제품 조회 - 인증된 사용자" ON public.products;
DROP POLICY IF EXISTS "제품 등록 - 본사 이상" ON public.products;
DROP POLICY IF EXISTS "제품 수정 - 본사 이상" ON public.products;
DROP POLICY IF EXISTS "제품 삭제 - 본사 이상" ON public.products;

CREATE POLICY "제품 조회 - 인증된 사용자" ON public.products
  FOR SELECT USING (true);

CREATE POLICY "제품 등록 - 본사 이상" ON public.products
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email() AND u.role IN ('super_admin', 'hq')
    )
  );

CREATE POLICY "제품 수정 - 본사 이상" ON public.products
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email() AND u.role IN ('super_admin', 'hq')
    )
  );

CREATE POLICY "제품 삭제 - 본사 이상" ON public.products
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = auth.email() AND u.role IN ('super_admin', 'hq')
    )
  );

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 제품 관리 RPC 함수
-- ============================================

-- 제품 목록 조회 (모든 인증 사용자)
CREATE OR REPLACE FUNCTION public.get_products(p_user_email TEXT, p_category TEXT DEFAULT NULL)
RETURNS TABLE(
  product_id UUID,
  product_name TEXT,
  product_description TEXT,
  product_sku TEXT,
  product_category TEXT,
  product_is_active BOOLEAN,
  product_org_id UUID,
  product_org_name TEXT,
  product_created_by UUID,
  product_created_at TIMESTAMPTZ,
  product_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  -- 사용자 역할 및 조직 조회
  SELECT id, role, org_id INTO v_user_id, v_role, v_org_id
  FROM public.users WHERE email = p_user_email LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '사용자를 찾을 수 없습니다';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.description AS product_description,
    p.sku AS product_sku,
    p.category AS product_category,
    p.is_active AS product_is_active,
    p.org_id AS product_org_id,
    o.name AS product_org_name,
    p.created_by AS product_created_by,
    p.created_at AS product_created_at,
    p.updated_at AS product_updated_at
  FROM public.products p
  JOIN public.organizations o ON o.id = p.org_id
  WHERE p.is_active = true
    AND (p_category IS NULL OR p.category = p_category)
  ORDER BY p.created_at DESC;
END;
$$;

-- 제품 등록 (본사 이상만)
CREATE OR REPLACE FUNCTION public.create_product(
  p_user_email TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_sku TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE(product_id UUID, product_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_org_id UUID;
  v_user_id UUID;
  v_new_id UUID;
BEGIN
  -- 사용자 역할 및 조직 조회
  SELECT id, role, org_id INTO v_user_id, v_role, v_org_id
  FROM public.users WHERE email = p_user_email LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '사용자를 찾을 수 없습니다';
  END IF;

  -- 권한 확인: super_admin 또는 hq만
  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '제품 등록 권한이 없습니다. 본사 관리자만 가능합니다.';
  END IF;

  -- 제품 등록
  INSERT INTO public.products (name, description, sku, category, created_by, org_id)
  VALUES (p_name, p_description, p_sku, p_category, v_user_id, v_org_id)
  RETURNING id, name INTO v_new_id, p_name;

  RETURN QUERY SELECT v_new_id, p_name;
END;
$$;

-- 제품 수정 (본사 이상만)
CREATE OR REPLACE FUNCTION public.update_product(
  p_user_email TEXT,
  p_product_id UUID,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_sku TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS TABLE(product_id UUID, product_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
  v_updated_name TEXT;
  v_updated_id UUID;
BEGIN
  -- 권한 확인
  SELECT role INTO v_role FROM public.users WHERE email = p_user_email LIMIT 1;
  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '제품 수정 권한이 없습니다.';
  END IF;

  UPDATE public.products
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    sku = COALESCE(p_sku, sku),
    category = COALESCE(p_category, category),
    is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_product_id
  RETURNING id, name INTO v_updated_id, v_updated_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION '제품을 찾을 수 없습니다.';
  END IF;

  RETURN QUERY SELECT v_updated_id, v_updated_name;
END;
$$;

-- 제품 삭제 (비활성화, 본사 이상만)
CREATE OR REPLACE FUNCTION public.delete_product(
  p_user_email TEXT,
  p_product_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE email = p_user_email LIMIT 1;
  IF v_role NOT IN ('super_admin', 'hq') THEN
    RAISE EXCEPTION '제품 삭제 권한이 없습니다.';
  END IF;

  UPDATE public.products SET is_active = false WHERE id = p_product_id;
  RETURN FOUND;
END;
$$;

-- ============================================
-- QR 생성 시 제품 ID 참조 추가
-- ============================================

-- qr_codes 테이블에 product_id 컬럼 추가
ALTER TABLE public.qr_codes
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_qr_codes_product_id ON public.qr_codes(product_id);
