'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Crown, Zap, TrendingUp, Check, X, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  feature: 'blog_analysis' | 'keyword_search' | 'general'
  currentUsage?: number
  maxUsage?: number
}

const featureInfo = {
  blog_analysis: {
    title: '블로그 분석',
    icon: '🔍',
    freeLimit: 2,
    proLimit: 50,
    benefit: '무제한 블로그 분석으로 경쟁사 분석까지!'
  },
  keyword_search: {
    title: '키워드 검색',
    icon: '🔑',
    freeLimit: 8,
    proLimit: 100,
    benefit: '100회 검색으로 블루오션 키워드 발굴!'
  },
  general: {
    title: '프리미엄 기능',
    icon: '✨',
    freeLimit: 0,
    proLimit: -1,
    benefit: '모든 프리미엄 기능을 제한 없이!'
  }
}

export default function UpgradeModal({ isOpen, onClose, feature, currentUsage, maxUsage }: UpgradeModalProps) {
  const [showUrgency, setShowUrgency] = useState(false)
  const info = featureInfo[feature]

  useEffect(() => {
    if (isOpen) {
      // 3초 후 긴급성 메시지 표시
      const timer = setTimeout(() => setShowUrgency(true), 3000)
      return () => clearTimeout(timer)
    } else {
      setShowUrgency(false)
    }
  }, [isOpen])

  // ESC 키로 닫기
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-gradient-to-br from-blue-900/95 to-purple-900/95 flex items-center justify-center z-[100] p-4"
          onClick={onClose}
        >
          {/* 배경 파티클 효과 */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 bg-white/20 rounded-full"
                initial={{
                  x: Math.random() * window.innerWidth,
                  y: window.innerHeight + 20
                }}
                animate={{
                  y: -20,
                  transition: {
                    duration: 3 + Math.random() * 2,
                    repeat: Infinity,
                    delay: Math.random() * 2
                  }
                }}
              />
            ))}
          </div>

          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 50 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* 헤더 */}
            <div className="text-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg"
              >
                <span className="text-4xl">{info.icon}</span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  오늘의 {info.title} 완료! 🎉
                </h2>
                <p className="text-gray-600">
                  {currentUsage !== undefined && maxUsage !== undefined ? (
                    <>무료 플랜 <span className="font-bold text-blue-600">{maxUsage}회</span>를 모두 사용했어요</>
                  ) : (
                    <>더 많은 기능이 필요하신가요?</>
                  )}
                </p>
              </motion.div>
            </div>

            {/* 비교 카드 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-2 gap-4 mb-6"
            >
              {/* 무료 플랜 */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 opacity-60">
                <div className="text-sm text-gray-500 mb-2">현재 (무료)</div>
                <div className="text-2xl font-bold text-gray-700 mb-1">
                  {info.freeLimit}회/일
                </div>
                <div className="text-xs text-gray-500">기본 기능만</div>
              </div>

              {/* Pro 플랜 */}
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-4 border-2 border-blue-400 relative">
                <div className="absolute -top-2 -right-2">
                  <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full">추천</span>
                </div>
                <div className="text-sm text-blue-600 mb-2">Pro 플랜</div>
                <div className="text-2xl font-bold text-blue-700 mb-1">
                  {info.proLimit === -1 ? '무제한' : `${info.proLimit}회/일`}
                </div>
                <div className="text-xs text-blue-600">{info.benefit}</div>
              </div>
            </motion.div>

            {/* Pro 혜택 리스트 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 mb-6"
            >
              <div className="text-sm font-bold text-emerald-800 mb-3">Pro 플랜 혜택</div>
              <div className="space-y-2">
                {[
                  '키워드 검색 100회/일 (12배 증가)',
                  '블로그 분석 50회/일 (25배 증가)',
                  '"상위 노출 가능" 키워드 필터',
                  '순위 추적 & 알림',
                  '엑셀 내보내기'
                ].map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-emerald-700">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* 긴급성 메시지 */}
            <AnimatePresence>
              {showUrgency && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-center"
                >
                  <span className="text-amber-700 text-sm font-medium">
                    🔥 지금 시작하면 <span className="font-bold">7일 무료 체험</span> + 첫 달 20% 할인!
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* CTA 버튼 */}
            <div className="space-y-3">
              <Link href="/pricing" className="block">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-xl hover:shadow-lg shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
                >
                  <Crown className="w-5 h-5" />
                  7일 무료로 Pro 체험하기
                </motion.button>
              </Link>

              <button
                onClick={onClose}
                className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium transition-colors text-sm"
              >
                내일 다시 무료로 사용할게요
              </button>
            </div>

            {/* 하단 안내 */}
            <div className="mt-4 text-center text-xs text-gray-400">
              7일 이내 언제든 해지 가능 · 자동 결제 전 알림
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
