"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { DollarSign, TrendingUp, Calendar, Plus, RefreshCw, Building2, ArrowRightLeft, Edit3, Wrench } from 'lucide-react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { getCurrentUser, roleLabels, type UserRole } from '@/lib/auth'

interface SaleItem {
  id: string
  org_id: string
  qr_id: string | null
  amount: number
  sale_date: string
  customer_name: string | null
  notes: string | null
  sale_type: string
  transfer_request_id: string | null
  created_by: string
  created_at: string
  organizations: { name: string } | null
  qr_codes: { product_name: string; uuid: string } | null
  creator_name: string | null
}

export default function SalesPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sales, setSales] = useState<SaleItem[]>([])
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('all')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'MANUAL' | 'TRANSFER' | 'INSTALLATION'>('ALL')
  const [stats, setStats] = useState({
    totalSales: 0,
    todaySales: 0,
    weekSales: 0,
    monthSales: 0,
  })

  const fetchSales = async () => {
    setLoading(true)
    try {
      const currentUser = await getCurrentUser()
      if (!currentUser) return
      setUser(currentUser)

      const res = await fetch('/api/sales')
      const data = await res.json()
      if (res.ok) {
        const salesData: SaleItem[] = (data.sales || []).map((s: any) => ({
          ...s,
          sale_type: s.sale_type || 'MANUAL',
          transfer_request_id: s.transfer_request_id || null,
        }))
        setSales(salesData)

        // 통계 계산
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        const monthAgo = new Date(today)
        monthAgo.setMonth(monthAgo.getMonth() - 1)

        const total = salesData.reduce((sum, s) => sum + Number(s.amount), 0)
        const todayTotal = salesData.filter(s => new Date(s.sale_date) >= today).reduce((sum, s) => sum + Number(s.amount), 0)
        const weekTotal = salesData.filter(s => new Date(s.sale_date) >= weekAgo).reduce((sum, s) => sum + Number(s.amount), 0)
        const monthTotal = salesData.filter(s => new Date(s.sale_date) >= monthAgo).reduce((sum, s) => sum + Number(s.amount), 0)

        setStats({ totalSales: total, todaySales: todayTotal, weekSales: weekTotal, monthSales: monthTotal })
      }
    } catch (e) {
      console.error('매출 데이터 로딩 오류:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSales() }, [])

  const filteredSales = sales
    .filter(sale => typeFilter === 'ALL' || sale.sale_type === typeFilter)
    .filter(sale => {
      if (filter === 'all') return true
      const saleDate = new Date(sale.sale_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (filter === 'today') return saleDate >= today
      if (filter === 'week') { const w = new Date(today); w.setDate(w.getDate() - 7); return saleDate >= w }
      if (filter === 'month') { const m = new Date(today); m.setMonth(m.getMonth() - 1); return saleDate >= m }
      return true
    })

  const saleTypeLabels: Record<string, { label: string; color: string; icon: any }> = {
    MANUAL: { label: '수동 등록', color: 'bg-gray-100 text-gray-700', icon: Edit3 },
    TRANSFER: { label: '이동 매출', color: 'bg-blue-100 text-blue-700', icon: ArrowRightLeft },
    INSTALLATION: { label: '설치 매출', color: 'bg-purple-100 text-purple-700', icon: Wrench },
  }

  const formatCurrency = (amount: number) => {
    if (amount >= 100000000) return (amount / 100000000).toFixed(1) + '억'
    if (amount >= 10000) return (amount / 10000).toFixed(0) + '만'
    return amount.toLocaleString()
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  }

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* 필더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">매출 관리</h1>
            <p className="text-sm text-gray-500 mt-1">매출 현황을 조회하고 관리합니다.</p>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={fetchSales} className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 flex items-center space-x-1">
              <RefreshCw size={14} /><span>새로고침</span>
            </button>
            <Link href="/sales/create" className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 flex items-center space-x-1">
              <Plus size={14} /><span>매출 등록</span>
            </Link>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">총 매출</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">₩{formatCurrency(stats.totalSales)}</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <DollarSign className="text-blue-600" size={20} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">오늘 매출</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">₩{formatCurrency(stats.todaySales)}</p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <Calendar className="text-green-600" size={20} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">주간 매출</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">₩{formatCurrency(stats.weekSales)}</p>
              </div>
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="text-purple-600" size={20} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">월간 매출</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">₩{formatCurrency(stats.monthSales)}</p>
              </div>
              <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="text-yellow-600" size={20} />
              </div>
            </div>
          </div>
        </div>

        {/* 필터 */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            {(['all', 'today', 'week', 'month'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ' +
                  (filter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50')}
              >
                {f === 'all' ? '전체' : f === 'today' ? '오늘' : f === 'week' ? '주간' : '월간'}
              </button>
            ))}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400">유형:</span>
            {(['ALL', 'MANUAL', 'TRANSFER', 'INSTALLATION'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={'px-3 py-1 rounded-lg text-xs font-medium transition-colors ' +
                  (typeFilter === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50')}
              >
                {t === 'ALL' ? '전체' : t === 'MANUAL' ? '수동 등록' : t === 'TRANSFER' ? '이동 매출' : '설치 매출'}
              </button>
            ))}
            <span className="text-xs text-gray-500 ml-2">{filteredSales.length}건</span>
          </div>
        </div>

        {/* 매출 목록 테이블 */}
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">로딩 중...</p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <DollarSign size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">매출 데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">날짜</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">유형</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">금액</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">제품</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">조직</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">고객명</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">등록자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSales.map(sale => (
                    <tr key={sale.id} className={'transition-colors ' + (sale.sale_type === 'TRANSFER' ? 'bg-blue-50/30 hover:bg-blue-50/50' : 'hover:bg-gray-50')}>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{formatDate(sale.sale_date)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const typeInfo = saleTypeLabels[sale.sale_type] || saleTypeLabels.MANUAL
                          const TypeIcon = typeInfo.icon
                          return (
                            <span className={'px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 ' + typeInfo.color}>
                              <TypeIcon size={10} />
                              {typeInfo.label}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-gray-900">₩{Number(sale.amount).toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600">{sale.qr_codes?.product_name || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Building2 size={12} className="text-gray-400" />
                          <span className="text-xs text-gray-500">{sale.organizations?.name || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{sale.customer_name || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{sale.creator_name || '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
