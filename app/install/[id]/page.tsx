"use client"

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  Camera, 
  MapPin, 
  CheckCircle,
  AlertCircle,
  Upload
} from 'lucide-react'

export default function InstallPage() {
  const router = useRouter()
  const params = useParams()
  const qrId = params.id as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationError, setLocationError] = useState('')
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // TODO: 실제 데이터로 대체
  const qrData = {
    uuid: qrId,
    productName: '청하람 제품 A',
    status: 'RECEIVED',
    ownerOrg: '광주 영업점',
    assignedTo: '홍길동',
    assignedAt: '2024-01-18'
  }

  useEffect(() => {
    // TODO: Supabase에서 QR 데이터 조회
    // const fetchQRData = async () => {
    //   try {
    //     const { data, error } = await supabase
    //       .from('qr_codes')
    //       .select('*')
    //       .eq('uuid', qrId)
    //       .single()

    //     if (error) throw error

    //     setQRData(data)
    //   } catch (err) {
    //     setError('QR 정보를 불러오는 데 실패했습니다.')
    //   } finally {
    //     setLoading(false)
    //   }
    // }

    // fetchQRData()
    setLoading(false)
  }, [qrId])

  const getLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('브라우저가 위치 정보를 지원하지 않습니다.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        })
        setLocationError('')
      },
      (error) => {
        setLocationError('위치 정보를 가져올 수 없습니다. 브라우저 설정에서 위치 권한을 허용해주세요.')
      }
    )
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      })

      setCameraStream(stream)
      setShowCamera(true)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      setError('카메라를 시작할 수 없습니다.')
    }
  }

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop())
      setCameraStream(null)
    }
    setShowCamera(false)
  }

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const video = videoRef.current

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0)

        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'install-photo.jpg', { type: 'image/jpeg' })
            setImage(file)
            setImagePreview(URL.createObjectURL(file))
            stopCamera()
          }
        }, 'image/jpeg')
      }
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImage(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!image) {
      setError('설치 사진을 업로드해주세요.')
      return
    }

    if (!location) {
      setError('위치 정보가 필요합니다.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // 이미지를 Base64로 변환
      const reader = new FileReader()
      reader.readAsDataURL(image)
      reader.onload = async () => {
        const base64Image = reader.result as string

        const response = await fetch('/api/install', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            qrId,
            image: base64Image,
            latitude: location.latitude,
            longitude: location.longitude
          })
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || '설치 정보 저장에 실패했습니다.')
        }

        router.push(`/qr/timeline/${qrId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '설치 정보 저장에 실패했습니다.')
      setSubmitting(false)
    }
  }

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

  if (error && !qrData) {
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
            <h1 className="text-xl font-bold text-blue-900">설치 완료 처리</h1>
          </div>
        </div>
      </nav>

      {/* 메인 콘텐츠 */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* QR 정보 카드 */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{qrData.productName}</h2>
            <div className="space-y-2">
              <div className="flex items-center text-sm text-gray-600">
                <span className="font-medium">QR ID:</span>
                <span className="ml-2">{qrData.uuid}</span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <span className="font-medium">소유 조직:</span>
                <span className="ml-2">{qrData.ownerOrg}</span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <span className="font-medium">담당자:</span>
                <span className="ml-2">{qrData.assignedTo}</span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <span className="font-medium">배정일:</span>
                <span className="ml-2">{qrData.assignedAt}</span>
              </div>
            </div>
          </div>

          {/* 설치 정보 입력 폼 */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">설치 정보 입력</h3>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 사진 업로드 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  설치 사진 *
                </label>

                {/* 카메라 버튼 */}
                <div className="flex space-x-2 mb-4">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Camera size={18} className="mr-2" />
                    카메라로 촬영
                  </button>

                  <label className="flex-1 flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
                    <Upload size={18} className="mr-2" />
                    파일 선택
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 카메라 뷰어 */}
                {showCamera && (
                  <div className="relative mb-4">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={captureImage}
                      className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      촬영
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="absolute top-4 right-4 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                )}

                {/* 이미지 프리뷰 */}
                {imagePreview && !showCamera && (
                  <div className="relative mb-4">
                    <img
                      src={imagePreview}
                      alt="설치 사진"
                      className="w-full rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImage(null)
                        setImagePreview('')
                      }}
                      className="absolute top-2 right-2 px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                    >
                      삭제
                    </button>
                  </div>
                )}

                <canvas ref={canvasRef} className="hidden" />
              </div>

              {/* 위치 정보 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  위치 정보 *
                </label>

                <button
                  type="button"
                  onClick={getLocation}
                  className="w-full flex items-center justify-center px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors mb-2"
                >
                  <MapPin size={18} className="mr-2" />
                  {location ? '위치 정보 다시 가져오기' : '위치 정보 가져오기'}
                </button>

                {location && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">
                      위도: {location.latitude.toFixed(6)}, 경도: {location.longitude.toFixed(6)}
                    </p>
                  </div>
                )}

                {locationError && (
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{locationError}</p>
                  </div>
                )}
              </div>

              {/* 에러 메시지 */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* 제출 버튼 */}
              <button
                type="submit"
                disabled={submitting || !image || !location}
                className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-blue-300"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    저장 중...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} className="mr-2" />
                    설치 완료
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
