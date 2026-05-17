-- 조직 테이블
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('super_admin', 'hq', 'branch', 'office', 'employee')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 사용자 테이블
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'hq', 'branch', 'office', 'employee')),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- QR 코드 테이블
CREATE TABLE qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uuid TEXT UNIQUE NOT NULL,
  parent_qr_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  owner_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PENDING', 'APPROVED', 'RECEIVED', 'INSTALLED', 'SETTLED', 'REJECTED', 'LOCKED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- QR 이동 요청 테이블
CREATE TABLE qr_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  from_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  to_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- QR 타임라인 테이블
CREATE TABLE qr_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 설치 정보 테이블
CREATE TABLE installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  installed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_organizations_parent_id ON organizations(parent_id);
CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_qr_codes_owner_org_id ON qr_codes(owner_org_id);
CREATE INDEX idx_qr_codes_uuid ON qr_codes(uuid);
CREATE INDEX idx_qr_transfer_requests_qr_id ON qr_transfer_requests(qr_id);
CREATE INDEX idx_qr_transfer_requests_from_org_id ON qr_transfer_requests(from_org_id);
CREATE INDEX idx_qr_transfer_requests_to_org_id ON qr_transfer_requests(to_org_id);
CREATE INDEX idx_qr_timeline_qr_id ON qr_timeline(qr_id);
CREATE INDEX idx_installations_qr_id ON installations(qr_id);

-- Row Level Security (RLS) 정책
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;

-- 슈퍼 관리자에게 모든 권한 부여
CREATE POLICY "Super admin can do anything" ON organizations
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'super_admin'
  ));

CREATE POLICY "Super admin can do anything" ON users
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'super_admin'
  ));

CREATE POLICY "Super admin can do anything" ON qr_codes
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'super_admin'
  ));

CREATE POLICY "Super admin can do anything" ON qr_transfer_requests
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'super_admin'
  ));

CREATE POLICY "Super admin can do anything" ON qr_timeline
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'super_admin'
  ));

CREATE POLICY "Super admin can do anything" ON installations
  FOR ALL USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'super_admin'
  ));

-- 본사 권한 정책
CREATE POLICY "HQ can view all organizations" ON organizations
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'hq'
  ));

CREATE POLICY "HQ can create QR codes" ON qr_codes
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'hq'
  ));

-- 지사 권한 정책
CREATE POLICY "Branch can view QR codes" ON qr_codes
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'branch'
  ));

CREATE POLICY "Branch can approve transfers" ON qr_transfer_requests
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'branch'
  ));

-- 영업점 권한 정책
CREATE POLICY "Office can create child QR codes" ON qr_codes
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'office'
  ));

-- 사원 권한 정책
CREATE POLICY "Employee can complete installations" ON installations
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'employee'
  ));
