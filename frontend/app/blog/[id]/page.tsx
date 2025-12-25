'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Heart,
  MessageCircle,
  Eye,
  Calendar,
  Award,
  BarChart3,
  Sparkles,
  RefreshCw,
  Share2,
  Bookmark,
  ExternalLink,
  Loader2,
  FileText
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { getBlogDetails, analyzeBlog, pollJobStatus } from '@/lib/api/blog'
import type { BlogIndexResult } from '@/lib/types/api'
import toast from 'react-hot-toast'

export default function BlogDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const blogId = params.id as string
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<'posts' | 'analytics' | 'history' | 'breakdown'>(
    (tabParam as any) || 'posts'
  )
  const [blogData, setBlogData] = useState<BlogIndexResult | null>(null)
  const [breakdownData, setBreakdownData] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isReanalyzing, setIsReanalyzing] = useState(false)
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false)

  useEffect(() => {
    if (blogId) {
      loadBlogData()
    }
  }, [blogId])

  useEffect(() => {
    if (tabParam === 'breakdown' && blogId && !breakdownData) {
      loadBreakdownData()
    }
  }, [tabParam, blogId])

  useEffect(() => {
    if (activeTab === 'breakdown' && blogId && !breakdownData && !isLoadingBreakdown) {
      loadBreakdownData()
    }
  }, [activeTab, blogId])

  const loadBlogData = async () => {
    setIsLoading(true)
    try {
      const data = await getBlogDetails(blogId)
      setBlogData(data)
    } catch (error) {
      console.error('Failed to load blog data:', error)
      toast.error('블로그 정보를 불러올 수 없습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const loadBreakdownData = async () => {
    setIsLoadingBreakdown(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/blogs/${blogId}/score-breakdown`)
      if (!response.ok) {
        throw new Error('Failed to load breakdown data')
      }
      const data = await response.json()
      setBreakdownData(data)
    } catch (error) {
      console.error('Failed to load breakdown data:', error)
      toast.error('상세 분석 정보를 불러올 수 없습니다')
    } finally {
      setIsLoadingBreakdown(false)
    }
  }

  const handleReanalyze = async () => {
    setIsReanalyzing(true)
    try {
      const analysisResponse = await analyzeBlog({
        blog_id: blogId,
        post_limit: 10,
        quick_mode: false
      })

      toast.success('재분석을 시작했습니다!')

      const analysisResult = await pollJobStatus(analysisResponse.job_id)
      setBlogData(analysisResult)
      toast.success('재분석이 완료되었습니다!')
    } catch (error) {
      console.error('Reanalysis error:', error)
      toast.error('재분석 중 오류가 발생했습니다')
    } finally {
      setIsReanalyzing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="inline-flex p-6 rounded-full instagram-gradient mb-4"
          >
            <Sparkles className="w-12 h-12 text-white" />
          </motion.div>
          <p className="text-gray-600 text-lg">블로그 정보를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (!blogData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😢</div>
          <h2 className="text-2xl font-bold mb-2">블로그를 찾을 수 없습니다</h2>
          <p className="text-gray-600 mb-6">블로그 ID를 확인해주세요</p>
          <Link href="/analyze">
            <button className="px-8 py-4 rounded-full instagram-gradient text-white font-semibold hover:shadow-xl transition-all">
              블로그 분석하기
            </button>
          </Link>
        </div>
      </div>
    )
  }

  // 실제 API 데이터 사용 (가짜 데이터 제거)
  const displayData = {
    ...blogData,
    stats: {
      ...blogData.stats,
      avg_likes: blogData.stats.avg_likes || 0,
      avg_comments: blogData.stats.avg_comments || 0,
      posting_frequency: blogData.stats.posting_frequency || 0
    },
    recent_posts: blogData.recent_posts || [],
    history: blogData.history && blogData.history.length > 0
      ? blogData.history
      : [
          {
            date: new Date().toISOString().substring(0, 10),
            score: blogData.index.total_score,
            level: blogData.index.level
          }
        ]
  }

  // 실제 추천사항 생성 (API 응답 기반)
  const getImprovementTips = () => {
    const tips = []

    // 포스팅 수 기반 추천
    if ((blogData.stats.total_posts || 0) < 100) {
      tips.push({
        title: '포스팅 수 증가',
        description: `현재 ${blogData.stats.total_posts || 0}개의 포스트가 있습니다. 꾸준한 포스팅으로 콘텐츠 축적이 필요합니다.`,
        priority: 'high',
        impact: '+3.0 점'
      })
    }

    // 이웃 수 기반 추천
    if ((blogData.stats.neighbor_count || 0) < 200) {
      tips.push({
        title: '이웃 활동 강화',
        description: '이웃 블로그 방문 및 댓글 활동으로 커뮤니티 참여도를 높여보세요.',
        priority: 'medium',
        impact: '+2.0 점'
      })
    }

    // 점수 기반 추천
    if (blogData.index.total_score < 50) {
      tips.push({
        title: 'SEO 최적화',
        description: '제목과 본문에 핵심 키워드를 자연스럽게 배치하세요.',
        priority: 'high',
        impact: '+4.0 점'
      })
    }

    // 레벨 기반 추천
    if (blogData.index.level < 5) {
      tips.push({
        title: '콘텐츠 품질 향상',
        description: '이미지, 영상 등 멀티미디어를 활용하고 깊이 있는 콘텐츠를 작성하세요.',
        priority: 'medium',
        impact: '+2.5 점'
      })
    }

    // 기본 추천사항
    if (tips.length === 0) {
      tips.push({
        title: '현재 상태 유지',
        description: '블로그가 잘 운영되고 있습니다. 꾸준한 포스팅을 유지하세요!',
        priority: 'low',
        impact: '유지'
      })
    }

    return tips
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-3 rounded-full glass hover:bg-white/90 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">블로그 프로필</h1>
        </div>

        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-8 mb-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl" />

          <div className="relative">
            {/* Top Section */}
            <div className="flex items-start gap-6 mb-6">
              {/* Avatar */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="w-32 h-32 rounded-full instagram-gradient flex items-center justify-center text-6xl shadow-xl"
              >
                {displayData.blog.blog_name[0] || '📝'}
              </motion.div>

              {/* Stats */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-3xl font-bold">{displayData.blog.blog_name}</h2>
                  <a
                    href={displayData.blog.blog_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-full hover:bg-purple-100 transition-colors"
                  >
                    <ExternalLink className="w-5 h-5 text-purple-600" />
                  </a>
                </div>
                <p className="text-gray-600 mb-1">@{displayData.blog.blog_id}</p>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-6 mt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold gradient-text">{displayData.stats.total_posts}</div>
                    <div className="text-sm text-gray-600">포스트</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold gradient-text">{displayData.stats.total_visitors.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">방문자</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold gradient-text">{displayData.stats.neighbor_count}</div>
                    <div className="text-sm text-gray-600">이웃</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold gradient-text">{displayData.stats.posting_frequency}</div>
                    <div className="text-sm text-gray-600">주간 포스팅</div>
                  </div>
                </div>
              </div>

              {/* Level Badge */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.3 }}
                className="text-center"
              >
                <div className="inline-flex p-6 rounded-full instagram-gradient mb-3">
                  <Award className="w-12 h-12 text-white" />
                </div>
                <div className="text-4xl font-bold gradient-text mb-1">
                  Level {displayData.index.level}
                </div>
                <div className="text-sm text-gray-600 mb-2">Lv.{displayData.index.level}</div>
              </motion.div>
            </div>

            {/* Description */}
            <p className="text-gray-700 mb-6">{displayData.blog.description || `${displayData.blog.blog_name}의 블로그입니다.`}</p>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleReanalyze}
                disabled={isReanalyzing}
                className="flex-1 py-3 px-6 rounded-xl instagram-gradient text-white font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isReanalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    재분석 중...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    재분석
                  </>
                )}
              </button>
              <button className="py-3 px-6 rounded-xl bg-purple-100 text-purple-700 font-semibold hover:bg-purple-200 transition-colors flex items-center gap-2">
                <Share2 className="w-5 h-5" />
                공유
              </button>
              <button className="py-3 px-6 rounded-xl bg-purple-100 text-purple-700 font-semibold hover:bg-purple-200 transition-colors">
                <Bookmark className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Score Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-3xl p-8 mb-6"
        >
          <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-purple-600" />
            점수 상세
          </h3>

          <div className="grid md:grid-cols-5 gap-6">
            {Object.entries(displayData.index.score_breakdown).map(([key, value]: [string, any], index) => {
              const labels: Record<string, string> = {
                trust: '신뢰도',
                content: '콘텐츠',
                engagement: '참여도',
                seo: 'SEO',
                traffic: '트래픽'
              }

              const maxScores: Record<string, number> = {
                trust: 25,
                content: 30,
                engagement: 20,
                seo: 15,
                traffic: 10
              }

              const icons: Record<string, string> = {
                trust: '🏆',
                content: '📝',
                engagement: '❤️',
                seo: '🔍',
                traffic: '📈'
              }

              const percentage = (value / maxScores[key]) * 100

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="text-center p-6 rounded-2xl bg-gradient-to-br from-white/80 to-purple-50/50 border border-purple-100"
                >
                  <div className="text-4xl mb-3">{icons[key]}</div>
                  <div className="text-2xl font-bold gradient-text mb-1">
                    {value}<span className="text-lg text-gray-500">/{maxScores[key]}</span>
                  </div>
                  <div className="text-sm text-gray-600 mb-3">{labels[key]}</div>
                  <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ delay: 0.5 + index * 0.1, duration: 0.8 }}
                      className="absolute inset-y-0 left-0 instagram-gradient rounded-full"
                    />
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="glass rounded-t-3xl p-2 mb-0">
          <div className="flex gap-2">
            {[
              { id: 'posts', label: '최근 포스트', icon: MessageCircle },
              { id: 'analytics', label: '분석', icon: BarChart3 },
              { id: 'breakdown', label: '상세 분석', icon: FileText },
              { id: 'history', label: '히스토리', icon: Calendar }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                  activeTab === tab.id
                    ? 'instagram-gradient text-white'
                    : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {/* Posts Tab */}
          {activeTab === 'posts' && (
            <motion.div
              key="posts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass rounded-b-3xl rounded-t-none p-8"
            >
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayData.recent_posts.map((post, index) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ y: -5 }}
                    className="bg-white rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center text-8xl">
                      {post.thumbnail}
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <h4 className="font-bold text-lg mb-2 line-clamp-2">{post.title}</h4>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                        <Calendar className="w-4 h-4" />
                        {post.date}
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1 text-gray-600">
                          <Eye className="w-4 h-4" />
                          {post.views.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1 text-gray-600">
                          <Heart className="w-4 h-4" />
                          {post.likes}
                        </div>
                        <div className="flex items-center gap-1 text-gray-600">
                          <MessageCircle className="w-4 h-4" />
                          {post.comments}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass rounded-b-3xl rounded-t-none p-8"
            >
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50">
                  <div className="text-3xl mb-2">❤️</div>
                  <div className="text-2xl font-bold gradient-text mb-1">{displayData.stats.avg_likes}</div>
                  <div className="text-sm text-gray-600">평균 좋아요</div>
                </div>
                <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-pink-50 to-orange-50">
                  <div className="text-3xl mb-2">💬</div>
                  <div className="text-2xl font-bold gradient-text mb-1">{displayData.stats.avg_comments}</div>
                  <div className="text-sm text-gray-600">평균 댓글</div>
                </div>
                <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-orange-50 to-yellow-50">
                  <div className="text-3xl mb-2">📊</div>
                  <div className="text-2xl font-bold gradient-text mb-1">{displayData.index.percentile}%</div>
                  <div className="text-sm text-gray-600">상위 백분율</div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-bold text-xl mb-4">개선 포인트</h4>
                {getImprovementTips().map((tip, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-6 rounded-2xl border-l-4 ${
                      tip.priority === 'high'
                        ? 'bg-red-50 border-red-500'
                        : tip.priority === 'low'
                        ? 'bg-green-50 border-green-500'
                        : 'bg-orange-50 border-orange-500'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h5 className="font-bold text-lg">{tip.title}</h5>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold instagram-gradient text-white">
                        {tip.impact}
                      </span>
                    </div>
                    <p className="text-gray-700">{tip.description}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass rounded-b-3xl rounded-t-none p-8"
            >
              <h4 className="font-bold text-xl mb-6">점수 추이</h4>

              <div className="space-y-4">
                {displayData.history.map((record, index) => {
                  const isLatest = index === 0
                  const prevScore = index < displayData.history.length - 1 ? displayData.history[index + 1].score : record.score
                  const change = record.score - prevScore

                  return (
                    <motion.div
                      key={record.date}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`flex items-center gap-6 p-6 rounded-2xl ${
                        isLatest ? 'bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300' : 'bg-white'
                      }`}
                    >
                      <div className="text-center min-w-[100px]">
                        <div className="text-sm text-gray-600 mb-1">{record.date}</div>
                        {isLatest && (
                          <span className="inline-block px-2 py-1 rounded-full text-xs font-semibold instagram-gradient text-white">
                            최신
                          </span>
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <div className="text-2xl font-bold gradient-text">
                            Level {record.level}
                          </div>
                          <div className="text-xl font-bold text-gray-800">
                            {record.score} 점
                          </div>
                          {change !== 0 && (
                            <div className={`flex items-center gap-1 ${change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {change > 0 ? (
                                <TrendingUp className="w-4 h-4" />
                              ) : (
                                <TrendingDown className="w-4 h-4" />
                              )}
                              <span className="text-sm font-semibold">
                                {change > 0 ? '+' : ''}{change.toFixed(1)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${record.score}%` }}
                            transition={{ delay: 0.2 + index * 0.1, duration: 0.8 }}
                            className="absolute inset-y-0 left-0 instagram-gradient rounded-full"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Breakdown Tab */}
          {activeTab === 'breakdown' && (
            <motion.div
              key="breakdown"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass rounded-b-3xl rounded-t-none p-8"
            >
              {isLoadingBreakdown ? (
                <div className="text-center py-12">
                  <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
                  <p className="text-gray-600">상세 분석 데이터를 불러오는 중...</p>
                </div>
              ) : breakdownData ? (
                <div className="space-y-8">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="font-bold text-2xl">점수 상세 계산 과정</h4>
                    <div className="text-sm text-gray-500">
                      분석 대상: {breakdownData.blog_info?.blog_name}
                    </div>
                  </div>

                  {/* C-Rank Breakdown */}
                  {breakdownData.breakdown?.c_rank && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 rounded-xl bg-gradient-to-r from-purple-100 to-pink-100">
                          <Award className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                          <h5 className="text-xl font-bold">C-Rank (출처 신뢰도)</h5>
                          <p className="text-sm text-gray-600">
                            점수: {breakdownData.breakdown.c_rank.score}/100 (가중치 {breakdownData.breakdown.c_rank.weight}%)
                          </p>
                        </div>
                      </div>

                      {/* Context */}
                      {breakdownData.breakdown.c_rank.breakdown?.context && (
                        <div className="bg-white rounded-2xl p-6">
                          <h6 className="font-semibold text-lg mb-4 flex items-center gap-2">
                            📊 Context (주제 집중도) - {breakdownData.breakdown.c_rank.breakdown.context.score}/100
                          </h6>
                          <div className="space-y-4">
                            {Object.entries(breakdownData.breakdown.c_rank.breakdown.context.details).map(([key, detail]: [string, any]) => (
                              <div key={key} className="border-l-4 border-purple-300 pl-4 py-2">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-gray-700">{detail.description || key}</span>
                                  <span className="text-purple-600 font-semibold">
                                    {detail.score}/{detail.max_score}
                                  </span>
                                </div>
                                {detail.top_keyword && (
                                  <p className="text-sm text-gray-600">
                                    키워드: '{detail.top_keyword}' ({detail.keyword_count}회 등장)
                                  </p>
                                )}
                                {detail.avg_interval !== undefined && (
                                  <p className="text-sm text-gray-600">
                                    평균 간격: {detail.avg_interval}일, 편차: {detail.std_deviation}일
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Content */}
                      {breakdownData.breakdown.c_rank.breakdown?.content && (
                        <div className="bg-white rounded-2xl p-6">
                          <h6 className="font-semibold text-lg mb-4 flex items-center gap-2">
                            ✍️ Content (콘텐츠 품질) - {breakdownData.breakdown.c_rank.breakdown.content.score}/100
                          </h6>
                          <div className="space-y-4">
                            {Object.entries(breakdownData.breakdown.c_rank.breakdown.content.details).map(([key, detail]: [string, any]) => (
                              <div key={key} className="border-l-4 border-pink-300 pl-4 py-2">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-gray-700">{detail.description || key}</span>
                                  <span className="text-pink-600 font-semibold">
                                    {detail.score}/{detail.max_score}
                                  </span>
                                </div>
                                {detail.note && (
                                  <p className="text-xs text-gray-500 mt-1">{detail.note}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* D.I.A. Breakdown */}
                  {breakdownData.breakdown?.dia && (
                    <div className="space-y-6 mt-8">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 rounded-xl bg-gradient-to-r from-orange-100 to-yellow-100">
                          <Sparkles className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                          <h5 className="text-xl font-bold">D.I.A. (문서 품질)</h5>
                          <p className="text-sm text-gray-600">
                            점수: {breakdownData.breakdown.dia.score}/100 (가중치 {breakdownData.breakdown.dia.weight}%)
                          </p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        {Object.entries(breakdownData.breakdown.dia.breakdown).map(([key, section]: [string, any]) => {
                          const labels: Record<string, string> = {
                            topic_relevance: '주제 적합도',
                            experience: '경험 정보',
                            information_richness: '정보 충실성',
                            originality: '독창성',
                            timeliness: '적시성',
                            abuse_penalty: '어뷰징 감점'
                          }

                          const icons: Record<string, string> = {
                            topic_relevance: '🎯',
                            experience: '✨',
                            information_richness: '📚',
                            originality: '💡',
                            timeliness: '⏰',
                            abuse_penalty: '⚠️'
                          }

                          return (
                            <div key={key} className="bg-white rounded-2xl p-6">
                              <div className="flex items-center justify-between mb-3">
                                <h6 className="font-semibold flex items-center gap-2">
                                  <span className="text-2xl">{icons[key]}</span>
                                  {labels[key]}
                                </h6>
                                <span className={`font-bold ${section.weight < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {section.score.toFixed(1)}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mb-3">가중치: {section.weight}%</p>

                              {section.details && (
                                <div className="space-y-2 text-sm">
                                  <p className="text-gray-700">{section.details.description}</p>

                                  {section.details.examples && section.details.examples.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                      <p className="font-medium text-gray-700">예시:</p>
                                      {section.details.examples.map((example: any, idx: number) => (
                                        <div key={idx} className="bg-gray-50 rounded-lg p-3">
                                          <p className="font-medium text-gray-800 mb-1">{example.title}</p>
                                          {example.keywords && (
                                            <p className="text-xs text-gray-600">
                                              키워드: {example.keywords.join(', ')}
                                            </p>
                                          )}
                                          {example.matching_words && (
                                            <p className="text-xs text-gray-600">
                                              일치 단어: {example.matching_words.join(', ')}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {section.details.issues && (
                                    <div className="mt-3">
                                      <p className="font-medium text-red-700 mb-2">발견된 이슈:</p>
                                      <ul className="space-y-1">
                                        {section.details.issues.map((issue: string, idx: number) => (
                                          <li key={idx} className="text-red-600 text-xs flex items-start gap-2">
                                            <span>•</span>
                                            <span>{issue}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Blog Info */}
                  {breakdownData.blog_info && (
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6 mt-8">
                      <h6 className="font-semibold text-lg mb-4">분석 기준 정보</h6>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">포스트 수</p>
                          <p className="font-bold text-lg">{breakdownData.blog_info.total_posts}개</p>
                        </div>
                        <div>
                          <p className="text-gray-600">이웃 수</p>
                          <p className="font-bold text-lg">{breakdownData.blog_info.neighbor_count}명</p>
                        </div>
                        <div>
                          <p className="text-gray-600">총 방문자</p>
                          <p className="font-bold text-lg">{breakdownData.blog_info.total_visitors.toLocaleString()}명</p>
                        </div>
                        <div>
                          <p className="text-gray-600">운영 기간</p>
                          <p className="font-bold text-lg">{breakdownData.blog_info.blog_age_days}일</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600 mb-4">상세 분석 데이터가 없습니다</p>
                  <button
                    onClick={loadBreakdownData}
                    className="px-6 py-3 rounded-xl instagram-gradient text-white font-semibold hover:shadow-lg transition-all"
                  >
                    다시 불러오기
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
