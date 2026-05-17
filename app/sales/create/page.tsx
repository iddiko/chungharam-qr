"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DollarSign, Save, ArrowLeft } from 'lucide-react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { getCurrentUser, canCreateQRCodes } from '@/lib/auth'

interface QROption {
  id: string
  uuid: string
  product_name: string
}

export default function CreateSalePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [qrCodes, setQRCodes] = useState<QROption[]>([])

  const [formData, setFormData] = useState({
    qrId: '',
    amount: '',
    customerName: '',
    notes: '',
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
          router.push('/login')
          return
        }

        if (!canCreateQRCodes(currentUser.role)) {
          setError('매출 등록 권한이 없습니다.')
          setLoading(false)
          return
        }

        setUser(currentUser)

        // 설치완료 QR 목록 조회 (RPC)
        const { data: { user: authUser } } = await (await import('@/lib/supabase')).supabase.auth.getUser()
        if (authUser) {
          const { supabase } = await import('@/lib/supabase')
          const { data: qrData, error: qrError } = await supabase
            .rpc('get_installed_qrs' as any, { p_user_email: authUser.email! } as any)

          if (!qrError && qrData) {
            setQRCodes(qrData || [])
          }
        }
      } catch (e) {
        console.error('데이터 로딩 실패:', e)
        setError('데이터를 불러오는 데 실패했습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrId: formData.qrId || null,
          amount: parseFloat(formData.amount),
          customerName: formData.customerName || null,
          notes: formData.notes || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '매출 등록에 실패했습니다.')
      }

      router.push('/sales')
    } catch (err) {
      setError(err instanceof Error ? err.message : '매출 등록에 실패했습니다.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <SidebarLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">로딩 중...</p>
          </div>
        </div>
      </SidebarLayout>
    )
  }

  if (error && !user) {
    return (
      <SidebarLayout>
        <div className="flex items-center justify-center h-64">
          <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <Link href="/sales" className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              매출 관리로 돌아가기
            </Link>
          </div>
        </div>
      </SidebarLayout>
    )
  }

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* 필더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">매출 등록</h1>
            <p className="text-sm text-gray-500 mt-1">새로운 매출을 등록합니다.</p>
          </div>
          <Link href="/sales" className="flex items-center text-gray-600 hover:text-gray-900 text-sm">
            <ArrowLeft size={16} className="mr-1" />매출 목록으로
          </Link>
        </div>

        {/* 폼 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
          <div className="flex items-center mb-6">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mr-3">
              <DollarSign className="text-blue-600" size={20} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">매출 정보</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">QR 코드 (선택)</label>
              <select
                value={formData.qrId}
                onChange={(e) => setFormData({ ...formData, qrId: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">QR 코드 선택 (선택 사항)</option>
                {qrCodes.map((qr) => (
                  <option key={qr.id} value={qr.id}>
                    {qr.product_name} - {qr.uuid}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">설치 완료된 제품의 QR 코드를 선택할 수 있습니다.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">매출 금액 <span className="text-red-500">*</span></label>
              <input
                type="number"
                step="1"
                min="1"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="금액 입력"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">고객명 (선택)</label>
              <input
                type="text"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="고객명 입력"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비고 (선택)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="추가 정보 입력"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-blue-300 flex items-center justify-center text-sm"
            >
              <Save size={18} className="mr-2" />
              {submitting ? '등록 중...' : '매출 등록'}
            </button>
          </form>
        </div>
      </div>
    </SidebarLayout>
  )
}
