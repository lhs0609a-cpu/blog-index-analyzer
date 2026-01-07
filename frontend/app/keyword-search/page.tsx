'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'
import { getApiUrl } from '@/lib/api/apiConfig'
import * as Tabs from '@radix-ui/react-tabs'
import { motion } from 'framer-motion'
import { Check, Loader2, X, TrendingUp, TrendingDown, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth'
import { incrementUsage, checkUsageLimit } from '@/lib/api/subscription'
import { useFeatureAccess } from '@/lib/features/useFeatureAccess'
import { PLAN_INFO } from '@/lib/features/featureAccess'
import toast from 'react-hot-toast'
import Tutorial, { keywordAnalysisTutorialSteps } from '@/components/Tutorial'

interface BlogIndexResult {
  rank: number
  blog_id: string
  blog_name: string
  blog_url: string
  post_title: string
  post_url: string
  tab_type?: string  // VIEW, BLOG, SMART_BLOCK
  rank_in_tab?: number  // Position within the tab
  rank_in_smart_block?: number  // Position within smart block keyword
  is_influencer?: boolean  // Influencer badge
  smart_block_keyword?: string  // Keyword for smart block
  index: {
    level: number
    grade: string
    level_category: string
    total_score: number
    percentile: number
    score_breakdown: {
      c_rank: number
      dia: number
    }
  } | null
  stats: {
    total_posts: number
    total_visitors: number
    neighbor_count: number
  } | null
  post_analysis?: {
    content_length: number  // 글자수 (공백 제외)
    image_count: number  // 이미지 수
    video_count: number  // 영상 수
    heading_count: number  // 소제목 수
    keyword_count: number  // 키워드 등장 횟수
    keyword_density: number  // 키워드 밀도
    like_count: number  // 공감 수
    comment_count: number  // 댓글 수
    has_map: boolean  // 지도 포함 여부
    has_link: boolean  // 외부 링크 포함 여부
    title_has_keyword: boolean  // 제목에 키워드 포함
    post_age_days?: number  // 포스트 작성 후 경과일
  } | null
  error?: string
}

interface KeywordSearchInsights {
  average_score: number
  average_level: number
  average_posts: number
  average_neighbors: number
  top_level: number
  top_score: number
  score_distribution: {
    [key: string]: number
  }
  common_patterns: string[]
  // 포스트 콘텐츠 분석 통계
  average_content_length?: number  // 평균 글자수
  average_image_count?: number  // 평균 이미지 수
  average_video_count?: number  // 평균 영상 수
}

interface KeywordSearchResponse {
  keyword: string
  total_found: number
  analyzed_count: number
  successful_count: number
  results: BlogIndexResult[]
  insights: KeywordSearchInsights
  learning?: LearningData  // 학습 엔진 데이터
  timestamp: string
}

interface MyBlogAnalysis {
  blog_id: string
  blog_name: string
  index: {
    level: number
    grade: string
    total_score: number
    score_breakdown: {
      c_rank: number
      dia: number
    }
  }
  stats: {
    total_posts: number
    total_visitors: number
    neighbor_count: number
  }
  competitiveness: {
    can_enter_top10: boolean
    probability: number
    rank_estimate: number
    gaps: {
      score_gap: number
      c_rank_gap: number
      dia_gap: number
      posts_gap: number
      neighbors_gap: number
    }
    recommendations: string[]
  }
}

// 멀티 키워드 검색 상태 인터페이스
interface KeywordSearchStatus {
  keyword: string
  status: 'pending' | 'loading' | 'completed' | 'error'
  progress: number
  result: KeywordSearchResponse | null
  error: string | null
  startTime: number
}

// 연관 키워드 인터페이스
interface RelatedKeyword {
  keyword: string
  monthly_pc_search: number | null
  monthly_mobile_search: number | null
  monthly_total_search: number | null
  competition: string | null
}

interface RelatedKeywordsResponse {
  success: boolean
  keyword: string
  source: string
  total_count: number
  keywords: RelatedKeyword[]
  error?: string
  message?: string
}

// 키워드 트리 인터페이스
interface KeywordTreeNode {
  keyword: string
  monthly_pc_search: number | null
  monthly_mobile_search: number | null
  monthly_total_search: number | null
  competition: string | null
  depth: number
  parent_keyword: string | null
  children: KeywordTreeNode[]
}

interface KeywordTreeResponse {
  success: boolean
  root_keyword: string
  total_keywords: number
  depth: number
  tree: KeywordTreeNode
  flat_list: RelatedKeyword[]
  error?: string
  cached: boolean
}

// 학습 엔진 관련 인터페이스
interface LearningWeights {
  c_rank: {
    weight: number
    sub_weights: {
      context: number
      content: number
      chain: number
    }
  }
  dia: {
    weight: number
    sub_weights: {
      depth: number
      information: number
      accuracy: number
    }
  }
  extra_factors: {
    post_count: number
    neighbor_count: number
    blog_age: number
    recent_activity: number
    visitor_count: number
  }
}

interface RankDifference {
  blog_id: string
  actual_rank: number
  predicted_rank: number
  difference: number
  actual_score: number
  predicted_score: number
}

interface FactorCorrelation {
  correlation: number
  impact: 'high' | 'medium' | 'low'
  direction: 'positive' | 'negative'
}

interface LearningData {
  rank_analysis: {
    total_samples: number
    average_difference: number
    max_difference: number
    accuracy_within_3: number
    accuracy_within_5: number
    rank_differences: RankDifference[]
    factor_correlations: { [key: string]: FactorCorrelation }
  }
  current_weights: LearningWeights
  accuracy: number
  factor_correlations: { [key: string]: FactorCorrelation }
}

// 학습 엔진 상태 인터페이스
interface LearningStatus {
  current_weights: LearningWeights
  statistics: {
    total_samples: number
    current_accuracy: number
    accuracy_within_3: number
    last_training: string
    training_count: number
  }
}

function KeywordSearchContent() {
  // 인증 상태
  const { isAuthenticated, user } = useAuthStore()

  // 플랜별 기능 접근
  const { getAccess, plan } = useFeatureAccess()
  const keywordSearchAccess = getAccess('keywordSearch')
  const maxKeywords = keywordSearchAccess.limits?.maxKeywords || 10
  const canUseTreeExpansion = keywordSearchAccess.limits?.treeExpansion || false

  // 멀티 키워드 검색 관련
  const [keywordsInput, setKeywordsInput] = useState('')
  const [keywordStatuses, setKeywordStatuses] = useState<KeywordSearchStatus[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('input')
  // quickMode 제거 - 항상 전체 13개 블로그 분석

  // 단일 키워드 검색용 (하위 호환성)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<KeywordSearchResponse | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')

  // 내 블로그 비교 관련 (키워드별로 관리)
  const [myBlogId, setMyBlogId] = useState('')
  const [myBlogAnalyzing, setMyBlogAnalyzing] = useState<{[keyword: string]: boolean}>({})
  const [myBlogResults, setMyBlogResults] = useState<{[keyword: string]: MyBlogAnalysis}>({})

  // 하위 호환성을 위한 단일 결과
  const [myBlogResult, setMyBlogResult] = useState<MyBlogAnalysis | null>(null)

  // 상세 분석 모달 관련
  const [showBreakdownModal, setShowBreakdownModal] = useState(false)
  const [selectedBlogId, setSelectedBlogId] = useState<string | null>(null)
  const [breakdownData, setBreakdownData] = useState<any | null>(null)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)

  // 연관 키워드 관련
  const [relatedKeywords, setRelatedKeywords] = useState<RelatedKeywordsResponse | null>(null)
  const [loadingRelatedKeywords, setLoadingRelatedKeywords] = useState(false)
  const [showAllRelatedKeywords, setShowAllRelatedKeywords] = useState(false)

  // 키워드 트리 관련 (2단계 연관 키워드 확장)
  const [keywordTree, setKeywordTree] = useState<KeywordTreeResponse | null>(null)
  const [loadingKeywordTree, setLoadingKeywordTree] = useState(false)
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Set<string>>(new Set())

  // 학습 엔진 상태
  const [learningStatus, setLearningStatus] = useState<LearningStatus | null>(null)
  const [loadingLearningStatus, setLoadingLearningStatus] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()

  // URL에서 키워드 파라미터 가져와서 자동 검색
  useEffect(() => {
    const keywordParam = searchParams.get('keyword')
    if (keywordParam && !keyword && !loading && !results) {
      setKeyword(keywordParam)
      // 약간의 딜레이 후 자동 검색 실행
      const timer = setTimeout(() => {
        performSearch(keywordParam)
      }, 100)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 검색 로직 (분리된 함수)
  const performSearch = useCallback(async (searchKeyword: string) => {
    if (!searchKeyword.trim()) return

    // 즉시 로딩 상태 표시 (사용자 피드백)
    setLoading(true)
    setError('')
    setResults(null)
    setMyBlogResult(null)
    setProgress(0)
    setProgressMessage('검색 준비 중...')

    // 로그인한 사용자인 경우 사용량 체크 및 차감
    // 관리자는 사용량 제한 없음
    if (isAuthenticated && user?.id && !user?.is_admin) {
      try {
        const usageCheck = await checkUsageLimit(user.id, 'keyword_search')
        if (!usageCheck.allowed) {
          toast.error(`일일 키워드 검색 한도(${usageCheck.limit}회)에 도달했습니다. 업그레이드를 고려해주세요.`)
          setLoading(false)
          setProgress(0)
          setProgressMessage('')
          return
        }
        // 사용량 차감 (백그라운드에서 처리)
        incrementUsage(user.id, 'keyword_search').catch(err => {
          console.error('Usage tracking error:', err)
        })
      } catch (err) {
        console.error('Usage check error:', err)
        // 사용량 체크 실패 시에도 검색은 진행
      }
    }

    setProgressMessage('블로그 검색 중...')

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return 90
          return prev + 2
        })
      }, 1000)

      const messageInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 20) setProgressMessage('블로그 검색 중...')
          else if (prev < 40) setProgressMessage('블로그 목록 수집 중...')
          else if (prev < 60) setProgressMessage('블로그 분석 준비 중...')
          else if (prev < 80) setProgressMessage('블로그 상세 분석 중...')
          else setProgressMessage('결과 정리 중...')
          return prev
        })
      }, 3000)

      const response = await fetch(
        `${getApiUrl()}/api/blogs/search-keyword-with-tabs?keyword=${encodeURIComponent(searchKeyword)}&limit=13&analyze_content=true&quick_mode=false`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      clearInterval(progressInterval)
      clearInterval(messageInterval)
      setProgress(100)
      setProgressMessage('완료!')

      if (!response.ok) throw new Error('검색 실패')

      const data: KeywordSearchResponse = await response.json()
      setResults(data)
      fetchRelatedKeywords(searchKeyword)
      collectLearningData(searchKeyword, data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
      setTimeout(() => {
        setProgress(0)
        setProgressMessage('')
      }, 1000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user])

  // 학습 엔진 상태 조회
  const fetchLearningStatus = async () => {
    setLoadingLearningStatus(true)
    try {
      const response = await fetch(`${getApiUrl()}/api/learning/status`)
      if (response.ok) {
        const data = await response.json()
        setLearningStatus(data)
        console.log('[Learning Status] Loaded:', data)
      } else {
        console.log('[Learning Status] API not available')
      }
    } catch (err) {
      console.log('[Learning Status] Failed to fetch:', err)
    } finally {
      setLoadingLearningStatus(false)
    }
  }

  // 페이지 로드 시 학습 엔진 상태 조회
  useEffect(() => {
    fetchLearningStatus()
  }, [])

  // 멀티 키워드 검색 핸들러
  const handleMultiKeywordSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[MultiKeyword] Search started, input:', keywordsInput)

    // 입력된 키워드 파싱 (쉼표, 줄바꿈, 공백으로 구분)
    const keywords = keywordsInput
      .split(/[,\n]/)
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .slice(0, maxKeywords) // 플랜별 동적 제한

    console.log('[MultiKeyword] Parsed keywords:', keywords)

    if (keywords.length === 0) {
      setError('최소 1개 이상의 키워드를 입력하세요')
      console.log('[MultiKeyword] No keywords, returning')
      return
    }

    if (keywords.length > maxKeywords) {
      setError(`${PLAN_INFO[plan].name} 플랜은 최대 ${maxKeywords}개까지 입력 가능합니다. 업그레이드하면 더 많은 키워드를 검색할 수 있습니다.`)
      return
    }

    // 즉시 분석 상태로 전환 (사용자 피드백)
    console.log('[MultiKeyword] Setting initial statuses for', keywords.length, 'keywords')
    const initialStatuses: KeywordSearchStatus[] = keywords.map(keyword => ({
      keyword,
      status: 'pending' as const,
      progress: 0,
      result: null,
      error: null,
      startTime: Date.now()
    }))
    setKeywordStatuses(initialStatuses)
    setIsAnalyzing(true)
    setError('')

    // 로그인한 사용자인 경우 사용량 체크 및 차감 (멀티 검색은 1회로 처리)
    // 관리자는 사용량 제한 없음
    if (isAuthenticated && user?.id && !user?.is_admin) {
      try {
        const usageCheck = await checkUsageLimit(user.id, 'keyword_search')
        if (!usageCheck.allowed) {
          toast.error(`일일 키워드 검색 한도(${usageCheck.limit}회)에 도달했습니다. 업그레이드를 고려해주세요.`)
          setIsAnalyzing(false)
          setKeywordStatuses([])
          return
        }
        // 사용량 차감 (백그라운드에서 처리)
        incrementUsage(user.id, 'keyword_search').catch(err => {
          console.error('Usage tracking error:', err)
        })
      } catch (err) {
        console.error('Usage check error:', err)
        // 사용량 체크 실패 시에도 검색은 진행
      }
    }

    // 동시 요청 수 제한 (서버 과부하 방지)
    // 각 키워드당 ~40-50개의 HTTP 요청이 발생하므로 동시 요청을 3개로 제한
    const MAX_CONCURRENT = 3

    // 단일 키워드 검색 함수
    const searchSingleKeyword = async (keyword: string, index: number) => {
      try {
        // 상태를 loading으로 업데이트
        setKeywordStatuses(prev =>
          prev.map((status, i) =>
            i === index ? { ...status, status: 'loading' as const, progress: 10 } : status
          )
        )

        const response = await fetch(
          `${getApiUrl()}/api/blogs/search-keyword-with-tabs?keyword=${encodeURIComponent(keyword)}&limit=13&analyze_content=true&quick_mode=false`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )

        if (!response.ok) {
          throw new Error(`검색 실패: ${response.statusText}`)
        }

        const data: KeywordSearchResponse = await response.json()

        // 완료 상태로 업데이트
        setKeywordStatuses(prev =>
          prev.map((status, i) =>
            i === index
              ? { ...status, status: 'completed' as const, progress: 100, result: data }
              : status
          )
        )
      } catch (err) {
        // 에러 상태로 업데이트
        setKeywordStatuses(prev =>
          prev.map((status, i) =>
            i === index
              ? {
                  ...status,
                  status: 'error' as const,
                  error: err instanceof Error ? err.message : '검색 실패'
                }
              : status
          )
        )
      }
    }

    // 동시 요청 수 제한하여 병렬 처리
    const processWithConcurrencyLimit = async () => {
      const queue = keywords.map((keyword, index) => ({ keyword, index }))
      const executing: Promise<void>[] = []

      for (const { keyword, index } of queue) {
        const promise = searchSingleKeyword(keyword, index).then(() => {
          executing.splice(executing.indexOf(promise), 1)
        })
        executing.push(promise)

        // 동시 실행 수가 제한에 도달하면 하나가 완료될 때까지 대기
        if (executing.length >= MAX_CONCURRENT) {
          await Promise.race(executing)
        }
      }

      // 남은 모든 요청 완료 대기
      await Promise.all(executing)
    }

    try {
      await processWithConcurrencyLimit()
      console.log('[MultiKeyword] All searches completed')
    } catch (err) {
      console.error('[MultiKeyword] Error during search:', err)
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다')
    } finally {
      setIsAnalyzing(false)
      console.log('[MultiKeyword] isAnalyzing set to false')
    }

    // 첫 번째 키워드에 대해 연관 키워드 조회 및 학습 데이터 수집
    const firstKeyword = keywords[0]
    if (firstKeyword) {
      // 연관 키워드 조회
      fetchRelatedKeywords(firstKeyword)

      // 학습 데이터 수집을 위해 상태 업데이트 후 처리
      setTimeout(() => {
        setKeywordStatuses(currentStatuses => {
          const firstStatus = currentStatuses.find(s => s.keyword === firstKeyword && s.status === 'completed')
          if (firstStatus?.result) {
            collectLearningData(firstKeyword, firstStatus.result)
          }
          return currentStatuses
        })
      }, 100)
    }

    // 첫 번째 키워드로 탭 전환
    setActiveTab(firstKeyword || 'input')
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyword.trim()) {
      setError('키워드를 입력하세요')
      return
    }
    performSearch(keyword)
  }

  const openBreakdownModal = async (blogId: string) => {
    setSelectedBlogId(blogId)
    setShowBreakdownModal(true)
    setLoadingBreakdown(true)
    setBreakdownData(null)

    try {
      const response = await fetch(`${getApiUrl()}/api/blogs/${blogId}/score-breakdown`)
      if (!response.ok) {
        throw new Error('Failed to load breakdown data')
      }
      const data = await response.json()
      console.log('Breakdown data received:', data)
      console.log('C-Rank data:', data?.breakdown?.c_rank)
      console.log('D.I.A. data:', data?.breakdown?.dia)
      setBreakdownData(data)
    } catch (error) {
      console.error('Failed to load breakdown:', error)
      alert('상세 분석 정보를 불러올 수 없습니다')
    } finally {
      setLoadingBreakdown(false)
    }
  }

  const closeBreakdownModal = () => {
    setShowBreakdownModal(false)
    setSelectedBlogId(null)
    setBreakdownData(null)
  }

  // 키워드별 내 블로그 분석
  const analyzeMyBlogForKeyword = async (keyword: string, keywordResults: KeywordSearchResponse) => {
    if (!myBlogId.trim()) {
      alert('블로그 ID를 입력하세요')
      return
    }

    setMyBlogAnalyzing(prev => ({ ...prev, [keyword]: true }))

    try {
      // 내 블로그 분석
      const response = await fetch(`${getApiUrl()}/api/blogs/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blog_id: myBlogId.trim(),
          analysis_type: 'quick',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.detail || errorData.message || `블로그 분석 실패 (${response.status})`
        throw new Error(errorMessage)
      }

      const analysisData = await response.json()

      if (!analysisData.result || !analysisData.result.index) {
        throw new Error('블로그 분석 데이터가 올바르지 않습니다')
      }
      const myBlog = analysisData.result

      // 10위권 블로그들의 평균 계산
      const top10Blogs = keywordResults.results.slice(0, 10).filter(b => b.index)

      const avgScore = top10Blogs.reduce((sum, b) => sum + (b.index?.total_score || 0), 0) / top10Blogs.length
      const avgCRank = top10Blogs.reduce((sum, b) => {
        const breakdown = b.index?.score_breakdown
        if (!breakdown) return sum
        return sum + (breakdown.c_rank || (breakdown as any).trust || 0)
      }, 0) / top10Blogs.length
      const avgDia = top10Blogs.reduce((sum, b) => {
        const breakdown = b.index?.score_breakdown
        if (!breakdown) return sum
        return sum + (breakdown.dia || (breakdown as any).content || 0)
      }, 0) / top10Blogs.length
      const avgPosts = top10Blogs.reduce((sum, b) => sum + (b.stats?.total_posts || 0), 0) / top10Blogs.length
      const avgNeighbors = top10Blogs.reduce((sum, b) => sum + (b.stats?.neighbor_count || 0), 0) / top10Blogs.length

      const myScore = myBlog.index.total_score
      const breakdown = myBlog.index.score_breakdown
      const myCRank = breakdown.c_rank ?? (breakdown as any).trust ?? 0
      const myDia = breakdown.dia ?? (breakdown as any).content ?? 0
      const myPosts = myBlog.stats.total_posts
      const myNeighbors = myBlog.stats.neighbor_count

      // 격차 계산
      const scoreGap = avgScore - myScore
      const cRankGap = avgCRank - myCRank
      const diaGap = avgDia - myDia
      const postsGap = avgPosts - myPosts
      const neighborsGap = avgNeighbors - myNeighbors

      // 10위권 진입 가능성 계산 (C-Rank 기반)
      const cRankDiff = (myCRank / avgCRank) * 100
      let probability = Math.min(Math.max(cRankDiff - 20, 0), 100)

      // 예상 순위 계산 (C-Rank 기반)
      const betterBlogs = top10Blogs.filter(b => {
        const bBreakdown = b.index?.score_breakdown
        const bCRank = bBreakdown?.c_rank ?? (bBreakdown as any)?.trust ?? 0
        return bCRank > myCRank
      }).length
      const rankEstimate = betterBlogs + 1

      // 추천사항 생성 (C-Rank 중심)
      const recommendations: string[] = []
      if (cRankGap > 5) recommendations.push(`C-Rank를 ${cRankGap.toFixed(1)}점 개선하세요 (주제 집중, 꾸준한 포스팅, 소통 활동)`)
      if (postsGap > 20) recommendations.push(`포스트를 ${Math.ceil(postsGap)}개 더 작성하세요`)
      if (neighborsGap > 10) recommendations.push(`이웃을 ${Math.ceil(neighborsGap)}명 더 늘리세요`)

      if (recommendations.length === 0) {
        recommendations.push('현재 10위권 진입 가능한 수준입니다!')
      }

      const analysis: MyBlogAnalysis = {
        blog_id: myBlog.blog.blog_id,
        blog_name: myBlog.blog.blog_name,
        index: myBlog.index,
        stats: myBlog.stats,
        competitiveness: {
          can_enter_top10: probability >= 70,
          probability: Math.round(probability),
          rank_estimate: rankEstimate,
          gaps: {
            score_gap: scoreGap,
            c_rank_gap: cRankGap,
            dia_gap: diaGap,
            posts_gap: postsGap,
            neighbors_gap: neighborsGap,
          },
          recommendations,
        },
      }

      setMyBlogResults(prev => ({ ...prev, [keyword]: analysis }))
    } catch (err) {
      alert(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다')
    } finally {
      setMyBlogAnalyzing(prev => ({ ...prev, [keyword]: false }))
    }
  }

  const analyzeMyBlog = async () => {
    if (!myBlogId.trim()) {
      alert('블로그 ID를 입력하세요')
      return
    }

    if (!results || results.results.length === 0) {
      alert('먼저 키워드 검색을 해주세요')
      return
    }

    setMyBlogAnalyzing(prev => ({ ...prev, [results.keyword]: true }))

    try {
      // 내 블로그 분석
      const response = await fetch(`${getApiUrl()}/api/blogs/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blog_id: myBlogId.trim(),
          analysis_type: 'quick',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.detail || errorData.message || `블로그 분석 실패 (${response.status})`
        throw new Error(errorMessage)
      }

      const analysisData = await response.json()

      if (!analysisData.result || !analysisData.result.index) {
        throw new Error('블로그 분석 데이터가 올바르지 않습니다')
      }
      const myBlog = analysisData.result

      // 10위권 블로그들의 평균 계산
      const top10Blogs = results.results.slice(0, 10).filter(b => b.index)

      const avgScore = top10Blogs.reduce((sum, b) => sum + (b.index?.total_score || 0), 0) / top10Blogs.length
      const avgCRank = top10Blogs.reduce((sum, b) => {
        const breakdown = b.index?.score_breakdown
        if (!breakdown) return sum
        return sum + (breakdown.c_rank || (breakdown as any).trust || 0)
      }, 0) / top10Blogs.length
      const avgDia = top10Blogs.reduce((sum, b) => {
        const breakdown = b.index?.score_breakdown
        if (!breakdown) return sum
        return sum + (breakdown.dia || (breakdown as any).content || 0)
      }, 0) / top10Blogs.length
      const avgPosts = top10Blogs.reduce((sum, b) => sum + (b.stats?.total_posts || 0), 0) / top10Blogs.length
      const avgNeighbors = top10Blogs.reduce((sum, b) => sum + (b.stats?.neighbor_count || 0), 0) / top10Blogs.length

      const myScore = myBlog.index.total_score
      const breakdown = myBlog.index.score_breakdown
      const myCRank = breakdown.c_rank ?? (breakdown as any).trust ?? 0
      const myDia = breakdown.dia ?? (breakdown as any).content ?? 0
      const myPosts = myBlog.stats.total_posts
      const myNeighbors = myBlog.stats.neighbor_count

      // 격차 계산
      const scoreGap = avgScore - myScore
      const cRankGap = avgCRank - myCRank
      const diaGap = avgDia - myDia
      const postsGap = avgPosts - myPosts
      const neighborsGap = avgNeighbors - myNeighbors

      // 10위권 진입 가능성 계산 (C-Rank 기반)
      const cRankDiff = (myCRank / avgCRank) * 100
      let probability = Math.min(Math.max(cRankDiff - 20, 0), 100)

      // 예상 순위 계산 (C-Rank 기반)
      const betterBlogs = top10Blogs.filter(b => {
        const bBreakdown = b.index?.score_breakdown
        const bCRank = bBreakdown?.c_rank ?? (bBreakdown as any)?.trust ?? 0
        return bCRank > myCRank
      }).length
      const rankEstimate = betterBlogs + 1

      // 추천사항 생성 (C-Rank 중심)
      const recommendations: string[] = []
      if (cRankGap > 5) recommendations.push(`C-Rank를 ${cRankGap.toFixed(1)}점 개선하세요 (주제 집중, 꾸준한 포스팅, 소통 활동)`)
      if (postsGap > 20) recommendations.push(`포스트를 ${Math.ceil(postsGap)}개 더 작성하세요`)
      if (neighborsGap > 10) recommendations.push(`이웃을 ${Math.ceil(neighborsGap)}명 더 늘리세요`)

      if (recommendations.length === 0) {
        recommendations.push('현재 10위권 진입 가능한 수준입니다!')
      }

      const analysis: MyBlogAnalysis = {
        blog_id: myBlog.blog.blog_id,
        blog_name: myBlog.blog.blog_name,
        index: myBlog.index,
        stats: myBlog.stats,
        competitiveness: {
          can_enter_top10: probability >= 70,
          probability: Math.round(probability),
          rank_estimate: rankEstimate,
          gaps: {
            score_gap: scoreGap,
            c_rank_gap: cRankGap,
            dia_gap: diaGap,
            posts_gap: postsGap,
            neighbors_gap: neighborsGap,
          },
          recommendations,
        },
      }

      setMyBlogResult(analysis)
      setMyBlogResults(prev => ({ ...prev, [results.keyword]: analysis }))
    } catch (err) {
      alert(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다')
    } finally {
      setMyBlogAnalyzing(prev => ({ ...prev, [results.keyword]: false }))
    }
  }

  const getLevelColor = (level: number) => {
    if (level === 1) return 'bg-gray-400'
    if (level >= 2 && level <= 8) return 'bg-blue-400'
    if (level >= 9 && level <= 11) return 'bg-purple-400'
    if (level >= 12 && level <= 15) return 'bg-pink-500'
    return 'bg-gray-300'
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-pink-600'
    if (score >= 80) return 'text-purple-600'
    if (score >= 70) return 'text-blue-600'
    if (score >= 60) return 'text-green-600'
    return 'text-gray-600'
  }

  // 학습 데이터 수집 (백그라운드)
  const collectLearningData = async (searchKeyword: string, searchResults: KeywordSearchResponse) => {
    try {
      // 학습용 샘플 데이터 준비
      const samples = searchResults.results.map((blog, index) => ({
        blog_id: blog.blog_id,
        actual_rank: index + 1, // 실제 검색 순위
        blog_features: {
          c_rank_score: blog.index?.score_breakdown?.c_rank || 0,
          dia_score: blog.index?.score_breakdown?.dia || 0,
          post_count: blog.stats?.total_posts || 0,
          neighbor_count: blog.stats?.neighbor_count || 0,
          blog_age_days: 0, // 나중에 추가
          recent_posts_30d: 0, // 나중에 추가
          visitor_count: blog.stats?.total_visitors || 0
        }
      }))

      // 백엔드로 전송 (비동기, 실패해도 사용자 경험에 영향 없음)
      fetch(`${getApiUrl()}/api/learning/collect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyword: searchKeyword,
          search_results: samples
        })
      }).then(async (response) => {
        if (response.ok) {
          const data = await response.json()
          console.log('[Learning] 데이터 수집 완료:', data)
          // 학습이 트리거되었으면 상태 새로고침
          if (data.learning_triggered) {
            console.log('[Learning] 학습 완료, 상태 업데이트')
            fetchLearningStatus()
          }
        }
      }).catch(err => {
        // 실패해도 무시 (백그라운드 작업)
        console.log('학습 데이터 수집 실패 (무시됨):', err)
      })
    } catch (err) {
      // 학습 데이터 수집 실패는 무시
      console.log('학습 데이터 준비 실패 (무시됨):', err)
    }
  }

  // 연관 키워드 조회
  const fetchRelatedKeywords = async (searchKeyword: string) => {
    setLoadingRelatedKeywords(true)
    setShowAllRelatedKeywords(false)  // 새 검색 시 펼치기 상태 초기화
    try {
      const apiUrl = getApiUrl()
      const fullUrl = `${apiUrl}/api/blogs/related-keywords/${encodeURIComponent(searchKeyword)}`
      console.log('[Related Keywords] Fetching from:', fullUrl)

      const response = await fetch(fullUrl)
      console.log('[Related Keywords] Response status:', response.status, response.statusText)

      if (response.ok) {
        const data = await response.json()
        console.log('[Related Keywords] Data received:', data)
        setRelatedKeywords(data)
      } else {
        const errorText = await response.text()
        console.error('[Related Keywords] API error:', response.status, errorText)
        // 빈 데이터 설정하여 "연관 키워드 없음" 메시지 표시
        setRelatedKeywords({ success: false, keyword: searchKeyword, source: '', total_count: 0, keywords: [], message: `API 오류: ${response.status}` })
      }
    } catch (err) {
      console.error('[Related Keywords] Fetch failed:', err)
      // 빈 데이터 설정하여 "조회 실패" 메시지 표시
      setRelatedKeywords({ success: false, keyword: searchKeyword, source: '', total_count: 0, keywords: [], message: '연관 키워드 조회 실패' })
    } finally {
      setLoadingRelatedKeywords(false)
    }
  }

  // 키워드 트리 조회 (2단계 연관 키워드 확장) - Basic 이상만 사용 가능
  const fetchKeywordTree = async (searchKeyword: string) => {
    if (!canUseTreeExpansion) {
      toast.error('키워드 트리 확장은 Basic 플랜 이상에서 사용 가능합니다.')
      return
    }

    setLoadingKeywordTree(true)
    setKeywordTree(null)

    try {
      const apiUrl = getApiUrl()
      const response = await fetch(
        `${apiUrl}/api/blogs/related-keywords-tree/${encodeURIComponent(searchKeyword)}?depth=2&limit_per_level=10`
      )

      if (response.ok) {
        const data: KeywordTreeResponse = await response.json()
        setKeywordTree(data)
        // 1차 노드 기본 확장
        if (data.tree?.children) {
          setExpandedTreeNodes(new Set(data.tree.children.map(c => c.keyword)))
        }
      } else {
        toast.error('키워드 트리 조회에 실패했습니다.')
      }
    } catch (err) {
      console.error('[Keyword Tree] Fetch failed:', err)
      toast.error('키워드 트리 조회 중 오류가 발생했습니다.')
    } finally {
      setLoadingKeywordTree(false)
    }
  }

  // 트리 노드 확장/접기 토글
  const toggleTreeNode = (keyword: string) => {
    setExpandedTreeNodes(prev => {
      const next = new Set(prev)
      if (next.has(keyword)) {
        next.delete(keyword)
      } else {
        next.add(keyword)
      }
      return next
    })
  }

  // 연관 키워드 클릭 핸들러 - 해당 키워드로 바로 검색
  const handleRelatedKeywordClick = async (clickedKeyword: string) => {
    setKeyword(clickedKeyword)
    setKeywordsInput(clickedKeyword)
    setResults(null)
    setMyBlogResult(null)
    setRelatedKeywords(null)
    setLoading(true)
    setProgress(0)
    setProgressMessage('검색 중...')
    setError('')

    try {
      // 프로그레스 시뮬레이션
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + Math.random() * 15, 90))
      }, 500)

      const response = await fetch(
        `${getApiUrl()}/api/blogs/search-keyword-with-tabs?keyword=${encodeURIComponent(clickedKeyword)}&limit=13&analyze_content=true&quick_mode=false`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      clearInterval(progressInterval)
      setProgress(100)

      if (!response.ok) {
        throw new Error('검색에 실패했습니다')
      }

      const data = await response.json()
      setResults(data)

      // 연관 키워드도 새로 조회
      fetchRelatedKeywords(clickedKeyword)
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  // 검색량 포맷팅
  const formatSearchVolume = (volume: number | null): string => {
    if (volume === null || volume === undefined) return '-'
    if (volume >= 10000) return `${(volume / 10000).toFixed(1)}만`
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}천`
    return volume.toLocaleString()
  }

  // 키워드 연관성 점수 계산 (추천 여부 판단)
  const calculateRelevanceScore = (searchKeyword: string, relatedKw: string): number => {
    const search = searchKeyword.toLowerCase().trim()
    const related = relatedKw.toLowerCase().trim()

    // 1. 완전 일치
    if (search === related) return 100

    // 2. 포함 관계 (검색어가 연관키워드에 포함되거나 그 반대)
    if (related.includes(search)) return 90
    if (search.includes(related)) return 85

    // 3. 단어 단위 매칭
    const searchWords = search.split(/\s+/)
    const relatedWords = related.split(/\s+/)

    let matchedWords = 0
    for (const sw of searchWords) {
      if (sw.length >= 2) {  // 2글자 이상만 비교
        for (const rw of relatedWords) {
          if (rw.includes(sw) || sw.includes(rw)) {
            matchedWords++
            break
          }
        }
      }
    }

    if (matchedWords > 0) {
      return 60 + (matchedWords / searchWords.length) * 30
    }

    // 4. 부분 문자열 매칭 (2글자 이상 연속)
    for (let len = Math.min(search.length, 4); len >= 2; len--) {
      for (let i = 0; i <= search.length - len; i++) {
        const substr = search.substring(i, i + len)
        if (related.includes(substr)) {
          return 40 + len * 5
        }
      }
    }

    return 0
  }

  // 추천 키워드인지 확인 (연관성 점수 50 이상이면 추천)
  const isRecommendedKeyword = (relatedKw: string): boolean => {
    const searchKw = results?.keyword || keyword || keywordsInput.split(/[,\n]/)[0]?.trim() || ''
    if (!searchKw) return false
    return calculateRelevanceScore(searchKw, relatedKw) >= 50
  }

  // 탭별 필터링된 결과
  const getFilteredResults = () => {
    if (!results) return []
    // 탭 구분 없이 모든 결과 표시 (20개)
    return results.results
  }

  // 키워드별 그룹화된 결과 (VIEW 탭에서 사용)
  const getGroupedByKeyword = () => {
    if (!results) return []

    // VIEW 탭의 블로그들을 스마트블록 키워드별로 그룹화
    const targetBlogs = results.results.filter(b => b.tab_type === 'VIEW')

    const grouped: { [key: string]: BlogIndexResult[] } = {}

    targetBlogs.forEach(blog => {
      const keyword = blog.smart_block_keyword || '기타'
      if (!grouped[keyword]) {
        grouped[keyword] = []
      }
      grouped[keyword].push(blog)
    })

    // 각 키워드별로 상위 10개까지 선택
    return Object.entries(grouped).map(([keyword, blogs]) => ({
      keyword,
      blogs: blogs.slice(0, 10)
    }))
  }


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Connection Indicator */}
      <ConnectionIndicator />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">뒤로</span>
            </button>
            <div className="text-center">
              <h1 className="text-lg font-semibold">키워드 검색</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                플라톤 마케팅에서 개발
              </p>
            </div>
            <div className="w-6"></div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4">
        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">통계 수집 안내</h3>
              <p className="text-xs text-blue-700">
                일부 통계(포스트 수, 방문자 수)는 네이버의 접근 제한으로 인해 수집이 제한될 수 있습니다.
                이웃 수와 블로그 지수는 정상적으로 분석되며, 경쟁 분석에는 영향이 없습니다.
              </p>
            </div>
          </div>
        </div>

        {/* AI Learning Engine Status */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-purple-900">AI 학습 엔진 상태</h3>
                {loadingLearningStatus ? (
                  <span className="text-xs text-purple-500 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    로딩중...
                  </span>
                ) : learningStatus ? (
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    활성화
                  </span>
                ) : (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">비활성화</span>
                )}
              </div>

              {learningStatus ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  <div className="bg-white rounded-lg p-2 border border-purple-100">
                    <div className="text-xs text-gray-500">학습 샘플</div>
                    <div className="text-lg font-bold text-purple-700">
                      {(learningStatus.statistics?.total_samples || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-purple-100">
                    <div className="text-xs text-gray-500">예측 정확도</div>
                    <div className="text-lg font-bold text-pink-600">
                      {(learningStatus.statistics?.current_accuracy || 0).toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-purple-100">
                    <div className="text-xs text-gray-500">C-Rank 가중치</div>
                    <div className="text-lg font-bold text-blue-600">
                      {((learningStatus.current_weights?.c_rank?.weight || 0.5) * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-purple-100">
                    <div className="text-xs text-gray-500">D.I.A. 가중치</div>
                    <div className="text-lg font-bold text-orange-600">
                      {((learningStatus.current_weights?.dia?.weight || 0.5) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-purple-700 mt-1">
                  검색 데이터를 수집하여 AI가 순위 예측 정확도를 개선합니다.
                </p>
              )}

              {learningStatus && learningStatus.statistics?.training_count > 0 && (
                <p className="text-xs text-purple-600 mt-2">
                  총 {learningStatus.statistics.training_count}회 학습 완료 |
                  마지막 학습: {learningStatus.statistics?.last_training && learningStatus.statistics.last_training !== '-'
                    ? new Date(learningStatus.statistics.last_training).toLocaleString('ko-KR')
                    : '-'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Multi-Keyword Search Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <form onSubmit={handleMultiKeywordSearch}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                검색할 키워드 (최대 {maxKeywords}개)
                {maxKeywords < 100 && (
                  <span className="text-xs text-blue-600 ml-2">
                    업그레이드하면 최대 100개까지 가능
                  </span>
                )}
              </label>
              <textarea
                id="keyword-analysis-input"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="키워드를 쉼표(,)로 구분해서 입력하세요 (띄어쓰기 X)&#10;예시: 강남아토피병원,강남피부과,청담동피부과"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-32 resize-none"
                disabled={isAnalyzing}
              />
              <p className="mt-2 text-xs text-gray-500">
                {keywordsInput.split(/[,\n]/).filter(k => k.trim()).length}/{maxKeywords} 키워드
              </p>
            </div>

            {/* 전체 13개 블로그 분석 안내 */}
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
              <span className="text-green-500">✓</span>
              <span>상위 13개 블로그 전체 분석 (상세 분석)</span>
            </div>

            <button
              type="submit"
              disabled={isAnalyzing}
              className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                isAnalyzing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isAnalyzing ? '분석 중...' : '동시 검색 및 분석 시작'}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Multi-Keyword Results - Tab UI */}
        {keywordStatuses.length > 0 && (
          <Tabs.Root id="keyword-analysis-results" value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Tab Navigation */}
            <Tabs.List className="flex flex-wrap gap-2 mb-6 bg-white rounded-lg p-2 shadow-sm border border-gray-200">
              {keywordStatuses.map((status, index) => (
                <Tabs.Trigger
                  key={index}
                  value={status.keyword}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:bg-gray-100"
                >
                  <span>{status.keyword}</span>
                  {status.status === 'pending' && (
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  )}
                  {status.status === 'loading' && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {status.status === 'completed' && (
                    <Check className="w-4 h-4" />
                  )}
                  {status.status === 'error' && (
                    <X className="w-4 h-4 text-red-500" />
                  )}
                </Tabs.Trigger>
              ))}
              {keywordStatuses.filter(s => s.status === 'completed').length > 1 && (
                <Tabs.Trigger
                  value="compare"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:bg-gray-100"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>전체 비교</span>
                </Tabs.Trigger>
              )}
            </Tabs.List>

            {/* Tab Content for each keyword */}
            {keywordStatuses.map((status, index) => (
              <Tabs.Content key={status.keyword} value={status.keyword} className="focus:outline-none">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
                  >
                    {/* Keyword Header */}
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-2xl font-bold gradient-text">
                        &quot;{status.keyword}&quot; 분석 결과
                      </h3>
                      <div className="flex items-center space-x-2">
                        {status.status === 'pending' && (
                          <span className="px-4 py-2 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                            대기중
                          </span>
                        )}
                        {status.status === 'loading' && (
                          <span className="px-4 py-2 bg-blue-100 text-blue-600 rounded-full text-sm font-medium flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            분석중
                          </span>
                        )}
                        {status.status === 'completed' && (
                          <span className="px-4 py-2 bg-green-100 text-green-600 rounded-full text-sm font-medium flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            완료
                          </span>
                        )}
                        {status.status === 'error' && (
                          <span className="px-4 py-2 bg-red-100 text-red-600 rounded-full text-sm font-medium flex items-center gap-2">
                            <X className="w-4 h-4" />
                            실패
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Error Message */}
                    {status.error && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-6">
                        {status.error}
                      </div>
                    )}

                    {/* Results */}
                    {status.result && (
                      <div>
                        {/* Insights Section */}
                        {status.result.insights && (
                          <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200">
                            <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                              <span className="text-2xl">📊</span>
                              키워드 인사이트
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-orange-600">
                                  {status.result?.insights?.monthly_search_volume
                                    ? status.result.insights.monthly_search_volume >= 10000
                                      ? `${(status.result.insights.monthly_search_volume / 10000).toFixed(1)}만`
                                      : status.result.insights.monthly_search_volume >= 1000
                                        ? `${(status.result.insights.monthly_search_volume / 1000).toFixed(1)}천`
                                        : status.result.insights.monthly_search_volume.toLocaleString()
                                    : '-'}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">월검색량</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-purple-600">
                                  {status.result?.insights?.average_score || 0}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 점수</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-pink-600">
                                  Lv.{status.result?.insights?.average_level || 0}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 레벨</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-blue-600">
                                  {status.result?.insights?.average_posts || 0}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 포스트</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-green-600">
                                  {status.result?.insights?.average_neighbors || 0}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 이웃</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-blue-500">
                                  {status.result?.insights?.average_content_length
                                    ? status.result.insights.average_content_length >= 1000
                                      ? `${(status.result.insights.average_content_length / 1000).toFixed(1)}k`
                                      : status.result.insights.average_content_length
                                    : '-'}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 글자수</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-green-500">
                                  {status.result?.insights?.average_image_count?.toFixed(1) || '-'}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 사진수</div>
                              </div>
                            </div>
                            <div className="mt-4 text-sm text-gray-700">
                              <strong>{status.result?.total_found || 0}개</strong> 블로그 발견,{' '}
                              <strong>{status.result?.successful_count || 0}개</strong> 분석 완료
                            </div>
                          </div>
                        )}

                        {/* Learning Engine Info */}
                        {status.result.learning && (
                          <div className="mb-6 p-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                            <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                              <span className="text-2xl">🧠</span>
                              AI 순위 학습 엔진
                              <span className="ml-2 px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full font-semibold">
                                실시간 학습 중
                              </span>
                            </h4>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-amber-600">
                                  {(status.result?.learning?.accuracy || 0).toFixed(1)}%
                                </div>
                                <div className="text-xs text-gray-600 mt-1">예측 정확도 (±3위)</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-orange-600">
                                  {(status.result?.learning?.rank_analysis?.average_difference || 0).toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 순위 오차</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-rose-600">
                                  {status.result?.learning?.current_weights?.c_rank?.weight || 50}%
                                </div>
                                <div className="text-xs text-gray-600 mt-1">C-Rank 가중치</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-pink-600">
                                  {status.result?.learning?.current_weights?.dia?.weight || 50}%
                                </div>
                                <div className="text-xs text-gray-600 mt-1">D.I.A 가중치</div>
                              </div>
                            </div>

                            {/* Factor Correlations */}
                            {status.result?.learning?.factor_correlations && Object.keys(status.result.learning.factor_correlations).length > 0 && (
                              <div className="mt-4">
                                <h5 className="text-sm font-semibold text-gray-700 mb-2">순위에 영향을 주는 요소 분석</h5>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(status.result.learning.factor_correlations).map(([factor, data]) => (
                                    <div
                                      key={factor}
                                      className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                                        data.impact === 'high'
                                          ? 'bg-green-100 text-green-700'
                                          : data.impact === 'medium'
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-gray-100 text-gray-600'
                                      }`}
                                    >
                                      {factor === 'c_rank' && 'C-Rank'}
                                      {factor === 'dia' && 'D.I.A'}
                                      {factor === 'post_count' && '포스트 수'}
                                      {factor === 'neighbor_count' && '이웃 수'}
                                      {factor === 'visitor_count' && '방문자 수'}
                                      {data.impact === 'high' && <TrendingUp className="w-3 h-3" />}
                                      {data.impact === 'low' && <TrendingDown className="w-3 h-3" />}
                                    </div>
                                  ))}
                                </div>
                                <p className="mt-2 text-xs text-gray-500">
                                  검색할수록 AI가 실제 순위 패턴을 학습하여 예측 정확도가 향상됩니다
                                </p>
                              </div>
                            )}

                            {/* Rank Difference Details (collapsible) */}
                            {status.result.learning.rank_analysis?.rank_differences?.length > 0 && (
                              <details className="mt-4">
                                <summary className="cursor-pointer text-sm font-medium text-amber-700 hover:text-amber-800">
                                  실제 순위 vs 예측 순위 비교 보기
                                </summary>
                                <div className="mt-2 max-h-48 overflow-y-auto">
                                  <table className="w-full text-xs">
                                    <thead className="bg-amber-100 sticky top-0">
                                      <tr>
                                        <th className="px-2 py-1 text-left">블로그</th>
                                        <th className="px-2 py-1 text-center">실제 순위</th>
                                        <th className="px-2 py-1 text-center">예측 순위</th>
                                        <th className="px-2 py-1 text-center">차이</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {status.result.learning.rank_analysis.rank_differences.slice(0, 10).map((diff, idx) => (
                                        <tr key={idx} className="border-b border-amber-100">
                                          <td className="px-2 py-1 truncate max-w-[100px]">{diff.blog_id}</td>
                                          <td className="px-2 py-1 text-center font-medium">{diff.actual_rank}위</td>
                                          <td className="px-2 py-1 text-center">{diff.predicted_rank}위</td>
                                          <td className={`px-2 py-1 text-center font-bold ${
                                            Math.abs(diff.difference) <= 2 ? 'text-green-600' :
                                            Math.abs(diff.difference) <= 5 ? 'text-yellow-600' :
                                            'text-red-600'
                                          }`}>
                                            {diff.difference > 0 ? '+' : ''}{diff.difference}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </details>
                            )}
                          </div>
                        )}

                        {/* My Blog Comparison for this keyword */}
                        <div className="mb-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl shadow-sm border-2 border-purple-200 p-6">
                          <h4 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <span>🎯</span>
                            &quot;{status.keyword}&quot; 키워드 경쟁력 분석
                          </h4>
                          <p className="text-sm text-gray-600 mb-4">
                            내 블로그 ID를 입력하면 이 키워드로 10위권 진입 가능성을 분석해드립니다
                          </p>

                          <div className="flex gap-3 mb-4">
                            <input
                              type="text"
                              value={myBlogId}
                              onChange={(e) => setMyBlogId(e.target.value)}
                              placeholder="내 블로그 ID 입력"
                              className="flex-1 px-4 py-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                              disabled={myBlogAnalyzing[status.keyword]}
                            />
                            <button
                              onClick={() => analyzeMyBlogForKeyword(status.keyword, status.result!)}
                              disabled={myBlogAnalyzing[status.keyword] || !myBlogId.trim()}
                              className={`px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                                myBlogAnalyzing[status.keyword] || !myBlogId.trim()
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg'
                              }`}
                            >
                              {myBlogAnalyzing[status.keyword] ? '분석 중...' : '경쟁력 분석'}
                            </button>
                          </div>

                          {/* My Blog Analysis Result for this keyword */}
                          {myBlogResults[status.keyword] && (
                            <div className="bg-white rounded-xl shadow-lg border-2 border-purple-300 p-6 mt-4">
                              <div className="flex items-start justify-between mb-6">
                                <div>
                                  <h5 className="text-xl font-bold text-gray-800 mb-1">{myBlogResults[status.keyword].blog_name}</h5>
                                  <p className="text-sm text-gray-500">@{myBlogResults[status.keyword].blog_id}</p>
                                </div>
                                <div className="text-right">
                                  <div className={`inline-flex px-3 py-1 rounded-full text-white text-sm font-bold ${getLevelColor(myBlogResults[status.keyword].index.level)}`}>
                                    Lv.{myBlogResults[status.keyword].index.level}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">Lv.{myBlogResults[status.keyword].index.level}</p>
                                </div>
                              </div>

                              {/* 10위권 진입 가능성 */}
                              <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl p-6 mb-6">
                                <div className="flex items-center justify-between mb-4">
                                  <h6 className="text-lg font-bold text-gray-800">
                                    10위권 진입 가능성
                                  </h6>
                                  <span className={`text-3xl font-bold ${
                                    myBlogResults[status.keyword].competitiveness.probability >= 80 ? 'text-green-600' :
                                    myBlogResults[status.keyword].competitiveness.probability >= 60 ? 'text-blue-600' :
                                    myBlogResults[status.keyword].competitiveness.probability >= 40 ? 'text-orange-600' :
                                    'text-red-600'
                                  }`}>
                                    {myBlogResults[status.keyword].competitiveness.probability}%
                                  </span>
                                </div>

                                {/* Progress Bar */}
                                <div className="relative h-8 bg-white rounded-full overflow-hidden mb-4">
                                  <div
                                    className={`absolute inset-y-0 left-0 flex items-center justify-end pr-3 text-white text-sm font-bold transition-all duration-1000 ${
                                      myBlogResults[status.keyword].competitiveness.probability >= 80 ? 'bg-gradient-to-r from-green-400 to-green-600' :
                                      myBlogResults[status.keyword].competitiveness.probability >= 60 ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
                                      myBlogResults[status.keyword].competitiveness.probability >= 40 ? 'bg-gradient-to-r from-orange-400 to-orange-600' :
                                      'bg-gradient-to-r from-red-400 to-red-600'
                                    }`}
                                    style={{ width: `${myBlogResults[status.keyword].competitiveness.probability}%` }}
                                  >
                                    {myBlogResults[status.keyword].competitiveness.probability >= 20 && `${myBlogResults[status.keyword].competitiveness.probability}%`}
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-600">예상 순위</span>
                                  <span className="font-bold text-purple-600 text-lg">
                                    {myBlogResults[status.keyword].competitiveness.rank_estimate > 10
                                      ? '순위권 밖'
                                      : `${myBlogResults[status.keyword].competitiveness.rank_estimate}위`}
                                  </span>
                                </div>
                              </div>

                              {/* Score Comparison */}
                              <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="bg-gray-50 rounded-lg p-4 text-center">
                                  <div className="text-xs text-gray-500 mb-1">총점</div>
                                  <div className={`text-2xl font-bold ${getScoreColor(myBlogResults[status.keyword].index.total_score)}`}>
                                    {myBlogResults[status.keyword].index.total_score.toFixed(1)}
                                  </div>
                                  {myBlogResults[status.keyword].competitiveness.gaps.score_gap > 0 && (
                                    <div className="text-xs text-red-500 mt-1">
                                      평균 대비 -{myBlogResults[status.keyword].competitiveness.gaps.score_gap.toFixed(1)}
                                    </div>
                                  )}
                                </div>
                                <div className="bg-purple-50 rounded-lg p-4 text-center">
                                  <div className="text-xs text-purple-600 mb-1">C-Rank</div>
                                  <div className="text-2xl font-bold text-purple-600">
                                    {(() => {
                                      const breakdown = myBlogResults[status.keyword].index.score_breakdown
                                      if (typeof breakdown?.c_rank === 'number') {
                                        return breakdown.c_rank.toFixed(1)
                                      }
                                      if (typeof (breakdown as any)?.trust === 'number') {
                                        return (breakdown as any).trust.toFixed(1)
                                      }
                                      return '-'
                                    })()}
                                  </div>
                                  {myBlogResults[status.keyword].competitiveness.gaps.c_rank_gap > 0 && (
                                    <div className="text-xs text-red-500 mt-1">
                                      평균 대비 -{myBlogResults[status.keyword].competitiveness.gaps.c_rank_gap.toFixed(1)}
                                    </div>
                                  )}
                                </div>
                                <div className="bg-pink-50 rounded-lg p-4 text-center">
                                  <div className="text-xs text-pink-600 mb-1">D.I.A.</div>
                                  <div className="text-2xl font-bold text-pink-600">
                                    {(() => {
                                      const breakdown = myBlogResults[status.keyword].index.score_breakdown
                                      if (typeof breakdown?.dia === 'number') {
                                        return breakdown.dia.toFixed(1)
                                      }
                                      if (typeof (breakdown as any)?.content === 'number') {
                                        return (breakdown as any).content.toFixed(1)
                                      }
                                      return '-'
                                    })()}
                                  </div>
                                  {myBlogResults[status.keyword].competitiveness.gaps.dia_gap > 0 && (
                                    <div className="text-xs text-red-500 mt-1">
                                      평균 대비 -{myBlogResults[status.keyword].competitiveness.gaps.dia_gap.toFixed(1)}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Recommendations */}
                              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                                <h6 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                  <span>💡</span>
                                  10위권 진입을 위한 개선 방안
                                </h6>
                                <ul className="space-y-2">
                                  {myBlogResults[status.keyword].competitiveness.recommendations.map((rec, idx) => (
                                    <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                                      <span className="text-yellow-500 mt-0.5">•</span>
                                      <span>{rec}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Blog Results Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-gradient-to-r from-purple-50 to-pink-50 border-b-2 border-purple-200">
                                <tr>
                                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-16">#</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">블로그</th>
                                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-24">레벨</th>
                                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-20">총점</th>
                                  <th className="px-3 py-3 text-center text-xs font-bold text-purple-700 uppercase tracking-wider w-20">C-Rank</th>
                                  <th className="px-3 py-3 text-center text-xs font-bold text-pink-700 uppercase tracking-wider w-20">D.I.A.</th>
                                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-20">포스트</th>
                                  <th className="px-3 py-3 text-center text-xs font-bold text-blue-700 uppercase tracking-wider w-20">글자수</th>
                                  <th className="px-3 py-3 text-center text-xs font-bold text-green-700 uppercase tracking-wider w-20">사진</th>
                                  <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-20"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {status.result.results.map((blog, blogIndex) => (
                                  <tr key={blogIndex} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-3 py-3 text-center">
                                      <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold text-xs">
                                        {blog.rank}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="max-w-sm">
                                        <div className="flex items-center gap-2 mb-0.5">
                                          <span className="font-semibold text-gray-800 text-sm truncate">{blog.blog_name}</span>
                                          {blog.is_influencer && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-yellow-400 to-orange-500 text-white whitespace-nowrap">
                                              ⭐ 인플루언서
                                            </span>
                                          )}
                                        </div>
                                        <a
                                          href={blog.post_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-gray-500 hover:text-blue-600 line-clamp-1"
                                        >
                                          {blog.post_title}
                                        </a>
                                      </div>
                                    </td>
                                    {blog.index ? (
                                      <>
                                        <td className="px-3 py-3 text-center">
                                          <span className={`inline-flex px-2 py-0.5 rounded-full text-white text-xs font-bold ${getLevelColor(blog.index.level)}`}>
                                            Lv.{blog.index.level}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                          <span className={`text-lg font-bold ${getScoreColor(blog.index?.total_score || 0)}`}>
                                            {(blog.index?.total_score || 0).toFixed(1)}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                          <span className="text-base font-bold text-purple-600">
                                            {(() => {
                                              const breakdown = blog.index.score_breakdown
                                              if (!breakdown) return '-'
                                              if (typeof breakdown.c_rank === 'number') return breakdown.c_rank.toFixed(1)
                                              if (typeof (breakdown as any).trust === 'number') return (breakdown as any).trust.toFixed(1)
                                              return '-'
                                            })()}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                          <span className="text-base font-bold text-pink-600">
                                            {(() => {
                                              const breakdown = blog.index.score_breakdown
                                              if (!breakdown) return '-'
                                              if (typeof breakdown.dia === 'number') return breakdown.dia.toFixed(1)
                                              if (typeof (breakdown as any).content === 'number') return (breakdown as any).content.toFixed(1)
                                              return '-'
                                            })()}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                          <span className="text-sm text-gray-700 font-medium">
                                            {blog.stats?.total_posts === 0 ? (
                                              <span className="text-gray-400 text-xs" title="일부 통계는 네이버 차단으로 수집 불가">
                                                수집중
                                              </span>
                                            ) : (
                                              blog.stats?.total_posts || 0
                                            )}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                          <span className="text-sm text-blue-600 font-medium">
                                            {blog.post_analysis?.content_length ? (
                                              blog.post_analysis.content_length >= 1000 
                                                ? `${(blog.post_analysis.content_length / 1000).toFixed(1)}k`
                                                : blog.post_analysis.content_length
                                            ) : (
                                              <span className="text-gray-400 text-xs">-</span>
                                            )}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                          <span className="text-sm text-green-600 font-medium">
                                            {blog.post_analysis?.image_count !== undefined ? (
                                              blog.post_analysis.image_count
                                            ) : (
                                              <span className="text-gray-400 text-xs">-</span>
                                            )}
                                          </span>
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                          <button
                                            onClick={() => openBreakdownModal(blog.blog_id)}
                                            className="px-3 py-1.5 text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg transition-all font-semibold whitespace-nowrap"
                                          >
                                            상세
                                          </button>
                                        </td>
                                      </>
                                    ) : (
                                      <td colSpan={10} className="px-3 py-3 text-center text-sm text-red-600">
                                        분석 실패
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                </motion.div>
              </Tabs.Content>
            ))}

            {/* Compare Tab */}
            {keywordStatuses.filter(s => s.status === 'completed').length > 1 && (
              <Tabs.Content key="compare" value="compare" className="focus:outline-none">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
                  >
                    <h3 className="text-2xl font-bold gradient-text mb-6">
                      전체 키워드 비교
                    </h3>

                    {/* Comparison Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gradient-to-r from-green-50 to-teal-50 border-b-2 border-green-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">키워드</th>
                            <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">평균 점수</th>
                            <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">평균 레벨</th>
                            <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">평균 포스트</th>
                            <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">평균 이웃</th>
                            <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">경쟁도</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {keywordStatuses
                            .filter(s => s.status === 'completed' && s.result)
                            .map((status, idx) => {
                              const insights = status.result?.insights
                              if (!insights) return null

                              // 경쟁도 계산 (점수가 높을수록 경쟁이 치열함)
                              const competitionLevel = insights.average_score >= 80 ? '매우 높음' :
                                                      insights.average_score >= 70 ? '높음' :
                                                      insights.average_score >= 60 ? '보통' : '낮음'
                              const competitionColor = insights.average_score >= 80 ? 'text-red-600' :
                                                      insights.average_score >= 70 ? 'text-orange-600' :
                                                      insights.average_score >= 60 ? 'text-yellow-600' : 'text-green-600'

                              return (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={() => setActiveTab(status.keyword)}
                                      className="font-semibold text-purple-600 hover:text-purple-700 text-sm"
                                    >
                                      {status.keyword} →
                                    </button>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-lg font-bold text-purple-600">
                                      {insights.average_score}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-base font-semibold text-pink-600">
                                      Lv.{insights.average_level}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm text-gray-700">
                                      {insights.average_posts}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className="text-sm text-gray-700">
                                      {insights.average_neighbors}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className={`font-semibold text-sm ${competitionColor}`}>
                                      {competitionLevel}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>

                    {/* Recommendation */}
                    <div className="mt-6 p-6 bg-gradient-to-r from-green-50 to-teal-50 rounded-xl border-2 border-green-200">
                      <h4 className="font-bold text-lg text-gray-800 mb-3 flex items-center gap-2">
                        <span>💡</span>
                        추천 키워드
                      </h4>
                      {(() => {
                        const completed = keywordStatuses.filter(s => s.status === 'completed' && s.result?.insights)
                        if (completed.length === 0) return <p className="text-gray-600">분석 완료된 키워드가 없습니다</p>

                        const easiest = completed.reduce((min, curr) =>
                          (curr.result?.insights?.average_score || 100) < (min.result?.insights?.average_score || 100) ? curr : min
                        )

                        return (
                          <p className="text-gray-700">
                            <strong className="text-green-600">&quot;{easiest.keyword}&quot;</strong> 키워드의 평균 점수가 가장 낮아
                            진입하기 가장 쉬운 키워드입니다. (평균 점수: <strong>{easiest.result?.insights?.average_score}</strong>)
                          </p>
                        )
                      })()}
                    </div>
                  </motion.div>
              </Tabs.Content>
            )}
          </Tabs.Root>
        )}

        {/* Original Single Keyword Search Form (for backward compatibility) */}
        {keywordStatuses.length === 0 && !loading && !results && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-md font-semibold mb-4 text-gray-700">단일 키워드 검색 (구버전)</h3>
            <form onSubmit={handleSearch}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  검색할 키워드
                </label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="예: 맛집, 여행, 육아"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  loading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
              >
                {loading ? '검색 중...' : '단일 검색 및 분석'}
              </button>
            </form>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center mb-6">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
              <p className="text-gray-800 font-semibold text-lg mb-2">
                {progressMessage || '블로그 분석 중...'}
              </p>
              <p className="text-sm text-gray-500">
                상위 13개 블로그를 분석합니다
              </p>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">진행률</span>
                <span className="text-sm font-bold text-purple-600">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
                  style={{ width: `${progress}%` }}
                >
                  {progress > 10 && (
                    <span className="text-xs text-white font-bold">{progress}%</span>
                  )}
                </div>
              </div>
            </div>

            {/* Estimated Time */}
            <div className="text-center">
              <p className="text-xs text-gray-400">
                예상 소요 시간: 약 1분
              </p>
            </div>
          </div>
        )}

        {/* My Blog Comparison Section */}
        {results && results.results.length > 0 && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl shadow-sm border-2 border-purple-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span>🎯</span>
              내 블로그와 비교하기
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              내 블로그 ID를 입력하면 이 키워드로 10위권 진입 가능성을 분석해드립니다
            </p>

            <div className="flex gap-3">
              <input
                type="text"
                value={myBlogId}
                onChange={(e) => setMyBlogId(e.target.value)}
                placeholder="내 블로그 ID 입력"
                className="flex-1 px-4 py-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                disabled={Object.values(myBlogAnalyzing).some(v => v)}
              />
              <button
                onClick={analyzeMyBlog}
                disabled={Object.values(myBlogAnalyzing).some(v => v) || !myBlogId.trim()}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  Object.values(myBlogAnalyzing).some(v => v) || !myBlogId.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg'
                }`}
              >
                {Object.values(myBlogAnalyzing).some(v => v) ? '분석 중...' : '경쟁력 분석'}
              </button>
            </div>
          </div>
        )}

        {/* My Blog Analysis Result */}
        {myBlogResult && (
          <div className="bg-white rounded-xl shadow-lg border-2 border-purple-300 p-6 mb-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-800 mb-1">{myBlogResult.blog_name}</h3>
                <p className="text-sm text-gray-500">@{myBlogResult.blog_id}</p>
              </div>
              <div className="text-right">
                <div className={`inline-flex px-3 py-1 rounded-full text-white text-sm font-bold ${getLevelColor(myBlogResult.index.level)}`}>
                  Lv.{myBlogResult.index.level}
                </div>
                <p className="text-xs text-gray-500 mt-1">Lv.{myBlogResult.index.level}</p>
              </div>
            </div>

            {/* 10위권 진입 가능성 */}
            <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-bold text-gray-800">
                  "{keyword}" 키워드 10위권 진입 가능성
                </h4>
                <span className={`text-3xl font-bold ${
                  myBlogResult.competitiveness.probability >= 80 ? 'text-green-600' :
                  myBlogResult.competitiveness.probability >= 60 ? 'text-blue-600' :
                  myBlogResult.competitiveness.probability >= 40 ? 'text-orange-600' :
                  'text-red-600'
                }`}>
                  {myBlogResult.competitiveness.probability}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="relative h-8 bg-white rounded-full overflow-hidden mb-4">
                <div
                  className={`absolute inset-y-0 left-0 flex items-center justify-end pr-3 text-white text-sm font-bold transition-all duration-1000 ${
                    myBlogResult.competitiveness.probability >= 80 ? 'bg-gradient-to-r from-green-400 to-green-600' :
                    myBlogResult.competitiveness.probability >= 60 ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
                    myBlogResult.competitiveness.probability >= 40 ? 'bg-gradient-to-r from-orange-400 to-orange-600' :
                    'bg-gradient-to-r from-red-400 to-red-600'
                  }`}
                  style={{ width: `${myBlogResult.competitiveness.probability}%` }}
                >
                  {myBlogResult.competitiveness.probability >= 20 && `${myBlogResult.competitiveness.probability}%`}
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">예상 순위</span>
                <span className="font-bold text-purple-600 text-lg">
                  {myBlogResult.competitiveness.rank_estimate > 10
                    ? '순위권 밖'
                    : `${myBlogResult.competitiveness.rank_estimate}위`}
                </span>
              </div>
            </div>

            {/* Score Comparison */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-xs text-gray-500 mb-1">총점</div>
                <div className={`text-2xl font-bold ${getScoreColor(myBlogResult.index.total_score)}`}>
                  {myBlogResult.index.total_score.toFixed(1)}
                </div>
                {myBlogResult.competitiveness.gaps.score_gap > 0 && (
                  <div className="text-xs text-red-500 mt-1">
                    평균 대비 -{myBlogResult.competitiveness.gaps.score_gap.toFixed(1)}
                  </div>
                )}
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <div className="text-xs text-purple-600 mb-1">C-Rank</div>
                <div className="text-2xl font-bold text-purple-600">
                  {(() => {
                    const breakdown = myBlogResult.index.score_breakdown
                    if (typeof breakdown?.c_rank === 'number') {
                      return breakdown.c_rank.toFixed(1)
                    }
                    if (typeof (breakdown as any)?.trust === 'number') {
                      return (breakdown as any).trust.toFixed(1)
                    }
                    return '-'
                  })()}
                </div>
                {myBlogResult.competitiveness.gaps.c_rank_gap > 0 && (
                  <div className="text-xs text-red-500 mt-1">
                    평균 대비 -{myBlogResult.competitiveness.gaps.c_rank_gap.toFixed(1)}
                  </div>
                )}
              </div>
              <div className="bg-pink-50 rounded-lg p-4 text-center">
                <div className="text-xs text-pink-600 mb-1">D.I.A.</div>
                <div className="text-2xl font-bold text-pink-600">
                  {(() => {
                    const breakdown = myBlogResult.index.score_breakdown
                    if (typeof breakdown?.dia === 'number') {
                      return breakdown.dia.toFixed(1)
                    }
                    if (typeof (breakdown as any)?.content === 'number') {
                      return (breakdown as any).content.toFixed(1)
                    }
                    return '-'
                  })()}
                </div>
                {myBlogResult.competitiveness.gaps.dia_gap > 0 && (
                  <div className="text-xs text-red-500 mt-1">
                    평균 대비 -{myBlogResult.competitiveness.gaps.dia_gap.toFixed(1)}
                  </div>
                )}
              </div>
            </div>

            {/* Recommendations */}
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded mb-4">
              <h5 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span>💡</span>
                10위권 진입을 위한 개선 방안
              </h5>
              <ul className="space-y-2">
                {myBlogResult.competitiveness.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="text-yellow-500 mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 상세 분석 버튼 */}
            <div className="text-center">
              <button
                onClick={() => openBreakdownModal(myBlogResult.blog_id)}
                className="w-full py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <span>📊</span>
                상세 점수 계산 과정 보기
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {results && results.results.length > 0 && (
          <div>
            <div className="mb-6 text-center">
              <h2 className="text-lg font-bold text-gray-800">
                &quot;{results.keyword}&quot; 검색 결과
              </h2>
              <p className="text-sm text-gray-500">
                총 {results.analyzed_count}개 블로그 분석 완료
              </p>
            </div>

            {/* 결과 헤더 */}
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl shadow-lg border border-purple-300 p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📊</span>
                  <span className="font-bold text-lg">분석 결과</span>
                </div>
                <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
                  총 {results.results.length}개 블로그
                </span>
              </div>
            </div>

            {/* 인사이트 섹션 */}
            {results.insights && results.successful_count > 0 && (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200 p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="text-2xl">📊</span>
                  키워드 분석 인사이트
                </h3>

                {/* 통계 그리드 - 크롤링 가능한 정보만 표시 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-600">{results.insights.average_score}</div>
                    <div className="text-xs text-gray-600">평균 점수</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-pink-600">Lv.{results.insights.average_level}</div>
                    <div className="text-xs text-gray-600">평균 레벨</div>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 text-center border-2 border-blue-300 shadow-lg transform hover:scale-105 transition-transform">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <span className="text-2xl">📝</span>
                      <div className="text-3xl font-extrabold text-blue-600">
                        {results.insights.average_content_length
                          ? results.insights.average_content_length >= 1000
                            ? `${(results.insights.average_content_length / 1000).toFixed(1)}k`
                            : results.insights.average_content_length
                          : '-'}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-blue-700">평균 글자수</div>
                    <div className="text-[10px] text-blue-500 mt-1">상위노출 권장: 2k~4k자</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 text-center border-2 border-green-300 shadow-lg transform hover:scale-105 transition-transform">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <span className="text-2xl">📷</span>
                      <div className="text-3xl font-extrabold text-green-600">
                        {results.insights.average_image_count?.toFixed(1) || '-'}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-green-700">평균 사진수</div>
                    <div className="text-[10px] text-green-500 mt-1">상위노출 권장: 15~30장</div>
                  </div>
                </div>

                {/* 공통 패턴 */}
                {results.insights.common_patterns.length > 0 && (
                  <div className="bg-white rounded-lg p-4">
                    <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                      <span>💡</span>
                      상위 노출 패턴
                    </h4>
                    <ul className="space-y-1">
                      {results.insights.common_patterns.map((pattern, idx) => (
                        <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                          <span className="text-green-500 mt-1">✓</span>
                          <span>{pattern}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Blog Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-purple-50 to-pink-50 border-b-2 border-purple-200">
                    <tr>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-16">#</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">블로그</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-24">레벨</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-20">
                        <div>합산점수</div>
                        <div className="text-[10px] text-gray-500 normal-case font-normal">(총점)</div>
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-purple-700 uppercase tracking-wider w-20">
                        <div>블로그점수</div>
                        <div className="text-[10px] text-purple-600 normal-case font-normal">(C-Rank)</div>
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-pink-700 uppercase tracking-wider w-20">
                        <div>글점수</div>
                        <div className="text-[10px] text-pink-600 normal-case font-normal">(D.I.A.)</div>
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-24">
                        <div>분석한</div>
                        <div>포스트 수</div>
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-blue-700 uppercase tracking-wider w-24 bg-blue-50">
                        <div className="flex items-center justify-center gap-1">
                          <span>📝</span>
                          <span>글자수</span>
                        </div>
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-green-700 uppercase tracking-wider w-24 bg-green-50">
                        <div className="flex items-center justify-center gap-1">
                          <span>📷</span>
                          <span>사진수</span>
                        </div>
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {getFilteredResults().map((blog, idx) => (
                      <tr
                        key={blog.rank}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {/* Rank */}
                        <td className="px-3 py-3 text-center">
                          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold text-xs">
                            {idx + 1}
                          </div>
                        </td>

                        {/* Blog Info */}
                        <td className="px-4 py-3">
                          <div className="max-w-sm">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-gray-800 text-sm truncate">{blog.blog_name}</span>
                              {blog.is_influencer && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-yellow-400 to-orange-500 text-white whitespace-nowrap">
                                  ⭐ 인플루언서
                                </span>
                              )}
                            </div>
                            <a
                              href={blog.post_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gray-500 hover:text-blue-600 line-clamp-1"
                            >
                              {blog.post_title}
                            </a>
                          </div>
                        </td>

                        {blog.index ? (
                          <>
                            {/* Level */}
                            <td className="px-3 py-3 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-white text-xs font-bold ${getLevelColor(blog.index.level)}`}>
                                  Lv.{blog.index.level}
                                </span>
                                
                              </div>
                            </td>

                            {/* Total Score */}
                            <td className="px-3 py-3 text-center">
                              <span className={`text-xl font-bold ${getScoreColor(blog.index.total_score)}`}>
                                {blog.index.total_score.toFixed(1)}
                              </span>
                            </td>

                            {/* C-Rank */}
                            <td className="px-3 py-3 text-center">
                              <span className="text-base font-bold text-purple-600">
                                {(() => {
                                  const breakdown = blog.index.score_breakdown
                                  if (!breakdown) return '-'
                                  if (typeof breakdown.c_rank === 'number') return breakdown.c_rank.toFixed(1)
                                  if (typeof (breakdown as any).trust === 'number') return (breakdown as any).trust.toFixed(1)
                                  return '-'
                                })()}
                              </span>
                            </td>

                            {/* DIA */}
                            <td className="px-3 py-3 text-center">
                              <span className="text-base font-bold text-pink-600">
                                {(() => {
                                  const breakdown = blog.index.score_breakdown
                                  if (!breakdown) return '-'
                                  if (typeof breakdown.dia === 'number') return breakdown.dia.toFixed(1)
                                  if (typeof (breakdown as any).content === 'number') return (breakdown as any).content.toFixed(1)
                                  return '-'
                                })()}
                              </span>
                            </td>

                            {/* Stats - Posts only */}
                            <td className="px-3 py-3 text-center">
                              <div className="text-sm text-gray-700 font-medium">
                                {blog.stats?.total_posts === 0 ? (
                                  <span className="text-gray-400 text-xs" title="일부 통계는 네이버 차단으로 수집 불가">
                                    수집중
                                  </span>
                                ) : (
                                  `${blog.stats?.total_posts || 0}개`
                                )}
                              </div>
                            </td>

                            {/* 글자수 - 시각화 강화 */}
                            <td className="px-3 py-3 text-center">
                              {blog.post_analysis?.content_length ? (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-base font-bold text-blue-600">
                                      {blog.post_analysis.content_length >= 1000 
                                        ? `${(blog.post_analysis.content_length / 1000).toFixed(1)}k`
                                        : blog.post_analysis.content_length}
                                    </span>
                                    {results?.insights?.average_content_length && (
                                      blog.post_analysis.content_length >= results.insights.average_content_length 
                                        ? <span className="text-green-500 text-xs">▲</span>
                                        : <span className="text-red-400 text-xs">▼</span>
                                    )}
                                  </div>
                                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                      className={"h-full rounded-full " + (
                                        blog.post_analysis.content_length >= 3000 ? 'bg-green-500' :
                                        blog.post_analysis.content_length >= 2000 ? 'bg-blue-500' :
                                        blog.post_analysis.content_length >= 1000 ? 'bg-yellow-500' : 'bg-red-400'
                                      )}
                                      style={{ width: Math.min(100, (blog.post_analysis.content_length / 5000) * 100) + '%' }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>

                            {/* 사진수 - 시각화 강화 */}
                            <td className="px-3 py-3 text-center">
                              {blog.post_analysis?.image_count !== undefined && blog.post_analysis?.image_count !== null ? (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-base font-bold text-green-600">
                                      {blog.post_analysis.image_count}
                                    </span>
                                    {results?.insights?.average_image_count && (
                                      blog.post_analysis.image_count >= results.insights.average_image_count 
                                        ? <span className="text-green-500 text-xs">▲</span>
                                        : <span className="text-red-400 text-xs">▼</span>
                                    )}
                                  </div>
                                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                      className={"h-full rounded-full " + (
                                        blog.post_analysis.image_count >= 25 ? 'bg-green-500' :
                                        blog.post_analysis.image_count >= 15 ? 'bg-blue-500' :
                                        blog.post_analysis.image_count >= 8 ? 'bg-yellow-500' : 'bg-red-400'
                                      )}
                                      style={{ width: Math.min(100, (blog.post_analysis.image_count / 40) * 100) + '%' }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>

                            {/* Action */}
                            <td className="px-3 py-3 text-center">
                              <button
                                onClick={() => openBreakdownModal(blog.blog_id)}
                                className="px-3 py-1.5 text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg transition-all font-semibold whitespace-nowrap"
                              >
                                상세 보기
                              </button>
                            </td>
                          </>
                        ) : (
                          <td colSpan={10} className="px-3 py-3 text-center text-sm text-red-600">
                            분석 실패
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* No Results */}
        {results && results.results.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            검색 결과가 없습니다
          </div>
        )}

        {/* Related Keywords Section */}
        {((results && !loading) || (!isAnalyzing && keywordStatuses.length > 0 && keywordStatuses.some(s => s.status === 'completed'))) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span>🔍</span>
                연관 키워드 & 검색량
                {relatedKeywords && relatedKeywords.keywords.length > 0 && (
                  <span className="text-sm font-normal text-gray-500">
                    (총 {relatedKeywords.keywords.length}개)
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {relatedKeywords?.source && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                    {relatedKeywords.source === 'searchad' ? '네이버 검색광고 API' : '네이버 자동완성'}
                  </span>
                )}
                {/* 2단계 확장 버튼 - Basic 이상만 */}
                {relatedKeywords && relatedKeywords.keywords.length > 0 && (
                  <button
                    onClick={() => fetchKeywordTree(relatedKeywords.keyword)}
                    disabled={loadingKeywordTree || !canUseTreeExpansion}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      canUseTreeExpansion
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    }`}
                    title={canUseTreeExpansion ? '2단계 연관 키워드 확장' : 'Basic 플랜 이상에서 사용 가능'}
                  >
                    {loadingKeywordTree ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        확장 중...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        🌳 2단계 확장
                        {!canUseTreeExpansion && <span className="ml-1">🔒</span>}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {loadingRelatedKeywords ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                <span className="ml-3 text-gray-600">연관 키워드 조회 중...</span>
              </div>
            ) : relatedKeywords && relatedKeywords.keywords.length > 0 ? (
              <>
                {/* 검색량 있는 키워드 테이블 */}
                {relatedKeywords.keywords.some(kw => kw.monthly_total_search !== null) && (
                  <>
                    <div className={`overflow-x-auto ${showAllRelatedKeywords ? 'max-h-[800px]' : 'max-h-[400px]'} overflow-y-auto transition-all duration-300`}>
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50 z-10">
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 font-semibold text-gray-700 w-8">#</th>
                            <th className="text-left py-3 px-4 font-semibold text-gray-700">키워드</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-700">추천</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">PC</th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">
                              <span className="text-blue-600">📱 모바일</span>
                            </th>
                            <th className="text-right py-3 px-4 font-semibold text-gray-700">총 검색량</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-700">경쟁도</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-700"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {relatedKeywords.keywords.slice(0, showAllRelatedKeywords ? 100 : 20).map((kw, idx) => {
                            const isRecommended = isRecommendedKeyword(kw.keyword)
                            return (
                              <tr
                                key={idx}
                                className={`border-b border-gray-100 hover:bg-purple-50 transition-colors cursor-pointer ${
                                  isRecommended ? 'bg-orange-50' : ''
                                }`}
                                onClick={() => handleRelatedKeywordClick(kw.keyword)}
                              >
                                <td className="py-3 px-4 text-gray-400 text-xs">{idx + 1}</td>
                                <td className="py-3 px-4">
                                  <span className={`font-medium hover:text-purple-600 ${
                                    isRecommended ? 'text-orange-700' : 'text-gray-800'
                                  }`}>
                                    {kw.keyword}
                                  </span>
                                </td>
                                <td className="text-center py-3 px-4">
                                  {isRecommended && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-orange-400 to-pink-500 text-white rounded-full text-xs font-bold shadow-sm">
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                      </svg>
                                      추천
                                    </span>
                                  )}
                                </td>
                                <td className="text-right py-3 px-4 text-gray-600">
                                  {formatSearchVolume(kw.monthly_pc_search)}
                                </td>
                                <td className="text-right py-3 px-4">
                                  <span className="text-blue-600 font-bold">
                                    {formatSearchVolume(kw.monthly_mobile_search)}
                                  </span>
                                </td>
                                <td className="text-right py-3 px-4">
                                  <span className={`font-bold ${
                                    (kw.monthly_total_search || 0) >= 10000 ? 'text-pink-600' :
                                    (kw.monthly_total_search || 0) >= 1000 ? 'text-purple-600' :
                                    'text-gray-700'
                                  }`}>
                                    {formatSearchVolume(kw.monthly_total_search)}
                                  </span>
                                </td>
                                <td className="text-center py-3 px-4">
                                  {kw.competition && (
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      kw.competition === '높음' ? 'bg-red-100 text-red-700' :
                                      kw.competition === '중간' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-green-100 text-green-700'
                                    }`}>
                                      {kw.competition}
                                    </span>
                                  )}
                                </td>
                                <td className="text-center py-3 px-4">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRelatedKeywordClick(kw.keyword)
                                    }}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                      isRecommended
                                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                        : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                    }`}
                                  >
                                    분석
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* 펼치기/접기 버튼 */}
                    {relatedKeywords.keywords.length > 20 && (
                      <div className="mt-4 text-center">
                        <button
                          onClick={() => setShowAllRelatedKeywords(!showAllRelatedKeywords)}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-full font-medium hover:from-purple-600 hover:to-blue-600 transition-all shadow-md hover:shadow-lg"
                        >
                          {showAllRelatedKeywords ? (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                              접기 (20개만 보기)
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                              {relatedKeywords.keywords.length}개 모두 보기 (모바일 검색량 포함)
                            </>
                          )}
                        </button>
                        {!showAllRelatedKeywords && (
                          <p className="mt-2 text-sm text-gray-500">
                            현재 상위 20개만 표시 중 • 펼치면 {relatedKeywords.keywords.length}개 연관검색어와 모바일 검색량을 확인할 수 있습니다
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* 검색량 없는 경우 (자동완성) - 칩 형태 */}
                {!relatedKeywords.keywords.some(kw => kw.monthly_total_search !== null) && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {relatedKeywords.keywords.slice(0, showAllRelatedKeywords ? 100 : 20).map((kw, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleRelatedKeywordClick(kw.keyword)}
                          className="px-4 py-2 bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-700 rounded-full text-sm font-medium transition-colors flex items-center gap-1"
                        >
                          {kw.keyword}
                          <span className="text-purple-500">→</span>
                        </button>
                      ))}
                    </div>
                    {/* 펼치기/접기 버튼 */}
                    {relatedKeywords.keywords.length > 20 && (
                      <div className="mt-4 text-center">
                        <button
                          onClick={() => setShowAllRelatedKeywords(!showAllRelatedKeywords)}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-full font-medium hover:from-purple-600 hover:to-blue-600 transition-all shadow-md hover:shadow-lg"
                        >
                          {showAllRelatedKeywords ? (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                              접기 (20개만 보기)
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                              {relatedKeywords.keywords.length}개 모두 보기
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                {relatedKeywords?.message ? (
                  <div className="text-orange-600">
                    ⚠️ {relatedKeywords.message}
                  </div>
                ) : (
                  <div className="text-gray-500">
                    연관 키워드를 조회하려면 키워드를 검색하세요
                  </div>
                )}
              </div>
            )}

            {/* 키워드 트리 (2단계 연관 키워드 확장) */}
            {keywordTree && keywordTree.success && keywordTree.tree?.children && keywordTree.tree.children.length > 0 && (
              <div className="mt-6 border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-md font-bold text-gray-800 flex items-center gap-2">
                    <span>🌳</span>
                    2단계 연관 키워드 트리
                    <span className="text-sm font-normal text-gray-500">
                      (총 {keywordTree.total_keywords}개)
                    </span>
                    {keywordTree.cached && (
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">캐시</span>
                    )}
                  </h3>
                </div>

                <div className="space-y-2">
                  {keywordTree.tree.children.map((level1Node, idx) => (
                    <div key={level1Node.keyword} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* 1차 연관 키워드 헤더 */}
                      <div
                        className="flex items-center justify-between p-3 bg-purple-50 cursor-pointer hover:bg-purple-100 transition-colors"
                        onClick={() => toggleTreeNode(level1Node.keyword)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400 text-xs w-6">{idx + 1}</span>
                          <button className="text-gray-500">
                            {expandedTreeNodes.has(level1Node.keyword) ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </button>
                          <span
                            className="font-medium text-purple-700 hover:text-purple-900 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRelatedKeywordClick(level1Node.keyword)
                            }}
                          >
                            {level1Node.keyword}
                          </span>
                          <span className="px-2 py-0.5 bg-purple-200 text-purple-700 rounded text-xs">1차</span>
                          {level1Node.children && level1Node.children.length > 0 && (
                            <span className="text-xs text-gray-500">
                              (+{level1Node.children.length}개 하위)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-600">
                            {level1Node.monthly_total_search?.toLocaleString() || '-'}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            level1Node.competition === '높음' ? 'bg-red-100 text-red-700' :
                            level1Node.competition === '중간' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {level1Node.competition || '-'}
                          </span>
                        </div>
                      </div>

                      {/* 2차 연관 키워드 (확장 시) */}
                      {expandedTreeNodes.has(level1Node.keyword) && level1Node.children && level1Node.children.length > 0 && (
                        <div className="border-t border-gray-200 bg-gray-50">
                          {level1Node.children.map((level2Node, idx2) => (
                            <div
                              key={level2Node.keyword}
                              className="flex items-center justify-between px-3 py-2 pl-12 hover:bg-gray-100 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0"
                              onClick={() => handleRelatedKeywordClick(level2Node.keyword)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-gray-300 text-xs">└</span>
                                <span className="text-gray-700 hover:text-purple-600">
                                  {level2Node.keyword}
                                </span>
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">2차</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-gray-500">
                                  {level2Node.monthly_total_search?.toLocaleString() || '-'}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  level2Node.competition === '높음' ? 'bg-red-100 text-red-700' :
                                  level2Node.competition === '중간' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {level2Node.competition || '-'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Breakdown Modal */}
      {showBreakdownModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={closeBreakdownModal}
        >
          <div
            className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-2xl font-bold text-gray-800">상세 점수 계산 과정</h2>
              <button
                onClick={closeBreakdownModal}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {loadingBreakdown ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
                  <p className="text-gray-600">상세 분석 데이터를 불러오는 중...</p>
                </div>
              ) : breakdownData ? (
                <div className="space-y-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="text-sm text-gray-500">
                      분석 대상: <span className="font-semibold text-gray-700">{breakdownData.blog_info?.blog_name}</span>
                    </div>
                  </div>

                  {/* C-Rank Breakdown */}
                  {breakdownData.breakdown?.c_rank && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 rounded-xl bg-gradient-to-r from-purple-100 to-pink-100">
                          <span className="text-2xl">🏆</span>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold">C-Rank (출처 신뢰도)</h3>
                          <p className="text-sm text-gray-600">
                            점수: {breakdownData.breakdown.c_rank.score !== undefined ? `${breakdownData.breakdown.c_rank.score.toFixed(1)}` : '-'}/100 (가중치 {breakdownData.breakdown.c_rank.weight || 50}%)
                          </p>
                        </div>
                      </div>

                      {/* Context */}
                      {breakdownData.breakdown.c_rank.breakdown?.context && (
                        <div className="bg-gray-50 rounded-xl p-6">
                          <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
                            📊 Context (주제 집중도) - {breakdownData.breakdown.c_rank.breakdown.context.score}/100
                          </h4>
                          <div className="space-y-4">
                            {breakdownData.breakdown.c_rank.breakdown.context.details && Object.entries(breakdownData.breakdown.c_rank.breakdown.context.details).map(([key, detail]: [string, any]) => (
                              <div key={key} className="bg-white border-l-4 border-purple-300 pl-4 py-3 rounded">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-gray-700">{detail.description || key}</span>
                                  <span className="text-purple-600 font-semibold">
                                    {detail.score}/{detail.max_score}
                                  </span>
                                </div>

                                {/* Reasoning - 왜 이 점수를 받았는지 */}
                                {detail.reasoning && (
                                  <div className="mt-2 p-2 bg-purple-50 rounded text-sm text-gray-700">
                                    <span className="font-medium">💡 이유: </span>{detail.reasoning}
                                  </div>
                                )}

                                {/* How to improve */}
                                {detail.how_to_improve && (
                                  <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-700">
                                    <span className="font-medium">📈 개선 방법: </span>{detail.how_to_improve}
                                  </div>
                                )}

                                {/* 키워드 예시 */}
                                {detail.keyword_examples && detail.keyword_examples.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    <p className="text-sm font-medium text-gray-600">🔑 주요 키워드 예시:</p>
                                    {detail.keyword_examples.map((kwEx: any, idx: number) => (
                                      <div key={idx} className="ml-4 p-2 bg-gray-50 rounded text-sm">
                                        <div className="font-medium text-purple-700">
                                          '{kwEx.keyword}' - {kwEx.frequency}회 사용 ({kwEx.ratio})
                                        </div>
                                        {kwEx.examples && kwEx.examples.length > 0 && (
                                          <div className="mt-1 ml-2 space-y-1">
                                            {kwEx.examples.map((ex: any, exIdx: number) => (
                                              <div key={exIdx} className="text-xs text-gray-600">
                                                • {ex.title} ({ex.date})
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {detail.top_keyword && !detail.keyword_examples && (
                                  <p className="text-sm text-gray-600 mt-2">
                                    키워드: '<strong>{detail.top_keyword}</strong>' ({detail.keyword_count}회 등장)
                                  </p>
                                )}
                                {detail.avg_interval !== undefined && (
                                  <p className="text-sm text-gray-600 mt-2">
                                    평균 간격: <strong>{detail.avg_interval}일</strong>, 편차: <strong>{detail.std_deviation}일</strong>
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Content */}
                      {breakdownData.breakdown.c_rank.breakdown?.content && (
                        <div className="bg-gray-50 rounded-xl p-6">
                          <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
                            ✍️ Content (콘텐츠 품질) - {breakdownData.breakdown.c_rank.breakdown.content.score}/100
                          </h4>
                          <div className="space-y-4">
                            {breakdownData.breakdown.c_rank.breakdown.content.details && Object.entries(breakdownData.breakdown.c_rank.breakdown.content.details).map(([key, detail]: [string, any]) => (
                              <div key={key} className="bg-white border-l-4 border-pink-300 pl-4 py-3 rounded">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-gray-700">{detail.description || key}</span>
                                  <span className="text-pink-600 font-semibold">
                                    {detail.score}/{detail.max_score}
                                  </span>
                                </div>

                                {/* Reasoning */}
                                {detail.reasoning && (
                                  <div className="mt-2 p-2 bg-pink-50 rounded text-sm text-gray-700">
                                    <span className="font-medium">💡 이유: </span>{detail.reasoning}
                                  </div>
                                )}

                                {/* How to improve */}
                                {detail.how_to_improve && (
                                  <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-700">
                                    <span className="font-medium">📈 개선 방법: </span>{detail.how_to_improve}
                                  </div>
                                )}

                                {/* 포스트 길이 예시 */}
                                {detail.post_examples && detail.post_examples.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    <p className="text-sm font-medium text-gray-600">📝 개별 포스트 점수:</p>
                                    {detail.post_examples.map((post: any, idx: number) => (
                                      <div key={idx} className="ml-4 p-2 bg-gray-50 rounded text-sm border-l-2 border-pink-200">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-xs text-gray-600 font-medium">{post.title}</span>
                                          <span className="text-xs font-semibold text-pink-600">{post.score}/50점</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          길이: {post.length}자 | 품질: <span className="font-medium">{post.quality}</span>
                                        </div>
                                        {post.preview && (
                                          <div className="mt-1 text-xs text-gray-400 italic truncate">
                                            "{post.preview}..."
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* 제목 예시 */}
                                {detail.title_examples && detail.title_examples.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    <p className="text-sm font-medium text-gray-600">📌 개별 제목 점수:</p>
                                    {detail.title_examples.map((title: any, idx: number) => (
                                      <div key={idx} className="ml-4 p-2 bg-gray-50 rounded text-sm border-l-2 border-pink-200">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-xs text-gray-600">{title.title}</span>
                                          <span className="text-xs font-semibold text-pink-600">{title.score}/30점</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          길이: {title.length}자 | 평가: <span className="font-medium">{title.quality}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {detail.note && (
                                  <p className="text-xs text-gray-500 mt-2">{detail.note}</p>
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
                          <span className="text-2xl">✨</span>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold">D.I.A. (문서 품질)</h3>
                          <p className="text-sm text-gray-600">
                            점수: {breakdownData.breakdown.dia.score !== undefined ? `${breakdownData.breakdown.dia.score.toFixed(1)}` : '-'}/100 (가중치 {breakdownData.breakdown.dia.weight || 50}%)
                          </p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        {breakdownData.breakdown.dia.breakdown && Object.entries(breakdownData.breakdown.dia.breakdown).map(([key, section]: [string, any]) => {
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
                            <div key={key} className="bg-gray-50 rounded-xl p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold flex items-center gap-2">
                                  <span className="text-xl">{icons[key]}</span>
                                  {labels[key]}
                                </h4>
                                <span className={`font-bold ${section.weight < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {section.score.toFixed(1)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 mb-3">가중치: {section.weight}%</p>

                              {section.details && (
                                <div className="space-y-2 text-sm">
                                  <p className="text-gray-700">{section.details.description}</p>

                                  {/* Reasoning */}
                                  {section.details.reasoning && (
                                    <div className="mt-2 p-2 bg-yellow-50 rounded text-sm text-gray-700">
                                      <span className="font-medium">💡 이유: </span>{section.details.reasoning}
                                    </div>
                                  )}

                                  {/* How to improve */}
                                  {section.details.how_to_improve && (
                                    <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-700">
                                      <span className="font-medium">📈 개선 방법: </span>{section.details.how_to_improve}
                                    </div>
                                  )}

                                  {section.details.examples && section.details.examples.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                      <p className="font-medium text-gray-700">예시:</p>
                                      {section.details.examples.map((example: any, idx: number) => (
                                        <div key={idx} className="bg-white rounded-lg p-3 text-xs">
                                          <p className="font-medium text-gray-800 mb-1">{example.title}</p>
                                          {example.keywords && (
                                            <p className="text-gray-600">
                                              키워드: {example.keywords.join(', ')}
                                            </p>
                                          )}
                                          {example.matching_words && (
                                            <p className="text-gray-600">
                                              일치 단어: {example.matching_words.join(', ')}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Quality Level - 저품질 경고 */}
                                  {section.details.quality_level && (
                                    <div className={`mt-3 p-3 rounded-lg ${
                                      section.details.quality_level.includes('심각') ? 'bg-red-100 border-2 border-red-500' :
                                      section.details.quality_level.includes('위험') ? 'bg-red-50 border-2 border-red-400' :
                                      section.details.quality_level.includes('주의') ? 'bg-yellow-100 border border-yellow-400' :
                                      section.details.quality_level.includes('개선') ? 'bg-yellow-50 border border-yellow-300' :
                                      'bg-green-50 border border-green-300'
                                    }`}>
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className="text-lg font-bold">
                                          {section.details.quality_level.includes('심각') || section.details.quality_level.includes('위험') ? '⛔' :
                                           section.details.quality_level.includes('주의') || section.details.quality_level.includes('개선') ? '⚠️' : '✅'}
                                        </span>
                                        <span className={`font-bold text-sm ${
                                          section.details.quality_level.includes('심각') || section.details.quality_level.includes('위험') ? 'text-red-700' :
                                          section.details.quality_level.includes('주의') || section.details.quality_level.includes('개선') ? 'text-yellow-700' :
                                          'text-green-700'
                                        }`}>
                                          {section.details.quality_level}
                                        </span>
                                      </div>
                                      {section.details.critical_count > 0 && (
                                        <div className="text-xs font-semibold text-red-800 mb-2">
                                          심각한 이슈 {section.details.critical_count}개 발견
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {section.details.issues && section.details.issues.length > 0 && section.details.issues[0] !== "이슈 없음" && (
                                    <div className="mt-3">
                                      <p className="font-medium text-red-700 mb-2">발견된 이슈:</p>
                                      <ul className="space-y-1">
                                        {section.details.issues.map((issue: string, idx: number) => (
                                          <li key={idx} className={`text-xs flex items-start gap-2 ${
                                            issue.includes('심각') ? 'text-red-700 font-bold' : 'text-red-600'
                                          }`}>
                                            <span>{issue.includes('심각') ? '⚠️' : '•'}</span>
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

                  {/* Score Composition - 최종 점수 구성 */}
                  {breakdownData.breakdown?.score_composition && (
                    <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 mt-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 rounded-xl bg-gradient-to-r from-green-100 to-blue-100">
                          <span className="text-2xl">🎯</span>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold">점수 구성 - 왜 이 점수가 나왔을까요?</h3>
                          <p className="text-sm text-gray-600">
                            최종 점수: <span className="font-bold text-green-600">{breakdownData.breakdown.score_composition.final_score}/100</span>
                          </p>
                        </div>
                      </div>

                      <div className="bg-white rounded-lg p-4 mb-4">
                        <p className="text-sm text-gray-700 leading-relaxed">
                          {breakdownData.breakdown.score_composition.explanation}
                        </p>
                      </div>

                      <div className="space-y-4">
                        {breakdownData.breakdown.score_composition.components?.map((comp: any, idx: number) => (
                          <div key={idx} className="bg-white rounded-lg p-4 border-2 border-gray-200">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-lg">{comp.name}</h4>
                              <div className="text-right">
                                <div className="text-2xl font-bold text-green-600">{comp.score}/100</div>
                                <div className="text-xs text-gray-500">가중치 {comp.weight}% = {comp.contribution}점 기여</div>
                              </div>
                            </div>

                            {/* Sub-components */}
                            {comp.sub_components && comp.sub_components.length > 0 && (
                              <div className="mt-3 space-y-2 pl-4 border-l-2 border-gray-200">
                                {comp.sub_components.map((sub: any, subIdx: number) => (
                                  <div key={subIdx} className="flex items-center justify-between text-sm py-2 bg-gray-50 px-3 rounded">
                                    <span className="text-gray-700">{sub.name}</span>
                                    <div className="text-right">
                                      <span className="font-semibold text-gray-800">{sub.score}/100</span>
                                      <span className="text-xs text-gray-500 ml-2">
                                        ({sub.weight}% = {sub.contribution}점)
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 p-4 bg-blue-100 rounded-lg">
                        <h4 className="font-semibold mb-2 text-blue-900">💡 계산 방식</h4>
                        <p className="text-sm text-blue-800">
                          {breakdownData.breakdown.score_composition.calculation_method}
                        </p>
                        <p className="text-xs text-blue-700 mt-2">
                          각 요소의 점수에 가중치를 곱한 후 모두 합산하여 최종 점수를 계산합니다.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Blog Info */}
                  {breakdownData.blog_info && (
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 mt-8">
                      <h4 className="font-semibold text-lg mb-4">분석 기준 정보</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">포스트 수</p>
                          <p className="font-bold text-lg">
                            {breakdownData.blog_info.total_posts > 0 ? `${breakdownData.blog_info.total_posts}개` : (
                              <span className="text-gray-400 text-sm" title="일부 통계는 네이버 차단으로 수집 불가">수집중</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">이웃 수</p>
                          <p className="font-bold text-lg">
                            {breakdownData.blog_info.neighbor_count > 0 ? `${breakdownData.blog_info.neighbor_count}명` : (
                              <span className="text-gray-400 text-sm" title="일부 통계는 네이버 차단으로 수집 불가">수집중</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">총 방문자</p>
                          <p className="font-bold text-lg">
                            {breakdownData.blog_info.total_visitors > 0 ? `${breakdownData.blog_info.total_visitors.toLocaleString()}명` : (
                              <span className="text-gray-400 text-sm" title="일부 통계는 네이버 차단으로 수집 불가">수집중</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">운영 기간</p>
                          <p className="font-bold text-lg">
                            {breakdownData.blog_info.blog_age_days > 0 ? `${breakdownData.blog_info.blog_age_days}일` : '-일'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600">상세 분석 데이터를 불러올 수 없습니다</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-bold text-purple-600">플라톤 마케팅</span>에서 개발한 AI 기반 블로그 분석 플랫폼
            </p>
            <p className="text-xs text-gray-400">
              © 2024 Platon Marketing. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* 게임형 튜토리얼 */}
      <Tutorial
        steps={keywordAnalysisTutorialSteps}
        tutorialKey="keyword-search"
        showGameElements={true}
      />
    </div>
  )
}

// Loading fallback component
function KeywordSearchLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">로딩 중...</p>
      </div>
    </div>
  )
}

// Default export with Suspense boundary
export default function KeywordSearchPage() {
  return (
    <Suspense fallback={<KeywordSearchLoading />}>
      <KeywordSearchContent />
    </Suspense>
  )
}
