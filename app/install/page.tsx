"use client"

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Camera, MapPin, CheckCircle, XCircle, ChevronDown, ChevronUp, Image as ImageIcon, Clock, User, Building2 } from 'lucide-react'
import SidebarLayout from '@/app/components/SidebarLayout'

interface Installation {
  install_id: string
  qr_uuid: string
  qr_product_name: string
  image_url: string
  latitude: number
  longitude: number
  installer_name: string
  installer_org_name: string
  installed_at: string
  qr_status: string
}

interface UserPermInfo {
  role: string
  canCreateTopLevel: boolean
  canCreateChild: boolean
  maxChildCount: number | null
}

export default function InstallPage() {
  const router = useRouter()
  const [installations, setInstallations] = useState<Installation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userPerm, setUserPerm] = useState<UserPermInfo | null>(null)

  // 설치 등록 상태
  const [showRegister, setShowRegister] = useState(false)
  const [qrUuid, setQrUuid] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [registerError, setRegisterError] = useState('')
  const [registerSuccess, setRegisterSuccess] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraActive, setCameraActive] = useState(false)

  useEffect(() => {
    fetchInstallations()
    fetchUserPerm()
  }, [])

  const fetchUserPerm = async () => {
    try {
      const res = await fetch('/api/qr/permissions')
      const data = await res.json()
      if (res.ok) setUserPerm(data.permissions)
    } catch {}
  }

  const fetchInstallations = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/install')
      const data = await res.json()
      if (res.ok) {
        setInstallations(data.installations || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setCameraActive(true)
      }
    } catch {
      setRegisterError('카메라 권한이 필요합니다.')
    }
  }

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  const capturePhoto = () => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    setImage(dataUrl)
    stopCamera()
  }

  const getLocation = () => {
    setGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude)
        setLongitude(pos.coords.longitude)
        setGettingLocation(false)
      },
      () => {
        setRegisterError('위치 정보를 가져올 수 없습니다. 브라우저 설정에서 위치 권한을 허용해주세요.')
        setGettingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!qrUuid || !image || !latitude || !longitude) {
      setRegisterError('모든 필수 항목을 입력해주세요.')
      return
    }

    setRegisterLoading(true)
    setRegisterError('')

    try {
      const res = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrId: qrUuid, image, latitude, longitude })
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || '설치 등록에 실패했습니다.')

      setRegisterSuccess(true)
      setTimeout(() => {
        setShowRegister(false)
        setRegisterSuccess(false)
        setQrUuid('')
        setImage(null)
        setLatitude(null)
        setLongitude(null)
        fetchInstallations()
      }, 2000)
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : '설치 등록에 실패했습니다.')
    } finally {
      setRegisterLoading(false)
    }
  }

  const isEmployee = userPerm?.role === 'employee' || userPerm?.role === 'office'
  const formatDate = (d: string) => new Date(d).toLocaleString('ko-KR')

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEmployee ? '설치 등록' : '설치 관리'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {isEmployee
                ? 'QR 코드를 스캔하고 설치 사진과 위치를 등록합니다.'
                : '설치 현황을 조회하고 관리합니다.'
              }
            </p>
          </div>
          <button
            onClick={() => setShowRegister(!showRegister)}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center space-x-2"
          >
            <Wrench size={16} />
            <span>{showRegister ? '목록으로' : '설치 등록'}</span>
          </button>
        </div>

        {/* 설치 등록 폼 */}
        {showRegister && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-6">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                <Camera className="text-green-600" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">설치 등록</h2>
                <p className="text-xs text-gray-500">QR 코드, 설치 사진, 위치 정보를 입력해주세요</p>
              </div>
            </div>

            {registerSuccess ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex items-center space-x-3">
                <CheckCircle className="text-green-500" size={24} />
                <div>
                  <p className="text-green-800 font-medium">설치가 성공적으로 등록되었습니다!</p>
                  <p className="text-green-600 text-sm mt-1">잠시 후 목록으로 이동합니다...</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-5">
                {/* QR UUID 입력 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    QR 코드 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={qrUuid}
                    onChange={(e) => setQrUuid(e.target.value)}
                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="QR-으로 시작하는 코드를 입력하세요"
                    required
                  />
                </div>

                {/* 사진 찍기 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    설치 사진 <span className="text-red-500">*</span>
                  </label>
                  {image ? (
                    <div className="relative">
                      <img src={image} alt="설치 사진" className="w-full max-h-64 object-cover rounded-lg border" />
                      <button
                        type="button"
                        onClick={() => setImage(null)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cameraActive ? (
                        <div className="relative">
                          <video ref={videoRef} autoPlay playsInline className="w-full max-h-64 object-cover rounded-lg border" />
                          <button
                            type="button"
                            onClick={capturePhoto}
                            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 font-medium text-sm"
                          >
                            사진 찍기
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
                        >
                          <Camera size={32} className="mb-2" />
                          <span className="text-sm">카메라로 사진 찍기</span>
                        </button>
                      )}
                      <div className="text-center text-xs text-gray-400">또는</div>
                      <label className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors cursor-pointer">
                        <ImageIcon size={24} className="mb-1" />
                        <span className="text-sm">갤러리에서 선택</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const reader = new FileReader()
                              reader.onload = (ev) => setImage(ev.target?.result as string)
                              reader.readAsDataURL(file)
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* 위치 정보 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    위치 정보 <span className="text-red-500">*</span>
                  </label>
                  {latitude && longitude ? (
                    <div className="flex items-center space-x-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                      <MapPin size={16} className="text-green-600" />
                      <span className="text-sm text-green-800">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
                      <CheckCircle size={14} className="text-green-500" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={getLocation}
                      disabled={gettingLocation}
                      className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center space-x-2 text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                    >
                      <MapPin size={18} />
                      <span className="text-sm">{gettingLocation ? '위치 가져오는 중...' : '현재 위치 가져오기'}</span>
                    </button>
                  )}
                </div>

                {/* 에러 */}
                {registerError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                    {registerError}
                  </div>
                )}

                {/* 제출 버튼 */}
                <button
                  type="submit"
                  disabled={registerLoading || !qrUuid || !image || !latitude || !longitude}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-blue-300 flex items-center justify-center space-x-2"
                >
                  {registerLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      <span>등록 중...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      <span>설치 완료 등록</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* 설치 통계 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Wrench className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500">설치 총 건수</p>
                <p className="text-xl font-bold text-gray-900">{installations.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500">완료된 설치</p>
                <p className="text-xl font-bold text-gray-900">{installations.filter(i => i.qr_status === 'INSTALLED').length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Clock className="text-amber-600" size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500">최근 설치</p>
                <p className="text-sm font-medium text-gray-900">
                  {installations.length > 0 ? formatDate(installations[0].installed_at) : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 설치 목록 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">설치 목록 ({installations.length}건)</h3>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">로딩 중...</p>
            </div>
          ) : installations.length === 0 ? (
            <div className="p-8 text-center">
              <Wrench size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">설치 기록이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">QR 코드</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">제품명</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">설치자</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">조직</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">사진</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">위치</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">설치일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {installations.map((inst) => (
                    <tr key={inst.install_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{inst.qr_uuid}</td>
                      <td className="px-4 py-2.5 text-gray-900">{inst.qr_product_name}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center space-x-1.5">
                          <User size={12} className="text-gray-400" />
                          <span>{inst.installer_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center space-x-1.5">
                          <Building2 size={12} className="text-gray-400" />
                          <span className="text-gray-600">{inst.installer_org_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {inst.image_url ? (
                          <a
                            href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/installations/${inst.image_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-xs"
                          >
                            사진 보기
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center space-x-1 text-xs text-gray-600">
                          <MapPin size={10} />
                          <span>{Number(inst.latitude).toFixed(4)}, {Number(inst.longitude).toFixed(4)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          inst.qr_status === 'INSTALLED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {inst.qr_status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(inst.installed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  )
}
