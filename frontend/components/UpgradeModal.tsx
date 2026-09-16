'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Crown, Check, X, Search, KeyRound, Wand2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'
import { PLAN_LIMITS, PLAN_INFO } from '@/lib/features/featureAccess'
import { track } from '@/lib/analytics/track'

/**
 * 한도에 부딪힌 사람에게 다음 걸음을 주는 화면.
 *
 * 여기가 유료 퍼널의 **입구**다. 2026-09-16 실측에서 이 구간은 통째로 비어
 * 있었다 — 서버에 한도가 없어 아무도 벽에 닿지 않았고, 닿았더라도 이 모달에는
 * track() 이 하나도 없어 몇 명이 봤는지조차 알 수 없었다.
 *
 * 비회원과 회원은 다음 걸음이 다르다. 비회원에게 요금제를 들이밀면 "아직
 * 써보지도 않았는데 돈부터"가 되고, 회원에게 가입을 권하면 말이 안 된다.
 */

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  feature: 'blog_analysis' | 'keyword_search' | 'general'
  /** 비회원이면 'guest'. 서버 429 응답의 authenticated 값으로 정한다. */
  audience?: 'guest' | 'member'
  /** 서버가 알려준 오늘의 한도. 프런트 상수보다 이 값이 우선이다. */
  maxUsage?: number
}

const featureInfo = {
  blog_analysis: {
    title: '블로그 분석',
    icon: Search,
    freeLimit: PLAN_LIMITS.free.blogAnalysisDaily,
    proLimit: PLAN_LIMITS.pro.blogAnalysisDaily,
  },
  keyword_search: {
    title: '키워드 검색',
    icon: KeyRound,
    freeLimit: PLAN_LIMITS.free.keywordSearchDaily,
    proLimit: PLAN_LIMITS.pro.keywordSearchDaily,
  },
  general: {
    title: '프리미엄 기능',
    icon: Wand2,
    freeLimit: 0,
    proLimit: -1,
  },
}

const fmt = (n: number) => (n === -1 ? '무제한' : `${n}회/일`)

/** 요금제 표시용 Pro 월 가격 — 숫자의 단일 출처는 featureAccess 다 */
const PLAN_INFO_PRO_PRICE = PLAN_INFO.pro.price

