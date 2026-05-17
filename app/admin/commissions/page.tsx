"use client"

import { useState, useEffect } from 'react'
import {
  AlertCircle,
  CheckCircle,
  DollarSign,
  Percent,
  RefreshCw,
  Save,
  Loader2,
  TrendingUp,
  Calculator
} from 'lucide-react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { getCurrentUser, type User as UserType, roleLabels, UserRole } from '@/lib/auth'

interface CommissionSetting {
  id: string
  org_type: string
  commission_type: 'percentage' | 'fixed'
  commission_value: number
  is_active: boolean
  updated_at: string
}

interface CommissionRecord {
  id: string
  qr_uuid: string
  product_name: string
  org_name: string
  org_type: string
  commission_type: string
  commission_rate: number
  sale_amount: number
  commission_amount: number
  status: string
  created_at: string
}

const orgTypeOrder: UserRole[] = ['hq', 'branch', 'sub_branch', 'office', 'employee']

export default function CommissionsPage() {
  const [userInfo, setUserInfo] = useState<UserType | null>(null)
  const [settings, setSettings] = useState<CommissionSetting[]>([])
  const [records, setRecords] = useState<CommissionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'settings' | 'records'>('settings')

  // 편집용 로컬 상태
  const [editValues, setEditValues] = useState<Record<string, { type: string; value: number }>>({})

  useEffect(() => {
    getCurrentUser().then(user => {
      setUserInfo(user)
      if (user) {
        fetchSettings(user.email)
        fetchRecords(user.email)
      }
    })
  }, [])

  const fetchSettings = async (email: string) => {
    try {
      const res = await fetch('/api/commissions', {
        headers: { 'x-user-email': email }
      })
      const data = await res.json()
      if (data.settings) {
        setSettings(data.settings)
        // 편집 값 초기화
        const vals: Record<string, { type: string; value: number }> = {}
        data.settings.forEach((s: CommissionSetting) => {
          vals[s.org_type] = { type: s.commission_type, value: s.commission_value }
        })
        setEditValues(vals)
      }
    } catch (err) {
      console.error('수수료 설정 조회 오류:', err)
    }
  }

  const fetchRecords = async (email: string) => {
    try {
      const res = await fetch('/api/commissions/records', {
        headers: { 'x-user-email': email }
      })
      const data = await res.json()
      if (data.records) {
        setRecords(data.records)
      }
    } catch (err) {
      console.error('수수료 기록 조회 오류:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (orgType: string) => {
    if (!userInfo) return
    setSaving(orgType)
    setError('')
    setSuccess('')

    const editVal = editValues[orgType]
    if (!editVal) return

    try {
      const res = await fetch('/api/commissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: userInfo.email,
          orgType,
          commissionType: editVal.type,
          commissionValue: editVal.value
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '저장에 실패했습니다.')
      }

      setSuccess(`${roleLabels[orgType as UserRole] || orgType} 수수료 설정이 저장되었습니다.`)
      fetchSettings(userInfo.email)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(null)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
  }

  const totalCommission = records.reduce((sum, r) => sum + Number(r.commission_amount), 0)
  const totalSales = records.reduce((sum, r) => sum + Number(r.sale_amount), 0)

  return (
    <SidebarLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">수수료 관리</h1>
            <p className="text-sm text-gray-500 mt-1">조직 계층별 수수료 설정 및 지급 내역 관리</p>
          </div>
          <button
            onClick={() => {
              if (userInfo) {
                fetchSettings(userInfo.email)
                fetchRecords(userInfo.email)
              }
            }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">총 매출</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(totalSales)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <TrendingUp size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">총 수수료</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(totalCommission)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Calculator size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">수수료율</p>
                <p className="text-lg font-bold text-gray-900">
                  {totalSales > 0 ? ((totalCommission / totalSales) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            수수료 설정
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'records'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            지급 내역
          </button>
        </div>

        {/* 알림 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-2">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start space-x-2">
            <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        {/* 수수료 설정 탭 */}
        {activeTab === 'settings' && (
          <div className="space-y-3">
            {orgTypeOrder.map(orgType => {
              const setting = settings.find(s => s.org_type === orgType)
              const editVal = editValues[orgType]
              if (!editVal) return null

              return (
                <div key={orgType} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                        <Percent size={20} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{roleLabels[orgType as UserRole] || orgType}</p>
                        <p className="text-xs text-gray-400">
                          마지막 수정: {setting?.updated_at ? new Date(setting.updated_at).toLocaleDateString('ko-KR') : '-'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <select
                        value={editVal.type}
                        onChange={(e) => setEditValues({
                          ...editValues,
                          [orgType]: { ...editVal, type: e.target.value }
                        })}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="percentage">퍼센트 (%)</option>
                        <option value="fixed">고정 금액 (원)</option>
                      </select>

                      <div className="relative">
                        <input
                          type="number"
                          value={editVal.value}
                          onChange={(e) => setEditValues({
                            ...editValues,
                            [orgType]: { ...editVal, value: parseFloat(e.target.value) || 0 }
                          })}
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500"
                          min={0}
                          max={editVal.type === 'percentage' ? 100 : undefined}
                          step={editVal.type === 'percentage' ? 0.1 : 1000}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                          {editVal.type === 'percentage' ? '%' : '원'}
                        </span>
                      </div>

                      <button
                        onClick={() => handleSave(orgType)}
                        disabled={saving === orgType}
                        className="flex items-center space-x-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300"
                      >
                        {saving === orgType ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        <span>저장</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* 수수료 분배 시뮬레이션 */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <h3 className="font-bold text-blue-900 mb-3">💡 수수료 분배 예시 (매출 1,000,000원 기준)</h3>
              <div className="space-y-2">
                {orgTypeOrder.map(orgType => {
                  const editVal = editValues[orgType]
                  if (!editVal) return null
                  const amount = editVal.type === 'percentage'
                    ? 1000000 * editVal.value / 100
                    : editVal.value
                  return (
                    <div key={orgType} className="flex items-center justify-between text-sm">
                      <span className="text-blue-700">{roleLabels[orgType as UserRole]}</span>
                      <span className="font-medium text-blue-900">
                        {editVal.type === 'percentage' ? `${editVal.value}%` : formatCurrency(editVal.value)} → {formatCurrency(amount)}
                      </span>
                    </div>
                  )
                })}
                <div className="border-t border-blue-300 pt-2 flex items-center justify-between text-sm font-bold">
                  <span className="text-blue-900">총 분배액</span>
                  <span className="text-blue-900">
                    {formatCurrency(
                      orgTypeOrder.reduce((sum, orgType) => {
                        const editVal = editValues[orgType]
                        if (!editVal) return sum
                        return sum + (editVal.type === 'percentage'
                          ? 1000000 * editVal.value / 100
                          : editVal.value)
                      }, 0)
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 수수료 지급 내역 탭 */}
        {activeTab === 'records' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            {loading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-500">불러오는 중...</p>
              </div>
            ) : records.length === 0 ? (
              <div className="p-8 text-center">
                <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">아직 수수료 지급 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">QR</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">조직</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">유형</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">매출액</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">수수료율</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">수수료</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {records.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{record.product_name}</p>
                          <p className="text-xs text-gray-400 font-mono">{record.qr_uuid}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-900">{record.org_name}</p>
                          <p className="text-xs text-gray-400">{roleLabels[record.org_type as UserRole] || record.org_type}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                            {record.commission_type === 'percentage' ? '%' : '고정'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900">
                          {formatCurrency(Number(record.sale_amount))}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">
                          {record.commission_type === 'percentage'
                            ? `${record.commission_rate}%`
                            : formatCurrency(Number(record.commission_rate))}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-blue-600">
                          {formatCurrency(Number(record.commission_amount))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            record.status === 'PAID'
                              ? 'bg-green-100 text-green-700'
                              : record.status === 'PENDING'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {record.status === 'PAID' ? '지급완료' : record.status === 'PENDING' ? '대기' : '취소'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
