import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const { userEmail, parentQrUuid, productName } = await request.json()

    if (!userEmail || !parentQrUuid || !productName) {
      return NextResponse.json({ error: '모든 필드를 입력해주세요.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data, error } = await supabase.rpc('create_child_qr', {
      p_user_email: userEmail,
      p_parent_qr_uuid: parentQrUuid,
      p_product_name: productName
    })

    if (error) {
      console.error('자식 QR 생성 오류:', error.message)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const result = Array.isArray(data) ? data[0] : data

    return NextResponse.json({
      success: true,
      message: '자식 QR이 생성되었습니다.',
      qr: result
    })

  } catch (error: any) {
    console.error('자식 QR 생성 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
