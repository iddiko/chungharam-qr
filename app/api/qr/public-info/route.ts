import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// GET /api/qr/public-info?uuid=xxx - 공개 QR 정보 (비로그인 접근 가능)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const uuid = searchParams.get('uuid')

    if (!uuid) {
      return NextResponse.json({ error: 'UUID는 필수 항목입니다.' }, { status: 400 })
    }

    // 서비스 롤 키로 RLS 우회 (공개 정보만 반환)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: qrData, error: qrError } = await supabase
      .rpc('get_qr_by_uuid', { p_uuid: uuid })

    if (qrError || !qrData || (Array.isArray(qrData) && qrData.length === 0)) {
      return NextResponse.json({ error: 'QR 코드를 찾을 수 없습니다.' }, { status: 404 })
    }

    const qr = Array.isArray(qrData) ? qrData[0] : qrData

    // 공개 정보만 반환 (민감 정보 제외)
    return NextResponse.json({
      qr: {
        qr_uuid: qr.qr_uuid,
        qr_product_name: qr.qr_product_name,
        qr_status: qr.qr_status,
        org_name: qr.org_name,
      }
    })
  } catch (error) {
    console.error('QR 공개 정보 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
