'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  BookOpen,
  BarChart2,
  FileText,
  Image,
  Video,
  Map,
  Link2,
  RefreshCw,
  Copy,
  Check,
  TrendingUp,
  AlertCircle,
  Sparkles
} from 'lucide-react'
import toast from 'react-hot-toast'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev'

interface WritingGuide {
  status: string
  category: string
  sample_count: number
  confidence: number
  message?: string
  rules: {
    title?: {
      length?: { optimal: number; min: number; max: number }
      keyword_placement?: {
        include_keyword: boolean
        rate: number
        best_position: string
        position_distribution: { front: number; middle: number; end: number }
      }
    }
    content?: {
      length?: { optimal: number; min: number; max: number }
      structure?: {
        heading_count: { optimal: number; min: number; max: number }
        keyword_density: { optimal: number; min: number; max: number }
        keyword_count: { optimal: number; min: number; max: number }
      }
    }
    media?: {
      images?: { optimal: number; min: number; max: number }
      videos?: { usage_rate: number; recommended: boolean; optimal: number }
    }
    extras?: {
      map?: { usage_rate: number; recommended: boolean }
      external_links?: { usage_rate: number; recommended: boolean }
    }
  }
  updated_at?: string
}

interface AnalysisStats {
  total_analyses: number
  category_breakdown: Record<string, number>
  recent_analyses: Array<{
    keyword: string
    rank: number
    content_length: number
    image_count: number
    analyzed_at: string
  }>
}

const categories = [
  { id: 'general', name: '전체', icon: '📊' },
  { id: 'hospital', name: '병원/의료', icon: '🏥' },
  { id: 'restaurant', name: '맛집/음식점', icon: '🍽️' },
  { id: 'beauty', name: '뷰티/화장품', icon: '💄' },
  { id: 'parenting', name: '육아/교육', icon: '👶' },
  { id: 'travel', name: '여행/숙소', icon: '✈️' },
  { id: 'tech', name: 'IT/리뷰', icon: '💻' },
]

