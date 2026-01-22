'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Search,
  BarChart3,
  Zap,
  User,
  Home
} from 'lucide-react'

const navItems = [
  {
    label: '홈',
    href: '/',
    icon: Home,
  },
  {
    label: '분석',
    href: '/analyze',
    icon: Search,
  },
  {
    label: '키워드',
    href: '/keyword-search',
    icon: BarChart3,
  },
  {
    label: 'AI도구',
    href: '/tools',
    icon: Zap,
  },
  {
    label: '대시보드',
    href: '/dashboard',
    icon: User,
  },
]

export default function MobileBottomNav() {
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  // 스크롤 방향에 따라 네비게이션 표시/숨김
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY

      // 스크롤 다운시 숨김, 업시 표시
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false)
      } else {
        setIsVisible(true)
      }

      setLastScrollY(currentScrollY)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY])

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: isVisible ? 0 : 100 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
    >
      {/* 배경 블러 */}
      <div className="absolute inset-0 bg-white/90 backdrop-blur-lg border-t border-gray-200 shadow-lg shadow-gray-200/50" />

      {/* Safe area padding for iOS */}
      <div className="relative flex items-center justify-around px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 py-1 px-3 min-w-[60px]"
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={`p-2 rounded-xl transition-all ${
                  isActive
                    ? 'bg-[#0064FF] text-white shadow-lg shadow-[#0064FF]/25'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="w-5 h-5" />
              </motion.div>
              <span className={`text-[10px] font-medium ${
                isActive ? 'text-[#0064FF]' : 'text-gray-500'
              }`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </motion.nav>
  )
}
