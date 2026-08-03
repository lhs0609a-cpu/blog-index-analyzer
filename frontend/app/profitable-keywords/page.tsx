'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, DollarSign, Target, Clock, Sparkles, Crown,
  ChevronRight, RefreshCw, Lock, Filter, Search, Zap,
  ArrowUpRight, Gift, BarChart3
} from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import {
  getWinnableKeywords,
  getOpportunityKeywords,
  ProfitableKeyword,
  OpportunityKeyword,
  CategorySummary,
  formatRevenue,
  getProbabilityColor,
  getProbabilityBgColor,
  getTagColor,
  getUrgencyColor
} from '@/lib/api/profitableKeywords'

export default function ProfitableKeywordsPage() {
  const { user } = useAuthStore()
  const [blogId, setBlogId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 데이터
  const [keywords, setKeywords] = useState<ProfitableKeyword[]>([])
  const [opportunities, setOpportunities] = useState<OpportunityKeyword[]>([])
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [summary, setSummary] = useState({
    blogLevel: 0,
    totalWinnable: 0,
    totalRevenue: 0,
    planLimit: 10,
    upgradeToSee: 0
  })

  // 필터
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [sortBy, setSortBy] = useState<'revenue' | 'probability' | 'opportunity'>('revenue')

  // 선택된 키워드
  const [selectedKeyword, setSelectedKeyword] = useState<ProfitableKeyword | null>(null)

  const loadKeywords = async () => {
    if (!blogId) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await getWinnableKeywords(blogId, user?.id, {
        category: selectedCategory || undefined,
        sortBy,
        minWinProbability: 60
      })

      setKeywords(result.keywords)
      setCategories(result.categories)
      setSummary({
        blogLevel: result.blog_level,
        totalWinnable: result.total_winnable,
        totalRevenue: result.total_potential_revenue,
        planLimit: result.plan_limit,
        upgradeToSee: result.upgrade_to_see
      })

      if (result.keywords.length > 0) {
        setSelectedKeyword(result.keywords[0])
      }

      // 기회 키워드도 로드
      const oppResult = await getOpportunityKeywords(blogId, 5)
      setOpportunities(oppResult.opportunities)

    } catch (err) {
      console.error('Failed to load keywords:', err)
      setError('키워드를 불러오는데 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (blogId) {
      loadKeywords()
    }
  }, [blogId, selectedCategory, sortBy])

  // 블로그 ID 입력 전 상태
  if (!blogId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 pt-24">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-8"
            >
              <div className="w-20 h-20 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-200">
                <DollarSign className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3">
                <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                  내 블로그로 돈되는 키워드
                </span>
              </h1>
              <p className="text-gray-600">
                내 레벨로 1위 가능하고, 실제로 수익이 나는 키워드만 추천합니다
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl p-8 shadow-xl border border-orange-100"
            >
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  블로그 ID 입력
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="예: myblog123"
                    className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-400 focus:outline-none transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setBlogId((e.target as HTMLInputElement).value)
                      }
                    }}
                  />
                  <button
                    onClick={(e) => {
                      const input = (e.target as HTMLElement).parentElement?.querySelector('input')
                      if (input?.value) {
                        setBlogId(input.value)
                      }
                    }}
                    className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                  >
                    분석 시작
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-100">
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600">2,847+</div>
                  <div className="text-xs text-gray-500">분석 키워드</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">₩24M+</div>
                  <div className="text-xs text-gray-500">잠재 수익</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">94%</div>
                  <div className="text-xs text-gray-500">평균 1위 확률</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 pt-24">
      <div className="container mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                돈되는 키워드
              </span>
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Lv.{summary.blogLevel} 블로그로 {summary.totalWinnable.toLocaleString()}개 키워드에서 1위 가능
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadKeywords}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
            <button
              onClick={() => setBlogId('')}
              className="px-4 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-sm"
            >
              블로그 변경
            </button>
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-5 shadow-lg border border-amber-100"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Target className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-sm text-gray-500">1위 가능 키워드</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {summary.totalWinnable.toLocaleString()}개
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-5 shadow-lg border border-green-100"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-sm text-gray-500">전체 잠재 수익</div>
            </div>
            <div className="text-2xl font-bold text-green-600">
              {formatRevenue(summary.totalRevenue)}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-5 shadow-lg border border-blue-100"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-sm text-gray-500">내 레벨</div>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              Lv.{summary.blogLevel}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl p-5 shadow-lg border border-purple-100"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-sm text-gray-500">열람 가능</div>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {summary.planLimit}개
            </div>
          </motion.div>
        </div>

        {/* 실시간 기회 알림 */}
        {opportunities.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl p-6 mb-8 text-white"
          >
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5" />
              <h2 className="font-bold">실시간 기회 알림</h2>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {opportunities.slice(0, 3).map((opp, index) => (
                <div
                  key={index}
                  className="bg-white/20 backdrop-blur-sm rounded-xl p-4"
                >
                  <div className="font-semibold mb-1">{opp.keyword}</div>
                  <div className="text-sm opacity-90 mb-2">{opp.opportunity_reason}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      1위 확률 {opp.win_probability}%
                    </span>
                    <span className="font-bold">
                      {formatRevenue(opp.estimated_monthly_revenue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* 필터 */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-orange-400"
          >
            <option value="">전체 카테고리</option>
            {categories.map((cat) => (
              <option key={cat.category} value={cat.category}>
                {cat.category} ({cat.count}개)
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-orange-400"
          >
            <option value="revenue">수익순</option>
            <option value="probability">확률순</option>
            <option value="opportunity">기회점수순</option>
          </select>
        </div>

        {/* 메인 컨텐츠 */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* 키워드 목록 */}
          <div className="lg:col-span-2 space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : keywords.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  키워드가 없습니다
                </h3>
                <p className="text-gray-500 text-sm">
                  조건에 맞는 키워드가 없거나, 키워드 풀이 업데이트 중입니다.
                </p>
              </div>
            ) : (
              keywords.map((keyword, index) => (
                <motion.div
                  key={keyword.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedKeyword(keyword)}
                  className={`bg-white rounded-2xl p-6 cursor-pointer transition-all ${
                    selectedKeyword?.id === keyword.id
                      ? 'ring-2 ring-orange-400 shadow-lg'
                      : 'hover:shadow-md border border-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-gray-900">
                          {keyword.keyword}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {keyword.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span>월 {keyword.monthly_search_volume.toLocaleString()}회</span>
                        {keyword.search_trend > 1 && (
                          <span className="text-green-600 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            +{Math.round((keyword.search_trend - 1) * 100)}%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">
                        {formatRevenue(keyword.estimated_monthly_revenue)}
                      </div>
                      <div className="text-xs text-gray-500">/월 예상</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`px-3 py-1 rounded-full text-sm font-semibold ${getProbabilityBgColor(keyword.win_probability)} ${getProbabilityColor(keyword.win_probability)}`}>
                        1위 확률 {keyword.win_probability}%
                      </div>
                      <div className="text-sm text-gray-500">
                        현재 1위 Lv.{keyword.rank1_blog_level}
                        {keyword.level_gap > 0 && (
                          <span className="text-green-600 ml-1">
                            (내가 +{keyword.level_gap})
                          </span>
                        )}
                      </div>
                    </div>

                    {keyword.golden_time && (
                      <div className="flex items-center gap-1 text-sm text-amber-600">
                        <Clock className="w-4 h-4" />
                        {keyword.golden_time}
                      </div>
                    )}
                  </div>

                  {keyword.opportunity_tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {keyword.opportunity_tags.map((tag, i) => (
                        <span
                          key={i}
                          className={`text-xs px-2 py-1 rounded-full ${getTagColor(tag)}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))
            )}

            {/* 업그레이드 유도 */}
            {summary.upgradeToSee > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl p-6 text-white"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Lock className="w-5 h-5" />
                      <span className="font-bold">
                        {summary.upgradeToSee.toLocaleString()}개 키워드가 더 있습니다
                      </span>
                    </div>
                    <p className="text-sm opacity-90">
                      Pro 플랜으로 200개까지 확인하세요
                    </p>
                  </div>
                  <Link
                    href="/pricing"
                    className="px-6 py-3 bg-white text-purple-600 rounded-xl font-semibold hover:bg-purple-50 transition-colors"
                  >
                    업그레이드
                  </Link>
                </div>
              </motion.div>
            )}
          </div>

          {/* 키워드 상세 */}
          <div className="lg:col-span-1">
            <AnimatePresence mode="wait">
              {selectedKeyword && (
                <motion.div
                  key={selectedKeyword.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white rounded-2xl p-6 shadow-lg border border-orange-100 sticky top-24"
                >
                  <h3 className="text-xl font-bold mb-4">{selectedKeyword.keyword}</h3>

                  {/* 수익 분해 */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">예상 월 수익</h4>
                    <div className="text-3xl font-bold text-green-600 mb-3">
                      {formatRevenue(selectedKeyword.estimated_monthly_revenue)}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">광고 수익</span>
                        <span className="font-medium">{formatRevenue(selectedKeyword.ad_revenue)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">체험단/협찬</span>
                        <span className="font-medium">{formatRevenue(selectedKeyword.sponsorship_revenue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 경쟁 분석 */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">경쟁 분석</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-xl">
                        <div className="text-lg font-bold">Lv.{selectedKeyword.rank1_blog_level}</div>
                        <div className="text-xs text-gray-500">현재 1위</div>
                      </div>
                      <div className="text-center p-3 bg-blue-50 rounded-xl">
                        <div className="text-lg font-bold text-blue-600">Lv.{selectedKeyword.my_level}</div>
                        <div className="text-xs text-gray-500">내 레벨</div>
                      </div>
                    </div>
                    <div className="mt-3 p-3 bg-green-50 rounded-xl text-center">
                      <div className={`text-2xl font-bold ${getProbabilityColor(selectedKeyword.win_probability)}`}>
                        {selectedKeyword.win_probability}%
                      </div>
                      <div className="text-xs text-gray-500">1위 확률</div>
                    </div>
                  </div>

                  {/* 골든타임 */}
                  {selectedKeyword.golden_time && (
                    <div className="mb-6 p-4 bg-amber-50 rounded-xl">
                      <div className="flex items-center gap-2 text-amber-700 mb-1">
                        <Clock className="w-4 h-4" />
                        <span className="font-semibold">골든타임</span>
                      </div>
                      <div className="text-lg font-bold text-amber-600">
                        {selectedKeyword.golden_time}
                      </div>
                      <p className="text-xs text-amber-600 mt-1">
                        이 시간에 발행하면 상위노출 확률 UP
                      </p>
                    </div>
                  )}

                  {/* CTA */}
                  <Link
                    href={`/keyword-search?keyword=${encodeURIComponent(selectedKeyword.keyword)}`}
                    className="flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                  >
                    <Target className="w-5 h-5" />
                    이 키워드로 글쓰기
                    <ChevronRight className="w-5 h-5" />
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 카테고리 요약 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <h2 className="text-lg font-bold mb-4">카테고리별 기회</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {categories.map((cat) => (
              <button
                key={cat.category}
                onClick={() => setSelectedCategory(cat.category)}
                className={`p-4 rounded-xl text-left transition-all ${
                  selectedCategory === cat.category
                    ? 'bg-orange-500 text-white'
                    : 'bg-white border border-gray-200 hover:border-orange-300'
                }`}
              >
                <div className="font-bold">{cat.category}</div>
                <div className={`text-sm ${selectedCategory === cat.category ? 'text-orange-100' : 'text-gray-500'}`}>
                  {cat.count}개 키워드
                </div>
                <div className={`text-lg font-bold mt-2 ${selectedCategory === cat.category ? 'text-white' : 'text-green-600'}`}>
                  {formatRevenue(cat.total_revenue)}
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
