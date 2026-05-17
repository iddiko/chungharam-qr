import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createRouteClient()
    const { data } = await supabase.auth.exchangeCodeForSession(code)

    // 초대 링크를 통한 가입인 경우 - users 테이블 자동 생성
    if (data?.user) {
      // users 테이블에 이미 존재하는지 확인
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', data.user.email)
        .single()

      // users 테이블에 없으면 초대 수락 프로세스 확인
      if (!existingUser) {
        // 대기 중인 초대가 있는지 확인
        const { data: invitations } = await supabase
          .from('user_invitations')
          .select('id, token, role, org_id, name')
          .eq('email', data.user.email)
          .eq('status', 'PENDING')
          .limit(1)

        if (invitations && invitations.length > 0) {
          const inv = invitations[0]
          // 초대 수락 RPC 호출
          await supabase.rpc('accept_invitation', {
            p_token: inv.token,
            p_auth_user_id: data.user.id
          })
        }
      }
    }
  }

  // 초대 토큰이 있는 경우 초대 수락 페이지로 리다이렉트
  const inviteToken = requestUrl.searchParams.get('invite_token')
  if (inviteToken) {
    return NextResponse.redirect(`${requestUrl.origin}/invite/${inviteToken}`)
  }

  // URL의 origin을 사용하여 리다이렉트
  return NextResponse.redirect(requestUrl.origin)
}
