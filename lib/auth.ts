import { supabase } from './supabase'

export type UserRole = 'super_admin' | 'hq' | 'branch' | 'sub_branch' | 'office' | 'employee'

export interface Organization {
  id: string
  parent_id: string | null
  name: string
  type: string
  created_at: string
}

export interface User {
  id: string
  org_id: string
  role: UserRole
  name: string
  email: string
  organization?: Organization
}

export const roleLabels: Record<UserRole, string> = {
  super_admin: '슈퍼관리자',
  hq: '본사',
  branch: '지사',
  sub_branch: '지점',
  office: '영업점',
  employee: '영업사원'
}

export const roleBadgeStyles: Record<UserRole, string> = {
  super_admin: 'bg-red-50 text-red-700 border-red-200',
  hq: 'bg-purple-50 text-purple-700 border-purple-200',
  branch: 'bg-blue-50 text-blue-700 border-blue-200',
  sub_branch: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  office: 'bg-green-50 text-green-700 border-green-200',
  employee: 'bg-gray-50 text-gray-700 border-gray-200'
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('Auth 조회 오류:', authError)
      return null
    }

    if (!user) {
      return null
    }

    // RPC 함수로 users 테이블 조회 (RLS 무한재귀 우회)
    const { data: rpcData, error } = await supabase
      .rpc('get_current_user_info', { user_email: user.email })

    if (error) {
      console.error('RPC 조회 오류:', error.message, error.code)
      // RPC 실패 시 직접 조회 시도 (RLS 정책이 수정된 경우)
      const { data: fallbackData, error: fbError } = await supabase
        .from('users')
        .select(`*, organizations (*)`)
        .eq('email', user.email)
        .single()

      if (fbError) {
        console.error('users 테이블 조회 오류:', fbError.message)
        return null
      }

      if (fallbackData) {
        return fallbackData as User
      }
      return null
    }

    // RPC는 배열을 반환하므로 첫 번째 요소 사용
    const userData = Array.isArray(rpcData) ? rpcData[0] : rpcData

    if (!userData) {
      console.error('RPC: 사용자 데이터 없음')
      return null
    }

    console.log('RPC 사용자 정보:', userData.name, userData.role)

    // organizations 별도 조회
    let organization = undefined
    if (userData.org_id) {
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', userData.org_id)
        .single()
      if (orgError) {
        console.error('organizations 조회 오류:', orgError.message)
      }
      if (orgData) organization = orgData
    }

    return {
      id: userData.id,
      org_id: userData.org_id,
      role: userData.role,
      name: userData.name,
      email: userData.email,
      organization,
    } as User
  } catch (error) {
    console.error('getCurrentUser 예외:', error)
    return null
  }
}

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    super_admin: 6,
    hq: 5,
    branch: 4,
    sub_branch: 3,
    office: 2,
    employee: 1
  }

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}

export function canViewAllSales(userRole: UserRole): boolean {
  return userRole === 'super_admin'
}

export function canViewBranchSales(userRole: UserRole): boolean {
  return userRole === 'super_admin' || userRole === 'hq' || userRole === 'branch' || userRole === 'sub_branch'
}

export function canViewOfficeSales(userRole: UserRole): boolean {
  return userRole === 'super_admin' || userRole === 'hq' || userRole === 'branch' || userRole === 'sub_branch' || userRole === 'office'
}

export function canManageUsers(userRole: UserRole): boolean {
  return userRole === 'super_admin' || userRole === 'hq'
}

export function canApproveTransfers(userRole: UserRole): boolean {
  return userRole === 'super_admin' || userRole === 'hq' || userRole === 'branch' || userRole === 'sub_branch'
}

export function canCreateQRCodes(userRole: UserRole): boolean {
  // super_admin, hq만 QR 생성 가능 (부모+자식 QR 모두)
  // branch, sub_branch, office, employee는 QR 생성 불가
  return userRole === 'super_admin' || userRole === 'hq'
}

