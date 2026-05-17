import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    // 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: '인증되지 않은 요청입니다.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { productName, parentQrId, quantity = 1, reason, productId } = body

    if (!productName) {
      return NextResponse.json(
        { error: '제품명은 필수 항목입니다.' },
        { status: 400 }
      )
    }

    // RPC 함수로 QR 생성 (RLS 우회, 권한 체크는 RPC 내부에서 수행)
    const { data: qrCodes, error: rpcError } = await supabase
      .rpc('create_qr_codes', {
        p_user_email: user.email!,
        p_product_name: productName,
        p_parent_qr_uuid: parentQrId || null,
        p_quantity: quantity,
        p_reason: reason || null,
        p_product_id: productId || null
      })

    if (rpcError) {
      console.error('QR 생성 RPC 오류:', rpcError)
      // RPC 오류 메시지 파싱
      const errorMsg = rpcError.message || 'QR 생성에 실패했습니다.'
      const status = errorMsg.includes('권한') ? 403
        : errorMsg.includes('제한') ? 400
        : errorMsg.includes('찾을 수 없') ? 404
        : 500
      return NextResponse.json({ error: errorMsg }, { status })
    }

    return NextResponse.json({
      success: true,
      qrCodes: qrCodes || [],
      count: (qrCodes || []).length
    })

  } catch (error) {
    console.error('QR 생성 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
