'use client'

import { useState, useEffect, useCallback } from 'react'
import { getApiUrl } from '@/lib/api/apiConfig'
import {
  Plus, Store, Star, TrendingUp, TrendingDown, AlertTriangle, Search,
  Loader2, Trash2, RefreshCw, BarChart3, MessageSquare, Tag, Globe
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface StoreInfo {
  id: string
  store_name: string
  naver_place_id?: string
  google_place_id?: string
  kakao_place_id?: string
  last_crawled_at?: string
  stats?: {
    total_reviews: number
    avg_rating: number
    sentiment_counts: { positive: number; neutral: number; negative: number }
    platform_stats: Record<string, { count: number; avg_rating: number }>
    recent_7d_reviews: number
    response_rate: number
  }
}

interface PlaceResult {
  place_id: string
  name: string
  category: string
  address: string
  road_address: string
  rating: string
  review_count: number
  platform?: string
}

interface PlatformComparison {
  platform: string
  platform_name: string
  total: number
  avg_rating: number
  positive: number
  negative: number
  response_rate: number
}

interface CategoryBreakdown {
  category: string
  label: string
  count: number
}

interface KeywordFreq {
  keyword: string
  count: number
  type: 'positive' | 'negative'
}

interface ResponseStats {
  total_reviews: number
  generated: number
  applied: number
  total_responded: number
  response_rate: number
  pending_negative: number
}

interface DashboardData {
  store: StoreInfo
  stats: StoreInfo['stats']
  rating_trend: Array<{ date: string; avg_rating: number; count: number }>
  unread_negative_reviews: Array<{
    id: string
    content: string
    rating: number
    author_name: string
    collected_at: string
  }>
  sentiment_trend: Array<{ date: string; positive: number; neutral: number; negative: number; total: number }>
  category_breakdown: CategoryBreakdown[]
  platform_comparison: PlatformComparison[]
  response_stats: ResponseStats
  keyword_frequency: KeywordFreq[]
}

export default function ReputationDashboard() {
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dashboardLoading, setDashboardLoading] = useState(false)

  // 가게 등록 모달
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchPlatform, setSearchPlatform] = useState<'naver' | 'google' | 'kakao'>('naver')
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [collecting, setCollecting] = useState(false)

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/stores?user_id=demo_user`)
      const data = await res.json()
      if (data.success) {
        setStores(data.stores)
        if (data.stores.length > 0 && !selectedStore) {
          setSelectedStore(data.stores[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch stores:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedStore])

  const fetchDashboard = useCallback(async (storeId: string) => {
    setDashboardLoading(true)
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/dashboard/${storeId}`)
      const data = await res.json()
      if (data.success) {
        setDashboard(data)
      }
    } catch (err) {
      console.error('Failed to fetch dashboard:', err)
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  useEffect(() => {
    if (selectedStore) {
      fetchDashboard(selectedStore)
    }
  }, [selectedStore, fetchDashboard])

  // 가게 검색 (플랫폼별)
  const searchPlaces = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(
        `${getApiUrl()}/api/reputation/search-place?query=${encodeURIComponent(searchQuery)}&platform=${searchPlatform}`
      )
      const data = await res.json()
      if (data.success) {
        setSearchResults(data.places)
      }
    } catch {
      toast.error('검색 실패')
    } finally {
      setSearching(false)
    }
  }

  // 가게 등록 (플랫폼별 ID 매핑)
  const registerStore = async (place: PlaceResult) => {
    setRegistering(true)
    try {
      const body: Record<string, string | undefined> = {
        store_name: place.name,
        category: place.category,
        address: place.road_address || place.address,
      }

      // 플랫폼별 place_id 매핑
      const platform = place.platform || searchPlatform
      if (platform === 'google') {
        body.google_place_id = place.place_id
      } else if (platform === 'kakao') {
        body.kakao_place_id = place.place_id
      } else {
        body.naver_place_id = place.place_id
      }

      const res = await fetch(`${getApiUrl()}/api/reputation/stores?user_id=demo_user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${place.name} 등록 완료! 리뷰 수집을 시작합니다.`)
        setShowAddModal(false)
        setSearchQuery('')
        setSearchResults([])
        await fetchStores()
        setSelectedStore(data.store.id)
      }
    } catch {
      toast.error('등록 실패')
    } finally {
      setRegistering(false)
    }
  }

  // 가게 삭제
  const deleteStore = async (storeId: string) => {
    if (!confirm('이 가게를 모니터링 목록에서 삭제할까요?')) return
    try {
      await fetch(`${getApiUrl()}/api/reputation/stores/${storeId}?user_id=demo_user`, { method: 'DELETE' })
      toast.success('삭제 완료')
      setStores(prev => prev.filter(s => s.id !== storeId))
      if (selectedStore === storeId) {
        setSelectedStore(null)
        setDashboard(null)
      }
    } catch {
      toast.error('삭제 실패')
    }
  }

  // 수동 리뷰 수집
  const collectReviews = async (storeId: string) => {
    setCollecting(true)
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/stores/${storeId}/collect`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        const byPlatform = data.by_platform
        if (byPlatform && Object.keys(byPlatform).length > 0) {
          const details = Object.entries(byPlatform)
            .map(([p, c]) => `${platformLabel(p as string)} ${c}건`)
            .join(', ')
          toast.success(`새 리뷰 ${data.collected_count}건 수집 (${details})`)
        } else {
          toast.success(`${data.collected_count}건의 새 리뷰를 수집했습니다`)
        }
        fetchDashboard(storeId)
      }
    } catch {
      toast.error('수집 실패')
    } finally {
      setCollecting(false)
    }
  }

  const platformLabel = (p: string) => {
    switch (p) {
      case 'naver_place': return '네이버'
      case 'google': return '구글'
      case 'kakao': return '카카오'
      default: return p
    }
  }

  const categoryLabel = (c: string) => {
    switch (c) {
      case 'food': return '음식/맛'
      case 'service': return '서비스'
      case 'hygiene': return '위생'
      case 'price': return '가격'
      default: return '기타'
    }
  }

  const categoryColor = (c: string) => {
    switch (c) {
      case 'food': return 'bg-orange-500'
      case 'service': return 'bg-purple-500'
      case 'hygiene': return 'bg-red-500'
      case 'price': return 'bg-blue-500'
      default: return 'bg-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#0064FF] animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 가게 선택 + 등록 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Store className="w-5 h-5 text-[#0064FF]" />
            내 가게
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#0064FF] text-white rounded-lg text-sm font-medium hover:bg-[#0052CC] transition-colors"
          >
            <Plus className="w-4 h-4" />
            가게 등록
          </button>
        </div>

        {stores.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Store className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">등록된 가게가 없습니다</p>
            <p className="text-sm mt-1">가게를 등록하면 리뷰를 자동으로 수집합니다</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {stores.map(store => (
              <button
                key={store.id}
                onClick={() => setSelectedStore(store.id)}
                className={`flex-shrink-0 px-4 py-3 rounded-lg border-2 transition-all text-left min-w-[200px] ${
                  selectedStore === store.id
                    ? 'border-[#0064FF] bg-[#0064FF]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 text-sm">{store.store_name}</span>
                  <button
                    onClick={e => { e.stopPropagation(); deleteStore(store.id) }}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {store.stats && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-0.5 text-xs text-yellow-600">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      {store.stats.avg_rating}
                    </span>
                    <span className="text-xs text-gray-500">{store.stats.total_reviews}건</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 대시보드 본문 */}
      {selectedStore && dashboard && !dashboardLoading && (
        <>
          {/* 통계 카드 5개 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-5 h-5 text-yellow-500" />
                <span className="text-sm text-gray-600">평균 평점</span>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {dashboard.stats?.avg_rating || '-'}
              </div>
              <div className="text-xs text-gray-500 mt-1">전체 {dashboard.stats?.total_reviews || 0}건</div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <span className="text-sm text-gray-600">긍정 리뷰</span>
              </div>
              <div className="text-3xl font-bold text-green-600">
                {dashboard.stats?.sentiment_counts?.positive || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {dashboard.stats?.total_reviews
                  ? `${Math.round((dashboard.stats.sentiment_counts.positive / dashboard.stats.total_reviews) * 100)}%`
                  : '0%'}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <span className="text-sm text-gray-600">부정 리뷰</span>
              </div>
              <div className="text-3xl font-bold text-red-600">
                {dashboard.stats?.sentiment_counts?.negative || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {dashboard.stats?.total_reviews
                  ? `${Math.round((dashboard.stats.sentiment_counts.negative / dashboard.stats.total_reviews) * 100)}%`
                  : '0%'}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                <span className="text-sm text-gray-600">답변율</span>
              </div>
              <div className="text-3xl font-bold text-blue-600">
                {dashboard.response_stats?.response_rate || 0}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {dashboard.response_stats?.total_responded || 0}/{dashboard.response_stats?.total_reviews || 0}건 답변
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <span className="text-sm text-gray-600">최근 7일</span>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {dashboard.stats?.recent_7d_reviews || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1">건의 새 리뷰</div>
            </div>
          </div>

          {/* 수동 수집 버튼 + 리뷰 관리 링크 */}
          <div className="flex gap-3">
            <button
              onClick={() => collectReviews(selectedStore)}
              disabled={collecting}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {collecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              리뷰 새로 수집
            </button>
            <Link
              href="/reputation-monitor/reviews"
              className="flex items-center gap-2 px-4 py-2.5 bg-[#0064FF] text-white rounded-lg text-sm font-medium hover:bg-[#0052CC] transition-colors"
            >
              리뷰 전체 보기
            </Link>
          </div>

          {/* 2열 레이아웃: 감성 트렌드 + 카테고리 분석 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 감성 트렌드 (스택 바 차트) */}
            {dashboard.sentiment_trend && dashboard.sentiment_trend.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#0064FF]" />
                  감성 트렌드 (30일)
                </h3>
                <p className="text-xs text-gray-400 mb-4">일별 긍정/중립/부정 리뷰 수</p>
                <div className="flex items-end gap-0.5 h-36">
                  {dashboard.sentiment_trend.map((day, idx) => {
                    const total = day.total || 1
                    const pPct = (day.positive / total) * 100
                    const nPct = (day.neutral / total) * 100
                    const negPct = (day.negative / total) * 100
                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col justify-end h-full"
                        title={`${day.date}\n긍정: ${day.positive} / 중립: ${day.neutral} / 부정: ${day.negative}`}
                      >
                        <div className="flex flex-col w-full rounded-t overflow-hidden" style={{ height: `${Math.min(total * 15, 100)}%` }}>
                          <div className="bg-green-400" style={{ height: `${pPct}%` }} />
                          <div className="bg-gray-300" style={{ height: `${nPct}%` }} />
                          <div className="bg-red-400" style={{ height: `${negPct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-green-400 rounded-sm" />긍정</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-gray-300 rounded-sm" />중립</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-red-400 rounded-sm" />부정</span>
                </div>
              </div>
            )}

            {/* 부정 리뷰 카테고리 분석 */}
            {dashboard.category_breakdown && dashboard.category_breakdown.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-red-500" />
                  부정 리뷰 원인 분석
                </h3>
                <p className="text-xs text-gray-400 mb-4">카테고리별 불만 유형</p>
                <div className="space-y-3">
                  {dashboard.category_breakdown.map((cat, idx) => {
                    const maxCount = dashboard.category_breakdown[0]?.count || 1
                    const pct = (cat.count / maxCount) * 100
                    return (
                      <div key={idx}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-gray-700">{cat.label || categoryLabel(cat.category)}</span>
                          <span className="text-sm text-gray-500">{cat.count}건</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5">
                          <div className={`${categoryColor(cat.category)} rounded-full h-2.5 transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 플랫폼별 비교 */}
          {dashboard.platform_comparison && dashboard.platform_comparison.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#0064FF]" />
                플랫폼별 비교
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {dashboard.platform_comparison.map(pc => (
                  <div key={pc.platform} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-gray-800 text-sm">{pc.platform_name}</span>
                      <span className="flex items-center gap-0.5 text-sm font-bold text-yellow-600">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        {pc.avg_rating}
                      </span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">총 리뷰</span>
                        <span className="font-medium text-gray-700">{pc.total}건</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">긍정</span>
                        <span className="font-medium text-green-600">{pc.positive}건</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">부정</span>
                        <span className="font-medium text-red-600">{pc.negative}건</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">답변율</span>
                        <span className="font-medium text-blue-600">{pc.response_rate}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2열: 평점 트렌드 + 키워드 빈도 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 평점 트렌드 */}
            {dashboard.rating_trend && dashboard.rating_trend.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-base font-bold text-gray-800 mb-4">평점 트렌드 (30일)</h3>
                <div className="flex items-end gap-1 h-32">
                  {dashboard.rating_trend.map((point, idx) => {
                    const height = (point.avg_rating / 5) * 100
                    const color = point.avg_rating >= 4 ? 'bg-green-500' : point.avg_rating >= 3 ? 'bg-yellow-500' : 'bg-red-500'
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1" title={`${point.date}: ${point.avg_rating}점 (${point.count}건)`}>
                        <span className="text-[10px] text-gray-500">{point.avg_rating}</span>
                        <div className={`w-full rounded-t ${color} transition-all`} style={{ height: `${height}%` }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 키워드 빈도 */}
            {dashboard.keyword_frequency && dashboard.keyword_frequency.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-base font-bold text-gray-800 mb-4">자주 언급되는 키워드</h3>
                <div className="flex flex-wrap gap-2">
                  {dashboard.keyword_frequency.map((kw, idx) => (
                    <span
                      key={idx}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        kw.type === 'positive'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                      title={`${kw.count}회 언급`}
                    >
                      {kw.keyword} <span className="opacity-60">({kw.count})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 미확인 악평 */}
          {dashboard.unread_negative_reviews && dashboard.unread_negative_reviews.length > 0 && (
            <div className="bg-red-50 rounded-xl border border-red-200 p-6">
              <h3 className="text-lg font-bold text-red-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                확인 필요한 부정 리뷰
              </h3>
              <div className="space-y-3">
                {dashboard.unread_negative_reviews.map(review => (
                  <div key={review.id} className="bg-white rounded-lg p-4 border border-red-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">{review.author_name}</span>
                        <span className="flex items-center gap-0.5 text-xs text-red-600">
                          <Star className="w-3 h-3 fill-red-400 text-red-400" />
                          {review.rating}
                        </span>
                      </div>
                      <Link
                        href="/reputation-monitor/reviews"
                        className="text-xs text-[#0064FF] hover:underline"
                      >
                        AI 답변 생성
                      </Link>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{review.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {selectedStore && dashboardLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#0064FF] animate-spin" />
        </div>
      )}

      {/* 가게 등록 모달 (멀티 플랫폼) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-2">가게 등록</h2>
            <p className="text-sm text-gray-500 mb-4">플랫폼을 선택하고 가게를 검색하세요</p>

            {/* 플랫폼 선택 탭 */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
              {([
                { value: 'naver' as const, label: '네이버 플레이스' },
                { value: 'google' as const, label: '구글 리뷰' },
                { value: 'kakao' as const, label: '카카오맵' },
              ]).map(tab => (
                <button
                  key={tab.value}
                  onClick={() => { setSearchPlatform(tab.value); setSearchResults([]) }}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                    searchPlatform === tab.value
                      ? 'bg-white text-[#0064FF] shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchPlaces()}
                placeholder="가게명 또는 주소 입력"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30 focus:border-[#0064FF]"
              />
              <button
                onClick={searchPlaces}
                disabled={searching}
                className="px-4 py-2.5 bg-[#0064FF] text-white rounded-lg text-sm font-medium hover:bg-[#0052CC] disabled:opacity-50"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {searchResults.map((place, idx) => (
                <div
                  key={`${place.place_id}-${idx}`}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-[#0064FF] transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <div className="font-medium text-gray-800 text-sm">{place.name}</div>
                    <div className="text-xs text-gray-500 truncate">{place.road_address || place.address}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{place.category}</span>
                      {place.rating && (
                        <span className="text-xs text-yellow-600 flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />{place.rating}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => registerStore(place)}
                    disabled={registering}
                    className="px-3 py-1.5 bg-[#0064FF] text-white rounded-md text-xs font-medium hover:bg-[#0052CC] disabled:opacity-50 flex-shrink-0"
                  >
                    {registering ? '등록 중...' : '등록'}
                  </button>
                </div>
              ))}
              {searchResults.length === 0 && searchQuery && !searching && (
                <p className="text-center text-sm text-gray-400 py-8">검색 결과가 없습니다</p>
              )}
            </div>

            <button
              onClick={() => setShowAddModal(false)}
              className="mt-4 w-full py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
