import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// GET: QR UUID로 QR 정보 조회 (스캔 시 사용)
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })
    const { searchParams } = new URL(request.url)
    const uuid = searchParams.get('uuid')

    if (!uuid) {
      return NextResponse.json({ error: 'UUID는 필수 항목입니다.' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    // RPC로 QR 정보 조회 (RLS 우회)
    const { data: qrData, error: qrError } = await supabase
      .rpc('get_qr_by_uuid', { p_uuid: uuid })

    if (qrError) {
      console.error('QR 조회 RPC 오류:', qrError)
      return NextResponse.json({ error: 'QR 코드를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!qrData || (Array.isArray(qrData) && qrData.length === 0)) {
      return NextResponse.json({ error: 'QR 코드를 찾을 수 없습니다.' }, { status: 404 })
    }

    const qr = Array.isArray(qrData) ? qrData[0] : qrData

    return NextResponse.json({ qr })
  } catch (error) {
    console.error('QR lookup API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
