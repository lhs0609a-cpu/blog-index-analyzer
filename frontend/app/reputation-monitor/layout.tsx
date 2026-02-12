'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, MessageSquare, Bell, FileText, ArrowLeft } from 'lucide-react'

const tabs = [
  { label: '대시보드', href: '/reputation-monitor', icon: LayoutDashboard },
  { label: '리뷰 관리', href: '/reputation-monitor/reviews', icon: MessageSquare },
  { label: '리포트', href: '/reputation-monitor/report', icon: FileText },
  { label: '알림 설정', href: '/reputation-monitor/alerts', icon: Bell },
]

export default function ReputationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
            <ArrowLeft className="w-4 h-4" />
            대시보드로 돌아가기
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">평판 모니터링</h1>
          <p className="text-sm text-gray-500 mt-1">내 가게 리뷰를 모아보고, AI가 답변을 도와드립니다</p>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-1 bg-white rounded-lg shadow-sm border border-gray-200 p-1 mb-6">
          {tabs.map(tab => {
            const isActive = pathname === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#0064FF] text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </Link>
            )
          })}
        </div>

        {children}
      </div>
    </div>
  )
}
