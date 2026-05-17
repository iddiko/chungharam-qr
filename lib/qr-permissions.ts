// QR 생성 권한 및 수량 제한 설정

export type UserRole = 'super_admin' | 'hq' | 'branch' | 'sub_branch' | 'office' | 'employee'

// 역할별 권한 설정
interface RolePermission {
  canCreateTopLevelQR: boolean  // 최상위 QR 생성 가능
  canCreateChildQR: boolean     // 자식 QR 생성 가능
  canTransferQR: boolean        // QR 이동 가능
  maxChildQRCount: number | null // 자식 QR 최대 생성 수 (null = 무제한)
  requiresReason: boolean       // QR 생성 시 사유 필수 여부
}

// 기본 권한 맵
const defaultPermissions: Record<UserRole, RolePermission> = {
  super_admin: {
    canCreateTopLevelQR: true,
    canCreateChildQR: true,
    canTransferQR: true,
    maxChildQRCount: null,  // 무제한
    requiresReason: false,
  },
  hq: {
    canCreateTopLevelQR: true,
    canCreateChildQR: true,
    canTransferQR: true,
    maxChildQRCount: null,
    requiresReason: false,
  },
  branch: {
    canCreateTopLevelQR: false,
    canCreateChildQR: false,  // QR 생성 불가
    canTransferQR: true,
    maxChildQRCount: null,
    requiresReason: false,
  },
  sub_branch: {
    canCreateTopLevelQR: false,
    canCreateChildQR: false,  // QR 생성 불가
    canTransferQR: true,
    maxChildQRCount: null,
    requiresReason: false,
  },
  office: {
    canCreateTopLevelQR: false,
    canCreateChildQR: false,  // QR 생성 불가 (본사에서 생성하여 동봉)
    canTransferQR: true,
    maxChildQRCount: null,
    requiresReason: false,
  },
  employee: {
    canCreateTopLevelQR: false,
    canCreateChildQR: false,  // QR 생성 불가
    canTransferQR: false,
    maxChildQRCount: 10,
    requiresReason: false,
  },
}

// 사용자 정의 수량 제한 (저장/로드)
let customMaxChildQR: Partial<Record<UserRole, number>> = {}

// 수량 제한 변경
export function setMaxChildQRCount(role: UserRole, count: number | null) {
  if (count === null) {
    delete customMaxChildQR[role]
  } else {
    customMaxChildQR[role] = count
  }
  // 내부 상태만 관리 (DB 저장이 필요하면 추가 가능)
}

// 수량 제한 조회
export function getMaxChildQRCount(role: UserRole): number | null {
  if (role in customMaxChildQR) {
    return customMaxChildQR[role] ?? null
  }
  return defaultPermissions[role].maxChildQRCount
}

// 권한 조회
export function getPermissions(role: UserRole): RolePermission {
  return {
    ...defaultPermissions[role],
    maxChildQRCount: getMaxChildQRCount(role),
  }
}

// 개별 권한 확인
export function canCreateTopLevelQR(role: UserRole): boolean {
  return defaultPermissions[role].canCreateTopLevelQR
}

export function canCreateChildQR(role: UserRole): boolean {
  return defaultPermissions[role].canCreateChildQR
}

export function canTransferQR(role: UserRole): boolean {
  return defaultPermissions[role].canTransferQR
}

// 모든 권한 맵 반환 (관리 페이지용)
export function getAllPermissions(): Record<UserRole, RolePermission> {
  const result = { ...defaultPermissions }
  for (const role of Object.keys(customMaxChildQR) as UserRole[]) {
    result[role] = {
      ...result[role],
      maxChildQRCount: customMaxChildQR[role] ?? null,
    }
  }
  return result
}
