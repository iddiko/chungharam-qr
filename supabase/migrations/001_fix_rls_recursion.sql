-- ============================================
-- RLS 무한 재귀 수정 마이그레이션
-- 문제: users 테이블 RLS 정책이 users 테이블을 다시 쿼리하여 무한 재귀 발생
-- 해결: custom claims (auth.jwt()->>'role', auth.jwt()->>'org_id') 사용
-- ============================================

-- 1. users 테이블의 기존 정책 삭제
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Super admin can do anything on users" ON users;

-- 2. users 테이블 새 정책 (자기 참조 없이 auth.jwt() 사용)
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (email = auth.email());

CREATE POLICY "Super admin can do anything on users" ON users
  FOR ALL USING (
    auth.jwt()->>'role' = 'super_admin'
  );

-- 3. organizations 테이블 정책 재생성
DROP POLICY IF EXISTS "Super admin can do anything on organizations" ON organizations;
DROP POLICY IF EXISTS "HQ Branch SubBranch can view organizations" ON organizations;
DROP POLICY IF EXISTS "Office Employee can view organizations" ON organizations;

CREATE POLICY "Super admin can do anything on organizations" ON organizations
  FOR ALL USING (
    auth.jwt()->>'role' = 'super_admin'
  );

CREATE POLICY "HQ Branch SubBranch can view organizations" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM get_accessible_orgs_by_email()
      WHERE org_id = organizations.id
    )
  );

CREATE POLICY "Office Employee can view organizations" ON organizations
  FOR SELECT USING (
    (auth.jwt()->>'org_id')::uuid = organizations.id
  );

-- 4. qr_codes 테이블 정책 재생성
DROP POLICY IF EXISTS "Super admin can do anything on qr_codes" ON qr_codes;
DROP POLICY IF EXISTS "HQ Branch SubBranch can create QR codes" ON qr_codes;
DROP POLICY IF EXISTS "HQ Branch SubBranch can view QR codes" ON qr_codes;
DROP POLICY IF EXISTS "Office Employee can create QR codes" ON qr_codes;
DROP POLICY IF EXISTS "Office Employee can view QR codes" ON qr_codes;

CREATE POLICY "Super admin can do anything on qr_codes" ON qr_codes
  FOR ALL USING (
    auth.jwt()->>'role' = 'super_admin'
  );

CREATE POLICY "HQ Branch SubBranch can create QR codes" ON qr_codes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM get_accessible_orgs_by_email()
      WHERE org_id = qr_codes.owner_org_id
    )
  );

CREATE POLICY "HQ Branch SubBranch can view QR codes" ON qr_codes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM get_accessible_orgs_by_email()
      WHERE org_id = qr_codes.owner_org_id
    )
  );

CREATE POLICY "Office Employee can create QR codes" ON qr_codes
  FOR INSERT WITH CHECK (
    (auth.jwt()->>'org_id')::uuid = qr_codes.owner_org_id
  );

CREATE POLICY "Office Employee can view QR codes" ON qr_codes
  FOR SELECT USING (
    (auth.jwt()->>'org_id')::uuid = qr_codes.owner_org_id
  );

-- 5. qr_transfer_requests 테이블 정책 재생성
DROP POLICY IF EXISTS "Super admin can do anything on qr_transfer_requests" ON qr_transfer_requests;
DROP POLICY IF EXISTS "HQ Branch SubBranch can view transfer requests" ON qr_transfer_requests;
DROP POLICY IF EXISTS "HQ Branch SubBranch can approve transfers" ON qr_transfer_requests;
DROP POLICY IF EXISTS "Office Employee can view transfer requests" ON qr_transfer_requests;
DROP POLICY IF EXISTS "Office Employee can request transfers" ON qr_transfer_requests;

CREATE POLICY "Super admin can do anything on qr_transfer_requests" ON qr_transfer_requests
  FOR ALL USING (
    auth.jwt()->>'role' = 'super_admin'
  );

