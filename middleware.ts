import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // 보호된 라우트 확인
  const protectedRoutes = ['/dashboard', '/qr', '/transfer', '/install', '/sales', '/products', '/admin']
  const isProtectedRoute = protectedRoutes.some(route => req.nextUrl.pathname.startsWith(route))

  // 로그인되지 않은 사용자가 보호된 라우트에 접근하려는 경우
  if (isProtectedRoute && !session) {
    const redirectUrl = new URL('/login', req.url)
    return NextResponse.redirect(redirectUrl)
  }

  // 이미 로그인한 사용자가 로그인 페이지에 접근하려는 경우
  if (req.nextUrl.pathname === '/login' && session) {
    const redirectUrl = new URL('/dashboard', req.url)
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*', '/qr/:path*', '/transfer/:path*', '/install/:path*', '/sales/:path*', '/products/:path*', '/admin/:path*', '/login'],
}
