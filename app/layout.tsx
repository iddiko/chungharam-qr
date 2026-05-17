import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '청하람 QR 물류 추적 시스템',
  description: 'QR 코드 기반 물류 추적 및 소유권 관리 시스템',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
