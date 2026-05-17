
import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'

// GET: 입출고 기록 조회
export async function GET(request: Request) {
  try {
    const supabase = createRouteClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const recordType = searchParams.get('recordType') || null
    const dateFrom = searchParams.get('dateFrom') || null
    const dateTo = searchParams.get('dateTo') || null

    const { data: records, error: rpcError } = await supabase
      .rpc('get_inventory_records' as any, {
        p_user_email: user.email!,
        p_record_type: recordType,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      } as any)

    if (rpcError) {
      console.error('입출고 조회 RPC 오류:', rpcError)
      return NextResponse.json({ records: [] })
    }

    return NextResponse.json({ records: records || [] })
  } catch (error) {
    console.error('입출고 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
