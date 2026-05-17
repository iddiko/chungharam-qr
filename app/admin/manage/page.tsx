"use client"

import { useState, useEffect } from 'react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { getCurrentUser, type User as UserType } from '@/lib/auth'
import {
  Building2, Plus, Edit2, X, Check, Users, QrCode,
  ChevronDown, ChevronRight, Search, LayoutGrid, List, Mail,
} from 'lucide-react'

interface Organization {
  id: string
  name: string
  type: string
  parent_id: string | null
  created_at: string
  children?: Organization[]
}

interface OrgStats {
  [key: string]: { users: number; qrs: number; children: number }
}

interface UserInfo {
  id: string
  name: string
  email: string
  role: string
  org_id: string
  organizations: { id: string; name: string; type: string } | null
  created_at: string
}

const orgTypeLabels: Record<string, string> = {
  hq: '본사', branch: '지사', sub_branch: '지점', office: '영업점',
}

const orgTypeColors: Record<string, { bg: string; text: string; gradient: string; card: string; border: string }> = {
  hq: { bg: 'bg-purple-100', text: 'text-purple-700', gradient: 'from-purple-500 to-purple-600', card: 'bg-purple-50', border: 'border-purple-200' },
  branch: { bg: 'bg-blue-100', text: 'text-blue-700', gradient: 'from-blue-500 to-blue-600', card: 'bg-blue-50', border: 'border-blue-200' },
  sub_branch: { bg: 'bg-indigo-100', text: 'text-indigo-700', gradient: 'from-indigo-500 to-indigo-600', card: 'bg-indigo-50', border: 'border-indigo-200' },
  office: { bg: 'bg-green-100', text: 'text-green-700', gradient: 'from-green-500 to-green-600', card: 'bg-green-50', border: 'border-green-200' },
}

const roleLabels: Record<string, string> = {
  super_admin: '슈퍼관리자', hq: '본사', branch: '지사', sub_branch: '지점', office: '영업점', employee: '영업사원',
}

const roleColors: Record<string, { bg: string; text: string; gradient: string; card: string; border: string }> = {
  super_admin: { bg: 'bg-red-100', text: 'text-red-700', gradient: 'from-red-500 to-red-600', card: 'bg-red-50', border: 'border-red-200' },
  hq: { bg: 'bg-purple-100', text: 'text-purple-700', gradient: 'from-purple-500 to-purple-600', card: 'bg-purple-50', border: 'border-purple-200' },
  branch: { bg: 'bg-blue-100', text: 'text-blue-700', gradient: 'from-blue-500 to-blue-600', card: 'bg-blue-50', border: 'border-blue-200' },
  sub_branch: { bg: 'bg-indigo-100', text: 'text-indigo-700', gradient: 'from-indigo-500 to-indigo-600', card: 'bg-indigo-50', border: 'border-indigo-200' },
  office: { bg: 'bg-green-100', text: 'text-green-700', gradient: 'from-green-500 to-green-600', card: 'bg-green-50', border: 'border-green-200' },
  employee: { bg: 'bg-gray-100', text: 'text-gray-700', gradient: 'from-gray-500 to-gray-600', card: 'bg-gray-50', border: 'border-gray-200' },
}

type TabType = 'org' | 'user'
type ViewMode = 'card' | 'list'

