'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, X, Crown, Gift, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import { getMySubscription, Subscription } from '@/lib/api/subscription'

interface TrialExpiryBannerProps {
  /** 배너를 숨길 수 있게 할지 여부 */
  dismissible?: boolean
  /** 컴팩트 모드 (상단 띠 형태) */
  compact?: boolean
}

export default function TrialExpiryBanner({ dismissible = true, compact = false }: TrialExpiryBannerProps) {
  const { user, isAuthenticated } = useAuthStore()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 로컬스토리지에서 dismiss 상태 확인
    const dismissed = localStorage.getItem('trial_banner_dismissed')
    if (dismissed) {
      const dismissedDate = new Date(dismissed)
      const now = new Date()
      // 24시간 후에 다시 표시
      if (now.getTime() - dismissedDate.getTime() < 24 * 60 * 60 * 1000) {
        setIsDismissed(true)
      }
    }
  }, [])

  useEffect(() => {
    async function fetchSubscription() {
      if (!isAuthenticated || !user?.id) {
        setIsLoading(false)
        return
      }

      try {
        const sub = await getMySubscription(user.id)
        setSubscription(sub)

        // 체험 기간 계산
        if (sub.expires_at && sub.status === 'active') {
          const expiresAt = new Date(sub.expires_at)
          const now = new Date()
          const diffTime = expiresAt.getTime() - now.getTime()
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

          // 7일 체험인 경우만 표시 (3일 이하 남았을 때)
          if (diffDays <= 3 && diffDays > 0) {
            setDaysRemaining(diffDays)
          }
        }
      } catch (error) {
        console.error('Failed to fetch subscription:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSubscription()
  }, [isAuthenticated, user?.id])

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem('trial_banner_dismissed', new Date().toISOString())
  }

  // 표시 조건: 로그인 + 체험 기간 3일 이하 + dismiss 안됨
  if (isLoading || !isAuthenticated || daysRemaining === null || isDismissed) {
    return null
  }

  // 컴팩트 모드 (상단 띠)
  if (compact) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 text-center text-sm font-medium relative"
        >
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" />
            <span>
              무료 체험이 <strong>{daysRemaining}일</strong> 남았어요!
            </span>
            <Link
              href="/pricing"
              className="underline hover:no-underline font-bold ml-2"
            >
              지금 구독하고 20% 할인받기
            </Link>
          </div>
          {dismissible && (
            <button
              onClick={handleDismiss}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/20 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    )
  }

  // 풀 배너 모드
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="relative bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200 rounded-2xl p-6 shadow-lg overflow-hidden"
      >
        {/* 배경 장식 */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-200/30 to-orange-200/30 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-yellow-200/30 to-amber-200/30 rounded-full blur-2xl" />

        {dismissible && (
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1.5 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="relative flex flex-col md:flex-row items-center gap-4">
          {/* 아이콘 */}
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2, repeatDelay: 3 }}
            className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg"
          >
            <Clock className="w-8 h-8 text-white" />
          </motion.div>

          {/* 내용 */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
              <span className="text-amber-800 font-bold text-lg">
                무료 체험이 {daysRemaining}일 남았어요!
              </span>
              {daysRemaining === 1 && (
                <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                  마지막 날
                </span>
              )}
            </div>
            <p className="text-amber-700 text-sm mb-3">
              체험 기간이 끝나면 무료 플랜으로 전환되어 하루 2회만 분석할 수 있어요.
              <br className="hidden md:block" />
              지금 구독하면 <strong>첫 달 20% 할인</strong> 혜택을 드려요!
            </p>

            {/* 혜택 하이라이트 */}
            <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-4">
              {[
                { icon: Crown, text: '무제한 분석' },
                { icon: Gift, text: '첫 달 20% 할인' },
                { icon: Sparkles, text: '프리미엄 기능' },
              ].map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-white/80 text-amber-700 text-xs font-medium rounded-full border border-amber-200"
                >
                  <item.icon className="w-3 h-3" />
                  {item.text}
                </span>
              ))}
            </div>
          </div>

          {/* CTA 버튼 */}
          <Link href="/pricing">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/30 transition-all whitespace-nowrap"
            >
              구독 플랜 보기
            </motion.button>
          </Link>
        </div>

        {/* 카운트다운 바 */}
        <div className="mt-4 relative">
          <div className="h-2 bg-amber-200 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: `${((7 - daysRemaining) / 7) * 100}%` }}
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-amber-600">
            <span>체험 시작</span>
            <span>{daysRemaining}일 남음</span>
            <span>7일 체험 종료</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
