"use client"

import { useState, useEffect, useCallback } from 'react'
import { QrCode, Search, Printer, RefreshCw, Copy, CheckCircle, ArrowRightLeft, Send, X } from 'lucide-react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { getCurrentUser, type User as UserType } from '@/lib/auth'

interface QRItem {
  qr_id: string
  qr_uuid: string
  qr_product_name: string
  qr_status: string
  qr_parent_qr_id: string | null
  qr_owner_org_id: string
  org_name: string
  qr_created_at: string
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return y + '-' + m + '-' + day + ' ' + h + ':' + min
}

const statusLabels: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: '활성', color: 'bg-green-100 text-green-800' },
  PENDING: { label: '이동대기', color: 'bg-yellow-100 text-yellow-800' },
  RECEIVED: { label: '수령대기', color: 'bg-blue-100 text-blue-800' },
  INSTALLED: { label: '설치완료', color: 'bg-purple-100 text-purple-800' },
  INACTIVE: { label: '비활성', color: 'bg-gray-100 text-gray-800' },
}

export default function QRListPage() {
  const [qrList, setQrList] = useState<QRItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [printMode, setPrintMode] = useState(false)
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [userInfo, setUserInfo] = useState<UserType | null>(null)
  const [transferModal, setTransferModal] = useState<{ open: boolean; qr: QRItem | null }>({ open: false, qr: null })
  const [transferLoading, setTransferLoading] = useState(false)

  const fetchQRList = useCallback(async (searchTerm?: string, statusTerm?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const s = searchTerm !== undefined ? searchTerm : search
      const st = statusTerm !== undefined ? statusTerm : statusFilter
      if (s) params.set('search', s)
      if (st && st !== 'ALL') params.set('status', st)
      const url = '/api/qr/list' + (params.toString() ? '?' + params.toString() : '')
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) setQrList(data.qrCodes || [])
    } catch {
      setQrList([])
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    fetchQRList('', 'ALL')
    getCurrentUser().then(setUserInfo)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchQRList()
    }, 400)
    return () => clearTimeout(timer)
  }, [search, statusFilter])

  const getQRImageUrl = (uuid: string, size: number = 200) => {
    const qrUrl = process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL + '/qr/' + uuid
      : uuid
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&data=' + encodeURIComponent(qrUrl)
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const togglePrintSelect = (id: string) => {
    const next = new Set(selectedForPrint)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedForPrint(next)
  }

  const selectAllForPrint = () => {
    if (selectedForPrint.size === qrList.length) {
      setSelectedForPrint(new Set())
    } else {
      setSelectedForPrint(new Set(qrList.map(q => q.qr_id)))
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const selectedQRs = qrList.filter(q => selectedForPrint.has(q.qr_id))
    const appUrl = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL
      : ''
    const qrCards = selectedQRs.map(q => {
      const qrData = appUrl ? appUrl + '/qr/' + q.qr_uuid : q.qr_uuid
      return '<div class="qr-card">' +
      '<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qrData) + '" alt="QR"/>' +
      '<div class="name">' + q.qr_product_name + '</div>' +
      '<div class="uuid">' + q.qr_uuid + '</div>' +
      '<div class="org">' + (q.org_name || '') + '</div>' +
      '</div>'
    }).join('')

    printWindow.document.write(
      '<html><head><title>QR 코드 인쇄</title>' +
      '<style>body{font-family:sans-serif;margin:20px}.qr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}' +
      '.qr-card{border:1px solid #ddd;border-radius:8px;padding:16px;text-align:center;page-break-inside:avoid}' +
      '.qr-card img{width:150px;height:150px}.qr-card .uuid{font-family:monospace;font-size:10px;margin-top:8px;word-break:break-all}' +
      '.qr-card .name{font-weight:bold;margin-top:4px}.qr-card .org{font-size:11px;color:#666;margin-top:2px}' +
      'h1{text-align:center}</style></head>' +
      '<body><h1>청하람 QR 코드</h1>' +
      '<div class="qr-grid">' + qrCards + '</div>' +
      '<script>window.onload=function(){window.print()}</script></body></html>'
    )
    printWindow.document.close()
  }

  const handleTransferRequest = async () => {
    if (!transferModal.qr || !userInfo) return
    setTransferLoading(true)
    try {
      const res = await fetch('/api/qr/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrUuid: transferModal.qr.qr_uuid,
          toOrgId: userInfo.org_id
        })
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || '이동 요청에 실패했습니다.')
        return
      }
      alert('이동 요청이 완료되었습니다. 승인을 기다려주세요.')
      setTransferModal({ open: false, qr: null })
      fetchQRList()
    } catch {
      alert('이동 요청에 실패했습니다.')
    } finally {
      setTransferLoading(false)
    }
  }

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">QR 코드 목록</h1>
            <p className="text-sm text-gray-500 mt-1">생성된 QR 코드 현황을 조회하고 관리합니다.</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => fetchQRList()}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 flex items-center space-x-1"
            >
              <RefreshCw size={14} />
              <span>새로고침</span>
            </button>
            <button
              onClick={() => setPrintMode(!printMode)}
              className={'px-3 py-2 rounded-lg text-sm font-medium flex items-center space-x-1 transition-colors ' +
                (printMode ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50')}
            >
              <Printer size={14} />
              <span>{printMode ? '인쇄 취소' : '인쇄'}</span>
            </button>
          </div>
        </div>

        {/* 검색 & 필터 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="QR UUID, 제품명 검색..."
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">모든 상태</option>
              <option value="ACTIVE">활성</option>
              <option value="PENDING">이동대기</option>
              <option value="RECEIVED">수령대기</option>
              <option value="INSTALLED">설치완료</option>
              <option value="INACTIVE">비활성</option>
            </select>
          </div>
          <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
            <span>검색 결과: {qrList.length}개</span>
            <span>활성: {qrList.filter(q => q.qr_status === 'ACTIVE').length}</span>
            <span>이동대기: {qrList.filter(q => q.qr_status === 'PENDING').length}</span>
            <span>설치완료: {qrList.filter(q => q.qr_status === 'INSTALLED').length}</span>
          </div>
        </div>

        {/* 인쇄 선택 바 */}
        {printMode && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={selectAllForPrint}
                className="px-3 py-1.5 text-sm rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                {selectedForPrint.size === qrList.length ? '전체 해제' : '전체 선택'}
              </button>
              <span className="text-sm text-blue-700">{selectedForPrint.size}개 선택됨</span>
            </div>
            <button
              onClick={handlePrint}
              disabled={selectedForPrint.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300 flex items-center space-x-2"
            >
              <Printer size={16} />
              <span>인쇄</span>
            </button>
          </div>
        )}

        {/* QR 목록 테이블 */}
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">로딩 중...</p>
          </div>
        ) : qrList.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <QrCode size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">
              {search || statusFilter !== 'ALL' ? '검색 결과가 없습니다.' : 'QR 코드가 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {printMode && (
                      <th className="px-3 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedForPrint.size === qrList.length && qrList.length > 0}
                          onChange={selectAllForPrint}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                      </th>
                    )}
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">QR</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">제품명</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">UUID</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">상태</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">조직</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">생성시간</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">복사</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">이동</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {qrList.map((qr) => {
                    const statusInfo = statusLabels[qr.qr_status] || { label: qr.qr_status, color: 'bg-gray-100 text-gray-800' }
                    return (
                      <tr key={qr.qr_id} className="hover:bg-gray-50 transition-colors">
                        {printMode && (
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedForPrint.has(qr.qr_id)}
                              onChange={() => togglePrintSelect(qr.qr_id)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <img
                            src={getQRImageUrl(qr.qr_uuid, 40)}
                            alt="QR"
                            className="w-10 h-10 rounded border border-gray-200"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm font-semibold text-gray-900">{qr.qr_product_name}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono text-gray-500">{qr.qr_uuid}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + statusInfo.color}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-gray-500">{qr.org_name || '-'}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-gray-500">{formatDate(qr.qr_created_at)}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => copyToClipboard(qr.qr_uuid, qr.qr_id)}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="UUID 복사"
                          >
                            {copiedId === qr.qr_id ? <CheckCircle size={14} className="text-green-500" /> : <Copy size={14} />}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {qr.qr_status === 'ACTIVE' && userInfo && qr.qr_owner_org_id !== userInfo.org_id && (
                            <button
                              onClick={() => setTransferModal({ open: true, qr })}
                              className="text-gray-400 hover:text-orange-600 transition-colors"
                              title="이동 요청"
                            >
                              <ArrowRightLeft size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 이동 요청 모달 */}
      {transferModal.open && transferModal.qr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">QR 이동 요청</h3>
              <button onClick={() => setTransferModal({ open: false, qr: null })} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center space-x-3">
                  <img src={getQRImageUrl(transferModal.qr.qr_uuid, 60)} alt="QR" className="w-14 h-14 rounded border border-gray-200" />
                  <div>
                    <p className="font-semibold text-gray-900">{transferModal.qr.qr_product_name}</p>
                    <p className="text-xs font-mono text-gray-500 mt-0.5">{transferModal.qr.qr_uuid}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-sm">
                <span className="text-gray-500">현재:</span>
                <span className="font-medium text-gray-900">{transferModal.qr.org_name}</span>
                <ArrowRightLeft size={14} className="text-orange-500" />
                <span className="text-gray-500">이동:</span>
                <span className="font-medium text-orange-600">{userInfo?.organization?.name || "내 조직"}</span>
              </div>

              <p className="text-xs text-gray-400">이동 요청 시 QR이 비활성화되며, 상위 조직의 승인 후 소유권이 이전됩니다.</p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setTransferModal({ open: false, qr: null })}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleTransferRequest}
                disabled={transferLoading}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:bg-orange-300 flex items-center justify-center space-x-1"
              >
                <Send size={14} />
                <span>{transferLoading ? "요청 중..." : "이동 요청"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  )
}
