
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/supabase'

// GET /api/dashboard/map-data - 지도 시각화용 QR 위치 집계 데이터
export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const { data: mapData, error: rpcError } = await supabase
      .rpc('get_map_data' as any, {
        p_user_email: user.email!
      } as any)

    if (rpcError) {
      console.error('맵 데이터 RPC 오류:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 400 })
    }

    // 상태별 카운트 집계
    const statusCounts = (mapData || []).reduce((acc: Record<string, number>, item: any) => {
      acc[item.qr_status] = (acc[item.qr_status] || 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      success: true,
      markers: mapData || [],
      summary: {
        total: (mapData || []).length,
        byStatus: statusCounts
      }
    })

  } catch (error) {
    console.error('맵 데이터 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
