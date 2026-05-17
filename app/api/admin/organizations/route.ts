import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// GET: 조직 목록 조회 (RPC로 RLS 우회)
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[조직 API] 인증 오류:', authError)
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    console.log('[조직 API] 사용자:', user.email)

    const { data: orgs, error: rpcError } = await supabase
      .rpc('get_organizations' as any, { p_user_email: user.email! } as any)

    if (rpcError) {
      console.error('조직 조회 RPC 오류:', rpcError)
      return NextResponse.json({ error: rpcError.message || '조직 조회에 실패했습니다.' }, { status: 500 })
    }

    const orgList = (orgs || []) as any[]
    console.log('[조직 API] 조회된 조직 수:', orgList.length, orgList)
    return NextResponse.json({ organizations: orgList })
  } catch (error) {
    console.error('조직 API 오류:', error)
    const message = error instanceof Error ? error.message : '서버 오류가 발생했습니다.'
    const stack = error instanceof Error ? error.stack : undefined
    return NextResponse.json({ error: message, stack }, { status: 500 })
  }
}

// POST: 조직 생성 (RPC로 RLS 우회)
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { name, type, parentId } = body

    if (!name || !type) {
      return NextResponse.json({ error: '조직명과 유형은 필수 항목입니다.' }, { status: 400 })
    }

    const { data: newOrg, error: rpcError } = await supabase
      .rpc('create_organization' as any, {
        p_user_email: user.email!,
        p_name: name,
        p_type: type,
        p_parent_id: parentId || null,
      } as any)

    if (rpcError) {
      console.error('조직 생성 RPC 오류:', rpcError)
      return NextResponse.json({ error: rpcError.message || '조직 생성에 실패했습니다.' }, { status: 500 })
    }

    const org = Array.isArray(newOrg) ? newOrg[0] : newOrg
    return NextResponse.json({ organization: org })
  } catch (error) {
    console.error('조직 생성 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// PATCH: 조직 수정 (RPC로 RLS 우회)
export async function PATCH(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { id, name, type, parentId } = body

    if (!id) {
      return NextResponse.json({ error: '조직 ID는 필수입니다.' }, { status: 400 })
    }

    const { data: updatedOrg, error: rpcError } = await supabase
      .rpc('update_organization' as any, {
        p_user_email: user.email!,
        p_id: id,
        p_name: name || null,
        p_type: type || null,
        p_parent_id: parentId !== undefined ? parentId : null,
      } as any)

    if (rpcError) {
      console.error('조직 수정 RPC 오류:', rpcError)
      return NextResponse.json({ error: rpcError.message || '조직 수정에 실패했습니다.' }, { status: 500 })
    }

    const org = Array.isArray(updatedOrg) ? updatedOrg[0] : updatedOrg
    return NextResponse.json({ organization: org })
  } catch (error) {
    console.error('조직 수정 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
