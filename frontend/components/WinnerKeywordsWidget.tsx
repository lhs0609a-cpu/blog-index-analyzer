'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Clock, TrendingUp, Sparkles, ChevronRight, Crown, Target, Zap, RefreshCw, Lock } from 'lucide-react'
import Link from 'next/link'
import {
  getQuickWinners,
  WinnerKeyword,
  getWinGradeColor,
  getWinGradeLabel,
  formatGoldenTime
} from '@/lib/api/winnerKeywords'
import { useAuthStore } from '@/lib/stores/auth'

interface WinnerKeywordsWidgetProps {
  blogId?: string
  className?: string
}

export default function WinnerKeywordsWidget({ blogId, className = '' }: WinnerKeywordsWidgetProps) {
  const { user, isAuthenticated } = useAuthStore()
  const [keywords, setKeywords] = useState<WinnerKeyword[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedKeyword, setSelectedKeyword] = useState<WinnerKeyword | null>(null)

  useEffect(() => {
    if (blogId) {
      loadKeywords()
    }
  }, [blogId])

  const loadKeywords = async () => {
    if (!blogId) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await getQuickWinners(blogId, 3)
      setKeywords(result.keywords)
      if (result.keywords.length > 0) {
        setSelectedKeyword(result.keywords[0])
      }
    } catch (err) {
      console.error('Failed to load winner keywords:', err)
      setError('키워드를 불러오는데 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 블로그 ID가 없으면 빈 상태 표시
  if (!blogId) {
    return (
      <div className={`rounded-2xl p-6 bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200/50 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">1위 가능 키워드</h3>
            <p className="text-xs text-gray-500">블로그를 먼저 분석해주세요</p>
          </div>
        </div>
        <Link
          href="/analyze"
          className="block w-full py-3 text-center rounded-xl bg-yellow-500 text-white font-semibold hover:bg-yellow-600 transition-colors"
        >
          블로그 분석하기
        </Link>
      </div>
    )
  }

  // 로딩 상태
  if (isLoading) {
    return (
      <div className={`rounded-2xl p-6 bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200/50 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center animate-pulse">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">1위 가능 키워드</h3>
            <p className="text-xs text-gray-500">분석 중...</p>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-white/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // 에러 상태
  if (error) {
    return (
      <div className={`rounded-2xl p-6 bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200/50 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">1위 가능 키워드</h3>
            <p className="text-xs text-red-500">{error}</p>
          </div>
        </div>
        <button
          onClick={loadKeywords}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-white border border-yellow-200 text-yellow-600 font-medium hover:bg-yellow-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          다시 시도
        </button>
      </div>
    )
  }

  // 키워드가 없을 때
  if (keywords.length === 0) {
    return (
      <div className={`rounded-2xl p-6 bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200/50 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">1위 가능 키워드</h3>
            <p className="text-xs text-gray-500">현재 1위 가능한 키워드를 찾지 못했습니다</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          블로그 레벨을 높이면 더 많은 키워드에서 1위가 가능해집니다.
        </p>
        <Link
          href="/keyword-search"
          className="block w-full py-3 text-center rounded-xl bg-yellow-500 text-white font-semibold hover:bg-yellow-600 transition-colors"
        >
          키워드 검색하기
        </Link>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl overflow-hidden bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200/50 shadow-lg ${className}`}
    >
      {/* 헤더 */}
      <div className="p-4 border-b border-yellow-200/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg shadow-yellow-500/30">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                오늘의 1위 가능 키워드
                <span className="px-2 py-0.5 text-xs bg-yellow-500 text-white rounded-full">
                  {keywords.length}개
                </span>
              </h3>
              <p className="text-xs text-gray-500">내 레벨로 지금 당장 1위 가능</p>
            </div>
          </div>
          <button
            onClick={loadKeywords}
            className="p-2 rounded-lg hover:bg-white/50 transition-colors"
            title="새로고침"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* 키워드 리스트 */}
      <div className="p-4 space-y-2">
        {keywords.map((keyword, index) => (
          <motion.button
            key={keyword.keyword}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => setSelectedKeyword(keyword)}
            className={`w-full p-3 rounded-xl text-left transition-all ${
              selectedKeyword?.keyword === keyword.keyword
                ? 'bg-white shadow-md border-2 border-yellow-400'
                : 'bg-white/70 hover:bg-white hover:shadow-sm border-2 border-transparent'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* 순위 배지 */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                  index === 0
                    ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white'
                    : index === 1
                    ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-white'
                    : 'bg-gradient-to-r from-orange-300 to-orange-400 text-white'
                }`}>
                  {index + 1}
                </div>

                <div>
                  <div className="font-semibold text-gray-900 text-sm">
                    {keyword.keyword}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">
                      월 {keyword.search_volume.toLocaleString()}회
                    </span>
                    {keyword.golden_time && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <Clock className="w-3 h-3" />
                        {formatGoldenTime(keyword.golden_time)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 1위 확률 */}
              <div className="text-right">
                <div className={`text-lg font-bold ${
                  keyword.win_probability >= 90
                    ? 'text-green-600'
                    : keyword.win_probability >= 70
                    ? 'text-blue-600'
                    : 'text-yellow-600'
                }`}>
                  {keyword.win_probability}%
                </div>
                <div className={`text-xs px-2 py-0.5 rounded-full ${getWinGradeColor(keyword.win_grade)}`}>
                  {getWinGradeLabel(keyword.win_grade)}
                </div>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* 선택된 키워드 상세 */}
      <AnimatePresence mode="wait">
        {selectedKeyword && (
          <motion.div
            key={selectedKeyword.keyword}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-yellow-200/50"
          >
            <div className="p-4 bg-white/50">
              {/* 왜 1위 가능한지 */}
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-yellow-500" />
                  왜 1위가 가능한가요?
                </h4>
                <ul className="space-y-1">
                  {selectedKeyword.why_winnable.slice(0, 3).map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="text-green-500 mt-0.5">✓</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 경쟁 정보 */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center p-2 bg-white rounded-lg">
                  <div className="text-lg font-bold text-gray-900">
                    Lv.{selectedKeyword.current_rank1_level}
                  </div>
                  <div className="text-xs text-gray-500">현재 1위</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <div className="text-lg font-bold text-blue-600">
                    Lv.{selectedKeyword.my_level}
                  </div>
                  <div className="text-xs text-gray-500">내 레벨</div>
                </div>
                <div className="text-center p-2 bg-white rounded-lg">
                  <div className={`text-lg font-bold ${
                    selectedKeyword.level_gap > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {selectedKeyword.level_gap > 0 ? '+' : ''}{selectedKeyword.level_gap}
                  </div>
                  <div className="text-xs text-gray-500">레벨 차이</div>
                </div>
              </div>

              {/* 팁 */}
              {selectedKeyword.tips.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <h4 className="text-xs font-semibold text-blue-700 mb-1">공략 팁</h4>
                  <p className="text-xs text-blue-600">{selectedKeyword.tips[0]}</p>
                </div>
              )}

              {/* CTA 버튼 */}
              <Link
                href={`/keyword-search?keyword=${encodeURIComponent(selectedKeyword.keyword)}`}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-semibold hover:shadow-lg transition-all"
              >
                <Target className="w-4 h-4" />
                이 키워드로 글쓰기
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pro 업그레이드 유도 */}
      {!user?.subscription_tier || user.subscription_tier === 'free' ? (
        <div className="p-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5" />
              <div>
                <div className="font-semibold text-sm">Pro로 매일 5개 추천받기</div>
                <div className="text-xs opacity-80">7일 무료 · 클릭 한 번 해지</div>
              </div>
            </div>
            <Link
              href="/pricing"
              className="px-4 py-2 bg-white text-purple-600 rounded-lg font-semibold text-sm hover:bg-purple-50 transition-colors"
            >
              무료 체험
            </Link>
          </div>
        </div>
      ) : null}
    </motion.div>
  )
}