export function canInstallProducts(userRole: UserRole): boolean {
  return userRole === 'super_admin' || userRole === 'hq' || userRole === 'branch' || userRole === 'sub_branch' || userRole === 'office' || userRole === 'employee'
}

// ============================================
// 권한별 메뉴 시스템
// ============================================

export interface MenuItem {
  label: string
  href: string
  icon: string
  children?: MenuItem[]
}

// 권한별 메뉴 구성
export const roleMenuItems: Record<UserRole, MenuItem[]> = {
  super_admin: [
    { label: '대시보드', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: '조직 & 사용자 관리', href: '/admin/manage', icon: 'Building2' },
    { label: '초대 관리', href: '/admin/invitations', icon: 'Mail' },
    { label: '수수료 관리', href: '/admin/commissions', icon: 'DollarSign' },
    { label: '제품 관리', href: '/products', icon: 'Package' },
    { label: 'QR 코드 관리', href: '/qr/create', icon: 'QrCode' },
    { label: 'QR 목록', href: '/qr/list', icon: 'List' },
    { label: 'QR 이동 관리', href: '/transfer/requests', icon: 'ArrowRightLeft' },
    { label: '설치 관리', href: '/install', icon: 'Wrench' },
    { label: '매출 관리', href: '/sales', icon: 'DollarSign' },
  ],
  hq: [
    { label: '대시보드', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: '조직 & 사용자 관리', href: '/admin/manage', icon: 'Building2' },
    { label: '초대 관리', href: '/admin/invitations', icon: 'Mail' },
    { label: '수수료 관리', href: '/admin/commissions', icon: 'DollarSign' },
    { label: '제품 관리', href: '/products', icon: 'Package' },
    { label: 'QR 코드 생성', href: '/qr/create', icon: 'QrCode' },
    { label: 'QR 목록', href: '/qr/list', icon: 'List' },
    { label: 'QR 이동 관리', href: '/transfer/requests', icon: 'ArrowRightLeft' },
    { label: '설치 관리', href: '/install', icon: 'Wrench' },
    { label: '매출 관리', href: '/sales', icon: 'DollarSign' },
  ],
  branch: [
    { label: '대시보드', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: '조직 & 사용자 관리', href: '/admin/manage', icon: 'Building2' },
    { label: 'QR 목록', href: '/qr/list', icon: 'List' },
    { label: 'QR 스캔', href: '/qr/scan', icon: 'ScanLine' },
    { label: 'QR 이동 관리', href: '/transfer/requests', icon: 'ArrowRightLeft' },
    { label: '설치 관리', href: '/install', icon: 'Wrench' },
    { label: '매출 관리', href: '/sales', icon: 'DollarSign' },
  ],
  sub_branch: [
    { label: '대시보드', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: '조직 & 사용자 관리', href: '/admin/manage', icon: 'Building2' },
    { label: 'QR 목록', href: '/qr/list', icon: 'List' },
    { label: 'QR 스캔', href: '/qr/scan', icon: 'ScanLine' },
    { label: 'QR 이동 관리', href: '/transfer/requests', icon: 'ArrowRightLeft' },
    { label: '설치 관리', href: '/install', icon: 'Wrench' },
    { label: '매출 관리', href: '/sales', icon: 'DollarSign' },
  ],
  office: [
    { label: '대시보드', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: '조직 & 사용자 관리', href: '/admin/manage', icon: 'Building2' },
    { label: 'QR 목록', href: '/qr/list', icon: 'List' },
    { label: 'QR 스캔', href: '/qr/scan', icon: 'ScanLine' },
    { label: 'QR 이동 요청', href: '/transfer/requests', icon: 'ArrowRightLeft' },
    { label: '설치 등록', href: '/install', icon: 'Wrench' },
    { label: '매출 등록', href: '/sales/create', icon: 'DollarSign' },
  ],
  employee: [
    { label: '대시보드', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'QR 목록', href: '/qr/list', icon: 'List' },
    { label: 'QR 스캔', href: '/qr/scan', icon: 'ScanLine' },
    { label: '설치 등록', href: '/install', icon: 'Wrench' },
    { label: '매출 등록', href: '/sales/create', icon: 'DollarSign' },
  ],
}

