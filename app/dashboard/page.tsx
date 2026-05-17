"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  getCurrentUser,
  roleLabels,
  roleBadgeStyles,
  roleMenuItems,
  roleDashboardCards,
  canApproveTransfers,
  canCreateQRCodes,
  type User as UserType,
} from '@/lib/auth'
import SidebarLayout from '@/app/components/SidebarLayout'
import {
  QrCode,
  ArrowRight,
  DollarSign,
  Building2,
  Users,
  ArrowRightLeft,
  Wrench,
  ScanLine,
} from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userInfo, setUserInfo] = useState<UserType | null>(null)
  const [stats, setStats] = useState<Record<string, number>>({
    totalOrgs: 0, totalUsers: 0, totalQRs: 0, totalSales: 0,
    pendingTransfers: 0, subBranchCount: 0, officeCount: 0,
    installedCount: 0, scanCount: 0, salesCount: 0,
  })
  const [recentQRs, setRecentQRs] = useState<any[]>([])
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
          setError('사용자 정보를 가져올 수 없습니다. 로그인 상태를 확인해주세요.')
          setLoading(false)
          return
        }
        setUserInfo(currentUser)

        // 대시보드 통계 RPC로 조회 (RLS 우회)
        try {
          const { data: dashData, error: dashError } = await supabase
            .rpc('get_dashboard_stats' as any, { p_user_email: currentUser.email } as any)

          if (dashError) {
            console.error('대시보드 RPC 오류:', dashError)
          } else if (dashData) {
            const d = dashData as any
            setStats({
              totalOrgs: d.totalOrgs || 0,
              totalUsers: d.totalUsers || 0,
              totalQRs: d.totalQRs || 0,
              totalSales: d.totalSales || 0,
              pendingTransfers: d.pendingTransfers || 0,
              installedCount: d.installedCount || 0,
              subBranchCount: d.subBranchCount || 0,
              officeCount: d.officeCount || 0,
              scanCount: 0,
              salesCount: 0,
            })
            setRecentQRs(d.recentQRs || [])
            setPendingTransfers(d.pendingTransferList || [])
          }
        } catch (e) { console.error('대시보드 데이터 오류:', e) }

      } catch (error) {
        console.error('데이터 로딩 실패:', error)
        setError('데이터를 불러오는데 실패했습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [router])

  const formatCurrency = (amount: number) => {
    if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억`
    if (amount >= 10000) return `${(amount / 10000).toFixed(0)}만`
    return amount.toLocaleString()
  }

  if (loading) {
    return (
      <SidebarLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">로딩 중...</p>
          </div>
        </div>
      </SidebarLayout>
    )
  }

  if (error || !userInfo) {
    return (
      <SidebarLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-red-500 text-lg mb-2">{error || '사용자 정보를 찾을 수 없습니다'}</p>
            <button
              onClick={() => router.push('/login')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              로그인 페이지로
            </button>
          </div>
        </div>
      </SidebarLayout>
    )
  }

  const dashboardCards = roleDashboardCards[userInfo.role] || []

  const cardIconMap: Record<string, any> = {
    Building2, Users, QrCode, DollarSign, ArrowRightLeft, Wrench, ScanLine,
  }

  const cardColorMap: Record<string, { bg: string; icon: string }> = {
    'bg-red-500': { bg: 'bg-red-50', icon: 'text-red-600' },
    'bg-purple-500': { bg: 'bg-purple-50', icon: 'text-purple-600' },
    'bg-blue-500': { bg: 'bg-blue-50', icon: 'text-blue-600' },
    'bg-indigo-500': { bg: 'bg-indigo-50', icon: 'text-indigo-600' },
    'bg-green-500': { bg: 'bg-green-50', icon: 'text-green-600' },
    'bg-emerald-500': { bg: 'bg-emerald-50', icon: 'text-emerald-600' },
    'bg-yellow-500': { bg: 'bg-yellow-50', icon: 'text-yellow-600' },
    'bg-gray-500': { bg: 'bg-gray-50', icon: 'text-gray-600' },
  }

  return (
    <SidebarLayout>
      {/* 환영 배너 */}
      <div className={`mb-6 p-5 rounded-xl flex items-center justify-between ${
        userInfo.role === 'super_admin' ? 'bg-gradient-to-r from-red-600 to-red-500' :
        userInfo.role === 'hq' ? 'bg-gradient-to-r from-purple-600 to-purple-500' :
        userInfo.role === 'branch' ? 'bg-gradient-to-r from-blue-600 to-blue-500' :
        userInfo.role === 'sub_branch' ? 'bg-gradient-to-r from-indigo-600 to-indigo-500' :
        userInfo.role === 'office' ? 'bg-gradient-to-r from-green-600 to-green-500' :
        'bg-gradient-to-r from-gray-600 to-gray-500'
      }`}>
        <div>
          <h2 className="text-xl font-bold text-white">{userInfo.name}님, 환영합니다</h2>
          <p className="text-white/80 text-sm mt-1 flex items-center space-x-2">
            <span>{roleLabels[userInfo.role]}</span>
            <span>•</span>
            <span className="flex items-center"><Building2 size={12} className="mr-1" />{userInfo.organization?.name || '-'}</span>
          </p>
        </div>
        <span className="hidden sm:inline px-3 py-1.5 bg-white/20 text-white text-sm font-bold rounded-lg">
          {roleLabels[userInfo.role]}
        </span>
      </div>

      {/* 통계 카드 */}
      <div className={`grid gap-4 mb-8 ${dashboardCards.length <= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
        {dashboardCards.map((card) => {
          const Icon = cardIconMap[card.icon] || QrCode
          const colors = cardColorMap[card.color] || { bg: 'bg-blue-50', icon: 'text-blue-600' }
          const value = stats[card.value] ?? 0
          const displayValue = card.value === 'totalSales' ? `₩${formatCurrency(value)}` : value.toString()
          return (
            <div key={card.value} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{displayValue}</p>
                  <p className="text-gray-400 text-xs mt-1">{card.description}</p>
                </div>
                <div className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center`}>
                  <Icon className={colors.icon} size={24} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 빠른 실행 */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">빠른 실행</h3>
        <div className="flex flex-wrap gap-3">
          {(userInfo.role === 'super_admin' || userInfo.role === 'hq') && (
            <>
              <Link href="/admin/organizations" className="inline-flex items-center px-4 py-2.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-sm font-medium">
                <Building2 size={16} className="mr-2" />조직 관리
              </Link>
              <Link href="/admin/users" className="inline-flex items-center px-4 py-2.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium">
                <Users size={16} className="mr-2" />사용자 관리
              </Link>
            </>
          )}
          {canCreateQRCodes(userInfo.role) ? (
            <Link href="/qr/create" className="inline-flex items-center px-4 py-2.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium">
              <QrCode size={16} className="mr-2" />QR 코드 생성
            </Link>
          ) : userInfo.role === 'employee' ? (
            <Link href="/qr/scan" className="inline-flex items-center px-4 py-2.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium">
              <ScanLine size={16} className="mr-2" />QR 스캔
            </Link>
          ) : null}
          <Link href="/transfer/requests" className="inline-flex items-center px-4 py-2.5 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors text-sm font-medium">
            <ArrowRightLeft size={16} className="mr-2" />이동 관리
          </Link>
          <Link href="/sales/create" className="inline-flex items-center px-4 py-2.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium">
            <DollarSign size={16} className="mr-2" />매출 등록
          </Link>
        </div>
      </div>

      {/* 최근 QR & 이동 대기 */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-semibold text-gray-900">최근 QR 코드</h3>
              <Link href="/qr/create" className="text-blue-600 hover:text-blue-700 flex items-center text-sm">
                전체 보기 <ArrowRight size={14} className="ml-1" />
              </Link>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {recentQRs.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <QrCode size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">QR 코드가 없습니다</p>
              </div>
            ) : recentQRs.slice(0, 5).map((qr: any) => (
              <div key={qr.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{qr.product_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{qr.org_name || '-'} • {qr.uuid}</p>
                  </div>
                  <span className={'ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ' +
                    (qr.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                    qr.status === 'INSTALLED' ? 'bg-blue-100 text-blue-700' :
                    qr.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700')
                  }>{qr.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-semibold text-gray-900">
                {canApproveTransfers(userInfo.role) ? '승인 대기 중인 이동' : '내 이동 요청'}
              </h3>
              <Link href="/transfer/requests" className="text-blue-600 hover:text-blue-700 flex items-center text-sm">
                전체 보기 <ArrowRight size={14} className="ml-1" />
              </Link>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingTransfers.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <ArrowRightLeft size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">대기 중인 이동 요청이 없습니다</p>
              </div>
            ) : pendingTransfers.slice(0, 5).map((transfer: any) => (
              <div key={transfer.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {transfer.qr_product_name || '-'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {transfer.from_org_name || '-'} → {transfer.to_org_name || '-'}
                    </p>
                  </div>
                  <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-bold shrink-0">
                    대기
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SidebarLayout>
  )
}
