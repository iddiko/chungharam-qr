"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { DollarSign, QrCode, ArrowRight, MapPin, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export default function OfficeDashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalSales: 0,
    totalQRCodes: 0,
    pendingTransfers: 0,
    pendingInstallations: 0
  })
  const [qrStatus, setQRStatus] = useState({
    active: 0,
    pending: 0,
    installed: 0
  })
  const [recentTransfers, setRecentTransfers] = useState<any[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const currentUser = await getCurrentUser()
        if (!currentUser) return

        // 영업점 매출 통계
        const { data: salesData } = await supabase
          .from('sales')
          .select('amount')
          .eq('org_id', currentUser.org_id)

        const totalSales = salesData?.reduce((sum, sale) => sum + parseFloat(sale.amount), 0) || 0

        // 영업점 QR 코드 수
        const { count: qrCount } = await supabase
          .from('qr_codes')
          .select('*', { count: 'exact', head: true })
          .eq('owner_org_id', currentUser.org_id)

        // 이동 대기 중인 QR 코드
        const { count: pendingCount } = await supabase
          .from('qr_transfer_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'PENDING')

        // 설치 대기 중인 QR 코드
        const { count: installCount } = await supabase
          .from('qr_codes')
          .select('*', { count: 'exact', head: true })
          .eq('owner_org_id', currentUser.org_id)
          .in('status', ['RECEIVED', 'INSTALLED'])

        // QR 코드 상태별 수
        const { data: qrStatusData } = await supabase
          .from('qr_codes')
          .select('status')
          .eq('owner_org_id', currentUser.org_id)

        const statusCounts = qrStatusData?.reduce((acc, qr) => {
          if (qr.status === 'ACTIVE') acc.active++
          else if (qr.status === 'PENDING') acc.pending++
          else if (qr.status === 'INSTALLED') acc.installed++
          return acc
        }, { active: 0, pending: 0, installed: 0 }) || { active: 0, pending: 0, installed: 0 }

        // 최근 이동 요청
        const { data: transfersData } = await supabase
          .from('qr_transfer_requests')
          .select(`
            id,
            qr_codes(product_name, uuid),
            from_organizations(name),
            to_organizations(name),
            requested_at
          `)
          .order('requested_at', { ascending: false })
          .limit(5)

        setStats({
          totalSales,
          totalQRCodes: qrCount || 0,
          pendingTransfers: pendingCount || 0,
          pendingInstallations: installCount || 0
        })

        setQRStatus(statusCounts)
        setRecentTransfers(transfersData || [])
      } catch (error) {
        console.error('데이터 로딩 실패:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">영업점 매출</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                ₩{stats.totalSales.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <DollarSign className="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">보유 QR 코드</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.totalQRCodes}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <QrCode className="text-purple-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">이동 대기</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.pendingTransfers}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <ArrowRight className="text-orange-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">설치 대기</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.pendingInstallations}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-green-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR 코드 상태 */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <MapPin className="mr-2" size={20} />
              QR 코드 상태
            </h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-3" />
                  <p className="font-medium text-gray-900">활성</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{qrStatus.active}</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-yellow-500 mr-3" />
                  <p className="font-medium text-gray-900">대기</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{qrStatus.pending}</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-green-500 mr-3" />
                  <p className="font-medium text-gray-900">설치 완료</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">{qrStatus.installed}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 최근 이동 요청 */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Clock className="mr-2" size={20} />
              최근 이동 요청
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {recentTransfers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                이동 요청이 없습니다
              </div>
            ) : (
              recentTransfers.map((transfer) => (
                <div key={transfer.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-gray-900">
                      {transfer.qr_codes?.product_name}
                    </p>
                    <span className="text-sm text-gray-500">
                      {new Date(transfer.requested_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span>{transfer.from_organizations?.name}</span>
                    <ArrowRight size={16} className="mx-2" />
                    <span>{transfer.to_organizations?.name}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-100">
            <Link
              href="/transfer/requests"
              className="flex items-center justify-center text-blue-600 hover:text-blue-700 font-medium"
            >
              전체 이동 요청 보기
              <ArrowRight size={16} className="ml-1" />
            </Link>
          </div>
        </div>
      </div>

      {/* QR 코드 관리 링크 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">QR 코드 관리</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/qr/list"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <QrCode className="text-blue-600 mr-3" size={20} />
            <div>
              <p className="font-medium text-gray-900">QR 코드 목록</p>
              <p className="text-sm text-gray-600">전체 QR 코드 확인</p>
            </div>
          </Link>
          <Link
            href="/qr/create"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <CheckCircle className="text-blue-600 mr-3" size={20} />
            <div>
              <p className="font-medium text-gray-900">QR 코드 생성</p>
              <p className="text-sm text-gray-600">새 QR 코드 등록</p>
            </div>
          </Link>
          <Link
            href="/installations"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <AlertCircle className="text-blue-600 mr-3" size={20} />
            <div>
              <p className="font-medium text-gray-900">설치 관리</p>
              <p className="text-sm text-gray-600">설치 작업 관리</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
