"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QrCode, Plus, CheckCircle, Copy, ChevronDown, ChevronUp, ShieldAlert, Printer } from 'lucide-react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { supabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

interface CreatedQR {
  qr_id: string
  qr_uuid: string
  qr_product_name: string
  qr_status: string
}

interface ParentQR {
  qr_id: string
  qr_uuid: string
  qr_product_name: string
  qr_status: string
}

interface UserPermInfo {
  role: string
  canCreateTopLevel: boolean
  canCreateChild: boolean
  maxChildCount: number | null
  requiresReason: boolean
}

interface Product {
  product_id: string
  product_name: string
  product_sku: string | null
  product_category: string | null
}

export default function CreateQRPage() {
  const router = useRouter()
  const [productName, setProductName] = useState('')
  const [parentQRId, setParentQRId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [createdQRs, setCreatedQRs] = useState<CreatedQR[]>([])
  const [showResults, setShowResults] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [parentQRs, setParentQRs] = useState<ParentQR[]>([])
  const [userPerm, setUserPerm] = useState<UserPermInfo | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [inputMode, setInputMode] = useState<'select' | 'manual'>('select')
  const [userEmail, setUserEmail] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    fetchUserPerm()
    fetchParentQRs()
    initUser()
  }, [])

  const initUser = async () => {
    const user = await getCurrentUser()
    if (user?.email) {
      setUserEmail(user.email)
      fetchProductsWithEmail(user.email)
    }
  }

  const fetchUserPerm = async () => {
    try {
      const res = await fetch('/api/qr/permissions')
      const data = await res.json()
      if (res.ok) {
        setUserPerm(data.permissions)
      }
    } catch {}
  }

  const fetchParentQRs = async () => {
    try {
      const res = await fetch('/api/qr/list')
      const data = await res.json()
      if (res.ok) setParentQRs(data.qrCodes || [])
    } catch {}
  }

  const fetchProductsWithEmail = async (email: string) => {
    try {
      const res = await fetch('/api/products', {
        headers: { 'x-user-email': email }
      })
      const data = await res.json()
      if (res.ok) setProducts(data.products || [])
    } catch {}
  }

  const maxQty = userPerm?.maxChildCount ?? 100

  const handleCreateQR = async (e: React.FormEvent) => {
    e.preventDefault()

    // 영업사원 사유 필수 검증
    if (mustInputReason && !reason.trim()) {
      setError('QR 생성 사유를 입력해주세요.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess(false)
    setCreatedQRs([])

    try {
      const response = await fetch('/api/qr/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          parentQrId: parentQRId || undefined,
          quantity,
          reason: reason.trim() || undefined,
          productId: selectedProductId || undefined
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'QR 생성에 실패했습니다.')
      }

      setCreatedQRs(data.qrCodes || [])
      setSuccess(true)
      setShowResults(true)
      setProductName('')
      setParentQRId('')
      setSelectedProductId('')
      setReason('')
      setQuantity(1)
      fetchParentQRs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QR 생성에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const qrCards = createdQRs.map(q => 
      '<div class="qr-card"><img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + 
      encodeURIComponent(appUrl ? appUrl + '/qr/' + q.qr_uuid : q.qr_uuid) + '" alt="QR"/><div class="name">' + 
      q.qr_product_name + '</div><div class="uuid">' + 
      q.qr_uuid + '</div></div>'
    ).join('')
    printWindow.document.write(
      '<html><head><title>QR \uCF54\uB4DC \uC778\uC1C4</title>' +
      '<style>body{font-family:sans-serif;margin:20px}.qr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}' +
      '.qr-card{border:1px solid #ddd;border-radius:8px;padding:16px;text-align:center;page-break-inside:avoid}' +
      '.qr-card img{width:150px;height:150px}.qr-card .uuid{font-family:monospace;font-size:10px;margin-top:8px;word-break:break-all}' +
      '.qr-card .name{font-weight:bold;margin-top:4px}h1{text-align:center}</style></head>' +
      '<body><h1>\uCCAD\uD558\uB78C QR \uCF54\uB4DC</h1>' +
      '<div class="qr-grid">' + qrCards + '</div>' +
      '<script>window.onload=function(){window.print()}</script></body></html>'
    )
    printWindow.document.close()
  }

  // 권한 없음 알림
  if (userPerm && !userPerm.canCreateTopLevel && !userPerm.canCreateChild) {
    return (
      <SidebarLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <ShieldAlert size={48} className="text-gray-300" />
          <h2 className="text-xl font-bold text-gray-400">QR 생성 권한이 없습니다</h2>
          <p className="text-sm text-gray-400">관리자에게 권한 요청을 해주세요.</p>
        </div>
      </SidebarLayout>
    )
  }

  // 본사/슈퍼관리자 여부
  const isTopLevel = userPerm?.canCreateTopLevel === true
  // 부모 QR 필수 여부 (영업점, 영업사원)
  const mustSelectParent = userPerm && !userPerm.canCreateTopLevel && userPerm.canCreateChild
  // 사유 필수 여부 (영업사원)
  const mustInputReason = userPerm?.requiresReason === true
  // 부모 QR 선택 표시 여부 (자식 QR 생성 권한이 있으면 표시)
  const showParentSelect = userPerm?.canCreateChild === true

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QR 코드 생성</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isTopLevel && showParentSelect
              ? '부모 QR 없이 생성하면 박스 QR이 생성됩니다. 부모 QR을 선택하면 그 하위로 개별 제품 QR이 생성됩니다.'
              : isTopLevel
                ? '최상위 QR(박스)을 생성합니다. 제품을 선택하고 수량을 지정하세요.'
                : mustSelectParent
                  ? '부모 QR(박스)을 선택하고 그 하위로 개별 제품 QR을 생성합니다.'
                  : '새로운 QR 코드를 생성합니다.'
            }
          </p>
          {userPerm && (
            <div className="mt-2 flex items-center space-x-3 text-xs">
              {userPerm.canCreateTopLevel && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">최상위 QR 생성 가능</span>
              )}
              {userPerm.canCreateChild && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">자식 QR 생성 가능</span>
              )}
              {userPerm.maxChildCount !== null && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">수량 제한: 최대 {userPerm.maxChildCount}개</span>
              )}
              {userPerm.requiresReason && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">사유 입력 필수</span>
              )}
            </div>
          )}
        </div>

        {/* 성공 메시지 */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start space-x-3">
            <CheckCircle className="text-green-500 shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-green-800 font-medium">QR 코드 {createdQRs.length}개가 성공적으로 생성되었습니다!</p>
              <button
                onClick={() => setShowResults(!showResults)}
                className="text-green-600 text-sm mt-1 flex items-center hover:underline"
              >
                {showResults ? '결과 숨기기' : '결과 보기'}
                {showResults ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
              </button>
            </div>
          </div>
        )}

        {/* 생성 결과 - QR 코드 이미지 카드 */}
        {showResults && createdQRs.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">생성된 QR 코드 ({createdQRs.length}개)</h3>
              <button
                onClick={handlePrint}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-1"
              >
                <Printer size={12} />
                <span>인쇄</span>
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {createdQRs.map((qr) => (
                  <div key={qr.qr_id} className="border border-gray-200 rounded-lg p-3 text-center hover:shadow-md transition-shadow">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_APP_URL + '/qr/' + qr.qr_uuid : qr.qr_uuid)}`}
                      alt="QR Code"
                      className="w-full aspect-square rounded-lg border border-gray-100 mb-2"
                    />
                    <p className="text-xs font-semibold text-gray-900 truncate">{qr.qr_product_name}</p>
                    <p className="text-[10px] font-mono text-gray-400 mt-1 truncate">{qr.qr_uuid}</p>
                    <div className="flex items-center justify-center space-x-1 mt-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800">
                        {qr.qr_status}
                      </span>
                      <button
                        onClick={() => copyToClipboard(qr.qr_uuid, qr.qr_id)}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title="UUID 복사"
                      >
                        <Copy size={12} className={copiedId === qr.qr_id ? 'text-green-500' : ''} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* QR 생성 폼 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
              <QrCode className="text-blue-600" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">QR 코드 생성</h2>
              <p className="text-xs text-gray-500">단일 및 대량 생성을 하나의 폼에서 처리합니다</p>
            </div>
          </div>

          <form onSubmit={handleCreateQR} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                제품 <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center space-x-2 mb-2">
                <button
                  type="button"
                  onClick={() => setInputMode('select')}
                  className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                    inputMode === 'select'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  제품 선택
                </button>
                <button
                  type="button"
                  onClick={() => { setInputMode('manual'); setSelectedProductId('') }}
                  className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                    inputMode === 'manual'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  직접 입력
                </button>
              </div>
              {inputMode === 'select' ? (
                <div>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value)
                      const product = products.find(p => p.product_id === e.target.value)
                      if (product) setProductName(product.product_name)
                    }}
                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    required
                  >
                    <option value="">제품을 선택하세요</option>
                    {products.map(p => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.product_name}{p.product_sku ? ` (${p.product_sku})` : ''}
                      </option>
                    ))}
                  </select>
                  {products.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      등록된 제품이 없습니다. 제품 관리에서 먼저 등록해주세요.
                    </p>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => { setProductName(e.target.value); setSelectedProductId('') }}
                  className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="제품명을 직접 입력하세요"
                  required
                />
              )}
            </div>

            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1.5">
                생성 수량
              </label>
              <div className="flex items-center space-x-3">
                <input
                  id="quantity"
                  type="number"
                  min="1"
                  max={maxQty}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)))}
                  className="block w-24 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-center"
                  required
                />
                <div className="flex space-x-1">
                  {[1, 5, 10, 25, 50].filter(n => n <= maxQty).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setQuantity(n)}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                        quantity === n
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {n}개
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {userPerm?.maxChildCount !== null
                  ? `최대 ${maxQty}개까지 생성 가능합니다`
                  : '최대 100개까지 생성 가능합니다'
                }
              </p>
            </div>

            {/* 부모 QR - 자식 QR 생성 권한이 있으면 표시 */}
            {showParentSelect && (
              <div>
                <label htmlFor="parentQRId" className="block text-sm font-medium text-gray-700 mb-1.5">
                  부모 QR (Box) {mustSelectParent ? <span className="text-red-500">*</span> : <span className="text-gray-400 text-xs">(선택)</span>}
                </label>
                <select
                  id="parentQRId"
                  value={parentQRId}
                  onChange={(e) => setParentQRId(e.target.value)}
                  className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  required={mustSelectParent}
                >
                  {!mustSelectParent && <option value="">없음 (최상위 QR)</option>}
                  {parentQRs.map(qr => (
                    <option key={qr.qr_id} value={qr.qr_uuid}>
                      {qr.qr_product_name} ({qr.qr_uuid})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {mustSelectParent
                    ? '박스 QR을 반드시 선택해야 합니다. 선택한 박스 내의 제품 QR이 생성됩니다.'
                    : parentQRs.length === 0
                      ? '부모 QR 없이 생성하면 최상위 QR이 됩니다.'
                      : `대형 박스 QR을 선택하면 그 하위로 개별 제품 QR이 생성됩니다 (${parentQRs.length}개 가능)`
                  }
                </p>
              </div>
            )}

            {/* 사유 입력 - 영업사원 필수 */}
            {mustInputReason && (
              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1.5">
                  생성 사유 <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="QR 코드 생성 사유를 입력해주세요 (예: 고객 요청, 재고 보충 등)"
                  rows={3}
                  required
                />
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-blue-300 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>생성 중...</span>
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    <span>QR 코드 {quantity}개 생성</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </SidebarLayout>
  )
}
