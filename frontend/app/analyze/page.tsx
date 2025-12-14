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
                          Level {result.index.level}
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-100 to-pink-100">
                          {result.index.grade}
                        </div>
                        <div className="text-lg text-gray-600 mt-3 font-medium">{result.index.level_category}</div>

                        {/* 티어 프로그레스 시각화 - 롤 스타일 */}
                        <div className="mt-10 px-4">
                          {/* 티어 카드 - 롤 스타일 */}
                          <div className="grid grid-cols-7 gap-2 mb-10">
                            {[
                              { range: [1, 2], label: 'Iron', labelKr: '아이언', color: 'bg-gradient-to-b from-gray-500 to-gray-700', textColor: 'text-gray-700', bgActive: 'bg-gray-100', ringColor: 'ring-gray-400' },
                              { range: [3, 4], label: 'Bronze', labelKr: '브론즈', color: 'bg-gradient-to-b from-amber-600 to-amber-800', textColor: 'text-amber-700', bgActive: 'bg-amber-50', ringColor: 'ring-amber-400' },
                              { range: [5, 6], label: 'Silver', labelKr: '실버', color: 'bg-gradient-to-b from-slate-300 to-slate-500', textColor: 'text-slate-600', bgActive: 'bg-slate-50', ringColor: 'ring-slate-400' },
                              { range: [7, 9], label: 'Gold', labelKr: '골드', color: 'bg-gradient-to-b from-yellow-400 to-yellow-600', textColor: 'text-yellow-700', bgActive: 'bg-yellow-50', ringColor: 'ring-yellow-400' },
                              { range: [10, 11], label: 'Platinum', labelKr: '플래티넘', color: 'bg-gradient-to-b from-teal-400 to-teal-600', textColor: 'text-teal-700', bgActive: 'bg-teal-50', ringColor: 'ring-teal-400' },
                              { range: [12, 13], label: 'Diamond', labelKr: '다이아', color: 'bg-gradient-to-b from-blue-400 to-purple-600', textColor: 'text-blue-700', bgActive: 'bg-blue-50', ringColor: 'ring-blue-400' },
                              { range: [14, 15], label: 'Challenger', labelKr: '챌린저', color: 'bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-500', textColor: 'text-orange-700', bgActive: 'bg-orange-50', ringColor: 'ring-orange-400' },
                            ].map((tier) => {
                              const currentLevel = result.index.level
                              const isActive = currentLevel >= tier.range[0] && currentLevel <= tier.range[1]

                              return (
                                <div
                                  key={tier.label}
                                  className={`text-center py-4 px-2 rounded-2xl transition-all duration-300 ${
                                    isActive
                                      ? `${tier.bgActive} shadow-2xl scale-110 ring-3 ${tier.ringColor} border-2 border-opacity-50`
                                      : 'bg-gray-100/60 opacity-50'
                                  }`}
                                >
                                  <div className={`w-10 h-10 rounded-full ${tier.color} mx-auto mb-2 ${isActive ? 'shadow-lg animate-pulse' : ''}`} />
                                  <div className={`text-sm font-bold ${isActive ? tier.textColor : 'text-gray-400'}`}>
                                    {tier.label}
                                  </div>
                                  <div className={`text-xs mt-1 ${isActive ? 'text-gray-600' : 'text-gray-400'}`}>
                                    {tier.labelKr}
                                  </div>
                                  {isActive && (
                                    <div className="mt-2">
                                      <span className="text-[10px] font-bold text-white bg-gradient-to-r from-purple-500 to-pink-500 px-2 py-0.5 rounded-full">
                                        현재
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* 프로그레스 바 - 롤 스타일 */}
                          <div className="relative py-6">
                            {/* 배경 바 */}
                            <div className="h-5 bg-gray-200 rounded-full overflow-hidden flex shadow-inner">
                              <div className="w-[13.3%] bg-gradient-to-r from-gray-500 to-gray-600" /> {/* Iron 1-2 */}
                              <div className="w-[13.3%] bg-gradient-to-r from-amber-600 to-amber-700" /> {/* Bronze 3-4 */}
                              <div className="w-[13.3%] bg-gradient-to-r from-slate-400 to-slate-500" /> {/* Silver 5-6 */}
                              <div className="w-[20%] bg-gradient-to-r from-yellow-400 to-yellow-500" /> {/* Gold 7-9 */}
                              <div className="w-[13.3%] bg-gradient-to-r from-teal-400 to-teal-500" /> {/* Platinum 10-11 */}
                              <div className="w-[13.3%] bg-gradient-to-r from-blue-400 to-purple-500" /> {/* Diamond 12-13 */}
                              <div className="w-[13.5%] bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500" /> {/* Challenger 14-15 */}
                            </div>

                            {/* 현재 레벨 마커 */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 transition-all duration-500"
                              style={{ left: `${((result.index.level - 1) / 14) * 100}%` }}
                            >
                              <div className="relative">
                                {/* 마커 */}
                                <div className="w-12 h-12 -ml-6 bg-white rounded-full shadow-2xl border-4 border-yellow-400 flex items-center justify-center ring-4 ring-yellow-200">
                                  <span className="text-lg font-bold text-gray-800">{result.index.level}</span>
                                </div>
                                {/* 라벨 */}
                                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-center">
                                  <div className="text-sm font-bold text-yellow-600 whitespace-nowrap bg-yellow-100 px-4 py-1.5 rounded-full shadow-md border border-yellow-200">
                                    현재
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 티어 눈금 */}
                          <div className="flex justify-between mt-12 px-2 text-xs text-gray-500 font-medium">
                            <span>Iron</span>
                            <span>Bronze</span>
                            <span>Silver</span>
                            <span>Gold</span>
                            <span>Platinum</span>
                            <span>Diamond</span>
                            <span>Challenger</span>
                          </div>

                          {/* 다음 티어 안내 */}
                          {result.index.level < 15 && (
                            <div className="mt-8 text-center">
                              {(() => {
                                const nextTierInfo = [
                                  { maxLevel: 2, nextTier: 'Bronze', nextTierKr: '브론즈', color: 'text-amber-700', bg: 'bg-amber-100' },
                                  { maxLevel: 4, nextTier: 'Silver', nextTierKr: '실버', color: 'text-slate-700', bg: 'bg-slate-100' },
                                  { maxLevel: 6, nextTier: 'Gold', nextTierKr: '골드', color: 'text-yellow-700', bg: 'bg-yellow-100' },
                                  { maxLevel: 9, nextTier: 'Platinum', nextTierKr: '플래티넘', color: 'text-teal-700', bg: 'bg-teal-100' },
                                  { maxLevel: 11, nextTier: 'Diamond', nextTierKr: '다이아', color: 'text-blue-700', bg: 'bg-blue-100' },
                                  { maxLevel: 13, nextTier: 'Challenger', nextTierKr: '챌린저', color: 'text-orange-700', bg: 'bg-orange-100' },
                                  { maxLevel: 15, nextTier: 'MAX', nextTierKr: '최고', color: 'text-purple-700', bg: 'bg-purple-100' },
                                ].find(t => result.index.level <= t.maxLevel)!

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
                      { label: '총점', value: `${result.index.total_score}/100`, icon: '🎯' },
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
