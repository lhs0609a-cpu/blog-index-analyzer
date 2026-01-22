'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, Sparkles, TrendingUp, Award, Zap, AlertCircle, BarChart3, ArrowLeft, Target, PenTool, Lightbulb, ChevronRight, Lock, HelpCircle } from 'lucide-react'
import Confetti from 'react-confetti'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWindowSize } from '@/lib/hooks/useWindowSize'
import { analyzeBlog, saveBlogToList } from '@/lib/api/blog'
import type { BlogIndexResult } from '@/lib/types/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { incrementUsage, checkUsageLimit } from '@/lib/api/subscription'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function AnalyzePage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const [blogId, setBlogId] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<BlogIndexResult | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [progress, setProgress] = useState(0)
  const { width, height } = useWindowSize()

  // 무료 플랜 체크 (비로그인 또는 free 플랜)
  const isPremium = isAuthenticated && user?.plan && user.plan !== 'free'
  const isFreeUser = !isPremium

  const handleAnalyze = async () => {
    if (!blogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    // 로그인한 사용자인 경우 사용량 체크 및 차감
    if (isAuthenticated && user?.id) {
      try {
        const usageCheck = await checkUsageLimit(user.id, 'blog_analysis')
        if (!usageCheck.allowed) {
          toast.error(`일일 블로그 분석 한도(${usageCheck.limit}회)에 도달했습니다. 업그레이드를 고려해주세요.`)
          return
        }
        // 사용량 차감
        await incrementUsage(user.id, 'blog_analysis')
      } catch (err) {
        console.error('Usage tracking error:', err)
        // 사용량 추적 실패 시에도 분석은 진행
      }
    }

    setIsAnalyzing(true)
    setResult(null)
    setProgress(0)

    try {
      // 동기 방식: 분석 결과 즉시 반환
      const analysisResponse = await analyzeBlog({
        blog_id: blogId.trim(),
        post_limit: 10,
        quick_mode: false
      })

      // 분석 결과가 response에 포함되어 있음
      if (analysisResponse.result) {
        const analysisResult = analysisResponse.result

        // Save to user's list (user?.id를 전달하여 로그인 사용자는 서버에 저장)
        await saveBlogToList({
          id: analysisResult.blog.blog_id,
          blog_id: analysisResult.blog.blog_id,
          name: analysisResult.blog.blog_name,
          level: analysisResult.index.level,
          grade: analysisResult.index.grade,
          score: analysisResult.index.total_score,
          change: 0, // First analysis
          stats: {
            posts: analysisResult.stats.total_posts,
            visitors: analysisResult.stats.total_visitors,
            engagement: analysisResult.stats.neighbor_count
          },
          last_analyzed: new Date().toISOString()
        }, user?.id)

        setResult(analysisResult)
        toast.success('분석이 완료되었습니다!')

        // Show confetti for high scores
        if (analysisResult.index.level >= 7) {
          setShowConfetti(true)
          setTimeout(() => setShowConfetti(false), 5000)
        }
      } else {
        toast.error('분석 결과를 받지 못했습니다.')
      }
    } catch (error) {
      console.error('Analysis error:', error)
      toast.error('분석 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsAnalyzing(false)
      setProgress(0)
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa] pt-24 pb-12">
      {showConfetti && <Confetti width={width} height={height} recycle={false} numberOfPieces={200} />}

      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="inline-flex p-4 rounded-full bg-[#0064FF] mb-6 shadow-lg shadow-[#0064FF]/15"
            >
              <Sparkles className="w-8 h-8 text-white" />
            </motion.div>

            <h1 className="text-5xl font-bold mb-4">
              <span className="gradient-text">블로그 분석</span>
            </h1>
            <p className="text-gray-600 text-lg">
              블로그 ID를 입력하고 지수를 확인하세요
            </p>
          </div>

          {/* Search Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-3xl p-8 mb-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50"
          >
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={blogId}
                  onChange={(e) => setBlogId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAnalyze()}
                  placeholder="블로그 ID 입력 (예: example_blog)"
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-200 focus:border-[#0064FF] focus:outline-none text-lg transition-all"
                  disabled={isAnalyzing}
                />
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !blogId.trim()}
                className="px-8 py-4 rounded-2xl bg-[#0064FF] text-white font-semibold hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    분석중...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    분석하기
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-500">
              💡 <strong>예시:</strong> blog.naver.com/<span className="text-[#0064FF] font-semibold">example_blog</span> → example_blog 입력
            </div>
          </motion.div>

          {/* Loading State */}
          <AnimatePresence>
            {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="rounded-3xl p-12 text-center bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="inline-flex p-6 rounded-full bg-[#0064FF] mb-6 shadow-lg shadow-[#0064FF]/15"
                >
                  <Sparkles className="w-12 h-12 text-white" />
                </motion.div>

                <h3 className="text-2xl font-bold mb-2">AI가 분석중입니다</h3>
                <p className="text-gray-600">40+ 지표를 종합 분석하고 있어요...</p>

                {progress > 0 && (
                  <div className="mt-6 w-full max-w-md mx-auto">
                    <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-full"
                      />
                    </div>
                    <p className="text-center text-sm text-gray-600 mt-2">{progress}% 완료</p>
                  </div>
                )}

                <div className="mt-8 space-y-3">
                  {['블로그 정보 수집', '콘텐츠 품질 분석', '지수 계산'].map((step, index) => (
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.5 }}
                      className="flex items-center gap-3"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#0064FF]" />
                      <span className="text-gray-700">{step}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results */}
          <AnimatePresence>
            {result && !isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Score Card */}
                <div className="rounded-3xl p-8 relative overflow-hidden bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#0064FF]/10 rounded-full blur-3xl" />

                  <div className="relative flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-bold mb-2">{result.blog.blog_name}</h2>
                      <p className="text-gray-600">@{result.blog.blog_id}</p>
                    </div>

                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.3 }}
                      className="text-center"
                    >
                      <div className="inline-flex p-8 rounded-full bg-[#0064FF] shadow-2xl mb-6 shadow-[#0064FF]/25">
                        <Award className="w-16 h-16 text-white" />
                      </div>
                      <div className="mt-4">
                        <div className="text-6xl font-black gradient-text mb-4">
                          {(() => {
                            const level = result.index.level
                            if (level <= 2) return 'Iron'
                            if (level <= 4) return 'Bronze'
                            if (level <= 6) return 'Silver'
                            if (level <= 9) return 'Gold'
                            if (level <= 11) return 'Platinum'
                            if (level <= 13) return 'Diamond'
                            return 'Challenger'
                          })()}
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#0064FF]/10 to-[#3182F6]/10">
                          Lv.{result.index.level}
                        </div>

                        {/* 레벨 프로그레스 시각화 - 확대 버전 */}
                        <div className="mt-10 px-4">
                          {/* 레벨 구간 설명 - 대형 티어 카드 */}
                          <div className="grid grid-cols-4 gap-4 mb-10">
                            {[
                              { range: '1', label: 'Lv.1', color: 'bg-gray-400', textColor: 'text-gray-700', bgActive: 'bg-gray-50' },
                              { range: '2-8', label: 'Lv.2~8', color: 'bg-blue-500', textColor: 'text-blue-600', bgActive: 'bg-blue-50' },
                              { range: '9-11', label: 'Lv.9~11', color: 'bg-[#0064FF]', textColor: 'text-[#0064FF]', bgActive: 'bg-blue-50' },
                              { range: '12-15', label: 'Lv.12~15', color: 'bg-gradient-to-r from-[#0064FF] to-[#3182F6]', textColor: 'text-[#0064FF]', bgActive: 'bg-blue-50' },
                            ].map((tier) => {
                              const currentLevel = result.index.level
                              const isActive = (tier.range === '1' && currentLevel === 1) ||
                                (tier.range === '2-8' && currentLevel >= 2 && currentLevel <= 8) ||
                                (tier.range === '9-11' && currentLevel >= 9 && currentLevel <= 11) ||
                                (tier.range === '12-15' && currentLevel >= 12 && currentLevel <= 15)

                              return (
                                <div
                                  key={tier.range}
                                  className={`text-center py-6 px-3 rounded-3xl transition-all duration-300 ${
                                    isActive
                                      ? `${tier.bgActive} shadow-2xl scale-110 ring-3 ring-[#0064FF] border-2 border-blue-200`
                                      : 'bg-gray-100/60 opacity-60'
                                  }`}
                                >
                                  <div className={`w-8 h-8 rounded-full ${tier.color} mx-auto mb-3 ${isActive ? 'shadow-lg' : ''}`} />
                                  <div className={`text-xl font-bold ${isActive ? tier.textColor : 'text-gray-400'}`}>
                                    {tier.label}
                                  </div>

                                  {isActive && (
                                    <div className="mt-3">
                                      <span className="text-xs font-bold text-white bg-[#0064FF] px-3 py-1 rounded-full">
                                        현재 티어
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* 프로그레스 바 - 크게 */}
                          <div className="relative py-6">
                            {/* 배경 바 */}
                            <div className="h-5 bg-gray-200 rounded-full overflow-hidden flex shadow-inner">
                              <div className="w-[6.67%] bg-gray-400" /> {/* Lv.1 */}
                              <div className="w-[46.67%] bg-gradient-to-r from-blue-400 to-blue-500" /> {/* Lv.2-8 */}
                              <div className="w-[20%] bg-gradient-to-r from-[#0064FF] to-[#3182F6]" /> {/* Lv.9-11 */}
                              <div className="w-[26.67%] bg-gradient-to-r from-[#0064FF] via-[#3182F6] to-[#4A9AF8]" /> {/* Lv.12-15 */}
                            </div>

                            {/* 현재 레벨 마커 */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 transition-all duration-500"
                              style={{ left: `${((result.index.level - 1) / 14) * 100}%` }}
                            >
                              <div className="relative">
                                {/* 마커 - 더 크게 */}
                                <div className="w-12 h-12 -ml-6 bg-white rounded-full shadow-2xl border-4 border-yellow-400 flex items-center justify-center ring-4 ring-yellow-200">
                                  <span className="text-lg font-bold text-gray-800">{result.index.level}</span>
                                </div>
                                {/* 라벨 */}
                                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-center">
                                  <div className="text-sm font-bold text-yellow-600 whitespace-nowrap bg-yellow-100 px-4 py-1.5 rounded-full shadow-md border border-yellow-200">
                                    현재 레벨
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 레벨 눈금 - 더 크게 */}
                          <div className="flex justify-between mt-12 px-2">
                            <span className="text-sm text-gray-500 font-semibold">1</span>
                            <span className="text-sm text-gray-500 font-semibold">5</span>
                            <span className="text-sm text-gray-500 font-semibold">8</span>
                            <span className="text-sm text-gray-500 font-semibold">11</span>
                            <span className="text-sm text-gray-500 font-semibold">15</span>
                          </div>

                          {/* 다음 티어 안내 - 롤 스타일 */}
                          {result.index.level < 15 && (
                            <div className="mt-8 text-center">
                              {(() => {
                                const level = result.index.level
                                const nextTierInfo =
                                  level <= 2 ? { nextTier: 'Bronze', color: 'text-amber-700', bg: 'bg-amber-100' } :
                                  level <= 4 ? { nextTier: 'Silver', color: 'text-slate-700', bg: 'bg-slate-100' } :
                                  level <= 6 ? { nextTier: 'Gold', color: 'text-yellow-700', bg: 'bg-yellow-100' } :
                                  level <= 9 ? { nextTier: 'Platinum', color: 'text-teal-700', bg: 'bg-teal-100' } :
                                  level <= 11 ? { nextTier: 'Diamond', color: 'text-blue-700', bg: 'bg-blue-100' } :
                                  level <= 13 ? { nextTier: 'Challenger', color: 'text-orange-700', bg: 'bg-orange-100' } :
                                  { nextTier: 'MAX', color: 'text-[#0064FF]', bg: 'bg-blue-100' }

                                const pointsNeeded = Math.ceil((result.index.level + 1) * 6.67 - result.index.total_score)

                                return (
                                  <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-[#0064FF]/5 to-[#3182F6]/10 rounded-2xl border border-blue-100 shadow-sm">
                                    <span className="text-base text-[#0064FF]">
                                      다음 티어까지 <span className="font-bold text-lg">{pointsNeeded}점</span> 필요
                                    </span>
                                    <span className="text-[#3182F6] text-xl">→</span>
                                    <span className={`text-lg font-bold ${nextTierInfo.color} ${nextTierInfo.bg} px-3 py-1 rounded-lg`}>
                                      {nextTierInfo.nextTier}
                                    </span>
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: '총점', value: `${(result.index.total_score * 10).toFixed(1)}/1000`, icon: '🎯' },
                      { label: '포스트', value: result.stats.total_posts, icon: '📝' },
                      { label: '방문자', value: result.stats.total_visitors.toLocaleString(), icon: '👥' },
                      { label: '이웃', value: result.stats.neighbor_count, icon: '❤️' },
                    ].map((stat, index) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 + index * 0.1 }}
                        className="text-center p-4 rounded-2xl bg-white/50"
                      >
                        <div className="text-3xl mb-2">{stat.icon}</div>
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <div className="text-sm text-gray-600">{stat.label}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Score Breakdown - 용어 쉽게 변경 + 툴팁 */}
                <div className="rounded-3xl p-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold flex items-center gap-2">
                      <TrendingUp className="w-6 h-6 text-[#0064FF]" />
                      핵심 지표 분석
                    </h3>
                    <Link href={`/blog/${result.blog.blog_id}?tab=breakdown`}>
                      <button className="px-6 py-3 rounded-xl bg-[#0064FF] text-white font-semibold hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all flex items-center gap-2">
                        <Sparkles className="w-5 h-5" />
                        상세 보기
                      </button>
                    </Link>
                  </div>

                  <div className="space-y-6">
                    {Object.entries(result.index.score_breakdown).map(([key, value]: [string, any], index) => {
                      const labels: Record<string, { name: string; simple: string; tooltip: string }> = {
                        c_rank: {
                          name: '네이버 신뢰점수',
                          simple: '블로그 신뢰도',
                          tooltip: '네이버가 블로그를 얼마나 신뢰하는지 나타내는 점수입니다. 주제 일관성, 콘텐츠 품질, 활동 이력, 운영자 신뢰도를 종합 평가합니다.'
                        },
                        dia: {
                          name: '문서 품질점수',
                          simple: '글 퀄리티',
                          tooltip: '개별 글의 품질을 평가하는 점수입니다. 주제 적합도, 경험/정보 풍부함, 독창성, 최신성을 기준으로 측정합니다.'
                        }
                      }

                      const percentage = value
                      const scoreLevel = percentage >= 80 ? '최상' : percentage >= 60 ? '양호' : percentage >= 40 ? '보통' : '개선필요'
                      const scoreColor = percentage >= 80 ? 'text-green-600' : percentage >= 60 ? 'text-blue-600' : percentage >= 40 ? 'text-yellow-600' : 'text-red-600'

                      return (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 + index * 0.1 }}
                          className="bg-white/50 rounded-2xl p-5"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-lg text-gray-900">{labels[key].name}</span>
                                <div className="group relative">
                                  <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                                  <div className="absolute left-0 bottom-full mb-2 w-72 p-3 bg-gray-900 text-white text-sm rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-xl">
                                    {labels[key].tooltip}
                                    <div className="absolute left-4 top-full border-8 border-transparent border-t-gray-900" />
                                  </div>
                                </div>
                              </div>
                              <div className="text-sm text-gray-500">{labels[key].simple}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-[#0064FF]">
                                {value.toFixed(0)}점
                              </div>
                              <div className={`text-sm font-medium ${scoreColor}`}>
                                {scoreLevel}
                              </div>
                            </div>
                          </div>
                          <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ delay: 0.7 + index * 0.1, duration: 0.5 }}
                              className={`absolute inset-y-0 left-0 rounded-full ${
                                percentage >= 80 ? 'bg-gradient-to-r from-green-500 to-green-400' :
                                percentage >= 60 ? 'bg-gradient-to-r from-[#0064FF] to-[#3182F6]' :
                                percentage >= 40 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
                                'bg-gradient-to-r from-red-500 to-red-400'
                              }`}
                            />
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>

                {/* Daily Visitors Chart - 무료 플랜 블러 처리 */}
                {result.daily_visitors && result.daily_visitors.length > 0 && (
                  <div className="rounded-3xl p-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50 relative overflow-hidden">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <BarChart3 className="w-6 h-6 text-[#0064FF]" />
                      일일 방문자 (최근 15일)
                      {isFreeUser && (
                        <span className="ml-2 px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                          Pro 전용
                        </span>
                      )}
                    </h3>

                    <div className={`h-80 ${isFreeUser ? 'blur-md select-none pointer-events-none' : ''}`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={result.daily_visitors}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="date"
                            stroke="#6b7280"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => {
                              const date = new Date(value)
                              return `${date.getMonth() + 1}/${date.getDate()}`
                            }}
                          />
                          <YAxis
                            stroke="#6b7280"
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(255, 255, 255, 0.95)',
                              border: '1px solid #e5e7eb',
                              borderRadius: '12px',
                              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                            }}
                            labelFormatter={(value) => {
                              const date = new Date(value)
                              return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
                            }}
                            formatter={(value: any) => [`${value.toLocaleString()}명`, '방문자']}
                          />
                          <Line
                            type="monotone"
                            dataKey="visitors"
                            stroke="url(#colorGradient)"
                            strokeWidth={3}
                            dot={{ fill: '#0064FF', r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                          <defs>
                            <linearGradient id="colorGradient" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#0064FF" />
                              <stop offset="50%" stopColor="#3182F6" />
                              <stop offset="100%" stopColor="#4A9AF8" />
                            </linearGradient>
                          </defs>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* 무료 플랜 업그레이드 오버레이 */}
                    {isFreeUser && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/30 backdrop-blur-[2px]">
                        <div className="text-center p-8 max-w-sm">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#0064FF] to-[#3182F6] flex items-center justify-center">
                            <Lock className="w-8 h-8 text-white" />
                          </div>
                          <h4 className="text-xl font-bold text-gray-900 mb-2">
                            상세 방문자 추이 확인
                          </h4>
                          <p className="text-gray-600 text-sm mb-4">
                            Pro 플랜에서 일일 방문자 추이를 확인하고 블로그 성장 패턴을 분석하세요
                          </p>
                          <Link href="/pricing">
                            <button className="px-6 py-3 bg-[#0064FF] text-white font-semibold rounded-xl hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all">
                              Pro 플랜 알아보기
                            </button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Recommendations - 무료 플랜은 1개만 표시 */}
                {result.recommendations.length > 0 && (
                  <div className="rounded-3xl p-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50 relative overflow-hidden">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <Sparkles className="w-6 h-6 text-[#0064FF]" />
                      개선 권장사항
                      {isFreeUser && result.recommendations.length > 1 && (
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          (1/{result.recommendations.length}개 표시)
                        </span>
                      )}
                    </h3>

                    <div className="space-y-4">
                      {/* 무료 플랜: 첫 번째 권장사항만 표시 */}
                      {(isFreeUser ? result.recommendations.slice(0, 1) : result.recommendations).map((rec: any, index: number) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.8 + index * 0.1 }}
                          className="p-6 rounded-2xl bg-blue-50 border-l-4 border-[#0064FF]"
                        >
                          <div className="font-semibold text-blue-900 mb-3">{rec.message}</div>
                          {rec.actions && rec.actions.length > 0 && (
                            <ul className="space-y-2">
                              {rec.actions.map((action: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-gray-700">
                                  <span className="text-[#0064FF] mt-1">•</span>
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </motion.div>
                      ))}

                      {/* 무료 플랜: 나머지 권장사항 블러 처리 */}
                      {isFreeUser && result.recommendations.length > 1 && (
                        <div className="relative">
                          <div className="blur-md select-none pointer-events-none">
                            <div className="p-6 rounded-2xl bg-blue-50 border-l-4 border-gray-300">
                              <div className="font-semibold text-gray-400 mb-3">추가 개선 권장사항이 있습니다...</div>
                              <div className="space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                              </div>
                            </div>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-white/90 rounded-xl p-4 shadow-lg text-center">
                              <Lock className="w-5 h-5 text-[#0064FF] mx-auto mb-2" />
                              <p className="text-sm text-gray-700 mb-2">
                                +{result.recommendations.length - 1}개 권장사항 더보기
                              </p>
                              <Link href="/pricing">
                                <button className="text-sm text-[#0064FF] font-medium hover:underline">
                                  Pro 플랜 업그레이드 →
                                </button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="rounded-3xl p-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <AlertCircle className="w-6 h-6 text-orange-600" />
                      주의사항
                    </h3>

                    <div className="space-y-3">
                      {result.warnings.map((warning: any, index: number) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.9 + index * 0.1 }}
                          className="p-4 rounded-2xl bg-orange-50 border-l-4 border-orange-500 text-orange-900"
                        >
                          {warning.message}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 다음 액션 - P0 핵심 기능 */}
                <div className="rounded-3xl p-8 bg-gradient-to-br from-[#0064FF]/5 to-blue-50 border-2 border-[#0064FF]/20 shadow-xl">
                  <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                    <Target className="w-6 h-6 text-[#0064FF]" />
                    지금 바로 할 수 있는 액션
                  </h3>
                  <p className="text-gray-600 mb-6">분석 결과를 바탕으로 추천드리는 다음 단계입니다</p>

                  <div className="grid md:grid-cols-3 gap-4">
                    {/* 액션 1: 키워드 검색 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.0 }}
                      whileHover={{ scale: 1.02 }}
                      className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-[#0064FF]/30 hover:shadow-lg transition-all cursor-pointer"
                    >
                      <Link href="/keyword-search" className="block">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0064FF] to-[#3182F6] flex items-center justify-center mb-4">
                          <Search className="w-6 h-6 text-white" />
                        </div>
                        <h4 className="font-bold text-lg mb-2">키워드 경쟁력 분석</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          {result.index.level >= 5
                            ? '현재 레벨에서 상위 노출 가능한 키워드를 찾아보세요'
                            : '경쟁이 낮은 블루오션 키워드부터 공략하세요'
                          }
                        </p>
                        <div className="flex items-center text-[#0064FF] font-medium text-sm">
                          키워드 검색하기 <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                      </Link>
                    </motion.div>

                    {/* 액션 2: AI 글쓰기 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.1 }}
                      whileHover={{ scale: 1.02 }}
                      className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-[#0064FF]/30 hover:shadow-lg transition-all cursor-pointer"
                    >
                      <Link href="/tools" className="block">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
                          <PenTool className="w-6 h-6 text-white" />
                        </div>
                        <h4 className="font-bold text-lg mb-2">AI 글쓰기 도움</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          {result.index.score_breakdown.dia < 60
                            ? '문서 품질을 높이는 글쓰기 가이드를 받아보세요'
                            : 'AI로 더 빠르게 고품질 콘텐츠를 작성하세요'
                          }
                        </p>
                        <div className="flex items-center text-purple-600 font-medium text-sm">
                          AI 도구 보기 <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                      </Link>
                    </motion.div>

                    {/* 액션 3: 상세 분석 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.2 }}
                      whileHover={{ scale: 1.02 }}
                      className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-[#0064FF]/30 hover:shadow-lg transition-all cursor-pointer"
                    >
                      <Link href={`/blog/${result.blog.blog_id}?tab=breakdown`} className="block">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-4">
                          <Lightbulb className="w-6 h-6 text-white" />
                        </div>
                        <h4 className="font-bold text-lg mb-2">상세 점수 분석</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          어떤 부분에서 점수를 잃고 있는지 구체적으로 확인하세요
                        </p>
                        <div className="flex items-center text-amber-600 font-medium text-sm">
                          상세 분석 보기 <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                      </Link>
                    </motion.div>
                  </div>

                  {/* 레벨별 맞춤 팁 */}
                  <div className="mt-6 p-4 bg-white/80 rounded-xl border border-blue-100">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-[#0064FF]/10">
                        <Sparkles className="w-5 h-5 text-[#0064FF]" />
                      </div>
                      <div>
                        <h5 className="font-bold text-gray-900 mb-1">
                          Lv.{result.index.level} 맞춤 성장 전략
                        </h5>
                        <p className="text-sm text-gray-600">
                          {result.index.level <= 3 && '기초 다지기 단계입니다. 꾸준한 포스팅과 이웃 활동으로 블로그 신뢰도를 쌓아보세요. 주 2-3회 포스팅을 목표로 해보세요.'}
                          {result.index.level >= 4 && result.index.level <= 6 && '성장 가속 단계입니다. 특정 주제에 집중하여 전문성을 높이고, 검색 유입을 늘려보세요. 키워드 분석 도구를 적극 활용하세요.'}
                          {result.index.level >= 7 && result.index.level <= 9 && '경쟁력 확보 단계입니다. 상위 노출 키워드를 공략하고, 콘텐츠 품질을 더욱 높여보세요. 방문자 유입 분석도 중요합니다.'}
                          {result.index.level >= 10 && '전문가 단계입니다. 브랜딩과 수익화를 고민해보세요. 다양한 채널 연동으로 영향력을 확장할 수 있습니다.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1 }}
                  className="text-center py-8"
                >
                  <button
                    onClick={() => {
                      setBlogId('')
                      setResult(null)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="px-8 py-4 rounded-full bg-[#0064FF] text-white font-semibold hover:shadow-xl shadow-lg shadow-[#0064FF]/15 transition-all duration-300"
                  >
                    다른 블로그 분석하기
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
