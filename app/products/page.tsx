"use client"

import { useState, useEffect } from 'react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { getCurrentUser, type User as UserType } from '@/lib/auth'
import {
  Package, Plus, Edit2, X, Check, Search, Trash2,
  Tag, FileText, Hash, ToggleLeft, ToggleRight
} from 'lucide-react'

interface Product {
  product_id: string
  product_name: string
  product_description: string | null
  product_sku: string | null
  product_category: string | null
  product_is_active: boolean
  product_org_id: string
  product_org_name: string
  product_created_by: string
  product_created_at: string
  product_updated_at: string
}

const categoryLabels: Record<string, string> = {
  food: '식품',
  beverage: '음료',
  supplement: '건강보조식품',
  cosmetic: '화장품',
  etc: '기타',
}

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  food: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  beverage: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  supplement: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  cosmetic: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
  etc: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userInfo, setUserInfo] = useState<UserType | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  // 폼 상태
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSku, setFormSku] = useState('')
  const [formCategory, setFormCategory] = useState('etc')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchUser()
  }, [])

  useEffect(() => {
    if (userInfo?.email) {
      fetchProducts()
    }
  }, [userInfo?.email])

  const fetchUser = async () => {
    const user = await getCurrentUser()
    if (user) setUserInfo(user)
  }

  const fetchProducts = async () => {
    try {
      setLoading(true)
      if (!userInfo?.email) return

      const res = await fetch('/api/products', {
        headers: { 'x-user-email': userInfo.email }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setProducts(data.products || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '제품 목록 조회에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const canManage = userInfo?.role === 'super_admin' || userInfo?.role === 'hq'

  const handleSave = async () => {
    if (!formName.trim()) {
      setError('제품명을 입력해주세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (!userInfo?.email) return

      if (editingProduct) {
        const res = await fetch('/api/products', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': userInfo.email
          },
          body: JSON.stringify({
            productId: editingProduct.product_id,
            name: formName.trim(),
            description: formDescription.trim() || null,
            sku: formSku.trim() || null,
            category: formCategory
          })
        })
        if (!res.ok) throw new Error((await res.json()).error)
      } else {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': userInfo.email
          },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim() || null,
            sku: formSku.trim() || null,
            category: formCategory
          })
        })
        if (!res.ok) throw new Error((await res.json()).error)
      }

      setShowForm(false)
      setEditingProduct(null)
      resetForm()
      fetchProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (product: Product) => {
    try {
      if (!userInfo?.email) return

      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userInfo.email
        },
        body: JSON.stringify({
          productId: product.product_id,
          isActive: !product.product_is_active
        })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      fetchProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : '상태 변경에 실패했습니다.')
    }
  }

  const handleDelete = async (productId: string) => {
    if (!confirm('이 제품을 비활성화하시겠습니까?')) return
    try {
      if (!userInfo?.email) return

      const res = await fetch(`/api/products?id=${productId}`, {
        method: 'DELETE',
        headers: { 'x-user-email': userInfo.email }
      })
      if (!res.ok) throw new Error((await res.json()).error)
      fetchProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.')
    }
  }

  const startEdit = (product: Product) => {
    setEditingProduct(product)
    setFormName(product.product_name)
    setFormDescription(product.product_description || '')
    setFormSku(product.product_sku || '')
    setFormCategory(product.product_category || 'etc')
    setShowForm(true)
  }

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormSku('')
    setFormCategory('etc')
  }

  const filteredProducts = products.filter(p => {
    const matchSearch = !searchTerm ||
      p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.product_sku && p.product_sku.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchCategory = categoryFilter === 'all' || p.product_category === categoryFilter
    return matchSearch && matchCategory
  })

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Package className="mr-2 text-blue-600" size={28} />
              제품 관리
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {canManage
                ? '제품을 등록하고 관리합니다. 등록된 제품은 QR 코드 생성 시 선택할 수 있습니다.'
                : '등록된 제품 목록을 확인합니다.'
              }
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => { setShowForm(true); setEditingProduct(null); resetForm() }}
              className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
            >
              <Plus size={16} />
              <span>제품 등록</span>
            </button>
          )}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <X size={16} />
            </button>
          </div>
        )}

        {/* 검색 및 필터 */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="제품명 또는 SKU 검색..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">전체 카테고리</option>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* 등록/수정 폼 */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingProduct ? '제품 수정' : '제품 등록'}
              </h2>
              <button
                onClick={() => { setShowForm(false); setEditingProduct(null); resetForm() }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    제품명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="제품명을 입력하세요"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    SKU 코드 <span className="text-gray-400 text-xs">(선택)</span>
                  </label>
                  <input
                    type="text"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="예: PRD-001"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  카테고리
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  설명 <span className="text-gray-400 text-xs">(선택)</span>
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="제품 설명을 입력하세요"
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => { setShowForm(false); setEditingProduct(null); resetForm() }}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 flex items-center space-x-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      <span>저장 중...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>{editingProduct ? '수정' : '등록'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 제품 목록 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <Package size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 font-medium">
              {searchTerm || categoryFilter !== 'all' ? '검색 결과가 없습니다.' : '등록된 제품이 없습니다.'}
            </p>
            {canManage && !searchTerm && categoryFilter === 'all' && (
              <p className="text-sm text-gray-400 mt-1">제품을 등록하면 QR 코드 생성 시 선택할 수 있습니다.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => {
              const cat = categoryColors[product.product_category || 'etc'] || categoryColors.etc
              return (
                <div key={product.product_id} className={`bg-white rounded-xl shadow-sm border ${cat.border} hover:shadow-md transition-all duration-200 overflow-hidden`}>
                  <div className={`h-2 bg-gradient-to-r ${
                    product.product_category === 'food' ? 'from-orange-400 to-orange-500' :
                    product.product_category === 'beverage' ? 'from-blue-400 to-blue-500' :
                    product.product_category === 'supplement' ? 'from-green-400 to-green-500' :
                    product.product_category === 'cosmetic' ? 'from-pink-400 to-pink-500' :
                    'from-gray-400 to-gray-500'
                  }`} />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-lg ${cat.bg} flex items-center justify-center`}>
                          <Package size={18} className={cat.text} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">{product.product_name}</h3>
                          {product.product_sku && (
                            <p className="text-xs text-gray-400 font-mono">{product.product_sku}</p>
                          )}
                        </div>
                      </div>
                      {!product.product_is_active && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500 rounded-full">비활성</span>
                      )}
                    </div>

                    {product.product_description && (
                      <p className="text-xs text-gray-500 mb-3 line-clamp-2">{product.product_description}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cat.bg} ${cat.text}`}>
                        {categoryLabels[product.product_category || 'etc'] || '기타'}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(product.product_created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {canManage && (
                      <div className="flex items-center justify-end space-x-1 mt-3 pt-3 border-t border-gray-100">
                        <button
                          onClick={() => handleToggleActive(product)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                          title={product.product_is_active ? '비활성화' : '활성화'}
                        >
                          {product.product_is_active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                        </button>
                        <button
                          onClick={() => startEdit(product)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                          title="편집"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(product.product_id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 통계 */}
        {!loading && products.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">전체 {products.length}개 제품</span>
              <span className="text-gray-500">활성 {products.filter(p => p.product_is_active).length}개</span>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
