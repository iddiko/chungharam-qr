"use client"

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getCurrentUser, roleLabels, roleBadgeStyles, roleMenuItems, type User as UserType } from '@/lib/auth'
import {
  QrCode,
  ArrowRightLeft,
  DollarSign,
  Wrench,
  Building2,
  Users,
  LayoutDashboard,
  ScanLine,
  List,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  User as UserIcon,
  Mail,
  Package
} from 'lucide-react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const iconMap: Record<string, any> = {
  LayoutDashboard,
  QrCode,
  List,
  ArrowRightLeft,
  DollarSign,
  Wrench,
  Building2,
  Users,
  ScanLine,
  Mail,
  Package,
}

interface SidebarLayoutProps {
  children: React.ReactNode
}

export default function SidebarLayout({ children }: SidebarLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [userInfo, setUserInfo] = useState<UserType | null>(null)
  const [userError, setUserError] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await getCurrentUser()
        if (user) {
          setUserInfo(user)
        } else {
          setUserError(true)
        }
      } catch (e) {
        console.error('SidebarLayout: 사용자 조회 실패', e)
        setUserError(true)
      }
    }
    fetchUser()
  }, [router])

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.replace('/login')
      router.refresh()
    } catch (error) {
      router.replace('/login')
    }
  }

  // 사용자 정보 로딩 중
  if (!userInfo && !userError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 사용자 정보 없음 - 최소 레이아웃
  if (!userInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="h-16 flex items-center px-6 border-b border-gray-200">
            <h1 className="text-lg font-bold text-blue-900">청하람 QR</h1>
          </div>
          <div className="flex-1"></div>
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="flex items-center space-x-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={20} />
              <span>로그아웃</span>
            </button>
          </div>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 lg:px-6">
            <h2 className="text-lg font-semibold text-gray-900">대시보드</h2>
          </header>
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    )
  }

  const menuItems = roleMenuItems[userInfo?.role || 'employee'] || []

  const roleColorMap: Record<string, string> = {
    super_admin: 'bg-red-600',
    hq: 'bg-purple-600',
    branch: 'bg-blue-600',
    sub_branch: 'bg-indigo-600',
    office: 'bg-green-600',
    employee: 'bg-gray-600',
  }

  const roleBorderColorMap: Record<string, string> = {
    super_admin: 'border-red-500',
    hq: 'border-purple-500',
    branch: 'border-blue-500',
    sub_branch: 'border-indigo-500',
    office: 'border-green-500',
    employee: 'border-gray-500',
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        ${collapsed ? 'w-20' : 'w-64'}
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        bg-white border-r border-gray-200 transition-all duration-300 flex flex-col
      `}>
        {/* 로고 영역 */}
        <div className={`h-16 flex items-center border-b border-gray-200 ${collapsed ? 'justify-center' : 'px-6'}`}>
          {!collapsed && (
            <h1 className="text-lg font-bold text-blue-900 truncate">청하람 QR</h1>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <ChevronLeft size={18} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* 사용자 정보 */}
        <div className={`border-b border-gray-200 ${collapsed ? 'p-3' : 'p-4'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'space-x-3'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${roleColorMap[userInfo?.role || '']}`}>
              {userInfo?.name?.charAt(0) || '?'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{userInfo?.name || '사용자'}</p>
                <p className="text-xs text-gray-500 truncate flex items-center">
                  <Building2 size={10} className="mr-1 shrink-0" />
                  {userInfo?.organization?.name || '-'}
                </p>
                <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${roleBadgeStyles[userInfo?.role || 'employee']}`}>
                  {roleLabels[userInfo?.role || 'employee']}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-3">
            {menuItems.map((item) => {
              const Icon = iconMap[item.icon] || QrCode
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center ${collapsed ? 'justify-center' : 'space-x-3'}
                      px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${isActive
                        ? `bg-blue-50 text-blue-700 border-l-4 ${roleBorderColorMap[userInfo?.role || 'employee']}`
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={20} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* 로그아웃 */}
        <div className={`border-t border-gray-200 ${collapsed ? 'p-3' : 'p-4'}`}>
          <button
            onClick={handleLogout}
            className={`
              flex items-center ${collapsed ? 'justify-center' : 'space-x-3'}
              w-full px-3 py-2.5 rounded-lg text-sm font-medium
              text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors
            `}
            title={collapsed ? '로그아웃' : undefined}
          >
            <LogOut size={20} />
            {!collapsed && <span>로그아웃</span>}
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 상단 바 */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              {menuItems.find(item => pathname === item.href || pathname.startsWith(item.href + '/'))?.label || '대시보드'}
            </h2>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 text-xs font-bold rounded-full border ${roleBadgeStyles[userInfo?.role || 'employee']}`}>
              {roleLabels[userInfo?.role || 'employee']}
            </span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs bg-blue-600">
              {userInfo?.name?.charAt(0) || '?'}
            </div>
          </div>
        </header>

        {/* 페이지 콘텐츠 */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
