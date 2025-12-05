'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'
import KeywordInsights from '@/components/KeywordInsights'
import * as Tabs from '@radix-ui/react-tabs'
import { motion } from 'framer-motion'
import { Check, Loader2, X, TrendingUp, TrendingDown } from 'lucide-react'

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
  blog?: {
    blog_age_days?: number
  }
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
}

interface KeywordSearchResponse {
  keyword: string
  total_found: number
  analyzed_count: number
  successful_count: number
  results: BlogIndexResult[]
  insights: KeywordSearchInsights
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
      blog_age_gap: number
      visitors_gap: number
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

export default function KeywordSearchPage() {
  // 멀티 키워드 검색 관련
  const [keywordsInput, setKeywordsInput] = useState('')
  const [keywordStatuses, setKeywordStatuses] = useState<KeywordSearchStatus[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('input')

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

  const router = useRouter()

  // 멀티 키워드 검색 핸들러
  const handleMultiKeywordSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    // 입력된 키워드 파싱 (쉼표, 줄바꿈, 공백으로 구분)
    const keywords = keywordsInput
      .split(/[,\n]/)
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .slice(0, 10) // 최대 10개

    if (keywords.length === 0) {
      setError('최소 1개 이상의 키워드를 입력하세요')
      return
    }

    if (keywords.length > 10) {
      setError('최대 10개까지만 입력 가능합니다')
      return
    }

    // 초기 상태 설정
    const initialStatuses: KeywordSearchStatus[] = keywords.map(keyword => ({
      keyword,
      status: 'pending',
      progress: 0,
      result: null,
      error: null,
      startTime: Date.now()
    }))

    setKeywordStatuses(initialStatuses)
    setIsAnalyzing(true)
    setError('')

    // 각 키워드를 병렬로 검색
    const searchPromises = keywords.map(async (keyword, index) => {
      try {
        // 상태를 loading으로 업데이트
        setKeywordStatuses(prev =>
          prev.map((status, i) =>
            i === index ? { ...status, status: 'loading' as const, progress: 10 } : status
          )
        )

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/blogs/search-keyword-with-tabs?keyword=${encodeURIComponent(keyword)}&limit=13&analyze_content=true`,
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
    })

    // 모든 검색 완료 대기
    await Promise.all(searchPromises)
    setIsAnalyzing(false)

    // 첫 번째 완료된 키워드로 탭 전환
    const firstCompleted = keywords.find((_, i) =>
      keywordStatuses[i]?.status === 'completed'
    )
    if (firstCompleted) {
      setActiveTab(firstCompleted)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!keyword.trim()) {
      setError('키워드를 입력하세요')
      return
    }

    setLoading(true)
    setError('')
    setResults(null)
    setMyBlogResult(null) // 새 검색 시 내 블로그 결과 초기화
    setProgress(0)
    setProgressMessage('블로그 검색 중...')

    try {
      // 진행률 시뮬레이션 (실제 백엔드 응답 전까지)
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return 90 // 90%에서 대기
          return prev + 2
        })
      }, 1000) // 1초마다 2% 증가

      // 단계별 메시지 업데이트
      const messageInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 20) setProgressMessage('블로그 검색 중...')
          else if (prev < 40) setProgressMessage('블로그 목록 수집 중...')
          else if (prev < 60) setProgressMessage('블로그 분석 준비 중...')
          else if (prev < 80) setProgressMessage('블로그 상세 분석 중...')
          else setProgressMessage('결과 정리 중...')
          return prev
        })
      }, 3000) // 3초마다 메시지 변경

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/blogs/search-keyword-with-tabs?keyword=${encodeURIComponent(keyword)}&limit=13&analyze_content=true`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      clearInterval(progressInterval)
      clearInterval(messageInterval)
      setProgress(100)
      setProgressMessage('완료!')

      if (!response.ok) {
        throw new Error('검색 실패')
      }

      const data: KeywordSearchResponse = await response.json()
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
      setTimeout(() => {
        setProgress(0)
        setProgressMessage('')
      }, 1000)
    }
  }

  const openBreakdownModal = async (blogId: string) => {
    setSelectedBlogId(blogId)
    setShowBreakdownModal(true)
    setLoadingBreakdown(true)
    setBreakdownData(null)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/blogs/${blogId}/score-breakdown`)
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/blogs/analyze`, {
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

      // 10위권 블로그들의 평균 계산 (C-Rank 전체 요소 기준)
      const top10Blogs = keywordResults.results.slice(0, 10).filter(b => b.index)

      const avgCRank = top10Blogs.reduce((sum, b) => {
        const breakdown = b.index?.score_breakdown
        if (!breakdown) return sum
        return sum + (breakdown.c_rank || (breakdown as any).trust || 0)
      }, 0) / top10Blogs.length

      // C-Rank 구성 요소 평균
      const avgPosts = top10Blogs.reduce((sum, b) => sum + (b.stats?.total_posts || 0), 0) / top10Blogs.length
      const avgNeighbors = top10Blogs.reduce((sum, b) => sum + (b.stats?.neighbor_count || 0), 0) / top10Blogs.length
      const avgBlogAge = top10Blogs.reduce((sum, b) => sum + (b.blog?.blog_age_days || 0), 0) / top10Blogs.length
      const avgVisitors = top10Blogs.reduce((sum, b) => sum + (b.stats?.total_visitors || 0), 0) / top10Blogs.length

      const breakdown = myBlog.index.score_breakdown
      const myCRank = breakdown.c_rank ?? (breakdown as any).trust ?? 0
      const myPosts = myBlog.stats.total_posts
      const myNeighbors = myBlog.stats.neighbor_count
      const myBlogAge = myBlog.blog.blog_age_days || 0
      const myVisitors = myBlog.stats.total_visitors || 0

      // 격차 계산 (C-Rank 모든 요소)
      const cRankGap = avgCRank - myCRank
      const postsGap = avgPosts - myPosts
      const neighborsGap = avgNeighbors - myNeighbors
      const blogAgeGap = avgBlogAge - myBlogAge
      const visitorsGap = avgVisitors - myVisitors

      // 10위권 진입 가능성 계산 (C-Rank 기준)
      const cRankDiff = (myCRank / avgCRank) * 100
      let probability = Math.min(Math.max(cRankDiff - 20, 0), 100)

      // 예상 순위 계산 (순수 C-Rank 점수만 비교)
      const betterBlogs = top10Blogs.filter(b => {
        const blogBreakdown = b.index?.score_breakdown
        if (!blogBreakdown) return false
        const blogCRank = blogBreakdown.c_rank ?? (blogBreakdown as any).trust ?? 0
        return blogCRank > myCRank
      }).length
      const rankEstimate = betterBlogs + 1

      // 추천사항 생성 (C-Rank 모든 요소 반영)
      const recommendations: string[] = []

      // 1. C-Rank 총점 격차
      if (cRankGap > 5) {
        recommendations.push(`C-Rank를 ${cRankGap.toFixed(1)}점 개선하세요`)
      }

      // 2. 블로그 나이 (Creator 요소 - 60점/100점)
      if (blogAgeGap > 365) {
        const yearGap = Math.floor(blogAgeGap / 365)
        const monthGap = Math.floor((blogAgeGap % 365) / 30)
        let ageMessage = `블로그 나이가 평균보다 ${yearGap}년`
        if (monthGap > 0) ageMessage += ` ${monthGap}개월`
        ageMessage += ' 짧습니다 (시간이 지나면 자동 개선)'
        recommendations.push(ageMessage)
      } else if (blogAgeGap > 30) {
        const monthGap = Math.floor(blogAgeGap / 30)
        recommendations.push(`블로그 나이가 평균보다 ${monthGap}개월 짧습니다 (시간이 지나면 자동 개선)`)
      }

      // 3. 포스팅 수 (Creator 요소 - 40점/100점)
      if (postsGap > 50) {
        recommendations.push(`포스트를 ${Math.ceil(postsGap)}개 더 작성하세요 (꾸준한 포스팅 중요)`)
      } else if (postsGap > 20) {
        recommendations.push(`포스트를 ${Math.ceil(postsGap)}개 더 작성하세요`)
      }

      // 4. 이웃 수 (Chain 요소 - 20점/100점)
      if (neighborsGap > 50) {
        recommendations.push(`이웃을 ${Math.ceil(neighborsGap)}명 더 늘리세요 (소통 활성화)`)
      } else if (neighborsGap > 10) {
        recommendations.push(`이웃을 ${Math.ceil(neighborsGap)}명 더 늘리세요`)
      }

      // 5. 방문자 수 (중요 지표)
      if (visitorsGap > 1000) {
        recommendations.push(`방문자 수를 ${Math.ceil(visitorsGap).toLocaleString()}명 늘리세요 (SEO 최적화, 홍보 활동)`)
      } else if (visitorsGap > 500) {
        recommendations.push(`방문자 수를 ${Math.ceil(visitorsGap)}명 늘리세요`)
      }

      if (recommendations.length === 0) {
        recommendations.push('✨ 현재 C-Rank 기준 10위권 진입 가능한 수준입니다!')
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
            score_gap: 0, // Legacy field
            c_rank_gap: cRankGap,
            dia_gap: 0, // Legacy field
            posts_gap: postsGap,
            neighbors_gap: neighborsGap,
            blog_age_gap: blogAgeGap,
            visitors_gap: visitorsGap,
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/blogs/analyze`, {
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
      const avgBlogAge = top10Blogs.reduce((sum, b) => sum + (b.blog?.blog_age_days || 0), 0) / top10Blogs.length
      const avgVisitors = top10Blogs.reduce((sum, b) => sum + (b.stats?.total_visitors || 0), 0) / top10Blogs.length

      const myScore = myBlog.index.total_score
      const breakdown = myBlog.index.score_breakdown
      const myCRank = breakdown.c_rank ?? (breakdown as any).trust ?? 0
      const myDia = breakdown.dia ?? (breakdown as any).content ?? 0
      const myPosts = myBlog.stats.total_posts
      const myNeighbors = myBlog.stats.neighbor_count
      const myBlogAge = myBlog.blog.blog_age_days || 0
      const myVisitors = myBlog.stats.total_visitors || 0

      // 격차 계산
      const scoreGap = avgScore - myScore
      const cRankGap = avgCRank - myCRank
      const diaGap = avgDia - myDia
      const postsGap = avgPosts - myPosts
      const neighborsGap = avgNeighbors - myNeighbors
      const blogAgeGap = avgBlogAge - myBlogAge
      const visitorsGap = avgVisitors - myVisitors

      // 내 블로그 레벨
      const myLevel = myBlog.index.level

      // 10위권 진입 가능성 계산 (블로그 레벨 기준)
      const avgLevel = top10Blogs.reduce((sum, b) => sum + (b.index?.level || 0), 0) / top10Blogs.length
      const levelDiff = (myLevel / avgLevel) * 100
      let probability = Math.min(Math.max(levelDiff - 20, 0), 100)

      // 예상 순위 계산 (순수 블로그 레벨만 비교)
      const betterBlogs = top10Blogs.filter(b => {
        const blogLevel = b.index?.level || 0
        return blogLevel > myLevel
      }).length
      const rankEstimate = betterBlogs + 1

      // 추천사항 생성 (C-Rank 모든 요소 반영)
      const recommendations: string[] = []

      // 1. C-Rank 총점 격차
      if (cRankGap > 5) {
        recommendations.push(`C-Rank를 ${cRankGap.toFixed(1)}점 개선하세요`)
      }

      // 2. 블로그 나이 (Creator 요소 - 60점/100점)
      if (blogAgeGap > 365) {
        const yearGap = Math.floor(blogAgeGap / 365)
        const monthGap = Math.floor((blogAgeGap % 365) / 30)
        let ageMessage = `블로그 나이가 평균보다 ${yearGap}년`
        if (monthGap > 0) ageMessage += ` ${monthGap}개월`
        ageMessage += ' 짧습니다 (시간이 지나면 자동 개선)'
        recommendations.push(ageMessage)
      } else if (blogAgeGap > 30) {
        const monthGap = Math.floor(blogAgeGap / 30)
        recommendations.push(`블로그 나이가 평균보다 ${monthGap}개월 짧습니다 (시간이 지나면 자동 개선)`)
      }

      // 3. 포스팅 수 (Creator 요소 - 40점/100점)
      if (postsGap > 50) {
        recommendations.push(`포스트를 ${Math.ceil(postsGap)}개 더 작성하세요 (꾸준한 포스팅 중요)`)
      } else if (postsGap > 20) {
        recommendations.push(`포스트를 ${Math.ceil(postsGap)}개 더 작성하세요`)
      }

      // 4. 이웃 수 (Chain 요소 - 20점/100점)
      if (neighborsGap > 50) {
        recommendations.push(`이웃을 ${Math.ceil(neighborsGap)}명 더 늘리세요 (소통 활성화)`)
      } else if (neighborsGap > 10) {
        recommendations.push(`이웃을 ${Math.ceil(neighborsGap)}명 더 늘리세요`)
      }

      // 5. 방문자 수 (중요 지표)
      if (visitorsGap > 1000) {
        recommendations.push(`방문자 수를 ${Math.ceil(visitorsGap).toLocaleString()}명 늘리세요 (SEO 최적화, 홍보 활동)`)
      } else if (visitorsGap > 500) {
        recommendations.push(`방문자 수를 ${Math.ceil(visitorsGap)}명 늘리세요`)
      }

      if (recommendations.length === 0) {
        recommendations.push('✨ 현재 C-Rank 기준 10위권 진입 가능한 수준입니다!')
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
            score_gap: 0, // Legacy field
            c_rank_gap: cRankGap,
            dia_gap: 0, // Legacy field
            posts_gap: postsGap,
            neighbors_gap: neighborsGap,
            blog_age_gap: blogAgeGap,
            visitors_gap: visitorsGap,
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
              className="text-2xl hover:opacity-60 transition-opacity"
            >
              ←
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

        {/* Multi-Keyword Search Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <form onSubmit={handleMultiKeywordSearch}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                검색할 키워드 (최대 10개)
              </label>
              <textarea
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="키워드를 쉼표(,)로 구분해서 입력하세요 (띄어쓰기 X)&#10;예시: 강남아토피병원,강남피부과,청담동피부과"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-32 resize-none"
                disabled={isAnalyzing}
              />
              <p className="mt-2 text-xs text-gray-500">
                {keywordsInput.split(/[,\n]/).filter(k => k.trim()).length}/10 키워드
              </p>
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
          <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-purple-600">
                                  {status.result.insights.average_score}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 점수</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-pink-600">
                                  Lv.{status.result.insights.average_level}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 레벨</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-blue-600">
                                  {status.result.insights.average_posts}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 포스트</div>
                              </div>
                              <div className="bg-white rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-green-600">
                                  {status.result.insights.average_neighbors}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">평균 이웃</div>
                              </div>
                            </div>
                            <div className="mt-4 text-sm text-gray-700">
                              <strong>{status.result.total_found}개</strong> 블로그 발견,{' '}
                              <strong>{status.result.successful_count}개</strong> 분석 완료
                            </div>
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
                                  <p className="text-xs text-gray-500 mt-1">{myBlogResults[status.keyword].index.grade}</p>
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
                                          <span className={`text-lg font-bold ${getScoreColor(blog.index.total_score)}`}>
                                            {blog.index.total_score.toFixed(1)}
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
                                          <button
                                            onClick={() => openBreakdownModal(blog.blog_id)}
                                            className="px-3 py-1.5 text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg transition-all font-semibold whitespace-nowrap"
                                          >
                                            상세
                                          </button>
                                        </td>
                                      </>
                                    ) : (
                                      <td colSpan={6} className="px-3 py-3 text-center text-sm text-red-600">
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
                <p className="text-xs text-gray-500 mt-1">{myBlogResult.index.grade}</p>
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
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-600">{results.insights.average_score}</div>
                    <div className="text-xs text-gray-600">평균 점수</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-pink-600">Lv.{results.insights.average_level}</div>
                    <div className="text-xs text-gray-600">평균 레벨</div>
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

            {/* 연관 검색어 및 검색량 */}
            <div className="mb-6">
              <KeywordInsights keyword={results.keyword} />
            </div>


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
                                <span className="text-xs text-gray-500 truncate max-w-[80px]">{blog.index.grade}</span>
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
                          <td colSpan={6} className="px-3 py-3 text-center text-sm text-red-600">
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
    </div>
  )
}
