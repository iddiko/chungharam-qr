
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// POST /api/qr/scan - QR 스캔: GPS 캡처, 상태를 PENDING_APPROVAL로 변경
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { qrUuid, latitude, longitude } = body

    if (!qrUuid || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: 'QR UUID, 위도, 경도는 필수 항목입니다.' },
        { status: 400 }
      )
    }

    // 위도/경도 유효성 검증
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: '유효하지 않은 GPS 좌표입니다.' },
        { status: 400 }
      )
    }

    const { data: scanResult, error: rpcError } = await supabase
      .rpc('scan_qr', {
        p_user_email: user.email!,
        p_qr_uuid: qrUuid,
        p_latitude: latitude,
        p_longitude: longitude
      })

    if (rpcError) {
      console.error('QR 스캔 RPC 오류:', rpcError)
      const errorMsg = rpcError.message || 'QR 스캔에 실패했습니다.'
      const status = errorMsg.includes('권한') ? 403
        : errorMsg.includes('상태') ? 400
        : errorMsg.includes('찾을 수 없') ? 404
        : 500
      return NextResponse.json({ error: errorMsg }, { status })
    }

    return NextResponse.json({
      success: true,
      scan: scanResult
    })

  } catch (error) {
    console.error('QR 스캔 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
