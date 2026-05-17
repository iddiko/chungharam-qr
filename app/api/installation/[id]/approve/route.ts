
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// POST /api/installation/[id]/approve - 상위 관리자 설치 승인 + 수수료 자동 분배
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const qrId = params.id
    if (!qrId) {
      return NextResponse.json({ error: 'QR ID가 필요합니다.' }, { status: 400 })
    }

    const body = await request.json()
    const { imageUrl, saleAmount = 0 } = body

    if (!imageUrl) {
      return NextResponse.json(
        { error: '설치 인증 사진은 필수 항목입니다.' },
        { status: 400 }
      )
    }

    // 승인 RPC 호출
    const { data: approveResult, error: rpcError } = await supabase
      .rpc('approve_installation', {
        p_user_email: user.email!,
        p_qr_id: qrId,
        p_image_url: imageUrl,
        p_sale_amount: saleAmount
      })

    if (rpcError) {
      console.error('설치 승인 RPC 오류:', rpcError)
      const errorMsg = rpcError.message || '설치 승인에 실패했습니다.'
      const status = errorMsg.includes('권한') ? 403
        : errorMsg.includes('상태') ? 400
        : errorMsg.includes('찾을 수 없') ? 404
        : 500
      return NextResponse.json({ error: errorMsg }, { status })
    }

    return NextResponse.json({
      success: true,
      approval: approveResult
    })

  } catch (error) {
    console.error('설치 승인 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