export default function WritingGuidePage() {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState('general')
  const [guide, setGuide] = useState<WritingGuide | null>(null)
  const [stats, setStats] = useState<AnalysisStats | null>(null)
  const [markdownContent, setMarkdownContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchGuide()
    fetchStats()
  }, [selectedCategory])

  const fetchGuide = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/top-posts/writing-guide?category=${selectedCategory}`)
      if (response.ok) {
        const data = await response.json()
        setGuide(data)
      }

      // Also fetch markdown version
      const mdResponse = await fetch(`${API_BASE_URL}/api/top-posts/writing-guide/markdown?category=${selectedCategory}`)
      if (mdResponse.ok) {
        const mdData = await mdResponse.json()
        setMarkdownContent(mdData.content)
      }
    } catch (error) {
      console.error('Failed to fetch guide:', error)
      toast.error('가이드를 불러오는데 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/top-posts/stats`)
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const refreshPatterns = async () => {
    setRefreshing(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/top-posts/refresh-patterns`, {
        method: 'POST'
      })
      if (response.ok) {
        toast.success('패턴 업데이트 시작')
        setTimeout(() => {
          fetchGuide()
          fetchStats()
        }, 2000)
      }
    } catch (error) {
      toast.error('패턴 업데이트 실패')
    } finally {
      setRefreshing(false)
    }
  }

  const copyMarkdown = () => {
    navigator.clipboard.writeText(markdownContent)
    setCopied(true)
    toast.success('마크다운이 복사되었습니다')
    setTimeout(() => setCopied(false), 2000)
  }

  const getPositionLabel = (pos: string) => {
    switch (pos) {
      case 'front': return '앞부분'
      case 'middle': return '중간'
      case 'end': return '뒷부분'
      default: return pos
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.push('/')}
          className="mb-4 flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>메인으로</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-purple-600" />
            실시간 글쓰기 최적화 가이드
          </h1>
          <p className="text-gray-600 mt-2">
            상위 글 분석 데이터를 기반으로 자동 생성되는 최적화 가이드입니다.
            키워드 검색을 많이 할수록 더 정확한 가이드가 제공됩니다.
          </p>
        </motion.div>

        {/* Stats Summary */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6 bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-purple-100"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-purple-600" />
                분석 현황
              </h2>
              <button
                onClick={refreshPatterns}
                disabled={refreshing}
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                패턴 재계산
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                <div className="text-2xl font-bold">{stats.total_analyses}</div>
                <div className="text-purple-100 text-sm">총 분석 수</div>
              </div>
              {Object.entries(stats.category_breakdown).slice(0, 3).map(([cat, count]) => (
                <div key={cat} className="bg-white rounded-xl p-4 border border-gray-200">
                  <div className="text-xl font-bold text-gray-800">{count}</div>
                  <div className="text-gray-500 text-sm">{categories.find(c => c.id === cat)?.name || cat}</div>
                </div>
              ))}
            </div>

            {stats.total_analyses < 50 && (
              <div className="mt-4 flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg p-3">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">
                  더 정확한 가이드를 위해 키워드 검색을 통해 더 많은 상위 글을 분석해주세요.
                  (현재: {stats.total_analyses}개, 권장: 100개 이상)
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* Category Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6 flex flex-wrap gap-2"
        >
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                selectedCategory === cat.id
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-white/80 text-gray-600 hover:bg-white border border-gray-200'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
              {stats?.category_breakdown[cat.id] && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  selectedCategory === cat.id ? 'bg-white/20' : 'bg-gray-100'
                }`}>
                  {stats.category_breakdown[cat.id]}
                </span>
              )}
            </button>
          ))}
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
          </div>
        ) : guide ? (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Guide Cards */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-4"
            >
              {/* Status Badge */}
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                guide.status === 'data_driven'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {guide.status === 'data_driven' ? (
                  <>
                    <TrendingUp className="w-4 h-4" />
                    데이터 기반 ({guide.sample_count}개 분석) - 신뢰도 {(guide.confidence * 100).toFixed(0)}%
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    기본값 사용 중 (분석 데이터 부족)
                  </>
                )}
              </div>

              {/* Title Rules */}
              {guide.rules.title && (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-purple-100">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    제목 작성 규칙
                  </h3>

                  <div className="space-y-4">
                    {guide.rules.title.length && (
                      <div>
                        <div className="text-sm text-gray-500 mb-1">글자 수</div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-blue-600">
                            {guide.rules.title.length.optimal}자
                          </span>
                          <span className="text-gray-400">
                            ({guide.rules.title.length.min}~{guide.rules.title.length.max}자)
                          </span>
                        </div>
                      </div>
                    )}

                    {guide.rules.title.keyword_placement && (
                      <div>
                        <div className="text-sm text-gray-500 mb-2">키워드 배치</div>
                        <div className="grid grid-cols-3 gap-2">
                          {['front', 'middle', 'end'].map((pos) => (
                            <div
                              key={pos}
                              className={`p-2 rounded-lg text-center ${
                                guide.rules.title.keyword_placement?.best_position === pos
                                  ? 'bg-blue-100 border-2 border-blue-400'
                                  : 'bg-gray-50'
                              }`}
                            >
                              <div className="text-sm font-medium">{getPositionLabel(pos)}</div>
                              <div className="text-lg font-bold">
                                {guide.rules.title.keyword_placement?.position_distribution[pos as keyof typeof guide.rules.title.keyword_placement.position_distribution]?.toFixed(0)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Content Rules */}
              {guide.rules.content && (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-purple-100">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-green-600" />
                    본문 작성 규칙
                  </h3>

                  <div className="space-y-4">
                    {guide.rules.content.length && (
                      <div>
                        <div className="text-sm text-gray-500 mb-1">본문 길이</div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-green-600">
                            {guide.rules.content.length.optimal.toLocaleString()}자
                          </span>
                          <span className="text-gray-400">
                            ({guide.rules.content.length.min.toLocaleString()}~{guide.rules.content.length.max.toLocaleString()}자)
                          </span>
                        </div>
                      </div>
                    )}

                    {guide.rules.content.structure && (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-green-50 rounded-lg p-3">
                          <div className="text-sm text-gray-500">소제목</div>
                          <div className="text-xl font-bold text-green-600">
                            {guide.rules.content.structure.heading_count.optimal}개
                          </div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3">
                          <div className="text-sm text-gray-500">키워드 등장</div>
                          <div className="text-xl font-bold text-green-600">
                            {guide.rules.content.structure.keyword_count.optimal}회
                          </div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3">
                          <div className="text-sm text-gray-500">키워드 밀도</div>
                          <div className="text-xl font-bold text-green-600">
                            {guide.rules.content.structure.keyword_density.optimal}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Media Rules */}
              {guide.rules.media && (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-purple-100">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Image className="w-5 h-5 text-orange-600" />
                    이미지/동영상 규칙
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    {guide.rules.media.images && (
                      <div className="bg-orange-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Image className="w-4 h-4 text-orange-600" />
                          <span className="text-sm text-gray-600">이미지</span>
                        </div>
                        <div className="text-2xl font-bold text-orange-600">
                          {guide.rules.media.images.optimal}장
                        </div>
                        <div className="text-sm text-gray-400">
                          {guide.rules.media.images.min}~{guide.rules.media.images.max}장
                        </div>
                      </div>
                    )}

                    {guide.rules.media.videos && (
                      <div className="bg-red-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Video className="w-4 h-4 text-red-600" />
                          <span className="text-sm text-gray-600">동영상</span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">
                          {guide.rules.media.videos.usage_rate.toFixed(0)}%
                        </div>
                        <div className="text-sm text-gray-400">
                          {guide.rules.media.videos.recommended ? '권장' : '선택사항'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Extras */}
              {guide.rules.extras && (
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-purple-100">
                  <h3 className="text-lg font-semibold mb-4">추가 요소</h3>

                  <div className="grid grid-cols-2 gap-4">
                    {guide.rules.extras.map && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <Map className="w-5 h-5 text-blue-500" />
                        <div>
                          <div className="text-sm font-medium">지도</div>
                          <div className="text-xs text-gray-500">
                            {guide.rules.extras.map.usage_rate.toFixed(0)}% 사용
                          </div>
                        </div>
                      </div>
                    )}

                    {guide.rules.extras.external_links && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <Link2 className="w-5 h-5 text-purple-500" />
                        <div>
                          <div className="text-sm font-medium">외부 링크</div>
                          <div className="text-xs text-gray-500">
                            {guide.rules.extras.external_links.usage_rate.toFixed(0)}% 사용
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>

            {/* Markdown Preview & Copy */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-purple-100"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  AI 프롬프트용 가이드
                </h3>
                <button
                  onClick={copyMarkdown}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      복사됨!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      복사하기
                    </>
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                아래 내용을 복사하여 ChatGPT나 Claude에 붙여넣으면 최적화된 블로그 글을 생성할 수 있습니다.
              </p>

              <div className="bg-gray-900 rounded-xl p-4 max-h-[600px] overflow-y-auto">
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                  {markdownContent || '가이드를 불러오는 중...'}
                </pre>
              </div>

              <div className="mt-4 p-4 bg-purple-50 rounded-xl">
                <h4 className="font-medium text-purple-800 mb-2">💡 사용 방법</h4>
                <ol className="text-sm text-purple-700 space-y-1">
                  <li>1. 위 내용을 복사합니다</li>
                  <li>2. ChatGPT 또는 Claude에 붙여넣습니다</li>
                  <li>3. &quot;키워드: OOO로 블로그 글 작성해줘&quot; 라고 입력합니다</li>
                  <li>4. 최적화된 블로그 글이 생성됩니다!</li>
                </ol>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="text-center py-20 text-gray-500">
            가이드를 불러올 수 없습니다.
          </div>
        )}

        {/* Recent Analyses */}
        {stats && stats.recent_analyses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-purple-100"
          >
            <h3 className="text-lg font-semibold mb-4">최근 분석된 상위 글</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">키워드</th>
                    <th className="pb-2">순위</th>
                    <th className="pb-2">글자수</th>
                    <th className="pb-2">이미지</th>
                    <th className="pb-2">분석일</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_analyses.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2 font-medium">{item.keyword}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          item.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                          item.rank === 2 ? 'bg-gray-100 text-gray-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {item.rank}위
                        </span>
                      </td>
                      <td className="py-2">{item.content_length.toLocaleString()}자</td>
                      <td className="py-2">{item.image_count}장</td>
                      <td className="py-2 text-gray-500">
                        {new Date(item.analyzed_at).toLocaleDateString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
