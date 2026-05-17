import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// GET: 하위 조직 목록 조회
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    // 사용자 정보 조회
    const { data: rpcUserData, error: rpcError } = await supabase
      .rpc('get_current_user_info', { user_email: user.email })

    if (rpcError || !rpcUserData) {
      return NextResponse.json({ organizations: [] })
    }

    const userData = Array.isArray(rpcUserData) ? rpcUserData[0] : rpcUserData

    // 하위 조직 조회
    const { data: childOrgs, error } = await supabase
      .from('organizations')
      .select('id, name, org_type')
      .eq('parent_id', userData.org_id)

    if (error) {
      console.error('하위 조직 조회 오류:', error)
      return NextResponse.json({ organizations: [] })
    }

    return NextResponse.json({ organizations: childOrgs || [] })
  } catch (error) {
    console.error('하위 조직 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
