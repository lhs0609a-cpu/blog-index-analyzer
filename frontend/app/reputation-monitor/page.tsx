'use client'

import { useState, useEffect, useCallback } from 'react'
import { getApiUrl } from '@/lib/api/apiConfig'
import { useAuthStore } from '@/lib/stores/auth'
import {
  Plus, Store, Star, TrendingUp, TrendingDown, AlertTriangle, Search,
  Loader2, Trash2, RefreshCw, BarChart3, MessageSquare, Tag, Globe, CheckCircle,
  Radar, ExternalLink, Eye, Filter, ShieldAlert, X
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

interface Review {
  id: string
  platform: string
  author_name: string
  rating: number
  content: string
  review_date: string
  sentiment: string
  collected_at: string
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

interface OnlineMention {
  id: string
  store_id: string
  source_type: string
  title: string
  snippet: string
  url: string
  author_name: string
  published_date: string
  sentiment: 'positive' | 'neutral' | 'negative'
  sentiment_score: number
  severity_score: number
  severity_level: 'none' | 'low' | 'medium' | 'high'
  matched_keywords: string[]
  is_resolved: number
  resolved_note: string | null
  created_at: string
}

interface MentionStats {
  total: number
  unresolved: number
  high_severity: number
  by_sentiment: Record<string, number>
  by_source: Record<string, number>
  by_severity: Record<string, number>
}

export default function ReputationDashboard() {
  const { user } = useAuthStore()
  const userId = user?.id || user?.email || 'demo_user'

  const [stores, setStores] = useState<StoreInfo[]>([])
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dashboardLoading, setDashboardLoading] = useState(false)

  // 가게 등록 모달
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'search' | 'url'>('search')
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [registering, setRegistering] = useState(false)
  // URL 직접 입력 모드
  const [urlInput, setUrlInput] = useState('')
  const [urlParsing, setUrlParsing] = useState(false)
  const [urlResult, setUrlResult] = useState<{platform: string; place_id: string} | null>(null)
  const [urlStoreName, setUrlStoreName] = useState('')
  const [collecting, setCollecting] = useState(false)
  const [collectionResult, setCollectionResult] = useState<{
    collected_count: number
    by_platform: Record<string, number>
    platform_ids?: Record<string, string | null>
  } | null>(null)
  const [showCollectionSuccess, setShowCollectionSuccess] = useState(false)
  const [recentReviews, setRecentReviews] = useState<Review[]>([])

  // 온라인 언급 탭
  const [activeTab, setActiveTab] = useState<'dashboard' | 'mentions'>('dashboard')
  const [mentions, setMentions] = useState<OnlineMention[]>([])
  const [mentionStats, setMentionStats] = useState<MentionStats | null>(null)
  const [mentionLoading, setMentionLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ new_mentions: number; high_severity_new: number; cached: boolean; new_by_sentiment?: Record<string, number> } | null>(null)
  const [mentionFilter, setMentionFilter] = useState({
    sentiment: '' as string,
    severity: '' as string,
    source: '' as string,
    resolved: '' as string,
  })

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/stores?user_id=${userId}`)
      const data = await res.json()
      if (data.success) {
        setStores(data.stores)
        // 첫 로드 시에만 첫 번째 가게 자동 선택 (selectedStore가 없을 때)
        if (data.stores.length > 0) {
          setSelectedStore((prev) => prev || data.stores[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch stores:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  const fetchRecentReviews = useCallback(async (storeId: string) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/reviews?store_id=${storeId}&limit=5`)
      const data = await res.json()
      if (data.success) setRecentReviews(data.reviews || [])
    } catch { /* silent */ }
  }, [])

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

  const fetchMentions = useCallback(async (storeId: string) => {
    setMentionLoading(true)
    try {
      const params = new URLSearchParams()
      if (mentionFilter.sentiment) params.set('sentiment', mentionFilter.sentiment)
      if (mentionFilter.severity) params.set('severity_level', mentionFilter.severity)
      if (mentionFilter.source) params.set('source_type', mentionFilter.source)
      if (mentionFilter.resolved !== '') params.set('is_resolved', mentionFilter.resolved)
      const qs = params.toString()
      const res = await fetch(`${getApiUrl()}/api/reputation/mentions/${storeId}${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      if (data.success) setMentions(data.mentions || [])
    } catch { /* silent */ }
    finally { setMentionLoading(false) }
  }, [mentionFilter])

  const fetchMentionStats = useCallback(async (storeId: string) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/mentions/${storeId}/stats`)
      const data = await res.json()
      if (data.success) setMentionStats(data.stats)
    } catch { /* silent */ }
  }, [])

  const scanMentions = async (storeId: string) => {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/mentions/scan/${storeId}`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setScanResult({
          new_mentions: data.new_mentions,
          high_severity_new: data.high_severity_new || 0,
          cached: data.cached || false,
          new_by_sentiment: data.new_by_sentiment,
        })
        if (data.cached) {
          toast('최근 6시간 내 스캔 기록이 있습니다', { icon: 'info' })
        } else {
          toast.success(`새 언급 ${data.new_mentions}건 수집 완료`)
        }
        fetchMentions(storeId)
        fetchMentionStats(storeId)
      }
    } catch {
      toast.error('스캔 실패')
    } finally {
      setScanning(false)
    }
  }

  const resolveMention = async (mentionId: string) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/mentions/${mentionId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '처리 완료' }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('처리 완료')
        if (selectedStore) {
          fetchMentions(selectedStore)
          fetchMentionStats(selectedStore)
        }
      }
    } catch {
      toast.error('처리 실패')
    }
  }

  const deleteMention = async (mentionId: string) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/mentions/${mentionId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('오탐 제거 완료')
        if (selectedStore) {
          fetchMentions(selectedStore)
          fetchMentionStats(selectedStore)
        }
      }
    } catch {
      toast.error('삭제 실패')
    }
  }

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  useEffect(() => {
    if (selectedStore) {
      fetchDashboard(selectedStore)
      fetchRecentReviews(selectedStore)
      fetchMentionStats(selectedStore)
    }
  }, [selectedStore, fetchDashboard, fetchRecentReviews, fetchMentionStats])

  useEffect(() => {
    if (selectedStore && activeTab === 'mentions') {
      fetchMentions(selectedStore)
    }
  }, [selectedStore, activeTab, fetchMentions])

  // 가게 검색 (카카오 + 네이버 통합)
  const searchPlaces = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    try {
      const res = await fetch(
        `${getApiUrl()}/api/reputation/search-unified?query=${encodeURIComponent(searchQuery)}`
      )
      const data = await res.json()
      if (data.success && data.places?.length > 0) {
        setSearchResults(data.places)
      } else {
        setSearchResults([])
        toast.error(`'${searchQuery}' 검색 결과가 없습니다. URL 직접 입력을 시도해보세요.`)
      }
    } catch {
      toast.error('검색 서버 연결 실패. 잠시 후 다시 시도해주세요.')
    } finally {
      setSearching(false)
    }
  }

  // URL 파싱
  const parseUrl = async () => {
    if (!urlInput.trim()) return
    setUrlParsing(true)
    setUrlResult(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/parse-place-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      })
      const data = await res.json()
      if (data.success) {
        setUrlResult({ platform: data.platform, place_id: data.place_id })
        toast.success(`${data.platform === 'naver' ? '네이버' : data.platform === 'kakao' ? '카카오' : '구글'} 장소 확인 완료`)
      } else {
        toast.error(data.error || 'URL을 인식할 수 없습니다')
      }
    } catch {
      toast.error('URL 확인 실패. 잠시 후 다시 시도해주세요.')
    } finally {
      setUrlParsing(false)
    }
  }

  // URL로 가게 등록
  const registerFromUrl = async () => {
    if (!urlResult || !urlStoreName.trim()) return
    setRegistering(true)
    try {
      const body: Record<string, string> = {
        store_name: urlStoreName,
      }
      if (urlResult.platform === 'google') {
        body.google_place_id = urlResult.place_id
      } else if (urlResult.platform === 'kakao') {
        body.kakao_place_id = urlResult.place_id
      } else {
        body.naver_place_id = urlResult.place_id
      }

      const res = await fetch(`${getApiUrl()}/api/reputation/stores?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${urlStoreName} 등록 완료! 리뷰 수집을 시작합니다.`)
        setShowAddModal(false)
        setUrlInput('')
        setUrlResult(null)
        setUrlStoreName('')
        await fetchStores()
        setSelectedStore(data.store.id)
      }
    } catch {
      toast.error('등록 실패')
    } finally {
      setRegistering(false)
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
      const platform = place.platform || 'naver'
      if (platform === 'google') {
        body.google_place_id = place.place_id
      } else if (platform === 'kakao') {
        body.kakao_place_id = place.place_id
      } else {
        body.naver_place_id = place.place_id
      }

      const res = await fetch(`${getApiUrl()}/api/reputation/stores?user_id=${userId}`, {
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
      await fetch(`${getApiUrl()}/api/reputation/stores/${storeId}?user_id=${userId}`, { method: 'DELETE' })
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
    setCollectionResult(null)
    setShowCollectionSuccess(false)
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/stores/${storeId}/collect`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setCollectionResult({
          collected_count: data.collected_count,
          by_platform: data.by_platform || {},
          platform_ids: data.platform_ids || undefined,
        })
        setShowCollectionSuccess(true)
        setTimeout(() => setShowCollectionSuccess(false), 8000)
        fetchStores() // 플랫폼 연결 상태가 변경됐을 수 있으므로 갱신
        fetchDashboard(storeId)
        fetchRecentReviews(storeId)
      } else {
        toast.error(data.message || '수집 실패')
      }
    } catch {
      toast.error('수집 실패')
    } finally {
      setCollecting(false)
    }
  }

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '방금 전'
    if (mins < 60) return `${mins}분 전`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    return `${days}일 전`
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

  const sourceLabel = (s: string) => {
    switch (s) {
      case 'blog': return '블로그'
      case 'cafe': return '카페'
      case 'kin': return '지식iN'
      case 'news': return '뉴스'
      case 'web': return '웹'
      default: return s
    }
  }

  const sourceColor = (s: string) => {
    switch (s) {
      case 'blog': return 'bg-green-100 text-green-700'
      case 'cafe': return 'bg-orange-100 text-orange-700'
      case 'kin': return 'bg-blue-100 text-blue-700'
      case 'news': return 'bg-purple-100 text-purple-700'
      case 'web': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const severityBadge = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200'
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-200'
      default: return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  const severityLabel = (level: string) => {
    switch (level) {
      case 'high': return '심각'
      case 'medium': return '주의'
      case 'low': return '경미'
      default: return level
    }
  }

  const sentimentBadge = (s: string) => {
    switch (s) {
      case 'positive': return 'bg-green-100 text-green-700 border-green-200'
      case 'negative': return 'bg-red-100 text-red-700 border-red-200'
      default: return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  const sentimentLabel = (s: string) => {
    switch (s) {
      case 'positive': return '긍정'
      case 'negative': return '부정'
      default: return '중립'
    }
  }

  const sentimentIcon = (s: string) => {
    switch (s) {
      case 'positive': return '+'
      case 'negative': return '-'
      default: return '~'
    }
  }

  const highlightKeywords = (text: string, keywords: string[]) => {
    if (!keywords || keywords.length === 0) return text
    const escaped = keywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      keywords.some(kw => kw.toLowerCase() === part.toLowerCase())
        ? <mark key={i} className="bg-red-200 text-red-900 px-0.5 rounded">{part}</mark>
        : part
    )
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

      {/* 탭 전환 */}
      {selectedStore && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 flex gap-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-[#0064FF] text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            리뷰 대시보드
          </button>
          <button
            onClick={() => setActiveTab('mentions')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
              activeTab === 'mentions'
                ? 'bg-[#0064FF] text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Radar className="w-4 h-4" />
            온라인 언급
            {mentionStats && mentionStats.unresolved > 0 && activeTab !== 'mentions' && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {mentionStats.unresolved > 99 ? '99+' : mentionStats.unresolved}
              </span>
            )}
          </button>
        </div>
      )}

      {/* 온라인 언급 탭 */}
      {selectedStore && activeTab === 'mentions' && (
        <div className="space-y-4">
          {/* 스캔 버튼 + 결과 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              온라인에서 업체 관련 부정 언급을 자동 검색합니다
            </div>
            <button
              onClick={() => scanMentions(selectedStore)}
              disabled={scanning}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0064FF] text-white rounded-lg text-sm font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
              {scanning ? '스캔 중...' : '지금 스캔'}
            </button>
          </div>

          {scanning && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">온라인 부정 언급을 검색하고 있습니다...</p>
                <p className="text-xs text-blue-600">블로그 · 카페 · 지식iN · 뉴스 · 웹 5개 소스에서 수집 중</p>
              </div>
            </div>
          )}

          {scanResult && !scanning && (
            <div className={`border rounded-xl p-4 flex items-center gap-3 ${
              scanResult.cached ? 'bg-gray-50 border-gray-200' :
              scanResult.new_mentions > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'
            }`}>
              {scanResult.cached ? (
                <Eye className="w-5 h-5 text-gray-500 flex-shrink-0" />
              ) : scanResult.new_mentions > 0 ? (
                <ShieldAlert className="w-5 h-5 text-orange-500 flex-shrink-0" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              )}
              <div className="text-sm font-medium">
                {scanResult.cached
                  ? '최근 스캔 결과를 표시합니다'
                  : scanResult.new_mentions > 0
                    ? (
                      <span>
                        새 언급 {scanResult.new_mentions}건 수집
                        {scanResult.new_by_sentiment && (
                          <span className="font-normal text-gray-600 ml-1">
                            (긍정 {scanResult.new_by_sentiment.positive || 0} /
                            중립 {scanResult.new_by_sentiment.neutral || 0} /
                            부정 {scanResult.new_by_sentiment.negative || 0})
                          </span>
                        )}
                      </span>
                    )
                    : '새로운 언급이 없습니다'}
              </div>
            </div>
          )}

          {/* 상단 요약 카드 */}
          {mentionStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Radar className="w-4 h-4 text-[#0064FF]" />
                  <span className="text-xs text-gray-500">총 언급</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">{mentionStats.total}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-gray-500">긍정</span>
                </div>
                <div className="text-2xl font-bold text-green-600">{mentionStats.by_sentiment?.positive || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  <span className="text-xs text-gray-500">중립</span>
                </div>
                <div className="text-2xl font-bold text-gray-600">{mentionStats.by_sentiment?.neutral || 0}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-gray-500">부정</span>
                </div>
                <div className="text-2xl font-bold text-red-600">{mentionStats.by_sentiment?.negative || 0}</div>
                {mentionStats.high_severity > 0 && (
                  <div className="text-[10px] text-red-500 mt-0.5">심각 {mentionStats.high_severity}건</div>
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-purple-500" />
                  <span className="text-xs text-gray-500">소스 분포</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(mentionStats.by_source).map(([src, cnt]) => (
                    <span key={src} className={`text-[10px] px-1.5 py-0.5 rounded ${sourceColor(src)}`}>
                      {sourceLabel(src)} {cnt}
                    </span>
                  ))}
                  {Object.keys(mentionStats.by_source).length === 0 && (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 필터 바 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">필터</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                value={mentionFilter.sentiment}
                onChange={e => setMentionFilter(prev => ({ ...prev, sentiment: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30"
              >
                <option value="">감성 전체</option>
                <option value="positive">긍정</option>
                <option value="neutral">중립</option>
                <option value="negative">부정</option>
              </select>
              <select
                value={mentionFilter.severity}
                onChange={e => setMentionFilter(prev => ({ ...prev, severity: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30"
              >
                <option value="">심각도 전체</option>
                <option value="high">심각</option>
                <option value="medium">주의</option>
                <option value="low">경미</option>
              </select>
              <select
                value={mentionFilter.source}
                onChange={e => setMentionFilter(prev => ({ ...prev, source: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30"
              >
                <option value="">소스 전체</option>
                <option value="blog">블로그</option>
                <option value="cafe">카페</option>
                <option value="kin">지식iN</option>
                <option value="news">뉴스</option>
                <option value="web">웹</option>
              </select>
              <select
                value={mentionFilter.resolved}
                onChange={e => setMentionFilter(prev => ({ ...prev, resolved: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30"
              >
                <option value="">상태 전체</option>
                <option value="0">미처리</option>
                <option value="1">처리완료</option>
              </select>
              {(mentionFilter.sentiment || mentionFilter.severity || mentionFilter.source || mentionFilter.resolved !== '') && (
                <button
                  onClick={() => setMentionFilter({ sentiment: '', severity: '', source: '', resolved: '' })}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  초기화
                </button>
              )}
            </div>
          </div>

          {/* 언급 리스트 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
              <Radar className="w-4 h-4 text-[#0064FF]" />
              온라인 언급 목록
              <span className="text-sm font-normal text-gray-400">({mentions.length}건)</span>
            </h3>

            {mentionLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-[#0064FF] animate-spin" />
              </div>
            ) : mentions.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Radar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">수집된 언급이 없습니다</p>
                <p className="text-xs mt-1">&apos;지금 스캔&apos; 버튼을 눌러 검색해보세요</p>
              </div>
            ) : (
              <div className="space-y-3">
                {mentions.map(mention => (
                  <div
                    key={mention.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      mention.is_resolved
                        ? 'border-gray-100 bg-gray-50 opacity-70'
                        : mention.sentiment === 'negative' && mention.severity_level === 'high'
                          ? 'border-red-200 bg-red-50/30'
                          : mention.sentiment === 'negative'
                            ? 'border-red-100 bg-red-50/10'
                            : mention.sentiment === 'positive'
                              ? 'border-green-100 bg-green-50/10'
                              : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {/* 감성 뱃지 */}
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${sentimentBadge(mention.sentiment)}`}>
                            {sentimentIcon(mention.sentiment)} {sentimentLabel(mention.sentiment)}
                          </span>
                          {/* 부정일 때만 심각도 표시 */}
                          {mention.sentiment === 'negative' && mention.severity_level !== 'none' && (
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${severityBadge(mention.severity_level)}`}>
                              {severityLabel(mention.severity_level)}
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${sourceColor(mention.source_type)}`}>
                            {sourceLabel(mention.source_type)}
                          </span>
                          {mention.is_resolved === 1 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700">
                              처리완료
                            </span>
                          )}
                          {mention.sentiment_score !== 0 && (
                            <span className={`text-[10px] ${mention.sentiment_score > 0 ? 'text-green-500' : mention.sentiment_score < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              감성 {mention.sentiment_score > 0 ? '+' : ''}{mention.sentiment_score}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-gray-800 mb-1 line-clamp-1">
                          {highlightKeywords(mention.title, mention.matched_keywords)}
                        </h4>
                        <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                          {highlightKeywords(mention.snippet, mention.matched_keywords)}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-gray-400">
                          {mention.author_name && <span>{mention.author_name}</span>}
                          {mention.published_date && <span>{mention.published_date}</span>}
                          {mention.matched_keywords && mention.matched_keywords.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {mention.matched_keywords.slice(0, 4).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {mention.url && (
                          <a
                            href={mention.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0064FF] border border-[#0064FF]/30 rounded-md hover:bg-[#0064FF]/5 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            원문
                          </a>
                        )}
                        {!mention.is_resolved && (
                          <button
                            onClick={() => resolveMention(mention.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 border border-green-200 rounded-md hover:bg-green-50 transition-colors"
                          >
                            <CheckCircle className="w-3 h-3" />
                            처리
                          </button>
                        )}
                        <button
                          onClick={() => deleteMention(mention.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          제거
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 대시보드 본문 */}
      {selectedStore && activeTab === 'dashboard' && dashboard && !dashboardLoading && (
        <>
          {/* 수집 상태 배너 */}
          {collecting && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">리뷰를 수집하고 있습니다...</p>
                <p className="text-xs text-blue-600">네이버 · 카카오 · 구글에서 최신 리뷰를 가져오는 중</p>
              </div>
              <div className="w-32 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          )}

          {!collecting && showCollectionSuccess && collectionResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">
                  새 리뷰 {collectionResult.collected_count}건 수집 완료
                </p>
                {Object.keys(collectionResult.by_platform).length > 0 && (
                  <p className="text-xs text-green-600 mt-0.5">
                    {Object.entries(collectionResult.by_platform).map(([p, c]) => `${platformLabel(p)} ${c}건`).join(' · ')}
                  </p>
                )}
                {collectionResult.platform_ids && (
                  <div className="flex gap-2 mt-2">
                    {(['naver_place_id', 'google_place_id', 'kakao_place_id'] as const).map(key => {
                      const connected = !!collectionResult.platform_ids?.[key]
                      const label = key === 'naver_place_id' ? '네이버' : key === 'google_place_id' ? '구글' : '카카오'
                      return (
                        <span key={key} className={`text-[10px] px-2 py-0.5 rounded-full ${
                          connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {label} {connected ? '연결됨' : '미연결'}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 수집 버튼 영역 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {dashboard.store?.last_crawled_at ? (
                <>마지막 수집: {formatRelativeTime(dashboard.store.last_crawled_at)} · </>
              ) : null}
              총 {dashboard.stats?.total_reviews || 0}건의 리뷰
            </div>
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
          </div>

          {/* 플랫폼 연결 상태 */}
          {dashboard.store && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#0064FF]" />
                플랫폼 연결 상태
              </h3>
              <div className="flex gap-4">
                {([
                  { key: 'naver_place_id', label: '네이버', platform: 'naver_place', color: 'green' },
                  { key: 'google_place_id', label: '구글', platform: 'google', color: 'blue' },
                  { key: 'kakao_place_id', label: '카카오', platform: 'kakao', color: 'yellow' },
                ] as const).map(({ key, label, platform, color }) => {
                  const connected = !!dashboard.store[key as keyof StoreInfo]
                  const reviewCount = dashboard.stats?.platform_stats?.[platform]?.count || 0
                  return (
                    <div key={key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                      connected ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50'
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${connected ? `bg-${color}-500` : 'bg-gray-300'}`}
                        style={{ backgroundColor: connected ? (color === 'green' ? '#22c55e' : color === 'blue' ? '#3b82f6' : '#eab308') : '#d1d5db' }}
                      />
                      <span className={`text-sm font-medium ${connected ? 'text-gray-800' : 'text-gray-400'}`}>
                        {label}
                      </span>
                      {connected && (
                        <span className="text-xs text-gray-500">{reviewCount}건</span>
                      )}
                      {!connected && (
                        <span className="text-[10px] text-gray-400">미연결</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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

          {/* 최근 리뷰 미리보기 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#0064FF]" />
                최근 리뷰
              </h3>
              <Link href="/reputation-monitor/reviews" className="text-sm text-[#0064FF] hover:underline">
                전체 보기 →
              </Link>
            </div>
            {recentReviews.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">아직 수집된 리뷰가 없습니다</p>
                <p className="text-xs mt-1">&apos;리뷰 새로 수집&apos; 버튼을 눌러보세요</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentReviews.map(review => (
                  <div key={review.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-800">{review.author_name}</span>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(i => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${i <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
                            />
                          ))}
                        </div>
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                          review.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                          review.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {review.sentiment === 'positive' ? '긍정' : review.sentiment === 'negative' ? '부정' : '중립'}
                        </span>
                        <span className="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-50 rounded">
                          {platformLabel(review.platform)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{review.content || '(내용 없음)'}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 mt-1">
                      {review.review_date || review.collected_at?.split('T')[0]}
                    </span>
                  </div>
                ))}
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

      {selectedStore && activeTab === 'dashboard' && dashboardLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#0064FF] animate-spin" />
        </div>
      )}

      {/* 가게 등록 모달 (통합 검색 + URL 입력) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-2">가게 등록</h2>
            <p className="text-sm text-gray-500 mb-4">가게명으로 검색하거나 URL을 입력하세요</p>

            {/* 모드 탭: 통합 검색 / URL 직접 입력 */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
              <button
                onClick={() => setSearchMode('search')}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                  searchMode === 'search'
                    ? 'bg-white text-[#0064FF] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                통합 검색
              </button>
              <button
                onClick={() => setSearchMode('url')}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                  searchMode === 'url'
                    ? 'bg-white text-[#0064FF] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                URL 직접 입력
              </button>
            </div>

            {/* 검색 모드 */}
            {searchMode === 'search' && (
              <>
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
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 text-sm">{place.name}</span>
                          {place.platform === 'kakao' && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-700 rounded">카카오</span>
                          )}
                          {place.platform === 'naver' && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">네이버</span>
                          )}
                        </div>
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
                  {searching && (
                    <div className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[#0064FF] mx-auto mb-2" />
                      <p className="text-sm text-gray-400">카카오 + 네이버 검색 중...</p>
                    </div>
                  )}
                  {searchResults.length === 0 && searchQuery && !searching && (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-400 mb-1">검색 결과가 없습니다</p>
                      <p className="text-xs text-gray-300">URL 직접 입력 탭을 이용해보세요</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* URL 모드 */}
            {searchMode === 'url' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={e => { setUrlInput(e.target.value); setUrlResult(null) }}
                    onKeyDown={e => e.key === 'Enter' && parseUrl()}
                    placeholder="https://map.naver.com/p/entry/place/..."
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30 focus:border-[#0064FF]"
                  />
                  <button
                    onClick={parseUrl}
                    disabled={urlParsing || !urlInput.trim()}
                    className="px-4 py-2.5 bg-[#0064FF] text-white rounded-lg text-sm font-medium hover:bg-[#0052CC] disabled:opacity-50 whitespace-nowrap"
                  >
                    {urlParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'URL 확인'}
                  </button>
                </div>
                <p className="text-xs text-gray-400">
                  네이버 지도, 카카오맵, 구글 지도 URL을 붙여넣으세요
                </p>

                {urlResult && (
                  <div className="space-y-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm text-green-700">
                        <span className="font-medium">
                          {urlResult.platform === 'naver' ? '네이버 플레이스' : urlResult.platform === 'kakao' ? '카카오맵' : '구글 지도'}
                        </span>
                        <span className="text-green-500">ID: {urlResult.place_id}</span>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={urlStoreName}
                      onChange={e => setUrlStoreName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && urlStoreName.trim() && registerFromUrl()}
                      placeholder="가게 이름 입력 (필수)"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30 focus:border-[#0064FF]"
                    />
                    <button
                      onClick={registerFromUrl}
                      disabled={registering || !urlStoreName.trim()}
                      className="w-full py-2.5 bg-[#0064FF] text-white rounded-lg text-sm font-medium hover:bg-[#0052CC] disabled:opacity-50"
                    >
                      {registering ? '등록 중...' : '등록'}
                    </button>
                  </div>
                )}
              </div>
            )}

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
