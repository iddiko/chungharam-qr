"use client"

import { useState, useEffect } from 'react'
import {
  AlertCircle,
  Send,
  XCircle,
  Clock,
  CheckCircle,
  Mail,
  User,
  Building2,
  Plus,
  RefreshCw,
  Copy,
  Loader2
} from 'lucide-react'
import SidebarLayout from '@/app/components/SidebarLayout'
import { getCurrentUser, type User as UserType, roleLabels, UserRole } from '@/lib/auth'

interface Invitation {
  invitation_id: string
  invitee_email: string
  invitee_name: string
  invitee_role: string
  org_name: string
  status: string
  invited_at: string
  expires_at: string
}

interface OrgOption {
  id: string
  name: string
  type: string
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: '대기 중', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  ACCEPTED: { label: '수락 완료', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  EXPIRED: { label: '만료', color: 'bg-gray-100 text-gray-600', icon: XCircle },
  CANCELLED: { label: '취소됨', color: 'bg-red-100 text-red-600', icon: XCircle },
}

export default function InvitationsPage() {
  const [userInfo, setUserInfo] = useState<UserType | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // 폼 상태
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('employee')
  const [formOrgId, setFormOrgId] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  // 초대 링크 복사
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    getCurrentUser().then(user => {
      setUserInfo(user)
      if (user) {
        fetchInvitations(user.email)
        fetchOrgs(user)
      }
    })
  }, [])

  const fetchInvitations = async (email: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/invitations/list`, {
        headers: { 'x-user-email': email }
      })
      const data = await res.json()
      if (data.invitations) {
        setInvitations(data.invitations)
      }
    } catch (err) {
      console.error('초대 목록 조회 오류:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchOrgs = async (user: UserType) => {
    try {
      const res = await fetch(`/api/admin/organizations`, {
        headers: { 'x-user-email': user.email }
      })
      const data = await res.json()
      if (data.organizations) {
        setOrgs(data.organizations.map((o: any) => ({ id: o.id, name: o.name, type: o.type })))
        if (data.organizations.length > 0) {
          setFormOrgId(data.organizations[0].id)
        }
      }
    } catch (err) {
      console.error('조직 목록 조회 오류:', err)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    setFormSubmitting(true)

    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: userInfo?.email,
          inviteeEmail: formEmail,
          inviteeName: formName,
          inviteeRole: formRole,
          inviteeOrgId: formOrgId
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '초대 발송에 실패했습니다.')
      }

      setFormSuccess(data.message || '초대가 발송되었습니다.')
      setFormName('')
      setFormEmail('')
      setFormRole('employee')

      // 목록 새로고침
      if (userInfo) {
        fetchInvitations(userInfo.email)
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '초대 발송에 실패했습니다.')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleCancel = async (invitationId: string) => {
    if (!confirm('이 초대를 취소하시겠습니까?')) return

    try {
      const res = await fetch('/api/invitations/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: userInfo?.email,
          invitationId
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '취소에 실패했습니다.')
      }

      if (userInfo) {
        fetchInvitations(userInfo.email)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '취소에 실패했습니다.')
    }
  }

  const copyInviteLink = (token: string, invitationId: string) => {
    const link = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(link)
    setCopiedId(invitationId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // 초대 가능한 역할 (super_admin은 모든 역할, hq는 branch 이하)
  const availableRoles: UserRole[] = userInfo?.role === 'super_admin'
    ? ['hq', 'branch', 'sub_branch', 'office', 'employee']
    : ['branch', 'sub_branch', 'office', 'employee']

  return (
    <SidebarLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">초대 관리</h1>
            <p className="text-sm text-gray-500 mt-1">새로운 구성원을 초대하여 조직에 추가합니다.</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => userInfo && fetchInvitations(userInfo.email)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw size={18} />
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Plus size={16} />
              <span>새 초대</span>
            </button>
          </div>
        </div>

        {/* 초대 폼 */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
            <h3 className="font-bold text-gray-900">새 구성원 초대</h3>

            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-2">
                <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{formError}</p>
              </div>
            )}

            {formSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start space-x-2">
                <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" />
                <p className="text-sm text-green-800">{formSuccess}</p>
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="홍길동"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="example@company.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">역할</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {availableRoles.map(r => (
                      <option key={r} value={r}>{roleLabels[r]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">소속 조직</label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <select
                      value={formOrgId}
                      onChange={(e) => setFormOrgId(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                    >
                      {orgs.map(o => (
                        <option key={o.id} value={o.id}>{o.name} ({roleLabels[o.type as UserRole] || o.type})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setFormError(''); setFormSuccess('') }}
                  className="px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {formSubmitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  <span>{formSubmitting ? '발송 중...' : '초대 발송'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 초대 목록 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">초대 목록</h3>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">불러오는 중...</p>
            </div>
          ) : invitations.length === 0 ? (
            <div className="p-8 text-center">
              <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">아직 발송된 초대가 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {invitations.map((inv) => {
                const st = statusConfig[inv.status] || statusConfig.PENDING
                const StIcon = st.icon
                return (
                  <div key={inv.invitation_id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${st.color}`}>
                          <StIcon size={18} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{inv.invitee_name}</p>
                          <p className="text-xs text-gray-500">{inv.invitee_email}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-sm text-gray-700">{inv.org_name}</p>
                          <p className="text-xs text-gray-400">{roleLabels[inv.invitee_role as UserRole] || inv.invitee_role}</p>
                        </div>

                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>
                          {st.label}
                        </span>

                        {inv.status === 'PENDING' && (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => copyInviteLink(inv.invitation_id, inv.invitation_id)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="초대 링크 복사"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={() => handleCancel(inv.invitation_id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              title="초대 취소"
                            >
                              <XCircle size={14} />
                            </button>
                          </div>
                        )}

                        {copiedId === inv.invitation_id && (
                          <span className="text-xs text-green-600">복사됨!</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center space-x-4 text-xs text-gray-400">
                      <span>발송: {new Date(inv.invited_at).toLocaleDateString('ko-KR')}</span>
                      {inv.status === 'PENDING' && (
                        <span>만료: {new Date(inv.expires_at).toLocaleDateString('ko-KR')}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  )
}
