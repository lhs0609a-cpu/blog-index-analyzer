'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Sparkles, Star, Trophy, Zap } from 'lucide-react'

/**
 * P3-3: 성공 피드백 애니메이션 컴포넌트
 * 분석 완료, 저장 완료 등 성공 시 시각적 피드백 제공
 */

type FeedbackType = 'success' | 'achievement' | 'levelup' | 'save'

interface SuccessFeedbackProps {
  type?: FeedbackType
  message: string
  subMessage?: string
  show: boolean
  onComplete?: () => void
  duration?: number
  className?: string
}

const feedbackConfig: Record<FeedbackType, {
  icon: React.ElementType
  bgGradient: string
  iconColor: string
}> = {
  success: {
    icon: Check,
    bgGradient: 'from-green-400 to-emerald-500',
    iconColor: 'text-white'
  },
  achievement: {
    icon: Trophy,
    bgGradient: 'from-yellow-400 to-amber-500',
    iconColor: 'text-white'
  },
  levelup: {
    icon: Star,
    bgGradient: 'from-purple-400 to-pink-500',
    iconColor: 'text-white'
  },
  save: {
    icon: Sparkles,
    bgGradient: 'from-blue-400 to-cyan-500',
    iconColor: 'text-white'
  }
}

export default function SuccessFeedback({
  type = 'success',
  message,
  subMessage,
  show,
  onComplete,
  duration = 2500,
  className = ''
}: SuccessFeedbackProps) {
  const config = feedbackConfig[type]
  const Icon = config.icon

  useEffect(() => {
    if (show && onComplete) {
      const timer = setTimeout(onComplete, duration)
      return () => clearTimeout(timer)
    }
  }, [show, onComplete, duration])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          className={`fixed inset-0 z-50 flex items-center justify-center pointer-events-none ${className}`}
        >
          {/* 배경 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />

          {/* 컨펫티 효과 */}
          <ConfettiEffect />

          {/* 메인 피드백 카드 */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="relative bg-white rounded-3xl shadow-2xl p-8 text-center max-w-sm mx-4"
          >
            {/* 아이콘 */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className={`w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br ${config.bgGradient} flex items-center justify-center shadow-lg`}
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                <Icon className={`w-10 h-10 ${config.iconColor}`} />
              </motion.div>
            </motion.div>

            {/* 메시지 */}
            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xl font-bold text-gray-900 mb-2"
            >
              {message}
            </motion.h3>

            {subMessage && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-gray-500"
              >
                {subMessage}
              </motion.p>
            )}

            {/* 프로그레스 바 (자동 닫힘 표시) */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: duration / 1000, ease: 'linear' }}
              className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${config.bgGradient} rounded-b-3xl origin-left`}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// 컨펫티 효과 컴포넌트
function ConfettiEffect() {
  const [particles] = useState(() =>
    Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
      size: 4 + Math.random() * 8,
      color: ['#0064FF', '#3182F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'][Math.floor(Math.random() * 6)]
    }))
  )

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          initial={{
            x: `${particle.x}vw`,
            y: '50vh',
            opacity: 1,
            scale: 0
          }}
          animate={{
            y: ['50vh', `${20 + Math.random() * 30}vh`, '120vh'],
            x: `${particle.x + (Math.random() - 0.5) * 20}vw`,
            opacity: [0, 1, 1, 0],
            scale: [0, 1, 1, 0.5],
            rotate: [0, 360, 720]
          }}
          transition={{
            duration: 2 + Math.random(),
            delay: particle.delay,
            ease: 'easeOut'
          }}
          style={{
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            position: 'absolute'
          }}
        />
      ))}
    </div>
  )
}

/**
 * 인라인 성공 체크마크 애니메이션
 * 버튼이나 인풋 옆에 작게 표시
 */
export function InlineSuccessCheck({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="inline-flex items-center justify-center w-6 h-6 bg-green-500 rounded-full"
        >
          <motion.div
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * 토스트 스타일 성공 알림 (하단 또는 상단에 잠시 표시)
 */
export function SuccessToast({
  message,
  show,
  position = 'bottom'
}: {
  message: string
  show: boolean
  position?: 'top' | 'bottom'
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: position === 'bottom' ? 50 : -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: position === 'bottom' ? 50 : -50 }}
          className={`fixed ${position === 'bottom' ? 'bottom-24' : 'top-24'} left-1/2 -translate-x-1/2 z-50`}
        >
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-full shadow-lg">
            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </div>
            <span className="font-medium">{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
