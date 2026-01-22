'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, useSpring, useTransform, useMotionValue } from 'framer-motion'

interface AnimatedScoreProps {
  value: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
  onComplete?: () => void
}

export function AnimatedScore({
  value,
  duration = 2000,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  onComplete
}: AnimatedScoreProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const hasCompletedRef = useRef(false)

  useEffect(() => {
    hasCompletedRef.current = false
    startTimeRef.current = null

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp
      }

      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // easeOutExpo for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 4)
      const currentValue = easeProgress * value

      setDisplayValue(currentValue)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setDisplayValue(value)
        if (!hasCompletedRef.current && onComplete) {
          hasCompletedRef.current = true
          onComplete()
        }
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [value, duration, onComplete])

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      className={className}
    >
      {prefix}
      {displayValue.toFixed(decimals)}
      {suffix}
    </motion.span>
  )
}

interface AnimatedLevelProps {
  level: number
  className?: string
  showLabel?: boolean
}

export function AnimatedLevel({ level, className = '', showLabel = true }: AnimatedLevelProps) {
  const [currentLevel, setCurrentLevel] = useState(1)
  const [isAnimating, setIsAnimating] = useState(true)

  useEffect(() => {
    if (level <= 1) {
      setCurrentLevel(level)
      setIsAnimating(false)
      return
    }

    let current = 1
    const interval = setInterval(() => {
      current++
      setCurrentLevel(current)

      if (current >= level) {
        clearInterval(interval)
        setIsAnimating(false)
      }
    }, 150)

    return () => clearInterval(interval)
  }, [level])

  const getLevelColor = (lvl: number) => {
    if (lvl >= 9) return 'from-purple-500 to-pink-500'
    if (lvl >= 7) return 'from-blue-500 to-cyan-500'
    if (lvl >= 5) return 'from-green-500 to-emerald-500'
    if (lvl >= 3) return 'from-yellow-500 to-orange-500'
    return 'from-gray-400 to-gray-500'
  }

  return (
    <motion.div
      className={`inline-flex items-center gap-2 ${className}`}
      animate={isAnimating ? { scale: [1, 1.1, 1] } : {}}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        key={currentLevel}
        initial={{ scale: 1.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`px-4 py-2 rounded-xl bg-gradient-to-r ${getLevelColor(currentLevel)} text-white font-bold shadow-lg`}
      >
        {showLabel && 'Lv.'}
        {currentLevel}
      </motion.div>
    </motion.div>
  )
}

interface ScoreRevealProps {
  score: number
  level: number
  grade: string
  onRevealComplete?: () => void
  className?: string
}

export function ScoreReveal({ score, level, grade, onRevealComplete, className = '' }: ScoreRevealProps) {
  const [phase, setPhase] = useState<'loading' | 'score' | 'level' | 'complete'>('loading')

  useEffect(() => {
    const timers: NodeJS.Timeout[] = []

    // Phase 1: Show score after 500ms
    timers.push(setTimeout(() => setPhase('score'), 500))

    // Phase 2: Show level after score animation (2500ms total)
    timers.push(setTimeout(() => setPhase('level'), 2500))

    // Phase 3: Complete
    timers.push(setTimeout(() => {
      setPhase('complete')
      onRevealComplete?.()
    }, 3500))

    return () => timers.forEach(clearTimeout)
  }, [onRevealComplete])

  return (
    <div className={`text-center ${className}`}>
      {/* Loading State */}
      {phase === 'loading' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-16 h-16 border-4 border-[#0064FF] border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">분석 결과 계산 중...</span>
        </motion.div>
      )}

      {/* Score Reveal */}
      {(phase === 'score' || phase === 'level' || phase === 'complete') && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div>
            <div className="text-sm text-gray-500 mb-2">블로그 지수</div>
            <div className="text-6xl font-bold text-[#0064FF]">
              <AnimatedScore value={score} decimals={1} duration={2000} />
            </div>
          </div>

          {/* Level Reveal */}
          {(phase === 'level' || phase === 'complete') && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              <div className="text-sm text-gray-500 mb-2">등급</div>
              <AnimatedLevel level={level} />
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-2 text-lg font-medium text-gray-700"
              >
                {grade}
              </motion.div>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  )
}

interface CircularProgressProps {
  value: number
  maxValue?: number
  size?: number
  strokeWidth?: number
  color?: string
  bgColor?: string
  showValue?: boolean
  label?: string
  className?: string
}

export function CircularProgress({
  value,
  maxValue = 100,
  size = 120,
  strokeWidth = 8,
  color = '#0064FF',
  bgColor = '#e5e7eb',
  showValue = true,
  label,
  className = ''
}: CircularProgressProps) {
  const [animatedValue, setAnimatedValue] = useState(0)

  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const normalizedValue = Math.min(value, maxValue)
  const progress = (animatedValue / maxValue) * 100
  const strokeDashoffset = circumference - (progress / 100) * circumference

  useEffect(() => {
    const duration = 1500
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeProgress = 1 - Math.pow(1 - progress, 3)

      setAnimatedValue(easeProgress * normalizedValue)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [normalizedValue])

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>
            {Math.round(animatedValue)}
          </span>
          {label && <span className="text-xs text-gray-500 mt-1">{label}</span>}
        </div>
      )}
    </div>
  )
}
