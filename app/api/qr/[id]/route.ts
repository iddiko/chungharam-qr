import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })
    const qrId = params.id

    // 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: '인증되지 않은 요청입니다.' },
        { status: 401 }
      )
    }

    // RPC 함수로 사용자 정보 조회 (RLS 무한재귈 우회)
    const { data: rpcUserData, error: rpcError } = await supabase
      .rpc('get_current_user_info', { user_email: user.email })

    if (rpcError || !rpcUserData) {
      console.error('RPC 사용자 조회 오류:', rpcError)
      return NextResponse.json(
        { error: '사용자 정보를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const userData = Array.isArray(rpcUserData) ? rpcUserData[0] : rpcUserData

    // QR 정보 조회
    const { data: qrData, error: qrError } = await supabase
      .from('qr_codes')
      .select(`
        *,
        owner_organization:organizations!owner_org_id(*),
        parent_qr:qr_codes!parent_qr_id(*)
      `)
      .eq('uuid', qrId)
      .single()

    if (qrError || !qrData) {
      return NextResponse.json(
        { error: 'QR 코드를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 권한 확인: 슈퍼 관리자 또는 자신의 조직에 속한 QR만 조회 가능
    if (userData.role !== 'super_admin' && qrData.owner_org_id !== userData.org_id) {
      // 하위 조직의 QR도 조회 가능하도록
      const { data: childOrgs } = await supabase
        .from('organizations')
        .select('id')
        .eq('parent_id', userData.org_id)

      const childOrgIds = childOrgs?.map(org => org.id) || []
      if (!childOrgIds.includes(qrData.owner_org_id)) {
        return NextResponse.json(
          { error: 'QR 조회 권한이 없습니다.' },
          { status: 403 }
        )
      }
    }

    // 타임라인 조회
    const { data: timelineData, error: timelineError } = await supabase
      .from('qr_timeline')
      .select(`
        *,
        actor:users(*),
        actor_organization:organizations!inner(id, name)
      `)
      .eq('qr_id', qrData.id)
      .order('created_at', { ascending: true })

    if (timelineError) {
      console.error('타임라인 조회 오류:', timelineError)
    }

    // 설치 정보 조회
    const { data: installationData, error: installationError } = await supabase
      .from('installations')
      .select('*')
      .eq('qr_id', qrData.id)
      .single()

    if (installationError && installationError.code !== 'PGRST116') {
      console.error('설치 정보 조회 오류:', installationError)
    }

    return NextResponse.json({
      success: true,
      qr: qrData,
      timeline: timelineData || [],
      installation: installationData || null
    })

  } catch (error) {
    console.error('QR 조회 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
