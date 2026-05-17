import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json({ error: '토큰과 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. 토큰으로 초대 정보 조회
    const { data: invitationData, error: invError } = await supabase.rpc('get_invitation_by_token', {
      p_token: token
    })

    if (invError || !invitationData) {
      return NextResponse.json({ error: '유효하지 않거나 만료된 초대 링크입니다.' }, { status: 400 })
    }

    const invitation = Array.isArray(invitationData) ? invitationData[0] : invitationData

    if (!invitation || invitation.status !== 'PENDING') {
      return NextResponse.json({ error: '유효하지 않거나 만료된 초대 링크입니다.' }, { status: 400 })
    }

    // 2. Auth에 사용자 생성 (이메일 확인 완료 상태)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: invitation.invitee_email,
      password: password,
      email_confirm: true,
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        return NextResponse.json({ error: '이미 가입된 이메일입니다. 로그인해주세요.' }, { status: 400 })
      }
      console.error('Auth 사용자 생성 오류:', authError.message)
      return NextResponse.json({ error: '계정 생성에 실패했습니다.' }, { status: 500 })
    }

    const authUserId = authData.user?.id

    if (!authUserId) {
      return NextResponse.json({ error: '계정 생성에 실패했습니다.' }, { status: 500 })
    }

    // 3. 초대 수락 - users 테이블에 자동 생성
    const { data: acceptData, error: acceptError } = await supabase.rpc('accept_invitation', {
      p_token: token,
      p_auth_user_id: authUserId
    })

    if (acceptError) {
      console.error('초대 수락 오류:', acceptError.message)
      // Auth 사용자는 생성되었으나 users 테이블 실패 - Auth 사용자 정리
      await supabase.auth.admin.deleteUser(authUserId)
      return NextResponse.json({ error: acceptError.message }, { status: 400 })
    }

    const acceptedUser = Array.isArray(acceptData) ? acceptData[0] : acceptData

    return NextResponse.json({
      success: true,
      message: '회원가입이 완료되었습니다! 로그인해주세요.',
      user: {
        name: acceptedUser?.user_name || invitation.invitee_name,
        email: acceptedUser?.user_email || invitation.invitee_email,
        role: acceptedUser?.user_role || invitation.invitee_role,
        orgName: acceptedUser?.org_name || invitation.org_name
      }
    })

  } catch (error: any) {
    console.error('초대 수락 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
