'use client'

import { useState, useEffect, useCallback } from 'react'
import { getApiUrl } from '@/lib/api/apiConfig'
import {
  Star, Loader2, MessageSquare, Shield, Copy, Check,
  ChevronDown, ChevronUp, Filter, Sparkles, AlertTriangle, X
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Review {
  id: string
  store_id: string
  platform: string
  author_name: string
  rating: number
  content: string
  review_date: string
  sentiment: string
  sentiment_score: number
  sentiment_category?: string
  keywords?: string[]
  ai_response?: string
  response_status: string
  collected_at: string
}

interface DeletionGuide {
  platform_name: string
  can_delete: boolean
  can_report: boolean
  report_reasons: string[]
  steps: string[]
  processing_time: string
  tips: string[]
  recommended_action?: {
    title: string
    description: string
    steps: string[]
  }
  legal_options?: Record<string, {
    title: string
    description: string
    steps: string[]
    estimated_cost: string
  }>
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [stores, setStores] = useState<Array<{ id: string; store_name: string }>>([])
  const [total, setTotal] = useState(0)

  // 필터
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [sentimentFilter, setSentimentFilter] = useState<string>('')

  // AI 답변 생성
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [selectedTone, setSelectedTone] = useState('professional')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // 삭제/신고 가이드
  const [showGuide, setShowGuide] = useState(false)
  const [guide, setGuide] = useState<DeletionGuide | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)
  const [guidePlatform, setGuidePlatform] = useState('naver_place')
  const [guideType, setGuideType] = useState('general')

  // 펼쳐진 리뷰
  const [expandedReview, setExpandedReview] = useState<string | null>(null)

  // 가게 목록 로드
  useEffect(() => {
    const loadStores = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/reputation/stores?user_id=demo_user`)
        const data = await res.json()
        if (data.success && data.stores.length > 0) {
          setStores(data.stores)
          setStoreId(data.stores[0].id)
        }
      } catch {
        console.error('Failed to load stores')
      }
    }
    loadStores()
  }, [])

  // 리뷰 로드
  const fetchReviews = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      let url = `${getApiUrl()}/api/reputation/reviews?store_id=${storeId}&limit=100`
      if (platformFilter) url += `&platform=${platformFilter}`
      if (sentimentFilter) url += `&sentiment=${sentimentFilter}`

      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setReviews(data.reviews)
        setTotal(data.total)
      }
    } catch {
      toast.error('리뷰 로딩 실패')
    } finally {
      setLoading(false)
    }
  }, [storeId, platformFilter, sentimentFilter])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  // AI 답변 생성
  const generateResponse = async (reviewId: string) => {
    setGeneratingId(reviewId)
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/reviews/${reviewId}/generate-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone: selectedTone }),
      })
      const data = await res.json()
      if (data.success) {
        setReviews(prev =>
          prev.map(r => r.id === reviewId ? { ...r, ai_response: data.response, response_status: 'generated' } : r)
        )
        setExpandedReview(reviewId)
        toast.success('AI 답변이 생성되었습니다')
      } else {
        toast.error(data.message || 'AI 답변 생성 실패')
      }
    } catch {
      toast.error('AI 답변 생성 중 오류')
    } finally {
      setGeneratingId(null)
    }
  }

  // 답변 복사
  const copyResponse = (text: string, reviewId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(reviewId)
    toast.success('클립보드에 복사되었습니다')
    setTimeout(() => setCopiedId(null), 2000)
  }

  // 삭제/신고 가이드 로드
  const loadGuide = async (platform: string, type: string) => {
    setGuideLoading(true)
    setGuidePlatform(platform)
    setGuideType(type)
    try {
      const res = await fetch(
        `${getApiUrl()}/api/reputation/deletion-guide?platform=${platform}&review_type=${type}`
      )
      const data = await res.json()
      if (data.success) {
        setGuide(data.guide)
        setShowGuide(true)
      }
    } catch {
      toast.error('가이드 로딩 실패')
    } finally {
      setGuideLoading(false)
    }
  }

  const sentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">긍정</span>
      case 'negative':
        return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">부정</span>
      default:
        return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">중립</span>
    }
  }

  const ratingStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={`w-3.5 h-3.5 ${i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
          />
        ))}
      </div>
    )
  }

  const platformLabel = (platform: string) => {
    switch (platform) {
      case 'naver_place': return '네이버'
      case 'google': return '구글'
      case 'kakao': return '카카오'
      default: return platform
    }
  }

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 가게 선택 */}
          {stores.length > 1 && (
            <select
              value={storeId || ''}
              onChange={e => setStoreId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.store_name}</option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1 text-sm text-gray-500">
            <Filter className="w-4 h-4" />
            필터:
          </div>

          {/* 감성 필터 */}
          <div className="flex gap-1">
            {[
              { value: '', label: '전체' },
              { value: 'positive', label: '긍정' },
              { value: 'neutral', label: '중립' },
              { value: 'negative', label: '부정' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSentimentFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  sentimentFilter === opt.value
                    ? 'bg-[#0064FF] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 플랫폼 필터 */}
          <div className="flex gap-1">
            {[
              { value: '', label: '전체 플랫폼' },
              { value: 'naver_place', label: '네이버' },
              { value: 'google', label: '구글' },
              { value: 'kakao', label: '카카오' },
            ].map(opt => (
              <button
                key={`plat-${opt.value}`}
                onClick={() => setPlatformFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  platformFilter === opt.value
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 톤 선택 */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">AI 톤:</span>
            <select
              value={selectedTone}
              onChange={e => setSelectedTone(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-xs"
            >
              <option value="professional">전문적</option>
              <option value="friendly">친근한</option>
              <option value="apologetic">사과</option>
            </select>
          </div>

          <span className="text-xs text-gray-400">총 {total}건</span>
        </div>
      </div>

      {/* 리뷰 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#0064FF] animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">리뷰가 없습니다</p>
          <p className="text-sm mt-1">가게를 등록하고 리뷰를 수집해보세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(review => (
            <div
              key={review.id}
              className={`bg-white rounded-xl shadow-sm border transition-all ${
                review.sentiment === 'negative' ? 'border-red-200' : 'border-gray-200'
              }`}
            >
              {/* 리뷰 헤더 */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-800 text-sm">{review.author_name}</span>
                    {ratingStars(review.rating)}
                    {sentimentBadge(review.sentiment)}
                    <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-50 rounded">
                      {platformLabel(review.platform)}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {review.review_date || review.collected_at?.split('T')[0]}
                  </span>
                </div>

                {/* 리뷰 내용 */}
                <p className="text-sm text-gray-700 leading-relaxed">{review.content || '(내용 없음)'}</p>

                {/* 키워드 태그 */}
                {review.keywords && review.keywords.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {review.keywords.map((kw, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}

                {/* 액션 버튼 */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => generateResponse(review.id)}
                    disabled={generatingId === review.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white rounded-lg text-xs font-medium hover:shadow-md transition-all disabled:opacity-50"
                  >
                    {generatingId === review.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    AI 답변 생성
                  </button>

                  {review.sentiment === 'negative' && (
                    <button
                      onClick={() => loadGuide(review.platform, 'general')}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      신고/삭제 가이드
                    </button>
                  )}

                  {review.ai_response && (
                    <button
                      onClick={() => setExpandedReview(expandedReview === review.id ? null : review.id)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      {expandedReview === review.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      답변 보기
                    </button>
                  )}
                </div>
              </div>

              {/* AI 답변 (펼침) */}
              {expandedReview === review.id && review.ai_response && (
                <div className="border-t border-gray-100 bg-blue-50/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-blue-700 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      AI 생성 답변
                    </span>
                    <button
                      onClick={() => copyResponse(review.ai_response || '', review.id)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white border border-blue-200 text-blue-700 rounded-md text-xs hover:bg-blue-50 transition-colors"
                    >
                      {copiedId === review.id ? (
                        <><Check className="w-3 h-3" /> 복사됨</>
                      ) : (
                        <><Copy className="w-3 h-3" /> 복사</>
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed bg-white rounded-lg p-3 border border-blue-100">
                    {review.ai_response}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-2">
                    답변을 복사한 뒤 네이버 플레이스에서 직접 붙여넣기 하세요
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 삭제/신고 가이드 모달 */}
      {showGuide && guide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowGuide(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-500" />
                {guide.platform_name} 신고/삭제 가이드
              </h2>
              <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 신고 사유 */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">신고 가능 사유</h3>
                <ul className="space-y-1">
                  {guide.report_reasons.map((reason, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full flex-shrink-0" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 신고 절차 */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">신고 절차</h3>
                <ol className="space-y-2">
                  {guide.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-gray-600">
                      <span className="flex-shrink-0 w-6 h-6 bg-[#0064FF] text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-gray-500 mt-2">처리 기간: {guide.processing_time}</p>
              </div>

              {/* 팁 */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">실전 팁</h3>
                <ul className="space-y-1.5">
                  {guide.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-green-500 mt-0.5">TIP</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 권장 조치 */}
              {guide.recommended_action && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h3 className="font-semibold text-blue-800 mb-1">{guide.recommended_action.title}</h3>
                  <p className="text-sm text-blue-700 mb-2">{guide.recommended_action.description}</p>
                  <ol className="space-y-1">
                    {guide.recommended_action.steps.map((step, i) => (
                      <li key={i} className="text-sm text-blue-600 flex items-start gap-2">
                        <span className="font-medium">{i + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* 법적 조치 옵션 */}
              {guide.legal_options && Object.keys(guide.legal_options).length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">법적 조치 (참고)</h3>
                  {Object.entries(guide.legal_options).map(([key, option]) => (
                    <div key={key} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200">
                      <h4 className="font-medium text-gray-700 text-sm">{option.title}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                      <p className="text-xs text-gray-400 mt-1">예상 비용: {option.estimated_cost}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
