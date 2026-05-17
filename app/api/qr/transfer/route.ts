import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// POST: QR 이동 요청 (RPC)
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { qrUuid, toOrgId } = body

    if (!qrUuid || !toOrgId) {
      return NextResponse.json({ error: 'QR UUID와 대상 조직 ID는 필수 항목입니다.' }, { status: 400 })
    }

    // RPC로 이동 요청 처리
    const { data: result, error: rpcError } = await supabase
      .rpc('request_qr_transfer', {
        p_user_email: user.email!,
        p_qr_uuid: qrUuid,
        p_to_org_id: toOrgId
      })

    if (rpcError) {
      console.error('이동 요청 RPC 오류:', rpcError)
      const errorMsg = rpcError.message || '이동 요청에 실패했습니다.'
      const status = errorMsg.includes('권한') ? 403
        : errorMsg.includes('찾을 수 없') ? 404
        : errorMsg.includes('상태') ? 400
        : errorMsg.includes('진행 중') ? 409
        : 500
      return NextResponse.json({ error: errorMsg }, { status })
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('이동 요청 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
