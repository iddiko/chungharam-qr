
// ============================================
// 수수료 분배 계산 로직
// 청하람 6단계 계층: super_admin > hq > branch > sub_branch > office > employee
// 각 단계별 퍼센트(%) 또는 고정 금액(fixed) 설정에 따라 자동 분배
// ============================================

export type CommissionType = 'percentage' | 'fixed'

export interface CommissionTierConfig {
  orgType: string
  orgId: string
  orgName: string
  commissionType: CommissionType
  commissionValue: number  // percentage: 0~100, fixed: 원 단위
}

export interface CommissionResult {
  orgType: string
  orgId: string
  orgName: string
  commissionType: CommissionType
  commissionRate: number
  commissionAmount: number
  remainingAmount: number  // 이 단계 분배 후 남은 금액
}

/**
 * 6단계 계층에 따라 수수료를 분배합니다.
 * 
 * @param totalAmount - 총 매출 금액
 * @param hierarchyPath - 하위→상위 순서의 계층 경로 (예: [employee, office, sub_branch, branch, hq])
 * @param commissionConfigs - 각 계층의 수수료 설정
 * @returns 분배 결과 배열 + 총 분배액
 * 
 * @example
 * const result = calculateCommissions(
 *   1000000,
 *   ['employee', 'office', 'sub_branch', 'branch', 'hq'],
 *   [
 *     { orgType: 'employee', orgId: '...', orgName: '영업사원', commissionType: 'percentage', commissionValue: 3 },
 *     { orgType: 'office', orgId: '...', orgName: '영업점', commissionType: 'percentage', commissionValue: 5 },
 *     { orgType: 'sub_branch', orgId: '...', orgName: '지점', commissionType: 'percentage', commissionValue: 7 },
 *     { orgType: 'branch', orgId: '...', orgName: '지사', commissionType: 'percentage', commissionValue: 8 },
 *     { orgType: 'hq', orgId: '...', orgName: '본사', commissionType: 'percentage', commissionValue: 10 },
 *   ]
 * )
 */
export function calculateCommissions(
  totalAmount: number,
  hierarchyPath: string[],
  commissionConfigs: CommissionTierConfig[]
): {
  distributions: CommissionResult[]
  totalDistributed: number
  totalRemaining: number
} {
  if (totalAmount <= 0) {
    return { distributions: [], totalDistributed: 0, totalRemaining: 0 }
  }

  const distributions: CommissionResult[] = []
  let remainingAmount = totalAmount
  let totalDistributed = 0

  // 설정을 Map으로 변환하여 빠른 조회
  const configMap = new Map<string, CommissionTierConfig>()
  for (const config of commissionConfigs) {
    configMap.set(config.orgType, config)
  }

  // 하위→상위 순서로 분배 (hierarchyPath 순서)
  for (const orgType of hierarchyPath) {
    const config = configMap.get(orgType)
    if (!config) continue

    let commissionAmount = 0

    if (config.commissionType === 'percentage') {
      // 퍼센트: 원금 기준으로 계산 (남은 금액 기준이 아님)
      commissionAmount = Math.floor(totalAmount * config.commissionValue / 100)
    } else {
      // 고정 금액: 남은 금액을 초과하지 않도록
      commissionAmount = Math.min(config.commissionValue, remainingAmount)
    }

    // 음수 방지
    commissionAmount = Math.max(0, commissionAmount)

    remainingAmount -= commissionAmount
    totalDistributed += commissionAmount

    distributions.push({
      orgType: config.orgType,
      orgId: config.orgId,
      orgName: config.orgName,
      commissionType: config.commissionType,
      commissionRate: config.commissionValue,
      commissionAmount,
      remainingAmount: Math.max(0, remainingAmount)
    })
  }

  return {
    distributions,
    totalDistributed,
    totalRemaining: Math.max(0, remainingAmount)
  }
}

/**
 * 조직 계층 경로를 생성합니다.
 * 하위 조직에서부터 상위 조직까지의 경로를 배열로 반환합니다.
 * (ltree 기반으로 DB에서 조회한 path를 파싱하여 사용)
 */
export function buildHierarchyPath(
  startOrgId: string,
  organizations: Array<{ id: string; parent_id: string | null; type: string; name: string }>
): string[] {
  const orgMap = new Map(organizations.map(o => [o.id, o]))
  const path: string[] = []
  let currentId: string | null = startOrgId

  while (currentId) {
    const org = orgMap.get(currentId)
    if (!org) break
    path.push(org.type)
    currentId = org.parent_id
  }

  return path
}

// ============================================
// 사용 예시 (클라이언트/서버 공통)
// ============================================
/*
// 예: 1,000,000원 매출에 대한 5단계 수수료 분배
const result = calculateCommissions(
  1000000,
  ['employee', 'office', 'sub_branch', 'branch', 'hq'],
  [
    { orgType: 'employee', orgId: 'emp-1', orgName: '해운대 영업사원 1', commissionType: 'percentage', commissionValue: 3 },
    { orgType: 'office', orgId: 'off-1', orgName: '해운대 1 영업점', commissionType: 'percentage', commissionValue: 5 },
    { orgType: 'sub_branch', orgId: 'sb-1', orgName: '부산 해운대 지점', commissionType: 'fixed', commissionValue: 50000 },
    { orgType: 'branch', orgId: 'br-1', orgName: '부산 지사', commissionType: 'percentage', commissionValue: 8 },
    { orgType: 'hq', orgId: 'hq-1', orgName: '서울 본사', commissionType: 'percentage', commissionValue: 10 },
  ]
)

// 결과:
// employee: 30,000원 (3%)
// office:   50,000원 (5%)
// sub_branch: 50,000원 (고정)
// branch:   80,000원 (8%)
// hq:      100,000원 (10%)
// 총 분배: 310,000원, 남은 금액: 690,000원
*/
