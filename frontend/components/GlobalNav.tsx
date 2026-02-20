'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Zap,
  Target,
  Users,
  Menu,
  X,
  LogOut,
  CreditCard,
  Shield,
  Home,
  LayoutDashboard,
  Eye,
  GitBranch,
  MessageCircle,
  Radio
} from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth'
import UsageIndicator from './UsageIndicator'
import toast from 'react-hot-toast'

// 네비게이션 메뉴 아이템
const navItems = [
  {
    label: '블로그 분석',
    href: '/analyze',
    icon: Zap,
    badge: 'FREE',
    badgeColor: 'bg-[#0064FF] text-white',
    description: '40개 이상의 지표로 블로그 분석'
  },
  {
    label: 'AI 도구',
    href: '/tools',
    icon: Sparkles,
    badge: 'SEO 원고 외 7건',
    badgeColor: 'bg-gray-100 text-gray-600',
    description: '상위노출 최적화 AI 도구 모음'
  },
  {
    label: '커뮤니티',
    href: '/community',
    icon: Users,
    badge: 'NEW',
    badgeColor: 'bg-green-500 text-white',
    description: '실시간 활동 & 랭킹'
  },
  {
    label: '광고 최적화',
    href: '/ad-optimizer',
    icon: Target,
    badge: 'PREMIUM',
    badgeColor: 'bg-gradient-to-r from-amber-500 to-red-500 text-white',
    description: 'AI가 찾아주는 가성비 광고 타겟팅'
  },
  {
    label: '평판 모니터링',
    href: '/reputation-monitor',
    icon: Eye,
    badge: 'NEW',
    badgeColor: 'bg-red-500 text-white',
    description: '리뷰 감시 + AI 답변'
  },
  {
    label: '퍼널 디자이너',
    href: '/funnel-designer',
    icon: GitBranch,
    badge: 'BETA',
    badgeColor: 'bg-orange-500 text-white',
    description: '마케팅 퍼널 설계 & AI 진단'
  },
  {
    label: 'Threads',
    href: '/threads',
    icon: MessageCircle,
    badge: 'BETA',
    badgeColor: 'bg-purple-500 text-white',
    description: 'AI 스레드 자동 마케팅'
  },
  {
    label: 'X 자동화',
    href: '/x',
    icon: Radio,
    badge: 'BETA',
    badgeColor: 'bg-gray-800 text-white',
    description: 'AI 트위터/X 자동 포스팅'
  },
  {
    label: '대시보드',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: '내 분석 현황'
  }
]

