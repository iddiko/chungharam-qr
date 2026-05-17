"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { DollarSign, QrCode, CheckCircle, Clock, AlertCircle, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export default function EmployeeDashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalSales: 0,
    assignedQRCodes: 0,
    pendingInstallations: 0,
    completedInstallations: 0
  })
  const [assignedQRCodes, setAssignedQRCodes] = useState<any[]>([])
  const [pendingInstallations, setPendingInstallations] = useState<any[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const currentUser = await getCurrentUser()
        if (!currentUser) return

        // 영업점 매출 통계 (읽기 전용)
        const { data: salesData } = await supabase
          .from('sales')
          .select('amount')
          .eq('org_id', currentUser.org_id)

        const totalSales = salesData?.reduce((sum, sale) => sum + parseFloat(sale.amount), 0) || 0

        // 할당된 QR 코드 수
        const { count: qrCount } = await supabase
          .from('qr_codes')
          .select('*', { count: 'exact', head: true })
          .eq('owner_org_id', currentUser.org_id)

        // 설치 대기 중인 QR 코드
        const { data: pendingData } = await supabase
          .from('qr_codes')
          .select('*')
          .eq('owner_org_id', currentUser.org_id)
          .in('status', ['RECEIVED', 'INSTALLED'])

        // 설치 완료된 QR 코드
        const { count: completedCount } = await supabase
          .from('installations')
          .select('*', { count: 'exact', head: true })
          .eq('installed_by', currentUser.id)

        // 할당된 QR 코드 목록
        const { data: qrListData } = await supabase
          .from('qr_codes')
          .select(`
            id,
            uuid,
            product_name,
            status,
            created_at
          `)
          .eq('owner_org_id', currentUser.org_id)
          .order('created_at', { ascending: false })
          .limit(5)

        // 설치 대기 목록
        const { data: installData } = await supabase
          .from('qr_codes')
          .select(`
            id,
            uuid,
            product_name,
            status,
            created_at
          `)
          .eq('owner_org_id', currentUser.org_id)
          .in('status', ['RECEIVED', 'INSTALLED'])
          .order('created_at', { ascending: false })
          .limit(5)

        setStats({
          totalSales,
          assignedQRCodes: qrCount || 0,
          pendingInstallations: pendingData?.length || 0,
          completedInstallations: completedCount || 0
        })

        setAssignedQRCodes(qrListData || [])
        setPendingInstallations(installData || [])
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
              <p className="text-gray-600 text-sm">할당된 QR 코드</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.assignedQRCodes}
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
              <p className="text-gray-600 text-sm">설치 대기</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.pendingInstallations}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Clock className="text-orange-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">설치 완료</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.completedInstallations}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-green-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 할당된 QR 코드 */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <QrCode className="mr-2" size={20} />
              할당된 QR 코드
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {assignedQRCodes.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                할당된 QR 코드가 없습니다
              </div>
            ) : (
              assignedQRCodes.map((qr) => (
                <div key={qr.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{qr.product_name}</p>
                      <p className="text-sm text-gray-600">{qr.uuid}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      qr.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700' :
                      qr.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                      qr.status === 'INSTALLED' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {qr.status === 'ACTIVE' ? '활성' :
                       qr.status === 'PENDING' ? '대기' :
                       qr.status === 'INSTALLED' ? '설치 완료' : qr.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-100">
            <Link
              href="/qr/list"
              className="flex items-center justify-center text-blue-600 hover:text-blue-700 font-medium"
            >
              전체 QR 코드 보기
              <QrCode size={16} className="ml-1" />
            </Link>
          </div>
        </div>

        {/* 설치 작업 대기 */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <AlertCircle className="mr-2" size={20} />
              설치 작업 대기
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {pendingInstallations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                설치 대기 중인 QR 코드가 없습니다
              </div>
            ) : (
              pendingInstallations.map((qr) => (
                <div key={qr.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{qr.product_name}</p>
                      <p className="text-sm text-gray-600">{qr.uuid}</p>
                    </div>
                    <Link
                      href={`/installations/create?qrId=${qr.id}`}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                    >
                      설치 등록
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-100">
            <Link
              href="/installations"
              className="flex items-center justify-center text-blue-600 hover:text-blue-700 font-medium"
            >
              전체 설치 작업 보기
              <MapPin size={16} className="ml-1" />
            </Link>
          </div>
        </div>
      </div>

      {/* 빠른 작업 링크 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">빠른 작업</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/qr/scan"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <QrCode className="text-blue-600 mr-3" size={20} />
            <div>
              <p className="font-medium text-gray-900">QR 스캔</p>
              <p className="text-sm text-gray-600">QR 코드 스캔 및 정보 확인</p>
            </div>
          </Link>
          <Link
            href="/installations/create"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <CheckCircle className="text-blue-600 mr-3" size={20} />
            <div>
              <p className="font-medium text-gray-900">설치 등록</p>
              <p className="text-sm text-gray-600">새 설치 작업 등록</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
