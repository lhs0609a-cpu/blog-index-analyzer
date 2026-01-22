'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, TrendingUp, Activity, Zap } from 'lucide-react'

interface LiveActivityBadgeProps {
  variant?: 'badge' | 'banner' | 'minimal'
  className?: string
}

// 실시간 활동 데이터 시뮬레이션 (실제로는 API 연동)
function generateLiveStats() {
  const baseUsers = 47 // 기본 사용자 수
  const timeVariation = Math.floor(Math.random() * 20) - 10 // -10 ~ +10
  const currentUsers = Math.max(15, baseUsers + timeVariation)

  const todayAnalyses = Math.floor(Math.random() * 200) + 300 // 300-500
  const recentBlogId = ['travel_lover', 'foodie_kim', 'tech_review', 'beauty_daily', 'book_reader'][Math.floor(Math.random() * 5)]

  return {
    currentUsers,
    todayAnalyses,
    recentBlogId
  }
}

export default function LiveActivityBadge({ variant = 'badge', className = '' }: LiveActivityBadgeProps) {
  const [stats, setStats] = useState(generateLiveStats())
  const [showNotification, setShowNotification] = useState(false)
  const [notificationText, setNotificationText] = useState('')

  // 주기적으로 통계 업데이트
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(generateLiveStats())
    }, 30000) // 30초마다 업데이트

    return () => clearInterval(interval)
  }, [])

  // 랜덤 알림 표시
  useEffect(() => {
    const notifications = [
      '방금 블로그 분석이 완료되었습니다',
      '새로운 사용자가 참여했습니다',
      '오늘 인기 키워드: "맛집 추천"',
      '상위 10% 블로거 분석 완료',
    ]

    const showRandomNotification = () => {
      const randomNotif = notifications[Math.floor(Math.random() * notifications.length)]
      setNotificationText(randomNotif)
      setShowNotification(true)
      setTimeout(() => setShowNotification(false), 3000)
    }

    // 첫 알림 5초 후
    const firstTimer = setTimeout(showRandomNotification, 5000)

    // 이후 20-40초 간격으로 알림
    const interval = setInterval(() => {
      if (Math.random() > 0.5) {
        showRandomNotification()
      }
    }, 25000)

    return () => {
      clearTimeout(firstTimer)
      clearInterval(interval)
    }
  }, [])

  // 미니멀 버전 (작은 배지)
  if (variant === 'minimal') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
        <span className="text-sm font-medium text-green-700">
          {stats.currentUsers}명 분석 중
        </span>
      </motion.div>
    )
  }

  // 배지 버전
  if (variant === 'badge') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative ${className}`}
      >
        <div className="flex items-center gap-4 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 shadow-sm">
          {/* 실시간 표시 */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-sm font-bold text-gray-700">LIVE</span>
          </div>

          <div className="h-6 w-px bg-gray-200" />

          {/* 현재 사용자 */}
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0064FF]" />
            <span className="text-sm text-gray-600">
              <span className="font-bold text-[#0064FF]">{stats.currentUsers}명</span>이 분석 중
            </span>
          </div>

          <div className="h-6 w-px bg-gray-200" />

          {/* 오늘 분석 수 */}
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-gray-600">
              오늘 <span className="font-bold text-purple-600">{stats.todayAnalyses}회</span> 분석
            </span>
          </div>
        </div>

        {/* 알림 팝업 */}
        <AnimatePresence>
          {showNotification && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -10, x: '-50%' }}
              className="absolute -top-12 left-1/2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg whitespace-nowrap"
            >
              <Zap className="w-3 h-3 inline mr-1 text-yellow-400" />
              {notificationText}
              <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  // 배너 버전
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white px-4 py-3 ${className}`}
    >
      <div className="container mx-auto flex items-center justify-center gap-6 flex-wrap">
        {/* 실시간 표시 */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span className="text-sm font-medium">실시간</span>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>
              <strong>{stats.currentUsers}명</strong>이 지금 분석 중
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            <span>
              오늘 <strong>{stats.todayAnalyses}회</strong> 분석 완료
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span>
              최근 분석: <strong>@{stats.recentBlogId}</strong>
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// 팝업 토스트 스타일 알림
export function LiveActivityToast() {
  const [isVisible, setIsVisible] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const messages = [
      { blog: 'travel_lover', level: 7 },
      { blog: 'foodie_daily', level: 5 },
      { blog: 'tech_review', level: 8 },
      { blog: 'beauty_tips', level: 6 },
    ]

    const showToast = () => {
      const randomMsg = messages[Math.floor(Math.random() * messages.length)]
      setMessage(`@${randomMsg.blog}님이 Lv.${randomMsg.level}을 달성했습니다!`)
      setIsVisible(true)
      setTimeout(() => setIsVisible(false), 4000)
    }

    // 10-20초 후 첫 표시
    const firstTimer = setTimeout(showToast, 12000)

    // 이후 30-60초 간격으로 표시
    const interval = setInterval(() => {
      if (Math.random() > 0.5) {
        showToast()
      }
    }, 45000)

    return () => {
      clearTimeout(firstTimer)
      clearInterval(interval)
    }
  }, [])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          className="fixed bottom-24 right-4 z-50 px-4 py-3 bg-white rounded-xl shadow-lg border border-gray-200 max-w-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">{message}</div>
              <div className="text-xs text-gray-500">방금 전</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