// 권한별 대시보드 요약 카드 구성
export interface DashboardCard {
  title: string
  value: string
  icon: string
  color: string
  description: string
}

export const roleDashboardCards: Record<UserRole, DashboardCard[]> = {
  super_admin: [
    { title: '전체 조직', value: 'totalOrgs', icon: 'Building2', color: 'bg-red-500', description: '전체 조직 수' },
    { title: '전체 사용자', value: 'totalUsers', icon: 'Users', color: 'bg-purple-500', description: '전체 사용자 수' },
    { title: '전체 QR 코드', value: 'totalQRs', icon: 'QrCode', color: 'bg-blue-500', description: '전체 QR 코드 수' },
    { title: '전체 매출', value: 'totalSales', icon: 'DollarSign', color: 'bg-green-500', description: '전체 매출액' },
  ],
  hq: [
    { title: '관리 조직', value: 'totalOrgs', icon: 'Building2', color: 'bg-purple-500', description: '하위 조직 수' },
    { title: 'QR 코드', value: 'totalQRs', icon: 'QrCode', color: 'bg-blue-500', description: '관리 중인 QR 코드' },
    { title: '이동 대기', value: 'pendingTransfers', icon: 'ArrowRightLeft', color: 'bg-yellow-500', description: '승인 대기 중인 이동' },
    { title: '전체 매출', value: 'totalSales', icon: 'DollarSign', color: 'bg-green-500', description: '하위 조직 매출' },
  ],
  branch: [
    { title: '관리 지점', value: 'subBranchCount', icon: 'Building2', color: 'bg-blue-500', description: '하위 지점 수' },
    { title: 'QR 코드', value: 'totalQRs', icon: 'QrCode', color: 'bg-indigo-500', description: '관리 중인 QR 코드' },
    { title: '이동 대기', value: 'pendingTransfers', icon: 'ArrowRightLeft', color: 'bg-yellow-500', description: '승인 대기 중인 이동' },
    { title: '관할 매출', value: 'totalSales', icon: 'DollarSign', color: 'bg-green-500', description: '하위 조직 매출' },
  ],
  sub_branch: [
    { title: '관리 영업점', value: 'officeCount', icon: 'Building2', color: 'bg-indigo-500', description: '하위 영업점 수' },
    { title: 'QR 코드', value: 'totalQRs', icon: 'QrCode', color: 'bg-blue-500', description: '관리 중인 QR 코드' },
    { title: '이동 대기', value: 'pendingTransfers', icon: 'ArrowRightLeft', color: 'bg-yellow-500', description: '승인 대기 중인 이동' },
    { title: '관할 매출', value: 'totalSales', icon: 'DollarSign', color: 'bg-green-500', description: '하위 조직 매출' },
  ],
  office: [
    { title: 'QR 코드', value: 'totalQRs', icon: 'QrCode', color: 'bg-green-500', description: '보유 QR 코드' },
    { title: '이동 요청', value: 'pendingTransfers', icon: 'ArrowRightLeft', color: 'bg-yellow-500', description: '대기 중인 이동 요청' },
    { title: '설치 완료', value: 'installedCount', icon: 'Wrench', color: 'bg-blue-500', description: '설치 완료 건수' },
    { title: '매출', value: 'totalSales', icon: 'DollarSign', color: 'bg-emerald-500', description: '영업점 매출' },
  ],
  employee: [
    { title: 'QR 스캔', value: 'scanCount', icon: 'ScanLine', color: 'bg-gray-500', description: '스캔한 QR 코드' },
    { title: '설치 완료', value: 'installedCount', icon: 'Wrench', color: 'bg-blue-500', description: '내 설치 건수' },
    { title: '매출 등록', value: 'salesCount', icon: 'DollarSign', color: 'bg-green-500', description: '내 매출 건수' },
  ],
}
