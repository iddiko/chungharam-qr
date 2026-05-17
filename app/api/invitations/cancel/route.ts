import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const { userEmail, invitationId } = await request.json()

    if (!userEmail || !invitationId) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data, error } = await supabase.rpc('cancel_invitation', {
      p_user_email: userEmail,
      p_invitation_id: invitationId
    })

    if (error) {
      console.error('초대 취소 오류:', error.message)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: '초대가 취소되었습니다.' })

  } catch (error: any) {
    console.error('초대 취소 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
