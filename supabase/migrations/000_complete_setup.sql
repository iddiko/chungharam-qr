-- ============================================
-- CHUNGHARAM 통합 마이그레이션
-- 기존 데이터를 모두 삭제하고 처음부터 재구성합니다
-- 순서: 삭제 → 스키마 → 데이터 → 함수 → 버킷 → RLS 정책
-- ============================================

-- ============================================
-- 0. 기존 객체 삭제 (역순)
-- ============================================
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Super admin can do anything on users" ON users;
DROP POLICY IF EXISTS "Super admin can do anything on organizations" ON organizations;
DROP POLICY IF EXISTS "HQ Branch SubBranch can view organizations" ON organizations;
DROP POLICY IF EXISTS "Office Employee can view organizations" ON organizations;
DROP POLICY IF EXISTS "Super admin can do anything on qr_codes" ON qr_codes;
DROP POLICY IF EXISTS "HQ Branch SubBranch can create QR codes" ON qr_codes;
DROP POLICY IF EXISTS "HQ Branch SubBranch can view QR codes" ON qr_codes;
DROP POLICY IF EXISTS "Office Employee can create QR codes" ON qr_codes;
DROP POLICY IF EXISTS "Office Employee can view QR codes" ON qr_codes;
DROP POLICY IF EXISTS "Super admin can do anything on qr_transfer_requests" ON qr_transfer_requests;
DROP POLICY IF EXISTS "HQ Branch SubBranch can view transfer requests" ON qr_transfer_requests;
DROP POLICY IF EXISTS "HQ Branch SubBranch can approve transfers" ON qr_transfer_requests;
DROP POLICY IF EXISTS "Office Employee can view transfer requests" ON qr_transfer_requests;
DROP POLICY IF EXISTS "Office Employee can request transfers" ON qr_transfer_requests;
DROP POLICY IF EXISTS "Super admin can do anything on qr_timeline" ON qr_timeline;
DROP POLICY IF EXISTS "Users can view qr_timeline" ON qr_timeline;
DROP POLICY IF EXISTS "Super admin can do anything on installations" ON installations;
DROP POLICY IF EXISTS "Users can complete installations" ON installations;
DROP POLICY IF EXISTS "Users can view installations" ON installations;
DROP POLICY IF EXISTS "Super admin can do anything on sales" ON sales;
DROP POLICY IF EXISTS "HQ Branch SubBranch can view sales" ON sales;
DROP POLICY IF EXISTS "HQ Branch SubBranch can create sales" ON sales;
DROP POLICY IF EXISTS "Office Employee can view sales" ON sales;
DROP POLICY IF EXISTS "Office Employee can create sales" ON sales;

DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS installations CASCADE;
DROP TABLE IF EXISTS qr_timeline CASCADE;
DROP TABLE IF EXISTS qr_transfer_requests CASCADE;
DROP TABLE IF EXISTS qr_codes CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

DROP FUNCTION IF EXISTS get_accessible_orgs_by_email();
DROP FUNCTION IF EXISTS get_accessible_orgs(user_id UUID);
DROP FUNCTION IF EXISTS get_all_child_orgs(parent_org_id UUID);

-- ============================================
-- 1. 스키마 생성
-- ============================================

-- 조직 테이블
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('super_admin', 'hq', 'branch', 'sub_branch', 'office', 'employee')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'hq', 'branch', 'sub_branch', 'office', 'employee')),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- QR 코드 테이블
CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uuid TEXT UNIQUE NOT NULL,
  parent_qr_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  product_name TEXT NOT NULL,
  owner_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PENDING', 'APPROVED', 'RECEIVED', 'INSTALLED', 'SETTLED', 'REJECTED', 'LOCKED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- QR 이동 요청 테이블
