import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// POST: QR 수령 확인 (RPC)
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { requestId } = body

    if (!requestId) {
      return NextResponse.json({ error: '요청 ID는 필수 항목입니다.' }, { status: 400 })
    }

    // RPC로 수령 확인 처리
    const { data: result, error: rpcError } = await supabase
      .rpc('receive_qr_transfer', {
        p_user_email: user.email!,
        p_request_id: requestId
      })

    if (rpcError) {
      console.error('수령 확인 RPC 오류:', rpcError)
      const errorMsg = rpcError.message || '수령 확인에 실패했습니다.'
      const status = errorMsg.includes('권한') ? 403
        : errorMsg.includes('찾을 수 없') ? 404
        : errorMsg.includes('승인된') ? 400
        : 500
      return NextResponse.json({ error: errorMsg }, { status })
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('수령 확인 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
