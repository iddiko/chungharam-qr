import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'

// GET: 매출 목록 조회 (RPC로 RLS 우회)
export async function GET(request: Request) {
  try {
    const supabase = createRouteClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const { data: sales, error: rpcError } = await supabase
      .rpc('get_sales_list' as any, { p_user_email: user.email! } as any)

    if (rpcError) {
      console.error('매출 조회 RPC 오류:', rpcError)
      return NextResponse.json({ sales: [] })
    }

    // RPC 결과를 클라이언트에서 사용하기 쉽게 변환
    const formattedSales = (sales || []).map((s: any) => ({
      id: s.id,
      org_id: s.org_id,
      qr_id: s.qr_id,
      amount: s.amount,
      sale_date: s.sale_date,
      customer_name: s.customer_name,
      notes: s.notes,
      created_by: s.created_by,
      created_at: s.created_at,
      organizations: s.org_name ? { name: s.org_name } : null,
      qr_codes: s.qr_product_name ? { product_name: s.qr_product_name, uuid: s.qr_uuid } : null,
      creator_name: s.creator_name,
    }))

    return NextResponse.json({ sales: formattedSales })
  } catch (error) {
    console.error('매출 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// POST: 매출 생성 (RPC로 RLS 우회)
export async function POST(request: Request) {
  try {
    const supabase = createRouteClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    const body = await request.json()
    const { qrId, amount, customerName, notes } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: '매출 금액을 입력해주세요.' }, { status: 400 })
    }

    const { data: newSale, error: rpcError } = await supabase
      .rpc('create_sale' as any, {
        p_user_email: user.email!,
        p_amount: amount,
        p_qr_id: qrId || null,
        p_customer_name: customerName || null,
        p_notes: notes || null,
      } as any)

    if (rpcError) {
      console.error('매출 생성 RPC 오류:', rpcError)
      return NextResponse.json({ error: rpcError.message || '매출 등록에 실패했습니다.' }, { status: 500 })
    }

    const sale = Array.isArray(newSale) ? newSale[0] : newSale
    return NextResponse.json({ sale })
  } catch (error) {
    console.error('매출 생성 API 오류:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
