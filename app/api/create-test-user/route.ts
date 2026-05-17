
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Database } from '@/lib/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET() {
  // 인증 확인 - super_admin만 접근 가능
  const authClient = createRouteHandlerClient<Database>({ cookies })
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
  }
  return POST()
}

export async function POST() {
  // 인증 확인
  const authClient = createRouteHandlerClient<Database>({ cookies })
  const { data: { user: authUser }, error: authError } = await authClient.auth.getUser()
  if (authError || !authUser) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const users = [
      { email: 'superadmin@example.com', password: 'password123', name: '슈퍼관리자', role: 'super_admin' },
      { email: 'hq@example.com', password: 'password123', name: '본사 관리자', role: 'hq' },
      { email: 'busan@example.com', password: 'password123', name: '부산 지사 관리자', role: 'branch' },
      { email: 'daegu@example.com', password: 'password123', name: '대구 지사 관리자', role: 'branch' },
      { email: 'busan-haeundae@example.com', password: 'password123', name: '부산 해운대 지점장', role: 'sub_branch' },
      { email: 'busan-saha@example.com', password: 'password123', name: '부산 사하 지점장', role: 'sub_branch' },
      { email: 'daegu-suseong@example.com', password: 'password123', name: '대구 수성 지점장', role: 'sub_branch' },
      { email: 'daegu-dalseo@example.com', password: 'password123', name: '대구 달서 지점장', role: 'sub_branch' },
      { email: 'haeundae-office1@example.com', password: 'password123', name: '해운대 1 영업점장', role: 'office' },
      { email: 'haeundae-office2@example.com', password: 'password123', name: '해운대 2 영업점장', role: 'office' },
      { email: 'saha-office1@example.com', password: 'password123', name: '사하 1 영업점장', role: 'office' },
      { email: 'suseong-office1@example.com', password: 'password123', name: '수성 1 영업점장', role: 'office' },
      { email: 'dalseo-office1@example.com', password: 'password123', name: '달서 1 영업점장', role: 'office' },
      { email: 'haeundae-emp1@example.com', password: 'password123', name: '해운대 영업사원 1', role: 'employee' },
      { email: 'haeundae-emp2@example.com', password: 'password123', name: '해운대 영업사원 2', role: 'employee' },
      { email: 'haeundae-emp3@example.com', password: 'password123', name: '해운대 영업사원 3', role: 'employee' },
      { email: 'saha-emp1@example.com', password: 'password123', name: '사하 영업사원 1', role: 'employee' },
      { email: 'suseong-emp1@example.com', password: 'password123', name: '수성 영업사원 1', role: 'employee' },
      { email: 'dalseo-emp1@example.com', password: 'password123', name: '달서 영업사원 1', role: 'employee' },
    ]

    const results = []

    for (const user of users) {
      let authUserId: string | undefined

      // 1. Auth에 사용자 생성
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      })

      if (error) {
        if (error.message.includes('already registered')) {
          // 이미 존재하는 사용자 - Auth에서 id 조회
          const { data: listData } = await supabase.auth.admin.listUsers()
          const existingUser = listData?.users?.find(u => u.email === user.email)
          authUserId = existingUser?.id
          results.push({ email: user.email, status: 'already_exists', authId: authUserId })
        } else {
          console.error(`Error creating user ${user.email}:`, error)
          results.push({ email: user.email, status: 'error', message: error.message })
          continue
        }
      } else {
        authUserId = data.user?.id
        results.push({ email: user.email, status: 'created', authId: authUserId })
      }

      // 2. users 테이블의 id를 Auth id와 동기화
      if (authUserId) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ id: authUserId })
          .eq('email', user.email)

        if (updateError) {
          console.error(`Error updating user id for ${user.email}:`, updateError)
          results.push({ email: user.email, status: 'sync_error', message: updateError.message })
        } else {
          results.push({ email: user.email, status: 'synced', authId: authUserId })
        }
      }
    }

    return NextResponse.json({
      message: '테스트 사용자 생성 및 동기화 완료',
      results,
      loginInfo: users.map(u => ({
        email: u.email,
        password: u.password,
        name: u.name,
        role: u.role
      }))
    })
  } catch (error: any) {
    console.error('Error creating test users:', error)
    return NextResponse.json({ error: '테스트 사용자 생성에 실패했습니다.', details: error?.message || error }, { status: 500 })
  }
}

