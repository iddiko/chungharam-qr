import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// GET: QR 전체 목록 조회 (검색/상태 필터 지원) - RPC로 RLS 우회
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    // URL 쿼리 파라믴터 추출
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || null
    const status = searchParams.get('status') || null

    // RPC 함수로 QR 목록 조회 (검색 + 상태 필터)
    const { data: qrCodes, error: rpcError } = await supabase
      .rpc('get_qr_list' as any, {
        p_user_email: user.email!,
        p_search: search,
        p_status: status,
      } as any)

    if (rpcError) {
      console.error('QR 목록 조회 RPC 오류:', rpcError)
      return NextResponse.json({ qrCodes: [] })
    }

    return NextResponse.json({ qrCodes: qrCodes || [] })
  } catch (error) {
    console.error('QR 목록 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
