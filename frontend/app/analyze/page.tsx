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

                        {/* 15단계 레벨 시각화 */}
                        <div className="mt-6 px-4">
                          <div className="text-sm text-gray-500 mb-3 font-medium">레벨 위치</div>
                          <div className="flex items-center gap-1 justify-center">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((level) => {
                              const isCurrentLevel = level === result.index.level
                              let bgColor = 'bg-gray-300'
                              let label = ''

                              if (level === 1) {
                                bgColor = 'bg-gray-400'
                                label = '일반'
                              } else if (level >= 2 && level <= 8) {
                                bgColor = 'bg-blue-400'
                                if (level === 2) label = '준최적'
                              } else if (level >= 9 && level <= 11) {
                                bgColor = 'bg-purple-400'
                                if (level === 9) label = '엔비최적'
                              } else if (level >= 12 && level <= 15) {
                                bgColor = 'bg-pink-500'
                                if (level === 12) label = '찐최적'
                              }

                              return (
                                <div key={level} className="flex flex-col items-center">
                                  <div
                                    className={`
                                      w-8 h-8 rounded-lg transition-all duration-300
                                      ${isCurrentLevel
                                        ? 'ring-4 ring-yellow-400 scale-125 shadow-lg ' + bgColor
                                        : bgColor + ' opacity-60'
                                      }
                                      flex items-center justify-center
                                    `}
                                  >
                                    {isCurrentLevel && (
                                      <span className="text-white font-bold text-xs">{level}</span>
                                    )}
                                  </div>
                                  {label && (
                                    <div className="text-xs text-gray-600 mt-1 whitespace-nowrap font-medium">
                                      {label}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          <div className="flex justify-between mt-2 px-1">
                            <span className="text-xs text-gray-500">Lv.1</span>
                            <span className="text-xs text-gray-500">Lv.15</span>
                          </div>
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