export default function GlobalNav() {
  const pathname = usePathname()
  const { user, isAuthenticated, logout } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 특정 페이지에서는 네비게이션 숨김 (로그인, 회원가입, 결제 페이지 등)
  const hideNavPages = ['/login', '/register', '/payment']
  if (hideNavPages.some(page => pathname?.startsWith(page))) {
    return null
  }

  const handleLogout = () => {
    logout()
    toast.success('로그아웃되었습니다')
    setMobileMenuOpen(false)
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname?.startsWith(href)
  }

  return (
    <>
      {/* Desktop Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-4 mt-4">
          <div className="backdrop-blur-2xl bg-white/80 border border-gray-200/50 rounded-2xl px-4 py-3 shadow-lg shadow-gray-200/50">
            <div className="flex items-center justify-between gap-4">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2 flex-shrink-0">
                <motion.div
                  className="relative w-9 h-9 rounded-xl overflow-hidden"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <div className="absolute inset-0 bg-[#0064FF]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                </motion.div>
                <span className="text-lg font-black text-[#0064FF] hidden sm:block">블랭크</span>
              </Link>

              {/* Desktop Menu */}
              <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link key={item.href} href={item.href}>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                          active
                            ? 'bg-[#0064FF] text-white shadow-md shadow-[#0064FF]/20'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                        {item.badge && (
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                            active ? 'bg-white/20 text-white' : item.badgeColor
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </motion.div>
                    </Link>
                  )
                })}

              </nav>

              {/* Right Section */}
              {!mounted ? (
                <div className="w-32 h-9 bg-gray-200 rounded-xl animate-pulse" />
              ) : isAuthenticated ? (
                <div className="flex items-center gap-2">
                  <div className="hidden md:block">
                    <UsageIndicator />
                  </div>
                  <Link href="/pricing" className="hidden md:block">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-[#0064FF] transition-colors flex items-center gap-1"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span className="hidden xl:inline">요금제</span>
                    </motion.button>
                  </Link>
                  <span className="hidden xl:block text-sm font-medium text-gray-600 max-w-[100px] truncate">
                    {user?.name}님
                  </span>
                  {user?.is_admin && (
                    <Link href="/admin">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="p-2 rounded-xl bg-blue-50 border border-blue-100"
                        title="관리자"
                      >
                        <Shield className="w-4 h-4 text-[#0064FF]" />
                      </motion.button>
                    </Link>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleLogout}
                    className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                    title="로그아웃"
                  >
                    <LogOut className="w-4 h-4 text-gray-500" />
                  </motion.button>

                  {/* Mobile Menu Button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setMobileMenuOpen(true)}
                    className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <Menu className="w-5 h-5 text-gray-600" />
                  </motion.button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/pricing" className="hidden md:block">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-3 py-2 text-sm font-semibold text-[#0064FF] hover:text-[#0050CC] transition-colors flex items-center gap-1"
                    >
                      <Sparkles className="w-4 h-4" />
                      7일 무료 체험
                    </motion.button>
                  </Link>
                  <Link href="/login">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      로그인
                    </motion.button>
                  </Link>
                  <Link href="/register" className="hidden sm:block">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-4 py-2 text-sm font-bold bg-[#0064FF] text-white rounded-xl hover:shadow-lg hover:shadow-[#0064FF]/20 transition-shadow"
                    >
                      시작하기
                    </motion.button>
                  </Link>

                  {/* Mobile Menu Button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setMobileMenuOpen(true)}
                    className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <Menu className="w-5 h-5 text-gray-600" />
                  </motion.button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 lg:hidden"
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 w-80 bg-white shadow-2xl z-50 lg:hidden overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#0064FF] flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-lg font-black text-[#0064FF]">블랭크</span>
                </Link>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* User Info */}
              {isAuthenticated && (
                <div className="p-4 border-b bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#0064FF] flex items-center justify-center text-white font-bold">
                      {user?.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{user?.name}님</p>
                      <p className="text-sm text-gray-500">{user?.email}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <UsageIndicator />
                  </div>
                </div>
              )}

              {/* Menu Items */}
              <div className="p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">메인 메뉴</p>

                <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                  <div className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
                    pathname === '/' ? 'bg-[#0064FF] text-white' : 'hover:bg-gray-100'
                  }`}>
                    <Home className="w-5 h-5" />
                    <span className="font-medium">홈</span>
                  </div>
                </Link>

                {navItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                      <div className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
                        active ? 'bg-[#0064FF] text-white' : 'hover:bg-gray-100'
                      }`}>
                        <Icon className="w-5 h-5" />
                        <span className="font-medium flex-1">{item.label}</span>
                        {item.badge && (
                          <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                            active ? 'bg-white/20 text-white' : item.badgeColor
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>

              {/* Bottom Section */}
              <div className="p-4 border-t space-y-2">
                <Link href="/pricing" onClick={() => setMobileMenuOpen(false)}>
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-100 transition-colors">
                    <CreditCard className="w-5 h-5 text-gray-600" />
                    <span className="font-medium">요금제</span>
                  </div>
                </Link>

                {isAuthenticated ? (
                  <>
                    {user?.is_admin && (
                      <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                        <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-100 transition-colors">
                          <Shield className="w-5 h-5 text-[#0064FF]" />
                          <span className="font-medium">관리자</span>
                        </div>
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-50 text-red-600 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="font-medium">로그아웃</span>
                    </button>
                  </>
                ) : (
                  <div className="space-y-2 pt-2">
                    <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                      <button className="w-full py-3 px-4 border border-gray-300 rounded-xl font-medium hover:bg-gray-50 transition-colors">
                        로그인
                      </button>
                    </Link>
                    <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                      <button className="w-full py-3 px-4 bg-[#0064FF] text-white rounded-xl font-bold hover:shadow-lg transition-shadow">
                        시작하기
                      </button>
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
