"use client"

import { useState, useEffect, useCallback } from 'react'
import {
  ArrowRightLeft,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  ArrowRight,
  Package
} from 'lucide-react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { canApproveTransfers, getCurrentUser, type User as UserType } from '@/lib/auth'

interface TransferRequest {
  request_id: string
  qr_uuid: string
  qr_product_name: string
  from_org_name: string
  to_org_name: string
  request_status: string
  requested_at: string
  approved_at: string | null
}

export default function TransferRequestsPage() {
  const [transfers, setTransfers] = useState<TransferRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [userInfo, setUserInfo] = useState<UserType | null>(null)
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'RECEIVED'>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser()
      setUserInfo(user)
    }
    init()
  }, [])

  const fetchTransfers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/qr/transfer/list')
      const data = await res.json()
      if (res.ok) {
        setTransfers(data.requests || [])
      }
    } catch {
      setTransfers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTransfers()
  }, [fetchTransfers])

  const handleApprove = async (requestId: string, approve: boolean) => {
    setActionLoading(requestId)
    try {
      const res = await fetch('/api/qr/transfer/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, approve })
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || '처리에 실패했습니다.')
        return
      }
      alert(approve ? '승인되었습니다.' : '거절되었습니다.')
      fetchTransfers()
    } catch {
      alert('처리에 실패했습니다.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReceive = async (requestId: string) => {
    setActionLoading(requestId)
    try {
      const res = await fetch('/api/qr/transfer/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId })
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || '수령 확인에 실패했습니다.')
        return
      }
      alert('수령 확인이 완료되었습니다.')
      fetchTransfers()
    } catch {
      alert('수령 확인에 실패했습니다.')
    } finally {
      setActionLoading(null)
    }
  }

  const canApprove = userInfo ? canApproveTransfers(userInfo.role) : false

  const filteredTransfers = filter === 'all'
    ? transfers
    : transfers.filter(t => t.request_status === filter)

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    PENDING: { label: '대기 중', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
    APPROVED: { label: '승인됨', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CheckCircle },
    REJECTED: { label: '거절됨', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
    RECEIVED: { label: '수령완료', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString('ko-KR') + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  const counts = {
    all: transfers.length,
    PENDING: transfers.filter(t => t.request_status === 'PENDING').length,
    APPROVED: transfers.filter(t => t.request_status === 'APPROVED').length,
    REJECTED: transfers.filter(t => t.request_status === 'REJECTED').length,
    RECEIVED: transfers.filter(t => t.request_status === 'RECEIVED').length,
  }

  if (loading) {
    return (
      <SidebarLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">이동 요청을 불러오는 중...</p>
          </div>
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">QR 이동 관리</h1>
            <p className="text-sm text-gray-500 mt-1">QR 코드 이동 요청 및 승인 현황을 관리합니다.</p>
          </div>
          <button
            onClick={() => fetchTransfers()}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 flex items-center space-x-1"
          >
            <RefreshCw size={14} />
            <span>새로고침</span>
          </button>
        </div>

        {/* 상태 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { key: 'all' as const, label: '전체', color: 'bg-gray-50 border-gray-200' },
            { key: 'PENDING' as const, label: '대기 중', color: 'bg-yellow-50 border-yellow-200' },
            { key: 'APPROVED' as const, label: '승인됨', color: 'bg-blue-50 border-blue-200' },
            { key: 'REJECTED' as const, label: '거절됨', color: 'bg-red-50 border-red-200' },
            { key: 'RECEIVED' as const, label: '수령완료', color: 'bg-green-50 border-green-200' },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`p-3 rounded-xl border-2 transition-all text-left ${
                filter === item.key ? 'border-blue-500 shadow-sm' : 'border-transparent'
              } ${item.color}`}
            >
              <p className="text-xs text-gray-500 font-medium">{item.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{counts[item.key]}</p>
            </button>
          ))}
        </div>

        {/* 이동 요청 목록 */}
        {filteredTransfers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <ArrowRightLeft size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 text-sm">이동 요청이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTransfers.map((transfer) => {
              const status = statusConfig[transfer.request_status] || statusConfig.PENDING
              const StatusIcon = status.icon
              const isActionLoading = actionLoading === transfer.request_id

              return (
                <div key={transfer.request_id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* 제품명 & 상태 */}
                      <div className="flex items-center space-x-2 mb-2">
                        <Package size={16} className="text-gray-400 shrink-0" />
                        <span className="font-medium text-gray-900 truncate">{transfer.qr_product_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.color} shrink-0`}>
                          {status.label}
                        </span>
                      </div>

                      {/* 이동 경로 */}
                      <div className="flex items-center space-x-2 text-sm text-gray-600 mb-1">
                        <span className="font-medium">{transfer.from_org_name}</span>
                        <ArrowRight size={14} className="text-gray-400 shrink-0" />
                        <span className="font-medium">{transfer.to_org_name}</span>
                      </div>

                      {/* UUID & 날짜 */}
                      <div className="flex items-center space-x-3 text-xs text-gray-400">
                        <span className="font-mono">{transfer.qr_uuid}</span>
                        <span>요청: {formatDate(transfer.requested_at)}</span>
                        {transfer.approved_at && (
                          <>
                            <span>승인: {formatDate(transfer.approved_at)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="ml-4 shrink-0">
                      {transfer.request_status === 'PENDING' && canApprove && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleApprove(transfer.request_id, true)}
                            disabled={isActionLoading}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 flex items-center space-x-1"
                          >
                            <CheckCircle size={12} />
                            <span>{isActionLoading ? '처리중...' : '승인'}</span>
                          </button>
                          <button
                            onClick={() => handleApprove(transfer.request_id, false)}
                            disabled={isActionLoading}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 flex items-center space-x-1"
                          >
                            <XCircle size={12} />
                            <span>거절</span>
                          </button>
                        </div>
                      )}
                      {transfer.request_status === 'APPROVED' && !canApprove && (
                        <button
                          onClick={() => handleReceive(transfer.request_id)}
                          disabled={isActionLoading}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 flex items-center space-x-1"
                        >
                          <CheckCircle size={12} />
                          <span>{isActionLoading ? '처리중...' : '수령 확인'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
