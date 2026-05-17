
-- ============================================
-- 024: get_products RPC - 비활성 제품도 조회 가능하도록 수정
-- ============================================

DROP FUNCTION IF EXISTS public.get_products(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.get_products(
  p_user_email TEXT,
  p_category TEXT DEFAULT NULL,
  p_include_inactive BOOLEAN DEFAULT true
)
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

  -- 관리자(super_admin, hq)는 비활성 제품도 포함, 나머지는 활성만
  IF v_role IN ('super_admin', 'hq') AND p_include_inactive THEN
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
    WHERE (p_category IS NULL OR p.category = p_category)
    ORDER BY p.is_active DESC, p.created_at DESC;
  ELSE
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
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_products(TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_products(TEXT, TEXT, BOOLEAN) TO anon;