CREATE POLICY "HQ Branch SubBranch can view transfer requests" ON qr_transfer_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM get_accessible_orgs_by_email()
      WHERE org_id = qr_transfer_requests.from_org_id
      OR org_id = qr_transfer_requests.to_org_id
    )
  );

CREATE POLICY "HQ Branch SubBranch can approve transfers" ON qr_transfer_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM get_accessible_orgs_by_email()
      WHERE org_id = qr_transfer_requests.to_org_id
    )
  );

CREATE POLICY "Office Employee can view transfer requests" ON qr_transfer_requests
  FOR SELECT USING (
    (auth.jwt()->>'org_id')::uuid = qr_transfer_requests.from_org_id
    OR (auth.jwt()->>'org_id')::uuid = qr_transfer_requests.to_org_id
  );

CREATE POLICY "Office Employee can request transfers" ON qr_transfer_requests
  FOR INSERT WITH CHECK (
    (auth.jwt()->>'org_id')::uuid = qr_transfer_requests.from_org_id
  );

-- 6. qr_timeline 테이블 정책 재생성
DROP POLICY IF EXISTS "Super admin can do anything on qr_timeline" ON qr_timeline;
DROP POLICY IF EXISTS "Users can view qr_timeline" ON qr_timeline;

CREATE POLICY "Super admin can do anything on qr_timeline" ON qr_timeline
  FOR ALL USING (
    auth.jwt()->>'role' = 'super_admin'
  );

CREATE POLICY "Users can view qr_timeline" ON qr_timeline
  FOR SELECT USING (
    (auth.jwt()->>'org_id')::uuid = (
      SELECT owner_org_id FROM qr_codes WHERE id = qr_timeline.qr_id
    )
  );

-- 7. installations 테이블 정책 재생성
DROP POLICY IF EXISTS "Super admin can do anything on installations" ON installations;
DROP POLICY IF EXISTS "Users can complete installations" ON installations;
DROP POLICY IF EXISTS "Users can view installations" ON installations;

CREATE POLICY "Super admin can do anything on installations" ON installations
  FOR ALL USING (
    auth.jwt()->>'role' = 'super_admin'
  );

CREATE POLICY "Users can complete installations" ON installations
  FOR INSERT WITH CHECK (
    (auth.jwt()->>'org_id')::uuid = (
      SELECT owner_org_id FROM qr_codes WHERE id = installations.qr_id
    )
  );

CREATE POLICY "Users can view installations" ON installations
  FOR SELECT USING (
    (auth.jwt()->>'org_id')::uuid = (
      SELECT owner_org_id FROM qr_codes WHERE id = installations.qr_id
    )
  );

-- 8. sales 테이블 정책 재생성
DROP POLICY IF EXISTS "Super admin can do anything on sales" ON sales;
DROP POLICY IF EXISTS "HQ Branch SubBranch can view sales" ON sales;
DROP POLICY IF EXISTS "HQ Branch SubBranch can create sales" ON sales;
DROP POLICY IF EXISTS "Office Employee can view sales" ON sales;
DROP POLICY IF EXISTS "Office Employee can create sales" ON sales;

CREATE POLICY "Super admin can do anything on sales" ON sales
  FOR ALL USING (
    auth.jwt()->>'role' = 'super_admin'
  );

CREATE POLICY "HQ Branch SubBranch can view sales" ON sales
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM get_accessible_orgs_by_email()
      WHERE org_id = sales.org_id
    )
  );

CREATE POLICY "HQ Branch SubBranch can create sales" ON sales
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM get_accessible_orgs_by_email()
      WHERE org_id = sales.org_id
    )
  );

CREATE POLICY "Office Employee can view sales" ON sales
  FOR SELECT USING (
    (auth.jwt()->>'org_id')::uuid = sales.org_id
  );

CREATE POLICY "Office Employee can create sales" ON sales
  FOR INSERT WITH CHECK (
    (auth.jwt()->>'org_id')::uuid = sales.org_id
  );