export default function UpgradeModal({
  isOpen,
  onClose,
  feature,
  audience = 'member',
  maxUsage,
}: UpgradeModalProps) {
  const info = featureInfo[feature]
  const isGuest = audience === 'guest'

  // 벽에 닿은 사람이 몇 명인지는 서버(middleware/usage_limit)도 세지만,
  // 화면이 실제로 떴는지는 여기서만 알 수 있다.
  useEffect(() => {
    if (!isOpen) return
    track('limit_hit', {
      reason: isGuest ? 'guest' : 'free',
      props: { feature, limit: maxUsage ?? info.freeLimit, at: 'modal' },
    })
  }, [isOpen, isGuest, feature, maxUsage, info.freeLimit])

  // ESC 키로 닫기
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  // 비회원 → 무료회원으로 실제로 늘어나는 양. 블로그 분석은 무료회원도 하루 1회라
  // 비회원과 같다 — 같은 숫자를 '혜택'이라고 나란히 그리면 화면이 거짓말을 한다.
  const guestGain = isGuest ? info.freeLimit - (maxUsage ?? 1) : 0

  const ctaHref = isGuest
    ? `/register?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`
    : '/pricing'

  const onCta = () => {
    track('limit_cta_click', {
      reason: isGuest ? 'guest' : 'free',
      props: { feature, to: isGuest ? 'register' : 'pricing' },
    })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="닫기"
            >
              <X className="w-5 h-5 gi3d" />
            </button>

            {/* 헤더 */}
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <info.icon className="w-10 h-10 text-[#0064FF]" strokeWidth={1.5} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                오늘의 {info.title}을 모두 쓰셨어요
              </h2>
              <p className="text-gray-600">
                {maxUsage !== undefined ? (
                  <>
                    {isGuest ? '비회원' : '무료 플랜'}은 하루{' '}
                    <span className="font-bold text-[#0064FF]">{maxUsage}회</span>까지 쓸 수 있습니다
                  </>
                ) : (
                  <>더 쓰시려면 한 걸음만 더 가시면 됩니다</>
                )}
              </p>
            </div>

            {/* 지금 → 다음 걸음 비교 */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                <div className="text-sm text-gray-500 mb-2">지금 ({isGuest ? '비회원' : '무료'})</div>
                <div className="text-2xl font-bold text-gray-700 mb-1">
                  {fmt(maxUsage ?? (isGuest ? 1 : info.freeLimit))}
                </div>
                <div className="text-xs text-gray-500">{info.title}</div>
              </div>

              <div className="bg-blue-50 rounded-2xl p-4 border-2 border-[#0064FF] relative">
                <div className="absolute -top-2 -right-2">
                  <span className="px-2 py-0.5 bg-[#0064FF] text-white text-xs font-bold rounded-full">
                    {isGuest ? '무료' : '추천'}
                  </span>
                </div>
                <div className="text-sm text-[#0064FF] mb-2">
                  {isGuest ? '무료 회원' : 'Pro 플랜'}
                </div>
                <div className="text-2xl font-bold text-[#0050CC] mb-1">
                  {isGuest
                    ? guestGain > 0
                      ? fmt(info.freeLimit)
                      : '기록 저장'
                    : fmt(info.proLimit)}
                </div>
                <div className="text-xs text-[#0064FF]">
                  {isGuest
                    ? guestGain > 0
                      ? '가입만 하면 바로'
                      : '분석한 블로그를 다시 볼 수 있어요'
                    : `${PLAN_INFO_PRO_PRICE.toLocaleString()}원/월`}
                </div>
              </div>
            </div>

            {/* 다음 걸음에서 실제로 얻는 것 — 숫자는 featureAccess 단일 출처에서 온다 */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <div className="text-sm font-bold text-gray-800 mb-3">
                {isGuest ? '무료 회원이 되면' : 'Pro 플랜이 되면'}
              </div>
              <div className="space-y-2">
                {(isGuest
                  ? [
                      // 실제로 늘어나는 것만 적는다. 비회원과 같은 한도를 혜택으로
                      // 적으면 가입한 사람이 곧바로 속았다고 느낀다.
                      `키워드 검색 ${fmt(PLAN_LIMITS.free.keywordSearchDaily)}`,
                      '분석한 블로그 저장 · 다시 보기',
                      '카드 등록 없이 가입 즉시 사용',
                    ]
                  : [
                      `키워드 검색 ${fmt(PLAN_LIMITS.pro.keywordSearchDaily)}`,
                      `블로그 분석 ${fmt(PLAN_LIMITS.pro.blogAnalysisDaily)}`,
                      `경쟁 블로그 비교 ${PLAN_LIMITS.pro.competitorCompare}개`,
                      '순위 추적 & 알림 · 엑셀 내보내기',
                    ]
                ).map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 gi3d" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="space-y-3">
              <Link href={ctaHref} className="block" onClick={onCta}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-4 bg-[#0064FF] text-white font-bold rounded-xl hover:shadow-lg shadow-lg shadow-[#0064FF]/25 transition-all flex items-center justify-center gap-2"
                >
                  {isGuest ? (
                    <>
                      <UserPlus className="w-5 h-5 gi3d" />
                      무료로 회원가입하고 이어서 하기
                    </>
                  ) : (
                    <>
                      <Crown className="w-5 h-5 gi3d" />
                      요금제 보기
                    </>
                  )}
                </motion.button>
              </Link>

              <button
                onClick={onClose}
                className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium transition-colors text-sm"
              >
                내일 다시 무료로 사용할게요
              </button>
            </div>

            <div className="mt-4 text-center text-xs text-gray-500">
              {isGuest
                ? '이메일과 비밀번호만 있으면 됩니다 · 카드 등록 없음'
                : '7일 이내 미사용 시 전액 환불 · 마이페이지에서 클릭 한 번으로 해지'}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
