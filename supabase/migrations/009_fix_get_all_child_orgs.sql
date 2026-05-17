-- ============================================
-- get_all_child_orgs 함수 수정
-- 반환 컬럼명을 id -> org_id로 변경
-- (다른 RPC 함수들에서 c.org_id로 참조하고 있음)
-- ============================================

-- 기존 함수 삭제
DROP FUNCTION IF EXISTS public.get_all_child_orgs(UUID);

-- 수정된 함수: 반환 컬럼명을 org_id로 변경
CREATE OR REPLACE FUNCTION public.get_all_child_orgs(parent_org_id UUID)
RETURNS TABLE (org_id UUID) AS $$
BEGIN
  RETURN QUERY
    WITH RECURSIVE org_tree AS (
      SELECT id FROM organizations WHERE id = parent_org_id
      UNION ALL
      SELECT o.id FROM organizations o
      INNER JOIN org_tree ot ON o.parent_id = ot.id
    )
    SELECT id FROM org_tree WHERE id != parent_org_id;
END;
$$ LANGUAGE plpgsql;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.get_all_child_orgs(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_child_orgs(UUID) TO anon;
