"use client"

import { useState, useEffect } from 'react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { Users, Plus, Edit2, X, Check, Search, LayoutGrid, List, Mail, Building2 } from 'lucide-react'

interface OrgInfo { id: string; name: string; type: string }
interface UserInfo {
  id: string
  name: string
  email: string
  role: string
  org_id: string
  organizations: OrgInfo | null
  created_at: string
}

const roleLabels: Record<string, string> = {
  super_admin: '스퍼관리자',
  hq: '본사',
  branch: '지사',
  sub_branch: '지점',
  office: '영업점',
  employee: '영업사원',
}

const roleColors: Record<string, { bg: string; text: string; gradient: string; card: string; border: string }> = {
  super_admin: { bg: 'bg-red-100', text: 'text-red-700', gradient: 'from-red-500 to-red-600', card: 'bg-red-50', border: 'border-red-200' },
  hq: { bg: 'bg-purple-100', text: 'text-purple-700', gradient: 'from-purple-500 to-purple-600', card: 'bg-purple-50', border: 'border-purple-200' },
  branch: { bg: 'bg-blue-100', text: 'text-blue-700', gradient: 'from-blue-500 to-blue-600', card: 'bg-blue-50', border: 'border-blue-200' },
  sub_branch: { bg: 'bg-indigo-100', text: 'text-indigo-700', gradient: 'from-indigo-500 to-indigo-600', card: 'bg-indigo-50', border: 'border-indigo-200' },
  office: { bg: 'bg-green-100', text: 'text-green-700', gradient: 'from-green-500 to-green-600', card: 'bg-green-50', border: 'border-green-200' },
  employee: { bg: 'bg-gray-100', text: 'text-gray-700', gradient: 'from-gray-500 to-gray-600', card: 'bg-gray-50', border: 'border-gray-200' },
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserInfo[]>([])
  const [orgs, setOrgs] = useState<OrgInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState('employee')
  const [formOrgId, setFormOrgId] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')

  useEffect(() => {
    fetchUsers()
    fetchOrgs()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(data.users || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '사용자 조회에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const fetchOrgs = async () => {
    try {
      const res = await fetch('/api/admin/organizations')
      const data = await res.json()
      if (res.ok) setOrgs(data.organizations || [])
    } catch {}
  }

  const handleSave = async () => {
    if (!formName.trim() || !formEmail.trim()) {
      setError('이름과 이메일은 필수입니다.')
      return
    }
    if (!editingUser && !formPassword.trim()) {
      setError('비밀번호는 필수입니다.')
      return
    }
    setSaving(true)
    setError('')

    try {
      if (editingUser) {
        const res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingUser.id, name: formName, role: formRole, orgId: formOrgId })
        })
        if (!res.ok) throw new Error((await res.json()).error)
      } else {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formEmail, name: formName, role: formRole, orgId: formOrgId, password: formPassword })
        })
        if (!res.ok) throw new Error((await res.json()).error)
      }
      setShowForm(false)
      setEditingUser(null)
      resetForm()
      fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (user: UserInfo) => {
    setEditingUser(user)
    setFormName(user.name)
    setFormEmail(user.email)
    setFormRole(user.role)
    setFormOrgId(user.org_id)
    setFormPassword('')
    setShowForm(true)
  }

  const resetForm = () => {
    setFormName('')
    setFormEmail('')
    setFormRole('employee')
    setFormOrgId('')
    setFormPassword('')
  }

  const filteredUsers = users.filter(u => {
    const ms = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.organizations?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    const mr = roleFilter === 'all' || u.role === roleFilter
    return ms && mr
  })

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">사용자 관리</h1>
            <p className="text-sm text-gray-500 mt-1">사용자를 관리할 수 있습니다.</p>
          </div>
          <button
            onClick={() => { resetForm(); setEditingUser(null); setShowForm(true) }}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus size={16} />
            <span>사용자 추가</span>
          </button>
        </div>

        {/* 검색 + 필터 + 뷰 전환 */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="이름, 이메일, 조직으로 검색..."
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { value: 'all', label: '전체' },
              { value: 'hq', label: '본사' },
              { value: 'branch', label: '지사' },
              { value: 'sub_branch', label: '지점' },
              { value: 'office', label: '영업점' },
              { value: 'employee', label: '영업사원' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setRoleFilter(opt.value)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  roleFilter === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`
              }
              >
                {opt.label}
              </button>
            ))}
            {/* 뷰 전환 버튼 */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden ml-1">
              <button
                onClick={() => setViewMode('card')}
                className={`p-2 transition-colors ${viewMode === 'card' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                title="카드 뷰"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                title="리스트 뷰"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{editingUser ? '사용자 수정' : '새 사용자 추가'}</h3>
              <button onClick={() => { setShowForm(false); setEditingUser(null) }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="이름을 입력하세요" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일 <span className="text-red-500">*</span></label>
                <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="email@example.com" disabled={!!editingUser} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">역할 <span className="text-red-500">*</span></label>
                <select value={formRole} onChange={(e) => setFormRole(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  {Object.entries(roleLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">소속 조직 <span className="text-red-500">*</span></label>
                <select value={formOrgId} onChange={(e) => setFormOrgId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">조직 선택</option>
                  {orgs.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 <span className="text-red-500">*</span></label>
                  <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="비밀번호 입력" />
                </div>
              )}
            </div>
            <div className="flex space-x-3 pt-4">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:bg-blue-300">
                <Check size={16} />
                <span>{saving ? '저장 중...' : '저장'}</span>
              </button>
              <button onClick={() => { setShowForm(false); setEditingUser(null) }}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                취소
              </button>
            </div>
          </div>
        )}

        {/* 사용자 목록 */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <p className="text-gray-500 text-sm">로딩 중...</p>
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-gray-400">사용자가 없습니다.</div>
        ) : viewMode === 'card' ? (
          /* ===== 카드 뷰 ===== */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredUsers.map(user => {
              const c = roleColors[user.role] || roleColors.employee
              return (
                <div key={user.id} className={`bg-white rounded-xl shadow-sm border ${c.border} hover:shadow-md transition-all duration-200 overflow-hidden`}>
                  <div className={`h-2 bg-gradient-to-r ${c.gradient}`} />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${c.gradient} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-gray-900">{user.name}</h3>
                          <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${c.bg} ${c.text}`}>
                            {roleLabels[user.role] || user.role}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => startEdit(user)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="편집">
                        <Edit2 size={15} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Mail size={14} className="text-gray-400 shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Building2 size={14} className="text-gray-400 shrink-0" />
                        <span className="truncate">{user.organizations?.name || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ===== 리스트 뷰 ===== */
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* 테이블 헤더 */}
            <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <div className="col-span-3">이름</div>
              <div className="col-span-3">이메일</div>
              <div className="col-span-2">역할</div>
              <div className="col-span-3">소속 조직</div>
              <div className="col-span-1 text-right">관리</div>
            </div>
            {/* 테이블 바디 */}
            {filteredUsers.map(user => {
              const c = roleColors[user.role] || roleColors.employee
              return (
                <div key={user.id} className="grid grid-cols-12 gap-4 px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center">
                  <div className="col-span-3 flex items-center space-x-3">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${c.gradient} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                      {user.name.charAt(0)}
                    </div>
                    <span className="text-sm font-semibold text-gray-900 truncate">{user.name}</span>
                  </div>
                  <div className="col-span-3 flex items-center space-x-2 text-sm text-gray-600 truncate">
                    <Mail size={14} className="text-gray-400 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${c.bg} ${c.text}`}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </div>
                  <div className="col-span-3 flex items-center space-x-2 text-sm text-gray-600 truncate">
                    <Building2 size={14} className="text-gray-400 shrink-0" />
                    <span className="truncate">{user.organizations?.name || '-'}</span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => startEdit(user)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="편집">
                      <Edit2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SidebarLayout>
  )
}