CREATE TABLE IF NOT EXISTS qr_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  from_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  to_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- QR 타임라인 테이블
CREATE TABLE IF NOT EXISTS qr_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 설치 정보 테이블
CREATE TABLE IF NOT EXISTS installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  image_url TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  installed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  installed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 매출 테이블
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  qr_id UUID REFERENCES qr_codes(id) ON DELETE SET NULL ON UPDATE CASCADE,
  amount NUMERIC NOT NULL,
  sale_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  customer_name TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_organizations_parent_id ON organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_owner_org_id ON qr_codes(owner_org_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_uuid ON qr_codes(uuid);
CREATE INDEX IF NOT EXISTS idx_qr_transfer_requests_qr_id ON qr_transfer_requests(qr_id);
CREATE INDEX IF NOT EXISTS idx_qr_transfer_requests_from_org_id ON qr_transfer_requests(from_org_id);
CREATE INDEX IF NOT EXISTS idx_qr_transfer_requests_to_org_id ON qr_transfer_requests(to_org_id);
CREATE INDEX IF NOT EXISTS idx_qr_timeline_qr_id ON qr_timeline(qr_id);
CREATE INDEX IF NOT EXISTS idx_installations_qr_id ON installations(qr_id);
CREATE INDEX IF NOT EXISTS idx_sales_org_id ON sales(org_id);
CREATE INDEX IF NOT EXISTS idx_sales_qr_id ON sales(qr_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON sales(created_by);

-- ============================================
-- 2. 시드 데이터
--    계층 구조: 본사 > 지사 > 지점 > 영업점 > 영업사원
-- ============================================

-- 조직 데이터
INSERT INTO organizations (id, parent_id, name, type) VALUES
  ('00000000-0000-0000-0000-000000000001', NULL, '슈퍼관리자', 'super_admin'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '서울 본사', 'hq'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '부산 지사', 'branch'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '대구 지사', 'branch'),
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000003', '부산 해운대 지점', 'sub_branch'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000003', '부산 사하 지점', 'sub_branch'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000004', '대구 수성 지점', 'sub_branch'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000004', '대구 달서 지점', 'sub_branch'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000100', '해운대 1 영업점', 'office'),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000100', '해운대 2 영업점', 'office'),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000101', '사하 1 영업점', 'office'),
  ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000102', '수성 1 영업점', 'office'),
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000103', '달서 1 영업점', 'office'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000005', '해운대 영업사원 1', 'employee'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000005', '해운대 영업사원 2', 'employee'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000006', '해운대 영업사원 3', 'employee'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000007', '사하 영업사원 1', 'employee'),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000008', '수성 영업사원 1', 'employee'),
  ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000009', '달서 영업사원 1', 'employee');

-- 사용자 데이터
INSERT INTO users (id, org_id, role, name, email) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'super_admin', '슈퍼관리자', 'superadmin@example.com'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'hq', '본사 관리자', 'hq@example.com'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'branch', '부산 지사 관리자', 'busan@example.com'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'branch', '대구 지사 관리자', 'daegu@example.com'),
  ('10000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000100', 'sub_branch', '부산 해운대 지점장', 'busan-haeundae@example.com'),
  ('10000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'sub_branch', '부산 사하 지점장', 'busan-saha@example.com'),
  ('10000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000102', 'sub_branch', '대구 수성 지점장', 'daegu-suseong@example.com'),
  ('10000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000103', 'sub_branch', '대구 달서 지점장', 'daegu-dalseo@example.com'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'office', '해운대 1 영업점장', 'haeundae-office1@example.com'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'office', '해운대 2 영업점장', 'haeundae-office2@example.com'),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007', 'office', '사하 1 영업점장', 'saha-office1@example.com'),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008', 'office', '수성 1 영업점장', 'suseong-office1@example.com'),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000009', 'office', '달서 1 영업점장', 'dalseo-office1@example.com'),
  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000010', 'employee', '해운대 영업사원 1', 'haeundae-emp1@example.com'),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'employee', '해운대 영업사원 2', 'haeundae-emp2@example.com'),
  ('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000012', 'employee', '해운대 영업사원 3', 'haeundae-emp3@example.com'),
  ('10000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000013', 'employee', '사하 영업사원 1', 'saha-emp1@example.com'),
  ('10000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000014', 'employee', '수성 영업사원 1', 'suseong-emp1@example.com'),
  ('10000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000015', 'employee', '달서 영업사원 1', 'dalseo-emp1@example.com');

