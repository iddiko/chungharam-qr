"use client"

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  QrCode, 
  Clock, 
  MapPin, 
  User,
  Package,
  ArrowRight,
  CheckCircle,
  AlertCircle
,
  LogOut
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function QRTimelinePage() {
  const router = useRouter()
  const params = useParams()
  const qrId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // TODO: 실제 데이터로 대체
  const qrData = {
    uuid: qrId,
    productName: '청하람 제품 A',
    status: 'ACTIVE',
    ownerOrg: '서울 본사',
    createdAt: '2024-01-15',
    parentQrId: null
  }

  const timelineEvents = [
    {
      id: '1',
      action: 'QR 생성',
      actor: '시스템',
      location: '서울 본사',
      timestamp: '2024-01-15 10:00:00'
    },
    {
      id: '2',
      action: '이동 요청',
      actor: '부산 지사',
      location: '부산 지사',
      timestamp: '2024-01-16 14:30:00'
    },
    {
      id: '3',
      action: '이동 승인',
      actor: '서울 본사',
      location: '서울 본사',
      timestamp: '2024-01-17 09:15:00'
    },
    {
      id: '4',
      action: '수령 확인',
      actor: '부산 지사',
      location: '부산 지사',
      timestamp: '2024-01-18 11:20:00'
    }
  ]

  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-blue-100 text-blue-700',
    RECEIVED: 'bg-purple-100 text-purple-700',
    INSTALLED: 'bg-indigo-100 text-indigo-700',
    SETTLED: 'bg-gray-100 text-gray-700',
    REJECTED: 'bg-red-100 text-red-700',
    LOCKED: 'bg-gray-100 text-gray-700'
  }

  const actionIcons = {
    'QR 생성': Package,
    '이동 요청': ArrowRight,
    '이동 승인': CheckCircle,
    '수령 확인': Package,
    '설치 완료': CheckCircle,
    '정산 완료': CheckCircle
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.push('/login')
    } catch (error) {
      console.error('로그아웃 오류:', error)
    }
  }

  useEffect(() => {
    const fetchQRData = async () => {
      try {
        const response = await fetch(`/api/qr/${qrId}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'QR 정보를 불러오는 데 실패했습니다.')
        }

        setQRData(data.qr)
        setTimelineEvents(data.timeline)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'QR 정보를 불러오는 데 실패했습니다.')
      } finally {
        setLoading(false)
      }
    }

    fetchQRData()
  }, [qrId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">QR 정보를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">오류 발생</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link
              href="/dashboard"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              대시보드로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 네비게이션 */}
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <Link href="/dashboard" className="flex items-center text-gray-700 hover:text-gray-900">
              <ArrowLeft size={20} className="mr-2" />
              대시보드로 돌아가기
            </Link>
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-blue-900">QR 타임라인</h1>
              <button
                onClick={handleLogout}
                className="flex items-center text-gray-700 hover:text-red-600"
              >
                <LogOut size={20} className="mr-1" />
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 메인 콘텐츠 */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* QR 정보 카드 */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                  <QrCode className="text-blue-600" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{qrData.productName}</h2>
                  <p className="text-sm text-gray-600 mt-1">UUID: {qrData.uuid}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[qrData.status as keyof typeof statusColors]}`}>
                {qrData.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="flex items-center">
                <User className="text-gray-400 mr-2" size={18} />
                <div>
                  <p className="text-xs text-gray-500">소유 조직</p>
                  <p className="text-sm font-medium text-gray-900">{qrData.ownerOrg}</p>
                </div>
              </div>
              <div className="flex items-center">
                <Clock className="text-gray-400 mr-2" size={18} />
                <div>
                  <p className="text-xs text-gray-500">생성일</p>
                  <p className="text-sm font-medium text-gray-900">{qrData.createdAt}</p>
                </div>
              </div>
            </div>

            {qrData.parentQrId && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-600">
                  부모 QR: <Link href={`/qr/timeline/${qrData.parentQrId}`} className="text-blue-600 hover:text-blue-700">{qrData.parentQrId}</Link>
                </p>
              </div>
            )}
          </div>

          {/* 타임라인 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">이동 기록</h3>
            <div className="relative">
              {/* 타임라인 라인 */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

              {/* 타임라인 이벤트 */}
              <div className="space-y-6">
                {timelineEvents.map((event, index) => {
                  const IconComponent = actionIcons[event.action as keyof typeof actionIcons] || Clock

                  return (
                    <div key={event.id} className="relative pl-10">
                      {/* 타임라인 아이콘 */}
                      <div className="absolute left-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <IconComponent className="text-blue-600" size={16} />
                      </div>

                      {/* 이벤트 내용 */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-gray-900">{event.action}</h4>
                          <span className="text-xs text-gray-500">{event.timestamp}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center text-sm text-gray-600">
                            <User size={14} className="mr-1.5" />
                            {event.actor}
                          </div>
                          {event.location && (
                            <div className="flex items-center text-sm text-gray-600">
                              <MapPin size={14} className="mr-1.5" />
                              {event.location}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
