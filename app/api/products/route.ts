import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// 제품 목록 조회
export async function GET(request: NextRequest) {
  try {
    const userEmail = request.headers.get('x-user-email')
    if (!userEmail) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    const { data, error } = await supabase.rpc('get_products', {
      p_user_email: userEmail,
      p_category: category || null
    })

    if (error) {
      console.error('제품 목록 조회 오류:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ products: data || [] })
  } catch (err) {
    console.error('제품 API 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// 제품 등록
export async function POST(request: NextRequest) {
  try {
    const userEmail = request.headers.get('x-user-email')
    if (!userEmail) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await request.json()
    const { name, description, sku, category } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: '제품명을 입력해주세요.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('create_product', {
      p_user_email: userEmail,
      p_name: name.trim(),
      p_description: description || null,
      p_sku: sku || null,
      p_category: category || null
    })

    if (error) {
      console.error('제품 등록 오류:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ product: data?.[0] || data }, { status: 201 })
  } catch (err) {
    console.error('제품 등록 API 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// 제품 수정
export async function PATCH(request: NextRequest) {
  try {
    const userEmail = request.headers.get('x-user-email')
    if (!userEmail) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await request.json()
    const { productId, name, description, sku, category, isActive } = body

    if (!productId) {
      return NextResponse.json({ error: '제품 ID가 필요합니다.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('update_product', {
      p_user_email: userEmail,
      p_product_id: productId,
      p_name: name || null,
      p_description: description || null,
      p_sku: sku || null,
      p_category: category || null,
      p_is_active: isActive !== undefined ? isActive : null
    })

    if (error) {
      console.error('제품 수정 오류:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ product: data?.[0] || data })
  } catch (err) {
    console.error('제품 수정 API 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// 제품 삭제 (비활성화)
export async function DELETE(request: NextRequest) {
  try {
    const userEmail = request.headers.get('x-user-email')
    if (!userEmail) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('id')

    if (!productId) {
      return NextResponse.json({ error: '제품 ID가 필요합니다.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('delete_product', {
      p_user_email: userEmail,
      p_product_id: productId
    })

    if (error) {
      console.error('제품 삭제 오류:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('제품 삭제 API 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