-- QR 코드 데이터
INSERT INTO qr_codes (id, uuid, parent_qr_id, product_name, owner_org_id, status) VALUES
  ('20000000-0000-0000-0000-000000000001', 'QR-001', NULL, '청하람 제품 A', '00000000-0000-0000-0000-000000000002', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000002', 'QR-002', NULL, '청하람 제품 B', '00000000-0000-0000-0000-000000000002', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000003', 'QR-003', NULL, '청하람 제품 C', '00000000-0000-0000-0000-000000000003', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000004', 'QR-004', NULL, '청하람 제품 D', '00000000-0000-0000-0000-000000000004', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000005', 'QR-005', NULL, '청하람 제품 E', '00000000-0000-0000-0000-000000000100', 'INSTALLED'),
  ('20000000-0000-0000-0000-000000000006', 'QR-006', NULL, '청하람 제품 F', '00000000-0000-0000-0000-000000000100', 'INSTALLED'),
  ('20000000-0000-0000-0000-000000000007', 'QR-007', NULL, '청하람 제품 G', '00000000-0000-0000-0000-000000000101', 'INSTALLED'),
  ('20000000-0000-0000-0000-000000000008', 'QR-008', NULL, '청하람 제품 H', '00000000-0000-0000-0000-000000000102', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000009', 'QR-009', NULL, '청하람 제품 I', '00000000-0000-0000-0000-000000000103', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000010', 'QR-010', NULL, '청하람 제품 J', '00000000-0000-0000-0000-000000000005', 'INSTALLED'),
  ('20000000-0000-0000-0000-000000000011', 'QR-011', NULL, '청하람 제품 K', '00000000-0000-0000-0000-000000000006', 'INSTALLED'),
  ('20000000-0000-0000-0000-000000000012', 'QR-012', NULL, '청하람 제품 L', '00000000-0000-0000-0000-000000000007', 'INSTALLED'),
  ('20000000-0000-0000-0000-000000000013', 'QR-013', NULL, '청하람 제품 M', '00000000-0000-0000-0000-000000000008', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000014', 'QR-014', NULL, '청하람 제품 N', '00000000-0000-0000-0000-000000000009', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000015', 'QR-015', NULL, '청하람 제품 O', '00000000-0000-0000-0000-000000000002', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000016', 'QR-016', NULL, '청하람 제품 P', '00000000-0000-0000-0000-000000000003', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000017', 'QR-017', NULL, '청하람 제품 Q', '00000000-0000-0000-0000-000000000004', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000018', 'QR-018', NULL, '청하람 제품 R', '00000000-0000-0000-0000-000000000005', 'INSTALLED'),
  ('20000000-0000-0000-0000-000000000019', 'QR-019', NULL, '청하람 제품 S', '00000000-0000-0000-0000-000000000006', 'INSTALLED'),
  ('20000000-0000-0000-0000-000000000020', 'QR-020', NULL, '청하람 제품 T', '00000000-0000-0000-0000-000000000007', 'INSTALLED');

-- QR 이동 요청 데이터
INSERT INTO qr_transfer_requests (id, qr_id, from_org_id, to_org_id, status, requested_by, requested_at, approved_at, approved_by) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'PENDING', '10000000-0000-0000-0000-000000000002', NOW() - INTERVAL '1 day', NULL, NULL),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'APPROVED', '10000000-0000-0000-0000-000000000002', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', '10000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000100', 'APPROVED', '10000000-0000-0000-0000-000000000003', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', '10000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000102', 'PENDING', '10000000-0000-0000-0000-000000000004', NOW() - INTERVAL '1 day', NULL, NULL);

-- QR 타임라인 데이터
INSERT INTO qr_timeline (id, qr_id, action, actor_id, location, created_at) VALUES
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'QR 생성', '10000000-0000-0000-0000-000000000002', '서울 본사', NOW() - INTERVAL '5 days'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '이동 요청', '10000000-0000-0000-0000-000000000003', '부산 지사', NOW() - INTERVAL '1 day'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'QR 생성', '10000000-0000-0000-0000-000000000002', '서울 본사', NOW() - INTERVAL '6 days'),
  ('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', '이동 승인', '10000000-0000-0000-0000-000000000002', '서울 본사', NOW() - INTERVAL '1 day'),
  ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', 'QR 생성', '10000000-0000-0000-0000-000000000003', '부산 지사', NOW() - INTERVAL '7 days'),
  ('40000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000003', '이동 요청', '10000000-0000-0000-0000-000000000100', '부산 해운대 지점', NOW() - INTERVAL '3 days'),
  ('40000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', '이동 승인', '10000000-0000-0000-0000-000000000003', '부산 지사', NOW() - INTERVAL '2 days'),
  ('40000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000003', '수령 확인', '10000000-0000-0000-0000-000000000005', '해운대 1 영업점', NOW() - INTERVAL '1 day'),
  ('40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000005', 'QR 생성', '10000000-0000-0000-0000-000000000005', '해운대 1 영업점', NOW() - INTERVAL '8 days'),
  ('40000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000005', '설치 완료', '10000000-0000-0000-0000-000000000010', '해운대 1 영업점', NOW() - INTERVAL '1 day');

