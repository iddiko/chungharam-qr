"use client"

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle,
  Clock,
  XCircle,
  Package,
  Send,
  X,
  Camera,
  Keyboard
} from 'lucide-react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { getCurrentUser, type User as UserType } from '@/lib/auth'

interface QRInfo {
  qr_id: string
  qr_uuid: string
  qr_product_name: string
  qr_status: string
  qr_owner_org_id: string
  org_name: string
}

export default function QRScanPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>}>
      <QRScanContent />
    </Suspense>
  )
}

function QRScanContent() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [userInfo, setUserInfo] = useState<UserType | null>(null)
  const [qrInfo, setQrInfo] = useState<QRInfo | null>(null)
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferResult, setTransferResult] = useState<{ success: boolean; message: string } | null>(null)
  const [scannerReady, setScannerReady] = useState(false)
  const [scannerRunning, setScannerRunning] = useState(false)
  const [inputMode, setInputMode] = useState<'camera' | 'manual'>('camera')
  const scannerRef = useRef<any>(null)
  const scannerElId = 'qr-reader-element'

  const searchParams = useSearchParams()

  // URL에서 UUID 파라미터 자동 처리 (외부 스캔 → 로그인 → 리다이렉트)
  useEffect(() => {
    const uuidFromUrl = searchParams.get('uuid')
    if (uuidFromUrl) {
      // URL에서 UUID가 있으면 수동 입력 모드로 전환 후 자동 조회
      setInputMode('manual')
      setManualInput(uuidFromUrl)
      handleScan(uuidFromUrl)
    }
  }, [searchParams])

  useEffect(() => {
    getCurrentUser().then(setUserInfo)
    return () => {
      stopScanner()
    }
  }, [])

  const startScanner = async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode')

      const scanner = new Html5Qrcode(scannerElId)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          // QR 스캔 성공 - 즉시 스캐너 정지
          stopScanner()
          handleScan(decodedText)
        },
        () => {
          // 스캔 실패 (계속 스캔 중) - 무시
        }
      )

      setScannerReady(true)
      setScannerRunning(true)
    } catch (err) {
      console.error('스캐너 시작 오류:', err)
      setError('카메라를 시작할 수 없습니다. 수동 입력을 이용해주세요.')
      setScannerReady(false)
      setScannerRunning(false)
    }
  }

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        const state = scannerRef.current.getState()
        if (state === 2) { // SCANNING state
          await scannerRef.current.stop()
        }
        scannerRef.current.clear()
        scannerRef.current = null
      }
    } catch {
      // 무시
    }
    setScannerRunning(false)
  }

  // 카메라 모드 진입 시 스캐너 시작
  useEffect(() => {
    if (inputMode === 'camera') {
      // 약간의 딜레이 후 시작 (DOM 준비 대기)
      const timer = setTimeout(() => {
        startScanner()
      }, 300)
      return () => {
        clearTimeout(timer)
        stopScanner()
      }
    } else {
      stopScanner()
    }
  }, [inputMode])

  const handleScan = async (qrUuid: string) => {
    // URL 형식인 경우 UUID만 추출 (예: https://chungharam.com/qr/UUID-XXX)
    let extractedUuid = qrUuid.trim()
    try {
      const url = new URL(extractedUuid)
      const pathParts = url.pathname.split('/')
      if (pathParts.length >= 3 && pathParts[1] === 'qr') {
        extractedUuid = pathParts[2]
      }
    } catch {
      // URL이 아니면 그대로 사용 (순수 UUID)
    }
    if (!extractedUuid) return
    setLoading(true)
    setError('')
    setQrInfo(null)
    setTransferResult(null)

    try {
      const res = await fetch(`/api/qr/lookup?uuid=${encodeURIComponent(extractedUuid)}`)
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

  const handleTransferRequest = async () => {
    if (!qrInfo || !userInfo) return
    setTransferLoading(true)
    try {
      const res = await fetch('/api/qr/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrUuid: qrInfo.qr_uuid,
          toOrgId: userInfo.org_id
        })
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '이동 요청에 실패했습니다.')
      }

      setTransferResult({ success: true, message: '이동 요청이 완료되었습니다. 본사 승인을 기다려주세요.' })
    } catch (err) {
      setTransferResult({ success: false, message: err instanceof Error ? err.message : '이동 요청에 실패했습니다.' })
    } finally {
      setTransferLoading(false)
    }
  }

  const resetScan = () => {
    setQrInfo(null)
    setTransferResult(null)
    setError('')
    setManualInput('')
    // 카메라 모드면 스캐너 재시작
    if (inputMode === 'camera') {
      startScanner()
    }
  }

  const canRequestTransfer = qrInfo && userInfo && qrInfo.qr_status === 'ACTIVE' && qrInfo.qr_owner_org_id !== userInfo.org_id

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    ACTIVE: { label: '활성', color: 'text-green-600', icon: CheckCircle },
    PENDING: { label: '이동 대기', color: 'text-yellow-600', icon: Clock },
    RECEIVED: { label: '수령 대기', color: 'text-blue-600', icon: Clock },
  }

  return (
    <SidebarLayout>
      <div className="max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QR 스캔</h1>
          <p className="text-sm text-gray-500 mt-1">QR 코드를 스캔하거나 수동 입력하여 이동 요청하세요.</p>
        </div>

        {/* 모드 전환 탭 */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setInputMode('camera')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              inputMode === 'camera'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Camera size={16} />
            <span>카메라 스캔</span>
          </button>
          <button
            onClick={() => setInputMode('manual')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              inputMode === 'manual'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Keyboard size={16} />
            <span>수동 입력</span>
          </button>
        </div>

        {/* 카메라 스캔 모드 */}
        {inputMode === 'camera' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="relative">
              <div id={scannerElId} className="w-full" style={{ minHeight: '300px' }} />

              {loading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                  <div className="bg-white rounded-lg px-6 py-3">
                    <p className="text-gray-900 text-sm">QR 코드를 조회하는 중...</p>
                  </div>
                </div>
              )}
            </div>

            {!scannerRunning && !loading && (
              <div className="p-4 text-center">
                <p className="text-sm text-gray-500 mb-3">카메라가 시작되지 않으면 수동 입력을 이용해주세요.</p>
                <button
                  onClick={startScanner}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  카메라 다시 시작
                </button>
              </div>
            )}
          </div>
        )}

        {/* 수동 입력 모드 */}
        {inputMode === 'manual' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleScan(manualInput)
              }}
              className="space-y-3"
            >
              <input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                type="text"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="QR 코드 UUID를 입력하세요"
              />
              <button
                type="submit"
                disabled={loading || !manualInput.trim()}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loading ? '조회 중...' : 'QR 코드 조회'}
              </button>
            </form>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-2">
            <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* QR 정보 + 이동 요청 */}
        {qrInfo && !transferResult && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">QR 정보</h3>
              <button onClick={resetScan} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                  <Package size={20} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{qrInfo.qr_product_name}</p>
                  <p className="text-xs font-mono text-gray-500 mt-0.5">{qrInfo.qr_uuid}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400 text-xs">현재 조직</p>
                <p className="font-medium text-gray-900">{qrInfo.org_name}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">상태</p>
                {(() => {
                  const st = statusConfig[qrInfo.qr_status] || { label: qrInfo.qr_status, color: 'text-gray-600', icon: AlertCircle }
                  const StIcon = st.icon
                  return (
                    <p className={`font-medium flex items-center space-x-1 ${st.color}`}>
                      <StIcon size={14} />
                      <span>{st.label}</span>
                    </p>
                  )
                })()}
              </div>
            </div>

            {canRequestTransfer ? (
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center space-x-2 text-sm mb-3">
                  <span className="text-gray-500">이동:</span>
                  <span className="font-medium text-gray-900">{qrInfo.org_name}</span>
                  <ArrowRightLeft size={14} className="text-orange-500" />
                  <span className="font-medium text-orange-600">{userInfo?.organization?.name || '내 조직'}</span>
                </div>
                <button
                  onClick={handleTransferRequest}
                  disabled={transferLoading}
                  className="w-full px-4 py-3 bg-orange-600 text-white rounded-xl text-sm font-bold hover:bg-orange-700 disabled:bg-orange-300 flex items-center justify-center space-x-2"
                >
                  <Send size={16} />
                  <span>{transferLoading ? '요청 중...' : '이동 요청하기'}</span>
                </button>
              </div>
            ) : qrInfo.qr_status === 'PENDING' ? (
              <div className="border-t border-gray-100 pt-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 flex items-center space-x-2">
                  <Clock size={16} className="shrink-0" />
                  <span>이미 이동 요청이 진행 중입니다.</span>
                </div>
              </div>
            ) : qrInfo.qr_owner_org_id === userInfo?.org_id ? (
              <div className="border-t border-gray-100 pt-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 flex items-center space-x-2">
                  <CheckCircle size={16} className="shrink-0" />
                  <span>우리 조직의 QR 코드입니다.</span>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* 이동 요청 결과 */}
        {transferResult && (
          <div className={`rounded-xl p-5 space-y-4 ${
            transferResult.success
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center space-x-2">
              {transferResult.success
                ? <CheckCircle size={20} className="text-green-600" />
                : <XCircle size={20} className="text-red-600" />
              }
              <p className={`font-medium text-sm ${
                transferResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {transferResult.message}
              </p>
            </div>
            <button
              onClick={resetScan}
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              다른 QR 스캔하기
            </button>
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
