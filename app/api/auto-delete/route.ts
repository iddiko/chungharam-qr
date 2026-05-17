import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// GET: 자동 삭제 설정 조회
export async function GET(request: NextRequest) {
  try {
    const userEmail = request.headers.get('x-user-email')
    if (!userEmail) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data, error } = await supabase.rpc('get_auto_delete_settings', {
      p_user_email: userEmail
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ settings: data || [] })

  } catch (error: any) {
    console.error('자동 삭제 설정 조회 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// PUT: 자동 삭제 설정 업데이트
export async function PUT(request: NextRequest) {
  try {
    const { userEmail, tableName, retentionMonths, isEnabled } = await request.json()

    if (!userEmail || !tableName || retentionMonths === undefined || isEnabled === undefined) {
      return NextResponse.json({ error: '모든 필드를 입력해주세요.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data, error } = await supabase.rpc('update_auto_delete_setting', {
      p_user_email: userEmail,
      p_table_name: tableName,
      p_retention_months: retentionMonths,
      p_is_enabled: isEnabled
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: '자동 삭제 설정이 업데이트되었습니다.' })

  } catch (error: any) {
    console.error('자동 삭제 설정 업데이트 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// POST: 자동 삭제 수동 실행
export async function POST(request: NextRequest) {
  try {
    const { userEmail } = await request.json()

    if (!userEmail) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 권한 확인
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('email', userEmail)
      .single()

    if (!userData || !['super_admin', 'hq'].includes(userData.role)) {
      return NextResponse.json({ error: '자동 삭제 실행 권한이 없습니다.' }, { status: 403 })
    }

    const { data, error } = await supabase.rpc('run_auto_delete')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: '자동 삭제가 실행되었습니다.',
      results: data || []
    })

  } catch (error: any) {
    console.error('자동 삭제 실행 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
