"use client"

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { AlertCircle, CheckCircle, Lock, Mail, User, Building2, Loader2 } from 'lucide-react'

interface InvitationInfo {
  invitee_email: string
  invitee_name: string
  invitee_role: string
  org_name: string
  status: string
  expires_at: string
}

const roleLabels: Record<string, string> = {
  super_admin: '슈퍼관리자',
  hq: '본사',
  branch: '지사',
  sub_branch: '지점',
  office: '영업점',
  employee: '영업사원'
}

export default function InviteAcceptPage() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string
  const supabase = createClientComponentClient()

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [successUser, setSuccessUser] = useState<{ name: string; email: string; role: string; orgName: string } | null>(null)

  useEffect(() => {
    if (!token) {
      setError('유효하지 않은 초대 링크입니다.')
      setLoading(false)
      return
    }

    // 토큰으로 초대 정보 조회
    const fetchInvitation = async () => {
      try {
        const { data, error } = await supabase.rpc('get_invitation_by_token', { p_token: token })

        if (error) {
          setError('초대 정보를 불러올 수 없습니다.')
          setLoading(false)
          return
        }

        const inv = Array.isArray(data) ? data[0] : data

        if (!inv || inv.status !== 'PENDING') {
          setError('유효하지 않거나 만료된 초대 링크입니다.')
          setLoading(false)
          return
        }

        setInvitation({
          invitee_email: inv.invitee_email,
          invitee_name: inv.invitee_name,
          invitee_role: inv.invitee_role,
          org_name: inv.org_name,
          status: inv.status,
          expires_at: inv.expires_at
        })
      } catch {
        setError('초대 정보를 불러올 수 없습니다.')
      } finally {
        setLoading(false)
      }
    }

    fetchInvitation()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.')
      return
    }

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '회원가입에 실패했습니다.')
      }

      setSuccess(true)
      setSuccessUser(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // 로딩 중
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-gray-600">초대 정보를 확인하는 중...</p>
        </div>
      </div>
    )
  }

  // 에러 (유효하지 않은 초대)
  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">초대 링크 오류</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            로그인 페이지로
          </button>
        </div>
      </div>
    )
  }

  // 가입 완료
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">회원가입 완료!</h1>
          {successUser && (
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left space-y-2">
              <div className="flex items-center space-x-2 text-sm">
                <User size={16} className="text-gray-400" />
                <span className="text-gray-600">이름:</span>
                <span className="font-medium text-gray-900">{successUser.name}</span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <Mail size={16} className="text-gray-400" />
                <span className="text-gray-600">이메일:</span>
                <span className="font-medium text-gray-900">{successUser.email}</span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <Building2 size={16} className="text-gray-400" />
                <span className="text-gray-600">소속:</span>
                <span className="font-medium text-gray-900">{successUser.orgName}</span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <Lock size={16} className="text-gray-400" />
                <span className="text-gray-600">역할:</span>
                <span className="font-medium text-gray-900">{roleLabels[successUser.role] || successUser.role}</span>
              </div>
            </div>
          )}
          <p className="text-gray-600 mb-6">지금 바로 로그인하여 시스템을 이용할 수 있습니다.</p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
          >
            로그인하기
          </button>
        </div>
      </div>
    )
  }

  // 회원가입 폼
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* 헤더 */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">회원가입</h1>
            <p className="text-gray-600 mt-2">초대받은 계정으로 가입을 완료해주세요.</p>
          </div>

          {/* 초대 정보 카드 */}
          {invitation && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 space-y-2">
              <div className="flex items-center space-x-2 text-sm">
                <User size={16} className="text-blue-500" />
                <span className="text-blue-700">이름:</span>
                <span className="font-medium text-blue-900">{invitation.invitee_name}</span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <Mail size={16} className="text-blue-500" />
                <span className="text-blue-700">이메일:</span>
                <span className="font-medium text-blue-900">{invitation.invitee_email}</span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <Building2 size={16} className="text-blue-500" />
                <span className="text-blue-700">소속:</span>
                <span className="font-medium text-blue-900">{invitation.org_name}</span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <Lock size={16} className="text-blue-500" />
                <span className="text-blue-700">역할:</span>
                <span className="font-medium text-blue-900">{roleLabels[invitation.invitee_role] || invitation.invitee_role}</span>
              </div>
            </div>
          )}

          {/* 비밀번호 설정 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">비밀번호 설정</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="6자 이상의 비밀번호"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">비밀번호 확인</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                placeholder="비밀번호 다시 입력"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-2">
                <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:bg-blue-300 flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>가입 처리 중...</span>
                </>
              ) : (
                <span>가입 완료</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