export default function ManagePage() {
  const [activeTab, setActiveTab] = useState<TabType>('org')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userInfo, setUserInfo] = useState<UserType | null>(null)

  // 조직 상태
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [flatOrgs, setFlatOrgs] = useState<Organization[]>([])
  const [orgStats, setOrgStats] = useState<OrgStats>({})
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set())
  const [orgSearchTerm, setOrgSearchTerm] = useState('')
  const [orgTypeFilter, setOrgTypeFilter] = useState('all')
  const [showOrgForm, setShowOrgForm] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [orgFormName, setOrgFormName] = useState('')
  const [orgFormType, setOrgFormType] = useState('office')
  const [orgFormParentId, setOrgFormParentId] = useState('')
  const [orgSaving, setOrgSaving] = useState(false)

  // 사용자 상태
  const [users, setUsers] = useState<UserInfo[]>([])
  const [userViewMode, setUserViewMode] = useState<ViewMode>('card')
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all')
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState('employee')
  const [userOrgId, setUserOrgId] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userSaving, setUserSaving] = useState(false)

  useEffect(() => {
    fetchOrgs()
    fetchUsers()
    getCurrentUser().then(u => setUserInfo(u))
  }, [])

  // ===== 조직 API =====
  const fetchOrgs = async () => {
    try {
      const res = await fetch('/api/admin/organizations')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const orgList = data.organizations || []
      setFlatOrgs(orgList)
      setOrgs(buildTree(orgList))
      const stats: OrgStats = {}
      for (const org of orgList) stats[org.id] = { users: 0, qrs: 0, children: 0 }
      for (const org of orgList) {
        if (org.parent_id && stats[org.parent_id]) stats[org.parent_id].children++
      }
      setOrgStats(stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : '조직 조회에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const buildTree = (flat: Organization[]): Organization[] => {
    const map = new Map<string, Organization>()
    flat.forEach(o => map.set(o.id, { ...o, children: [] }))
    const roots: Organization[] = []
    map.forEach(org => {
      if (org.parent_id && map.has(org.parent_id)) map.get(org.parent_id)!.children!.push(org)
      else roots.push(org)
    })
    return roots
  }

  const toggleExpand = (id: string) => {
    setExpandedOrgs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const handleOrgSave = async () => {
    if (!orgFormName.trim()) { setError('조직명을 입력해주세요.'); return }
    setOrgSaving(true); setError('')
    try {
      const body = editingOrg
        ? { id: editingOrg.id, name: orgFormName, type: orgFormType, parentId: orgFormParentId || null }
        : { name: orgFormName, type: orgFormType, parentId: orgFormParentId || undefined }
      const res = await fetch('/api/admin/organizations', {
        method: editingOrg ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setShowOrgForm(false); setEditingOrg(null); resetOrgForm(); fetchOrgs()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally { setOrgSaving(false) }
  }

  const startEditOrg = (org: Organization) => {
    setEditingOrg(org); setOrgFormName(org.name); setOrgFormType(org.type); setOrgFormParentId(org.parent_id || ''); setShowOrgForm(true)
  }

  const resetOrgForm = () => { setOrgFormName(''); setOrgFormType('office'); setOrgFormParentId('') }

  const filterOrgTree = (orgList: Organization[]): Organization[] => {
    return orgList.reduce<Organization[]>((acc, org) => {
      const ms = !orgSearchTerm || org.name.toLowerCase().includes(orgSearchTerm.toLowerCase())
      const mt = orgTypeFilter === 'all' || org.type === orgTypeFilter
      const filteredChildren = org.children ? filterOrgTree(org.children) : []
      if ((ms && mt) || filteredChildren.length > 0) {
        acc.push({ ...org, children: filteredChildren.length > 0 ? filteredChildren : org.children })
      }
      return acc
    }, [])
  }

  const filteredOrgs = filterOrgTree(orgs)

  // ===== 사용자 API =====
  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(data.users || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '사용자 조회에 실패했습니다.')
    }
  }

  const handleUserSave = async () => {
    if (!userName.trim() || !userEmail.trim()) { setError('이름과 이메일은 필수입니다.'); return }
    if (!editingUser && !userPassword.trim()) { setError('비밀번호는 필수입니다.'); return }
    setUserSaving(true); setError('')
    try {
      if (editingUser) {
        const res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingUser.id, name: userName, role: userRole, orgId: userOrgId })
        })
        if (!res.ok) throw new Error((await res.json()).error)
      } else {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail, name: userName, role: userRole, orgId: userOrgId, password: userPassword })
        })
        if (!res.ok) throw new Error((await res.json()).error)
      }
      setShowUserForm(false); setEditingUser(null); resetUserForm(); fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally { setUserSaving(false) }
  }

  const startEditUser = (user: UserInfo) => {
    setEditingUser(user); setUserName(user.name); setUserEmail(user.email); setUserRole(user.role); setUserOrgId(user.org_id); setUserPassword(''); setShowUserForm(true)
  }

  const resetUserForm = () => { setUserName(''); setUserEmail(''); setUserRole('employee'); setUserOrgId(''); setUserPassword('') }

  const filteredUsers = users.filter(u => {
    const ms = u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      (u.organizations?.name || '').toLowerCase().includes(userSearchTerm.toLowerCase())
    const mr = userRoleFilter === 'all' || u.role === userRoleFilter
    return ms && mr
  })

  // ===== 조직 카드 렌더링 =====
  const renderOrgCard = (org: Organization, depth: number = 0) => {
    const c = orgTypeColors[org.type] || orgTypeColors.office
    const s = orgStats[org.id] || { users: 0, qrs: 0, children: 0 }
    const hasChildren = org.children && org.children.length > 0
    const isExpanded = expandedOrgs.has(org.id)
    return (
      <div key={org.id} className={depth > 0 ? 'ml-6' : ''}>
        <div className={`bg-white rounded-xl shadow-sm border ${c.border} hover:shadow-md transition-all duration-200 overflow-hidden`}>
          <div className={`h-2 bg-gradient-to-r ${c.gradient}`} />
          <div className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${c.gradient} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
                  {org.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">{org.name}</h3>
                  <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${c.bg} ${c.text}`}>
                    {orgTypeLabels[org.type] || org.type}
                  </span>
                </div>
              </div>
              <button onClick={() => startEditOrg(org)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="편집">
                <Edit2 size={15} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className={`text-center p-2.5 rounded-lg ${c.card}`}>
                <div className="flex items-center justify-center space-x-1">
                  <Users size={12} className={c.text} />
                  <span className="text-lg font-bold text-gray-900">{s.users}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">사용자</p>
              </div>
              <div className={`text-center p-2.5 rounded-lg ${c.card}`}>
                <div className="flex items-center justify-center space-x-1">
                  <QrCode size={12} className={c.text} />
                  <span className="text-lg font-bold text-gray-900">{s.qrs}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">QR코드</p>
              </div>
              <div className={`text-center p-2.5 rounded-lg ${c.card}`}>
                <div className="flex items-center justify-center space-x-1">
                  <Building2 size={12} className={c.text} />
                  <span className="text-lg font-bold text-gray-900">{s.children}</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">하위조직</p>
              </div>
            </div>
            {hasChildren && (
              <button onClick={() => toggleExpand(org.id)} className={`w-full flex items-center justify-center space-x-1 py-2 rounded-lg text-xs font-medium transition-colors ${c.card} ${c.text} hover:opacity-80`}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>하위 조직 {org.children!.length}개 {isExpanded ? '접기' : '펼치기'}</span>
              </button>
            )}
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div className="mt-3 space-y-3 border-l-2 border-gray-200 pl-4">
            {org.children!.map(child => renderOrgCard(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">조직 & 사용자 관리</h1>
            <p className="text-sm text-gray-500 mt-1">조직과 사용자를 통합 관리할 수 있습니다.</p>
          </div>
          <button
            onClick={() => {
              if (activeTab === 'org') { resetOrgForm(); setEditingOrg(null); setShowOrgForm(true) }
              else { resetUserForm(); setEditingUser(null); setShowUserForm(true) }
            }}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus size={16} />
            <span>{activeTab === 'org' ? '조직 추가' : '사용자 추가'}</span>
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => { setActiveTab('org'); setError('') }}
            className={`flex items-center space-x-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'org'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Building2 size={16} />
            <span>조직 관리</span>
            <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'org' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>{flatOrgs.length}</span>
          </button>
          <button
            onClick={() => { setActiveTab('user'); setError('') }}
            className={`flex items-center space-x-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'user'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={16} />
            <span>사용자 관리</span>
            <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'user' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>{users.length}</span>
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        {/* ===== 조직 탭 ===== */}
        {activeTab === 'org' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={orgSearchTerm} onChange={(e) => setOrgSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="조직명으로 검색..." />
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'all', label: '전체' },
                  { value: 'branch', label: '지사' },
                  { value: 'sub_branch', label: '지점' },
                  { value: 'office', label: '영업점' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setOrgTypeFilter(opt.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      orgTypeFilter === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {showOrgForm && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{editingOrg ? '조직 수정' : '새 조직 추가'}</h3>
                  <button onClick={() => { setShowOrgForm(false); setEditingOrg(null) }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">조직명 <span className="text-red-500">*</span></label>
                    <input type="text" value={orgFormName} onChange={(e) => setOrgFormName(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="조직명 입력" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">유형 <span className="text-red-500">*</span></label>
                    <select value={orgFormType} onChange={(e) => setOrgFormType(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      {Object.entries(orgTypeLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">상위 조직</label>
                    <select value={orgFormParentId} onChange={(e) => setOrgFormParentId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      <option value="">없음 (최상위)</option>
                      {flatOrgs.map(org => (
                        <option key={org.id} value={org.id}>{org.name} ({orgTypeLabels[org.type] || org.type})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex space-x-3 pt-4">
                  <button onClick={handleOrgSave} disabled={orgSaving}
                    className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:bg-blue-300">
                    <Check size={16} />
                    <span>{orgSaving ? '저장 중...' : '저장'}</span>
                  </button>
                  <button onClick={() => { setShowOrgForm(false); setEditingOrg(null) }}
                    className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    취소
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                  <p className="text-gray-500 text-sm">로딩 중...</p>
                </div>
              </div>
            ) : filteredOrgs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">조직이 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {filteredOrgs.map(org => renderOrgCard(org))}
              </div>
            )}
          </>
        )}

        {/* ===== 사용자 탭 ===== */}
        {activeTab === 'user' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="이름, 이메일, 조직으로 검색..." />
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
                  <button key={opt.value} onClick={() => setUserRoleFilter(opt.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      userRoleFilter === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {opt.label}
                  </button>
                ))}
                <div className="flex border border-gray-200 rounded-lg overflow-hidden ml-1">
                  <button onClick={() => setUserViewMode('card')}
                    className={`p-2 transition-colors ${userViewMode === 'card' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                    title="카드 뷰">
                    <LayoutGrid size={16} />
                  </button>
                  <button onClick={() => setUserViewMode('list')}
                    className={`p-2 transition-colors ${userViewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
                    title="리스트 뷰">
                    <List size={16} />
                  </button>
                </div>
              </div>
            </div>

            {showUserForm && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{editingUser ? '사용자 수정' : '새 사용자 추가'}</h3>
                  <button onClick={() => { setShowUserForm(false); setEditingUser(null) }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
                    <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="이름을 입력하세요" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">이메일 <span className="text-red-500">*</span></label>
                    <input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="email@example.com" disabled={!!editingUser} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">역할 <span className="text-red-500">*</span></label>
                    <select value={userRole} onChange={(e) => setUserRole(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      {Object.entries(roleLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">소속 조직 <span className="text-red-500">*</span></label>
                    <select value={userOrgId} onChange={(e) => setUserOrgId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      <option value="">조직 선택</option>
                      {flatOrgs.map(org => (
                        <option key={org.id} value={org.id}>{org.name} ({orgTypeLabels[org.type] || org.type})</option>
                      ))}
                    </select>
                  </div>
                  {!editingUser && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 <span className="text-red-500">*</span></label>
                      <input type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="비밀번호 입력" />
                    </div>
                  )}
                </div>
                <div className="flex space-x-3 pt-4">
                  <button onClick={handleUserSave} disabled={userSaving}
                    className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:bg-blue-300">
                    <Check size={16} />
                    <span>{userSaving ? '저장 중...' : '저장'}</span>
                  </button>
                  <button onClick={() => { setShowUserForm(false); setEditingUser(null) }}
                    className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    취소
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                  <p className="text-gray-500 text-sm">로딩 중...</p>
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-gray-400">사용자가 없습니다.</div>
            ) : userViewMode === 'card' ? (
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
                          <button onClick={() => startEditUser(user)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="편집">
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
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <div className="col-span-3">이름</div>
                  <div className="col-span-3">이메일</div>
                  <div className="col-span-2">역할</div>
                  <div className="col-span-3">소속 조직</div>
                  <div className="col-span-1 text-right">관리</div>
                </div>
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
                        <button onClick={() => startEditUser(user)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors" title="편집">
                          <Edit2 size={15} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </SidebarLayout>
  )
}
