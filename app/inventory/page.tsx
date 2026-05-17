
"use client"

import { useState, useEffect } from 'react'
import { Package, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Search, Building2, QrCode } from 'lucide-react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { getCurrentUser, type User as UserType } from '@/lib/auth'

interface InventoryRecord {
  id: string
  qr_id: string
  qr_uuid: string
  qr_product_name: string
  org_id: string
  org_name: string
  record_type: string
  quantity: number
  from_org_id: string | null
  from_org_name: string | null
  to_org_id: string | null
  to_org_name: string | null
  notes: string | null
  created_at: string
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

export default function InventoryPage() {
  const [records, setRecords] = useState<InventoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INBOUND' | 'OUTBOUND'>('ALL')
  const [search, setSearch] = useState('')
  const [userInfo, setUserInfo] = useState<UserType | null>(null)

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'ALL') params.set('recordType', typeFilter)
      const url = '/api/inventory' + (params.toString() ? '?' + params.toString() : '')
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) {
        setRecords((data.records || []).map((r: any) => ({
          ...r,
          qr_uuid: r.qr_uuid || '',
          qr_product_name: r.qr_product_name || '',
          org_name: r.org_name || '',
          from_org_name: r.from_org_name || '',
          to_org_name: r.to_org_name || '',
        })))
      }
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
    getCurrentUser().then(setUserInfo)
  }, [typeFilter])

  const filteredRecords = records.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return (r.qr_uuid || '').toLowerCase().includes(s)
      || (r.qr_product_name || '').toLowerCase().includes(s)
      || (r.org_name || '').toLowerCase().includes(s)
  })

  const inboundCount = records.filter(r => r.record_type === 'INBOUND').length
  const outboundCount = records.filter(r => r.record_type === 'OUTBOUND').length

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">입출고 관리</h1>
            <p className="text-sm text-gray-500 mt-1">QR 이동에 따른 입출고 기록을 조회합니다.</p>
          </div>
          <button
            onClick={fetchRecords}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 flex items-center space-x-1"
          >
            <RefreshCw size={14} />
            <span>새로고침</span>
          </button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">전체 기록</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{records.length}</p>
              </div>
              <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
                <Package className="text-gray-600" size={20} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">입고</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{inboundCount}</p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <ArrowDownToLine className="text-green-600" size={20} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium">출고</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{outboundCount}</p>
              </div>
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <ArrowUpFromLine className="text-orange-600" size={20} />
              </div>
            </div>
          </div>
        </div>

        {/* 필터 & 검색 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center space-x-2">
              {(['ALL', 'INBOUND', 'OUTBOUND'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ' +
                    (typeFilter === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50')}
                >
                  {t === 'ALL' ? '전체' : t === 'INBOUND' ? '입고' : '출고'}
                </button>
              ))}
            </div>
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="QR UUID, 제품명, 조직명 검색..."
              />
            </div>
          </div>
          <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
            <span>검색 결과: {filteredRecords.length}건</span>
          </div>
        </div>

        {/* 입출고 목록 */}
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">로딩 중...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <Package size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">입출고 기록이 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">유형</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">날짜</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">제품명</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">UUID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">조직</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">이동 경로</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRecords.map(record => (
                    <tr key={record.id} className={'transition-colors ' + (record.record_type === 'INBOUND' ? 'bg-green-50/30 hover:bg-green-50/50' : 'bg-orange-50/30 hover:bg-orange-50/50')}>
                      <td className="px-4 py-3">
                        {record.record_type === 'INBOUND' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 bg-green-100 text-green-700">
                            <ArrowDownToLine size={10} />
                            입고
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 bg-orange-100 text-orange-700">
                            <ArrowUpFromLine size={10} />
                            출고
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{formatDate(record.created_at)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-gray-900">{record.qr_product_name || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-gray-500">{record.qr_uuid ? record.qr_uuid.substring(0, 8) + '...' : '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Building2 size={12} className="text-gray-400" />
                          <span className="text-xs text-gray-500">{record.org_name || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-orange-600">{record.from_org_name || '?'}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-green-600">{record.to_org_name || '?'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-400">{record.notes || '-'}</span>
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
