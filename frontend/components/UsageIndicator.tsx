'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, TrendingUp, AlertCircle, Zap, Crown, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import { getUsage, getMySubscription, type UsageInfo, type Subscription } from '@/lib/api/subscription'

interface UsageIndicatorProps {
  compact?: boolean
  showUpgrade?: boolean
}

export default function UsageIndicator({ compact = false, showUpgrade = true }: UsageIndicatorProps) {
  const { isAuthenticated, user } = useAuthStore()
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      loadUsage()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user])

  const loadUsage = async () => {
    if (!user?.id) return

    try {
      const [usageData, subData] = await Promise.all([
        getUsage(user.id),
        getMySubscription(user.id)
      ])
      setUsage(usageData)
      setSubscription(subData)
    } catch (error) {
      console.error('Failed to load usage:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 로그인하지 않은 경우 표시하지 않음
  if (!isAuthenticated || isLoading) {
    return null
  }

  const keywordUsed = usage?.keyword_searches.used || 0
  const keywordLimit = usage?.keyword_searches.limit || 3
  const keywordRemaining = usage?.keyword_searches.remaining ?? 0

  const analysisUsed = usage?.blog_analyses.used || 0
  const analysisLimit = usage?.blog_analyses.limit || 1
  const analysisRemaining = usage?.blog_analyses.remaining ?? 0

  const isUnlimited = keywordLimit === -1
  const isLowUsage = !isUnlimited && (keywordRemaining <= 1 || analysisRemaining <= 0)

  const planIcon = subscription?.plan_type === 'pro' || subscription?.plan_type === 'business'
    ? <Crown className="w-4 h-4" />
    : <Zap className="w-4 h-4" />

  // 컴팩트 모드
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${
          isLowUsage ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'
        }`}>
          {planIcon}
          <span className="font-medium">{subscription?.plan_name}</span>
          {!isUnlimited && (
            <span className="text-xs opacity-70">
              ({keywordRemaining}/{keywordLimit})
            </span>
          )}
        </div>
        {isLowUsage && showUpgrade && (
          <Link href="/pricing">
            <button className="px-2 py-1 text-xs bg-purple-600 text-white rounded-full hover:bg-purple-700">
              업그레이드
            </button>
          </Link>
        )}
      </div>
    )
  }

  // 풀 모드 (확장 가능)
  return (
    <div className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
          isLowUsage
            ? 'bg-orange-100 hover:bg-orange-200 text-orange-700'
            : 'bg-white/80 hover:bg-white text-gray-700'
        } backdrop-blur-sm border border-white/20 shadow-sm`}
      >
        <div className="flex items-center gap-1.5">
          {planIcon}
          <span className="font-medium text-sm">{subscription?.plan_name}</span>
        </div>

        {!isUnlimited && (
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1">
              <Search className="w-3 h-3" />
              {keywordRemaining}
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {analysisRemaining}
            </span>
          </div>
        )}

        {isUnlimited && (
          <span className="text-xs text-green-600 font-medium">무제한</span>
        )}

        {isExpanded ? (
          <ChevronUp className="w-4 h-4 opacity-50" />
        ) : (
          <ChevronDown className="w-4 h-4 opacity-50" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-50"
          >
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">오늘의 사용량</span>
                <span className="text-xs text-gray-400">{usage?.date}</span>
              </div>

              {/* 키워드 검색 */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-1">
                    <Search className="w-4 h-4 text-blue-500" />
                    키워드 검색
                  </span>
                  <span className="font-medium">
                    {isUnlimited ? `${keywordUsed}회` : `${keywordUsed}/${keywordLimit}회`}
                  </span>
                </div>
                {!isUnlimited && (
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        keywordRemaining <= 1 ? 'bg-orange-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min((keywordUsed / keywordLimit) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 블로그 분석 */}
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-purple-500" />
                    블로그 분석
                  </span>
                  <span className="font-medium">
                    {analysisLimit === -1 ? `${analysisUsed}회` : `${analysisUsed}/${analysisLimit}회`}
                  </span>
                </div>
                {analysisLimit !== -1 && (
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        analysisRemaining <= 0 ? 'bg-orange-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${Math.min((analysisUsed / analysisLimit) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 경고 메시지 */}
            {isLowUsage && (
              <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-xl mb-3 text-sm">
                <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="text-orange-700">
                  <p className="font-medium">사용량이 거의 소진되었습니다</p>
                  <p className="text-xs opacity-80">업그레이드하여 더 많이 검색하세요</p>
                </div>
              </div>
            )}

            {/* 버튼들 */}
            <div className="flex gap-2">
              <Link href="/dashboard/subscription" className="flex-1">
                <button className="w-full py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                  구독 관리
                </button>
              </Link>
              {showUpgrade && subscription?.plan_type !== 'business' && (
                <Link href="/pricing" className="flex-1">
                  <button className="w-full py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
                    업그레이드
                  </button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
