import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const { userEmail, inviteeEmail, inviteeName, inviteeRole, inviteeOrgId } = await request.json()

    if (!userEmail || !inviteeEmail || !inviteeName || !inviteeRole || !inviteeOrgId) {
      return NextResponse.json({ error: '모든 필드를 입력해주세요.' }, { status: 400 })
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteeEmail)) {
      return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. RPC로 초대 생성
    const { data, error } = await supabase.rpc('create_invitation', {
      p_user_email: userEmail,
      p_invitee_email: inviteeEmail,
      p_invitee_name: inviteeName,
      p_invitee_role: inviteeRole,
      p_invitee_org_id: inviteeOrgId
    })

    if (error) {
      console.error('초대 생성 오류:', error.message)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const invitation = Array.isArray(data) ? data[0] : data

    if (!invitation) {
      return NextResponse.json({ error: '초대 생성에 실패했습니다.' }, { status: 500 })
    }

    // 2. Supabase Auth에 초대 이메일 발송
    //    redirectTo에 토큰을 포함하여 회원가입 페이지로 이동
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get('origin') || ''
    const redirectUrl = `${baseUrl}/invite/${invitation.invitation_token}`

    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      inviteeEmail,
      { redirectTo: redirectUrl }
    )

    if (inviteError) {
      console.error('초대 이메일 발송 오류:', inviteError.message)
      // 이메일 발송 실패해도 초대 기록은 유지
      return NextResponse.json({
        success: true,
        warning: '초대는 생성되었으나 이메일 발송에 실패했습니다. 직접 링크를 공유해주세요.',
        invitationToken: invitation.invitation_token,
        invitationId: invitation.invitation_id,
        inviteLink: redirectUrl
      })
    }

    return NextResponse.json({
      success: true,
      message: `${inviteeName}님에게 초대 이메일이 발송되었습니다.`,
      invitationToken: invitation.invitation_token,
      invitationId: invitation.invitation_id,
      inviteeEmail: invitation.invitee_email,
      orgName: invitation.org_name,
      expiresAt: invitation.expires_at
    })

  } catch (error: any) {
    console.error('초대 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
