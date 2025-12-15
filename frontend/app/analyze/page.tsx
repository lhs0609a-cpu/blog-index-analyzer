'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, Sparkles, TrendingUp, Award, Zap, AlertCircle, BarChart3, ArrowLeft } from 'lucide-react'
import Confetti from 'react-confetti'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWindowSize } from '@/lib/hooks/useWindowSize'
import { analyzeBlog, saveBlogToList } from '@/lib/api/blog'
import type { BlogIndexResult } from '@/lib/types/api'
import toast from 'react-hot-toast'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function AnalyzePage() {
  const router = useRouter()
  const [blogId, setBlogId] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<BlogIndexResult | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [progress, setProgress] = useState(0)
  const { width, height } = useWindowSize()

  const handleAnalyze = async () => {
    if (!blogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
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

        // Save to user's list
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
        })

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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 py-20">
      {showConfetti && <Confetti width={width} height={height} recycle={false} numberOfPieces={200} />}

      <div className="container mx-auto px-4">
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-lg transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">뒤로가기</span>
        </motion.button>

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
              className="inline-flex p-4 rounded-full instagram-gradient mb-6"
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
            className="glass rounded-3xl p-8 mb-8"
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
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg transition-all"
                  disabled={isAnalyzing}
                />
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !blogId.trim()}
                className="px-8 py-4 rounded-2xl instagram-gradient text-white font-semibold hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
              💡 <strong>예시:</strong> blog.naver.com/<span className="text-purple-600 font-semibold">example_blog</span> → example_blog 입력
            </div>
          </motion.div>

          {/* Loading State */}
          <AnimatePresence>
            {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="glass rounded-3xl p-12 text-center"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="inline-flex p-6 rounded-full instagram-gradient mb-6"
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
                        className="absolute inset-y-0 left-0 instagram-gradient rounded-full"
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
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
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
                <div className="glass rounded-3xl p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-purple-400/10 rounded-full blur-3xl" />

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
                      <div className="inline-flex p-8 rounded-full instagram-gradient shadow-2xl mb-6">
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
                        <div className="text-3xl font-bold text-gray-900 mb-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-100 to-pink-100">
                          {result.index.grade}
                        </div>
                        <div className="text-lg text-gray-600 mt-3 font-medium">{result.index.level_category}</div>

                        {/* 레벨 프로그레스 시각화 - 확대 버전 */}
                        <div className="mt-10 px-4">
                          {/* 레벨 구간 설명 - 대형 티어 카드 */}
                          <div className="grid grid-cols-4 gap-4 mb-10">
                            {[
                              { range: '1', label: '일반', color: 'bg-gray-400', textColor: 'text-gray-700', bgActive: 'bg-gray-50' },
                              { range: '2-8', label: '준최적화', color: 'bg-blue-500', textColor: 'text-blue-600', bgActive: 'bg-blue-50' },
                              { range: '9-11', label: '최적화', color: 'bg-purple-500', textColor: 'text-purple-600', bgActive: 'bg-purple-50' },
                              { range: '12-15', label: '찐최적화', color: 'bg-gradient-to-r from-pink-500 to-rose-500', textColor: 'text-pink-600', bgActive: 'bg-pink-50' },
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
                                      ? `${tier.bgActive} shadow-2xl scale-110 ring-3 ring-purple-400 border-2 border-purple-200`
                                      : 'bg-gray-100/60 opacity-60'
                                  }`}
                                >
                                  <div className={`w-8 h-8 rounded-full ${tier.color} mx-auto mb-3 ${isActive ? 'shadow-lg' : ''}`} />
                                  <div className={`text-xl font-bold ${isActive ? tier.textColor : 'text-gray-400'}`}>
                                    {tier.label}
                                  </div>
                                  <div className={`text-base mt-2 font-medium ${isActive ? 'text-gray-600' : 'text-gray-400'}`}>
                                    Lv.{tier.range}
                                  </div>
                                  {isActive && (
                                    <div className="mt-3">
                                      <span className="text-xs font-bold text-white bg-purple-500 px-3 py-1 rounded-full">
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
                              <div className="w-[20%] bg-gradient-to-r from-purple-400 to-purple-500" /> {/* Lv.9-11 */}
                              <div className="w-[26.67%] bg-gradient-to-r from-pink-400 via-pink-500 to-rose-500" /> {/* Lv.12-15 */}
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
                                  { nextTier: 'MAX', color: 'text-purple-700', bg: 'bg-purple-100' }

                                const pointsNeeded = Math.ceil((result.index.level + 1) * 6.67 - result.index.total_score)

                                return (
                                  <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl border border-purple-100 shadow-sm">
                                    <span className="text-base text-purple-600">
                                      다음 티어까지 <span className="font-bold text-lg">{pointsNeeded}점</span> 필요
                                    </span>
                                    <span className="text-purple-400 text-xl">→</span>
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

                {/* Score Breakdown */}
                <div className="glass rounded-3xl p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold flex items-center gap-2">
                      <TrendingUp className="w-6 h-6 text-purple-600" />
                      상세 점수
                    </h3>
                    <Link href={`/blog/${result.blog.blog_id}?tab=breakdown`}>
                      <button className="px-6 py-3 rounded-xl instagram-gradient text-white font-semibold hover:shadow-lg transition-all flex items-center gap-2">
                        <Sparkles className="w-5 h-5" />
                        상세 보기
                      </button>
                    </Link>
                  </div>

                  <div className="space-y-4">
                    {Object.entries(result.index.score_breakdown).map(([key, value]: [string, any], index) => {
                      const labels: Record<string, string> = {
                        c_rank: 'C-Rank (출처 신뢰도)',
                        dia: 'D.I.A. (문서 품질)'
                      }

                      const descriptions: Record<string, string> = {
                        c_rank: 'Context, Content, Chain, Creator',
                        dia: '주제 적합도, 경험 정보, 충실성, 독창성, 적시성'
                      }

                      // 모든 점수를 100점 만점으로 통일
                      const percentage = value

                      return (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 + index * 0.1 }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="font-semibold text-lg">{labels[key]}</div>
                              <div className="text-sm text-gray-500 mt-1">{descriptions[key]}</div>
                            </div>
                            <span className="text-purple-600 font-bold text-xl">
                              {value.toFixed(1)}/100
                            </span>
                          </div>
                          <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ delay: 0.7 + index * 0.1, duration: 0.5 }}
                              className="absolute inset-y-0 left-0 instagram-gradient rounded-full"
                            />
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>

                {/* Daily Visitors Chart */}
                {result.daily_visitors && result.daily_visitors.length > 0 && (
                  <div className="glass rounded-3xl p-8">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <BarChart3 className="w-6 h-6 text-purple-600" />
                      일일 방문자 (최근 15일)
                    </h3>

                    <div className="h-80">
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
                            dot={{ fill: '#8b5cf6', r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                          <defs>
                            <linearGradient id="colorGradient" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#8b5cf6" />
                              <stop offset="50%" stopColor="#ec4899" />
                              <stop offset="100%" stopColor="#f97316" />
                            </linearGradient>
                          </defs>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {result.recommendations.length > 0 && (
                  <div className="glass rounded-3xl p-8">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <Sparkles className="w-6 h-6 text-purple-600" />
                      개선 권장사항
                    </h3>

                    <div className="space-y-4">
                      {result.recommendations.map((rec: any, index: number) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.8 + index * 0.1 }}
                          className="p-6 rounded-2xl bg-purple-50 border-l-4 border-purple-500"
                        >
                          <div className="font-semibold text-purple-900 mb-3">{rec.message}</div>
                          {rec.actions && rec.actions.length > 0 && (
                            <ul className="space-y-2">
                              {rec.actions.map((action: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-gray-700">
                                  <span className="text-purple-500 mt-1">•</span>
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="glass rounded-3xl p-8">
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
                    className="px-8 py-4 rounded-full instagram-gradient text-white font-semibold hover:shadow-xl transition-all duration-300"
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
