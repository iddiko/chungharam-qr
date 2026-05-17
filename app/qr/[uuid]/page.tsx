"use client"

import { useState, useEffect } from 'react'
import { QrCode, Package, CheckCircle, Clock, ArrowRight, LogIn } from 'lucide-react'

interface QRPublicInfo {
  qr_uuid: string
  qr_product_name: string
  qr_status: string
  org_name: string
}

export default function QRPublicPage({ params }: { params: { uuid: string } }) {
  const uuid = params.uuid
  const [qrInfo, setQrInfo] = useState<QRPublicInfo | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchQR = async () => {
      try {
        const res = await fetch(`/api/qr/public-info?uuid=${encodeURIComponent(uuid)}`)
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'QR 코드를 찾을 수 없습니다.')
        }
        setQrInfo(data.qr)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'QR 코드를 찾을 수 없습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetchQR()
  }, [uuid])

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    ACTIVE: { label: '활성', color: 'text-green-600 bg-green-50', icon: CheckCircle },
    PENDING: { label: '이동 대기', color: 'text-yellow-600 bg-yellow-50', icon: Clock },
    RECEIVED: { label: '수령 대기', color: 'text-blue-600 bg-blue-50', icon: Clock },
    INSTALLED: { label: '설치 완료', color: 'text-purple-600 bg-purple-50', icon: CheckCircle },
    INACTIVE: { label: '비활성', color: 'text-gray-600 bg-gray-50', icon: QrCode },
  }

  const loginUrl = `/login?redirect=${encodeURIComponent('/qr/scan?uuid=' + uuid)}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <QrCode size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">청하람</h1>
          <p className="text-sm text-gray-500 mt-1">QR 코드 스캔</p>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500 text-sm">QR 정보를 불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mb-4">
              <QrCode size={24} className="text-red-400" />
            </div>
            <p className="text-red-600 font-medium">{error}</p>
            <p className="text-gray-400 text-sm mt-2">유효하지 않은 QR 코드입니다.</p>
          </div>
        ) : qrInfo ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* QR 정보 */}
            <div className="p-6 space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                  <Package size={24} className="text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-gray-900 text-lg truncate">{qrInfo.qr_product_name}</h2>
                  <p className="text-xs font-mono text-gray-400 mt-0.5 truncate">{qrInfo.qr_uuid}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">소속 조직</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{qrInfo.org_name}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">상태</p>
                  {(() => {
                    const st = statusConfig[qrInfo.qr_status] || { label: qrInfo.qr_status, color: 'text-gray-600 bg-gray-50', icon: QrCode }
                    const StIcon = st.icon
                    return (
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                        <StIcon size={12} />
                        <span>{st.label}</span>
                      </span>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* 로그인 안내 */}
            <div className="border-t border-gray-100 p-6 space-y-3">
              <p className="text-sm text-gray-600 text-center">
                QR 이동 요청을 하려면 로그인이 필요합니다.
              </p>
              <a
                href={loginUrl}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                <LogIn size={16} />
                <span>로그인하여 이동 요청하기</span>
              </a>
              <p className="text-xs text-gray-400 text-center">
                로그인 후 자동으로 이동 요청 페이지로 이동합니다.
              </p>
            </div>
          </div>
        ) : null}

        {/* 하단 안내 */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            © 2024 청하람. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
