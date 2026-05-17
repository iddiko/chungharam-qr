import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// GET: 수수료 설정 조회
export async function GET(request: NextRequest) {
  try {
    const userEmail = request.headers.get('x-user-email')
    if (!userEmail) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data, error } = await supabase.rpc('get_commission_settings', {
      p_user_email: userEmail
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ settings: data || [] })

  } catch (error: any) {
    console.error('수수료 설정 조회 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// PUT: 수수료 설정 업데이트
export async function PUT(request: NextRequest) {
  try {
    const { userEmail, orgType, commissionType, commissionValue } = await request.json()

    if (!userEmail || !orgType || !commissionType || commissionValue === undefined) {
      return NextResponse.json({ error: '모든 필드를 입력해주세요.' }, { status: 400 })
    }

    if (commissionValue < 0) {
      return NextResponse.json({ error: '수수료 값은 0 이상이어야 합니다.' }, { status: 400 })
    }

    if (commissionType === 'percentage' && commissionValue > 100) {
      return NextResponse.json({ error: '퍼센트 수수료는 100%를 초과할 수 없습니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data, error } = await supabase.rpc('update_commission_setting', {
      p_user_email: userEmail,
      p_org_type: orgType,
      p_commission_type: commissionType,
      p_commission_value: commissionValue
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: '수수료 설정이 업데이트되었습니다.' })

  } catch (error: any) {
    console.error('수수료 설정 업데이트 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// POST: 수수료 분배 실행
export async function POST(request: NextRequest) {
  try {
    const { userEmail, qrId, saleAmount } = await request.json()

    if (!userEmail || !qrId || !saleAmount) {
      return NextResponse.json({ error: '모든 필드를 입력해주세요.' }, { status: 400 })
    }

    if (saleAmount <= 0) {
      return NextResponse.json({ error: '매출 금액은 0보다 커야 합니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data, error } = await supabase.rpc('distribute_commission', {
      p_user_email: userEmail,
      p_qr_id: qrId,
      p_sale_amount: saleAmount
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: '수수료가 분배되었습니다.',
      distributions: data || []
    })

  } catch (error: any) {
    console.error('수수료 분배 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
