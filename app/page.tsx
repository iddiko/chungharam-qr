import Link from 'next/link'
import { ArrowRight, QrCode, ShieldCheck, Truck } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      <div className="container mx-auto px-4 py-8">
        {/* 헤더 */}
        <header className="mb-12">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-blue-900">청하람 QR 물류 추적 시스템</h1>
            <Link 
              href="/login" 
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              로그인
            </Link>
          </div>
        </header>

        {/* 히어로 섹션 */}
        <section className="mb-16">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              QR 코드 기반 물류 추적 시스템
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              제품 이동부터 설치까지, 모든 과정을 QR 코드로 관리하세요
            </p>
            <Link 
              href="/login"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg"
            >
              시작하기
              <ArrowRight className="ml-2" size={20} />
            </Link>
          </div>
        </section>

        {/* 기능 소개 */}
        <section className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <QrCode className="text-blue-600" size={24} />
            </div>
            <h3 className="text-xl font-semibold mb-2">QR 코드 관리</h3>
            <p className="text-gray-600">
              제품별 QR 코드를 생성하고, 이동 과정을 추적하세요
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <ShieldCheck className="text-blue-600" size={24} />
            </div>
            <h3 className="text-xl font-semibold mb-2">승인 기반 이동</h3>
            <p className="text-gray-600">
              이동 요청 후 승인 과정을 통해 안전하게 소유권을 이전하세요
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Truck className="text-blue-600" size={24} />
            </div>
            <h3 className="text-xl font-semibold mb-2">설치 관리</h3>
            <p className="text-gray-600">
              사진과 GPS 정보로 설치 현황을 기록하고 관리하세요
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
