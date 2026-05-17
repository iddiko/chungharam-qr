-- ============================================
-- get_qr_by_uuid 함수 생성
-- QR UUID로 QR 정보 + 조직명 조회 (스캔 시 사용)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_qr_by_uuid(p_uuid TEXT)
RETURNS TABLE (
  qr_id UUID,
  qr_uuid TEXT,
  qr_product_name TEXT,
  qr_status TEXT,
  qr_owner_org_id UUID,
  org_name TEXT
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      q.id AS qr_id,
      q.uuid AS qr_uuid,
      q.product_name AS qr_product_name,
      q.status AS qr_status,
      q.owner_org_id AS qr_owner_org_id,
      o.name AS org_name
    FROM public.qr_codes q
    LEFT JOIN public.organizations o ON o.id = q.owner_org_id
    WHERE q.uuid = p_uuid;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_qr_by_uuid(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qr_by_uuid(TEXT) TO anon;
