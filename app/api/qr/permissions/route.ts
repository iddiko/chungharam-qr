import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'
import { getPermissions } from '@/lib/qr-permissions'

// GET: 현재 사용자의 QR 생성 권한 조회
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const { data: rpcUserData, error: rpcError } = await supabase
      .rpc('get_current_user_info', { user_email: user.email })

    if (rpcError || !rpcUserData) {
      return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const userData = Array.isArray(rpcUserData) ? rpcUserData[0] : rpcUserData
    const permissions = getPermissions(userData.role)

    return NextResponse.json({
      permissions: {
        role: userData.role,
        canCreateTopLevel: permissions.canCreateTopLevelQR,
        canCreateChild: permissions.canCreateChildQR,
        maxChildCount: permissions.maxChildQRCount,
        requiresReason: permissions.requiresReason,
      }
    })
  } catch (error) {
    console.error('QR 권한 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
