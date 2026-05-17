
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// POST: QR 코드 재활성화 (INACTIVE/PENDING → ACTIVE)
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { qrId } = body

    if (!qrId) {
      return NextResponse.json({ error: 'QR ID는 필수 항목입니다.' }, { status: 400 })
    }

    // RPC로 재활성화 처리
    const { data: result, error: rpcError } = await supabase
      .rpc('reactivate_qr' as any, {
        p_user_email: user.email!,
        p_qr_id: qrId
      } as any)

    if (rpcError) {
      console.error('QR 재활성화 RPC 오류:', rpcError)
      const errorMsg = rpcError.message || '재활성화에 실패했습니다.'
      const status = errorMsg.includes('권한') ? 403
        : errorMsg.includes('찾을 수 없') ? 404
        : errorMsg.includes('상태') ? 400
        : 500
      return NextResponse.json({ error: errorMsg }, { status })
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('QR 재활성화 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
