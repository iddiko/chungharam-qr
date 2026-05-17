import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// GET: 사용자 목록 조회 (RPC로 RLS 우회)
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const { data: users, error: rpcError } = await supabase
      .rpc('get_users' as any, { p_user_email: user.email! } as any)

    if (rpcError) {
      console.error('사용자 조회 RPC 오류:', rpcError)
      return NextResponse.json({ error: rpcError.message || '사용자 조회에 실패했습니다.' }, { status: 500 })
    }

    // RPC 결과를 클라이언트에서 사용하기 쉽게 변환
    const formattedUsers = ((users || []) as any[]).map((u: any) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      org_id: u.org_id,
      organizations: u.org_name ? { id: u.org_id, name: u.org_name, type: u.org_type } : null,
    }))

    return NextResponse.json({ users: formattedUsers })
  } catch (error) {
    console.error('사용자 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// POST: 사용자 생성 (Auth + RPC)
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { email, name, role, orgId, password } = body

    if (!email || !name || !role || !orgId || !password) {
      return NextResponse.json({ error: '모든 필수 항목을 입력해주세요.' }, { status: 400 })
    }

    // Auth에 사용자 생성
    const { data: authData, error: authCreateError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authCreateError) {
      console.error('Auth 사용자 생성 오류:', authCreateError)
      return NextResponse.json({ error: '계정 생성 실패: ' + authCreateError.message }, { status: 500 })
    }

    // users 테이블에 사용자 정보 삽입 (RPC)
    const { data: newUser, error: rpcError } = await supabase
      .rpc('create_user_record' as any, {
        p_id: authData.user.id,
        p_email: email,
        p_name: name,
        p_role: role,
        p_org_id: orgId,
      } as any)

    if (rpcError) {
      console.error('사용자 레코드 생성 오류:', rpcError)
      return NextResponse.json({ error: rpcError.message || '사용자 정보 저장에 실패했습니다.' }, { status: 500 })
    }

    const u = (Array.isArray(newUser) ? newUser[0] : newUser) as any
    const formattedUser = u ? {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      org_id: u.org_id,
      organizations: u.org_name ? { id: u.org_id, name: u.org_name, type: u.org_type } : null,
    } : null

    return NextResponse.json({ user: formattedUser })
  } catch (error) {
    console.error('사용자 생성 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// PATCH: 사용자 수정 (RPC로 RLS 우회)
export async function PATCH(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { id, name, role, orgId } = body

    if (!id) {
      return NextResponse.json({ error: '사용자 ID는 필수입니다.' }, { status: 400 })
    }

    const { data: updatedUser, error: rpcError } = await supabase
      .rpc('update_user_record' as any, {
        p_user_email: user.email!,
        p_id: id,
        p_name: name || null,
        p_role: role || null,
        p_org_id: orgId || null,
      } as any)

    if (rpcError) {
      console.error('사용자 수정 RPC 오류:', rpcError)
      return NextResponse.json({ error: rpcError.message || '사용자 수정에 실패했습니다.' }, { status: 500 })
    }

    const u = (Array.isArray(updatedUser) ? updatedUser[0] : updatedUser) as any
    const formattedUser = u ? {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      org_id: u.org_id,
      organizations: u.org_name ? { id: u.org_id, name: u.org_name, type: u.org_type } : null,
    } : null

    return NextResponse.json({ user: formattedUser })
  } catch (error) {
    console.error('사용자 수정 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
