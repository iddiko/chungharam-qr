import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'

// POST: 설치 등록 (이미지 업로드 후 RPC로 설치 정보 저장)
export async function POST(request: Request) {
  try {
    const supabase = createRouteClient()

    // 사용자 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: '인증되지 않은 요청입니다.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { qrId, image, latitude, longitude } = body

    if (!qrId || !image || !latitude || !longitude) {
      return NextResponse.json(
        { error: '필수 항목이 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 이미지 업로드
    const imageBuffer = Buffer.from(image.split(',')[1], 'base64')
    const fileName = `${qrId}/${Date.now()}.jpg`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('installations')
      .upload(fileName, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      })

    if (uploadError) {
      console.error('이미지 업로드 오류:', uploadError)
      return NextResponse.json(
        { error: '이미지 업로드에 실패했습니다.' },
        { status: 500 }
      )
    }

    // RPC 함수로 설치 정보 저장 (RLS 우회, 권한 체크는 RPC 내부에서 수행)
    const { data: installResult, error: rpcError } = await supabase
      .rpc('create_installation', {
        p_user_email: user.email!,
        p_qr_uuid: qrId,
        p_image_url: uploadData.path,
        p_latitude: latitude,
        p_longitude: longitude
      })

    if (rpcError) {
      console.error('설치 등록 RPC 오류:', rpcError)
      const errorMsg = rpcError.message || '설치 등록에 실패했습니다.'
      const status = errorMsg.includes('권한') ? 403
        : errorMsg.includes('상태') ? 400
        : errorMsg.includes('찾을 수 없') ? 404
        : 500
      return NextResponse.json({ error: errorMsg }, { status })
    }

    return NextResponse.json({
      success: true,
      installation: installResult
    })

  } catch (error) {
    console.error('설치 완료 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// GET: 설치 목록 조회
export async function GET(request: Request) {
  try {
    const supabase = createRouteClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    // RPC 함수로 설치 목록 조회 (RLS 우회)
    const { data: installations, error: rpcError } = await supabase
      .rpc('get_install_list', { p_user_email: user.email! })

    if (rpcError) {
      console.error('설치 목록 조회 RPC 오류:', rpcError)
      return NextResponse.json({ installations: [] })
    }

    return NextResponse.json({ installations: installations || [] })
  } catch (error) {
    console.error('설치 목록 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