-- 설치 정보 데이터
INSERT INTO installations (id, qr_id, image_url, latitude, longitude, installed_by, installed_at) VALUES
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'installations/QR-005/1705310400000.jpg', 35.1796, 129.0756, '10000000-0000-0000-0000-000000000010', NOW() - INTERVAL '1 day'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006', 'installations/QR-006/1705310400000.jpg', 35.1587, 129.1600, '10000000-0000-0000-0000-000000000011', NOW() - INTERVAL '1 day'),
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000007', 'installations/QR-007/1705310400000.jpg', 35.1043, 128.9754, '10000000-0000-0000-0000-000000000013', NOW() - INTERVAL '1 day'),
  ('50000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000010', 'installations/QR-010/1705310400000.jpg', 35.1796, 129.0756, '10000000-0000-0000-0000-000000000010', NOW() - INTERVAL '1 day'),
  ('50000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000011', 'installations/QR-011/1705310400000.jpg', 35.1587, 129.1600, '10000000-0000-0000-0000-000000000012', NOW() - INTERVAL '1 day'),
  ('50000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000012', 'installations/QR-012/1705310400000.jpg', 35.1043, 128.9754, '10000000-0000-0000-0000-000000000013', NOW() - INTERVAL '1 day');

-- 매출 샘플 데이터
INSERT INTO sales (id, org_id, amount, customer_name, notes, created_by, created_at) VALUES
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 1500000, '거래처 A', '해운대 1 영업점 매출', '10000000-0000-0000-0000-000000000005', NOW() - INTERVAL '1 day'),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 2300000, '거래처 B', '해운대 2 영업점 매출', '10000000-0000-0000-0000-000000000006', NOW() - INTERVAL '1 day'),
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000007', 1800000, '거래처 C', '사하 1 영업점 매출', '10000000-0000-0000-0000-000000000007', NOW() - INTERVAL '2 days'),
  ('60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000008', 2100000, '거래처 D', '수성 1 영업점 매출', '10000000-0000-0000-0000-000000000008', NOW() - INTERVAL '2 days'),
  ('60000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000009', 1900000, '거래처 E', '달서 1 영업점 매출', '10000000-0000-0000-0000-000000000009', NOW() - INTERVAL '3 days');

-- ============================================
-- 3. 계층 함수
-- ============================================

-- 모든 하위 조직 재귀 조회
CREATE OR REPLACE FUNCTION get_all_child_orgs(parent_org_id UUID)
RETURNS TABLE (id UUID) AS $$
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

-- uid 기반 접근 가능 조직
CREATE OR REPLACE FUNCTION get_accessible_orgs(user_id UUID)
RETURNS TABLE (org_id UUID) AS $$
DECLARE
  v_org_id UUID;
  v_role TEXT;
BEGIN
  SELECT org_id, role INTO v_org_id, v_role
  FROM users WHERE users.id = user_id;

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT id FROM organizations;
  ELSIF v_role = 'hq' THEN
    RETURN QUERY SELECT * FROM get_all_child_orgs(v_org_id);
  ELSIF v_role = 'branch' THEN
    RETURN QUERY SELECT * FROM get_all_child_orgs(v_org_id);
  ELSIF v_role = 'sub_branch' THEN
    RETURN QUERY SELECT * FROM get_all_child_orgs(v_org_id);
  ELSIF v_role = 'office' THEN
    RETURN QUERY SELECT v_org_id;
  ELSIF v_role = 'employee' THEN
    RETURN QUERY SELECT v_org_id;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- email 기반 접근 가능 조직
CREATE OR REPLACE FUNCTION get_accessible_orgs_by_email()
RETURNS TABLE (org_id UUID) AS $$
DECLARE
  v_org_id UUID;
  v_role TEXT;
