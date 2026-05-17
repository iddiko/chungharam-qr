
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// GET /api/installation/pending - 승인 대기 중인 QR 목록 조회
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const { data: pendingList, error: rpcError } = await supabase
      .rpc('get_pending_approvals', {
        p_user_email: user.email!
      })

    if (rpcError) {
      console.error('승인 대기 목록 RPC 오류:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      pending: pendingList || []
    })

  } catch (error) {
    console.error('승인 대기 목록 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
