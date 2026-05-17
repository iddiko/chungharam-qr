import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// GET: QR 전체 목록 조회 (RLS 우회)
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    // RPC 함수로 QR 전체 목록 조회
    const { data: qrCodes, error: rpcError } = await supabase
      .rpc('get_qr_all_list', { p_user_email: user.email! })

    if (rpcError) {
      console.error('QR 전체 목록 RPC 오류:', rpcError)
      return NextResponse.json({ qrCodes: [] })
    }

    return NextResponse.json({ qrCodes: qrCodes || [] })
  } catch (error) {
    console.error('QR 전체 목록 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