BEGIN
  SELECT org_id, role INTO v_org_id, v_role
  FROM users WHERE users.email = auth.email();

  IF v_role = 'super_admin' THEN
    RETURN QUERY SELECT id FROM organizations;
  ELSIF v_role = 'hq' THEN
    RETURN QUERY SELECT * FROM get_all_child_orgs(v_org_id);
  ELSIF v_role = 'branch' THEN
    RETURN QUERY SELECT * FROM get_all_child_orgs(v_org_id);
  ELSIF v_role = 'sub_branch' THEN
    RETURN QUERY SELECT * FROM get_all_child_orgs(v_org_id);
  ELSIF v_role = 'office' THEN
    RETURN QUERY SELECT v_org_id;
  ELSIF v_role = 'employee' THEN
    RETURN QUERY SELECT v_org_id;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. 스토리지 버킷
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('installations', 'installations', true) ON CONFLICT (id) DO NOTHING;

-- 설치 이미지 업로드 정책
DROP POLICY IF EXISTS "Anyone can upload installation images" ON storage.objects;
CREATE POLICY "Anyone can upload installation images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'installations');

DROP POLICY IF EXISTS "Anyone can view installation images" ON storage.objects;
CREATE POLICY "Anyone can view installation images" ON storage.objects
  FOR SELECT USING (bucket_id = 'installations');

-- ============================================
-- 5. RLS 정책 - email 기반
-- ============================================

-- RLS 활성화
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- --- users 테이블 ---
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (email = auth.email());

CREATE POLICY "Super admin can do anything on users" ON users
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.email = auth.email()
    AND u.role = 'super_admin'
  ));

-- --- organizations 테이블 ---
CREATE POLICY "Super admin can do anything on organizations" ON organizations
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.email = auth.email()
    AND users.role = 'super_admin'
  ));

CREATE POLICY "HQ Branch SubBranch can view organizations" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM get_accessible_orgs_by_email()
      WHERE org_id = organizations.id
    )
  );

CREATE POLICY "Office Employee can view organizations" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.email()
      AND users.org_id = organizations.id
    )
  );

-- --- qr_codes 테이블 ---
CREATE POLICY "Super admin can do anything on qr_codes" ON qr_codes
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.email = auth.email()
    AND users.role = 'super_admin'
  ));

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
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.email()
      AND users.org_id = qr_codes.owner_org_id
    )
  );

CREATE POLICY "Office Employee can view QR codes" ON qr_codes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.email()
      AND users.org_id = qr_codes.owner_org_id
    )
  );

-- --- qr_transfer_requests 테이블 ---
CREATE POLICY "Super admin can do anything on qr_transfer_requests" ON qr_transfer_requests
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.email = auth.email()
    AND users.role = 'super_admin'
  ));

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
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.email()
      AND (users.org_id = qr_transfer_requests.from_org_id OR users.org_id = qr_transfer_requests.to_org_id)
    )
  );

CREATE POLICY "Office Employee can request transfers" ON qr_transfer_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.email()
      AND users.org_id = qr_transfer_requests.from_org_id
    )
  );

-- --- qr_timeline 테이블 ---
CREATE POLICY "Super admin can do anything on qr_timeline" ON qr_timeline
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.email = auth.email()
    AND users.role = 'super_admin'
  ));

CREATE POLICY "Users can view qr_timeline" ON qr_timeline
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.email()
      AND users.org_id = (
        SELECT owner_org_id FROM qr_codes WHERE id = qr_timeline.qr_id
      )
    )
  );

-- --- installations 테이블 ---
CREATE POLICY "Super admin can do anything on installations" ON installations
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.email = auth.email()
    AND users.role = 'super_admin'
  ));

CREATE POLICY "Users can complete installations" ON installations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.email()
      AND users.org_id = (
        SELECT owner_org_id FROM qr_codes WHERE id = installations.qr_id
      )
    )
  );

CREATE POLICY "Users can view installations" ON installations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.email()
      AND users.org_id = (
        SELECT owner_org_id FROM qr_codes WHERE id = installations.qr_id
      )
    )
  );

-- --- sales 테이블 ---
CREATE POLICY "Super admin can do anything on sales" ON sales
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.email = auth.email()
    AND users.role = 'super_admin'
  ));

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
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.email()
      AND users.org_id = sales.org_id
    )
  );

CREATE POLICY "Office Employee can create sales" ON sales
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.email()
      AND users.org_id = sales.org_id
    )
  );
