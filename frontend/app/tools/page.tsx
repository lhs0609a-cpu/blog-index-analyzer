'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, FileText, Hash, Clock, ArrowLeft, Crown,
  Search, Loader2, BarChart3, Download, Sparkles, Target,
  Calendar, Users, Eye, ThumbsUp, MessageCircle, Lightbulb,
  PenTool, Compass, LineChart, CheckCircle, XCircle, AlertCircle,
  Copy, RefreshCw, Zap, Star, TrendingDown, Award
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

type TabType = 'title' | 'blueocean' | 'writing' | 'insight' | 'prediction' | 'report' | 'hashtag' | 'timing'

// AI 제목 생성 결과 타입
interface TitleResult {
  keyword: string
  titles: {
    title: string
    ctr: number
    emotion: string
    type: string
  }[]
}

// 블루오션 키워드 결과 타입
interface BlueOceanResult {
  mainKeyword: string
  keywords: {
    keyword: string
    searchVolume: number
    competition: number
    opportunity: number
    trend: 'up' | 'down' | 'stable'
  }[]
}

// 글쓰기 가이드 결과 타입
interface WritingGuideResult {
  score: number
  checks: {
    item: string
    status: 'pass' | 'fail' | 'warning'
    message: string
    suggestion?: string
  }[]
}

// 성과 인사이트 결과 타입
interface InsightResult {
  blogId: string
  insights: {
    category: string
    title: string
    description: string
    impact: 'high' | 'medium' | 'low'
  }[]
  bestPerforming: {
    type: string
    performance: number
  }[]
  recommendations: string[]
}

// 상위 노출 예측 결과 타입
interface PredictionResult {
  keyword: string
  difficulty: number
  successRate: number
  avgScore: number
  avgPosts: number
  avgNeighbors: number
  recommendation: string
  tips: string[]
}

// 해시태그 추천 결과 타입
interface HashtagResult {
  keyword: string
  hashtags: {
    tag: string
    frequency: number
    relevance: number
  }[]
}

// 최적 발행 시간 결과 타입
interface TimingResult {
  bestDays: { day: string; score: number }[]
  bestHours: { hour: number; score: number }[]
  recommendation: string
}

export default function ToolsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('title')

  // AI 제목 생성기 상태
  const [titleKeyword, setTitleKeyword] = useState('')
  const [titleLoading, setTitleLoading] = useState(false)
  const [titleResult, setTitleResult] = useState<TitleResult | null>(null)

  // 블루오션 키워드 상태
  const [blueOceanKeyword, setBlueOceanKeyword] = useState('')
  const [blueOceanLoading, setBlueOceanLoading] = useState(false)
  const [blueOceanResult, setBlueOceanResult] = useState<BlueOceanResult | null>(null)

  // AI 글쓰기 가이드 상태
  const [writingTitle, setWritingTitle] = useState('')
  const [writingContent, setWritingContent] = useState('')
  const [writingKeyword, setWritingKeyword] = useState('')
  const [writingLoading, setWritingLoading] = useState(false)
  const [writingResult, setWritingResult] = useState<WritingGuideResult | null>(null)

  // 성과 인사이트 상태
  const [insightBlogId, setInsightBlogId] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightResult, setInsightResult] = useState<InsightResult | null>(null)

  // 상위 노출 예측 상태
  const [predictionKeyword, setPredictionKeyword] = useState('')
  const [predictionLoading, setPredictionLoading] = useState(false)
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null)

  // 해시태그 추천 상태
  const [hashtagKeyword, setHashtagKeyword] = useState('')
  const [hashtagLoading, setHashtagLoading] = useState(false)
  const [hashtagResult, setHashtagResult] = useState<HashtagResult | null>(null)

  // 최적 발행 시간 상태
  const [timingBlogId, setTimingBlogId] = useState('')
  const [timingLoading, setTimingLoading] = useState(false)
  const [timingResult, setTimingResult] = useState<TimingResult | null>(null)

  // 리포트 상태
  const [reportBlogId, setReportBlogId] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportPeriod, setReportPeriod] = useState<'weekly' | 'monthly'>('weekly')

  const tabs = [
    { id: 'title' as TabType, label: 'AI 제목', icon: PenTool, color: 'from-violet-500 to-purple-500' },
    { id: 'blueocean' as TabType, label: '키워드 발굴', icon: Compass, color: 'from-cyan-500 to-blue-500' },
    { id: 'writing' as TabType, label: '글쓰기 가이드', icon: FileText, color: 'from-emerald-500 to-teal-500' },
    { id: 'insight' as TabType, label: '성과 인사이트', icon: LineChart, color: 'from-amber-500 to-orange-500' },
    { id: 'prediction' as TabType, label: '노출 예측', icon: Target, color: 'from-purple-500 to-pink-500' },
    { id: 'hashtag' as TabType, label: '해시태그', icon: Hash, color: 'from-green-500 to-emerald-500' },
    { id: 'timing' as TabType, label: '발행 시간', icon: Clock, color: 'from-orange-500 to-red-500' },
    { id: 'report' as TabType, label: '리포트', icon: BarChart3, color: 'from-blue-500 to-cyan-500' },
  ]

  // AI 제목 생성
  const handleTitleGenerate = async () => {
    if (!titleKeyword.trim()) {
      toast.error('키워드를 입력해주세요')
      return
    }

    setTitleLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))

      const titleTemplates = [
        { template: `${titleKeyword} 완벽 정리! 이것만 알면 끝`, emotion: '정보형', type: '리스트' },
        { template: `${titleKeyword}, 아직도 모르세요? 꼭 알아야 할 꿀팁`, emotion: '호기심', type: '질문형' },
        { template: `${titleKeyword} 후기 | 직접 써보고 솔직하게 말합니다`, emotion: '신뢰', type: '후기형' },
        { template: `2024 ${titleKeyword} 추천 TOP 10 (+ 비교 분석)`, emotion: '정보형', type: '리스트' },
        { template: `${titleKeyword} 초보자도 쉽게! 단계별 가이드`, emotion: '친근함', type: '가이드' },
        { template: `이게 진짜 ${titleKeyword}입니다 (현실 후기)`, emotion: '공감', type: '후기형' },
        { template: `${titleKeyword} 비용, 시간, 효과 총정리`, emotion: '정보형', type: '정보형' },
        { template: `나만 알고 싶은 ${titleKeyword} 꿀팁 대방출`, emotion: '희소성', type: '팁형' },
        { template: `${titleKeyword} 실패하지 않는 방법 (경험담)`, emotion: '공감', type: '경험형' },
        { template: `${titleKeyword} 전문가가 추천하는 BEST 5`, emotion: '권위', type: '리스트' },
      ]

      setTitleResult({
        keyword: titleKeyword,
        titles: titleTemplates.map(t => ({
          title: t.template,
          ctr: Math.floor(Math.random() * 5) + 5 + Math.random(),
          emotion: t.emotion,
          type: t.type
        })).sort((a, b) => b.ctr - a.ctr)
      })

      toast.success('제목 생성 완료!')
    } catch (error) {
      toast.error('생성 중 오류가 발생했습니다')
    } finally {
      setTitleLoading(false)
    }
  }

  // 블루오션 키워드 발굴
  const handleBlueOcean = async () => {
    if (!blueOceanKeyword.trim()) {
      toast.error('키워드를 입력해주세요')
      return
    }

    setBlueOceanLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 2500))

      const suffixes = ['추천', '후기', '비교', '가격', '방법', '꿀팁', '순위', '맛집', '카페', '숙소']
      const prefixes = ['서울', '강남', '홍대', '제주', '부산', '2024', '최신', '숨은', '찐', '로컬']

      const keywords = [
        ...suffixes.map(s => `${blueOceanKeyword} ${s}`),
        ...prefixes.map(p => `${p} ${blueOceanKeyword}`)
      ].slice(0, 12).map(kw => ({
        keyword: kw,
        searchVolume: Math.floor(Math.random() * 10000) + 500,
        competition: Math.floor(Math.random() * 100),
        opportunity: 0,
        trend: ['up', 'down', 'stable'][Math.floor(Math.random() * 3)] as 'up' | 'down' | 'stable'
      }))

      // 기회 점수 계산 (검색량 높고 경쟁 낮을수록 높음)
      keywords.forEach(k => {
        k.opportunity = Math.round((k.searchVolume / 100) * (100 - k.competition) / 100)
      })

      // 기회 점수순 정렬
      keywords.sort((a, b) => b.opportunity - a.opportunity)

      setBlueOceanResult({
        mainKeyword: blueOceanKeyword,
        keywords
      })

      toast.success('키워드 발굴 완료!')
    } catch (error) {
      toast.error('발굴 중 오류가 발생했습니다')
    } finally {
      setBlueOceanLoading(false)
    }
  }

  // AI 글쓰기 가이드
  const handleWritingGuide = async () => {
    if (!writingTitle.trim() || !writingContent.trim()) {
      toast.error('제목과 본문을 입력해주세요')
      return
    }

    setWritingLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      const checks: WritingGuideResult['checks'] = []
      let score = 100

      // 제목 검사
      if (writingTitle.length < 15) {
        checks.push({ item: '제목 길이', status: 'fail', message: '제목이 너무 짧습니다', suggestion: '15자 이상 작성을 권장합니다' })
        score -= 15
      } else if (writingTitle.length > 40) {
        checks.push({ item: '제목 길이', status: 'warning', message: '제목이 다소 깁니다', suggestion: '40자 이내가 적당합니다' })
        score -= 5
      } else {
        checks.push({ item: '제목 길이', status: 'pass', message: '적절한 제목 길이입니다' })
      }

      // 키워드 포함 검사
      if (writingKeyword && writingTitle.includes(writingKeyword)) {
        checks.push({ item: '제목 키워드', status: 'pass', message: '제목에 키워드가 포함되어 있습니다' })
      } else if (writingKeyword) {
        checks.push({ item: '제목 키워드', status: 'fail', message: '제목에 키워드가 없습니다', suggestion: '제목에 메인 키워드를 포함하세요' })
        score -= 20
      }

      // 본문 길이 검사
      const contentLength = writingContent.length
      if (contentLength < 500) {
        checks.push({ item: '본문 길이', status: 'fail', message: `현재 ${contentLength}자 - 너무 짧습니다`, suggestion: '최소 1500자 이상 작성하세요' })
        score -= 25
      } else if (contentLength < 1500) {
        checks.push({ item: '본문 길이', status: 'warning', message: `현재 ${contentLength}자 - 조금 부족합니다`, suggestion: '2000자 이상이면 더 좋습니다' })
        score -= 10
      } else {
        checks.push({ item: '본문 길이', status: 'pass', message: `현재 ${contentLength}자 - 충분합니다` })
      }

      // 키워드 빈도 검사
      if (writingKeyword) {
        const keywordCount = (writingContent.match(new RegExp(writingKeyword, 'g')) || []).length
        const density = (keywordCount / contentLength) * 1000

        if (keywordCount < 3) {
          checks.push({ item: '키워드 빈도', status: 'fail', message: `키워드 ${keywordCount}회 사용`, suggestion: '본문에 키워드를 3-5회 자연스럽게 포함하세요' })
          score -= 15
        } else if (keywordCount > 10) {
          checks.push({ item: '키워드 빈도', status: 'warning', message: `키워드 ${keywordCount}회 - 과다 사용`, suggestion: '키워드 스터핑으로 인식될 수 있습니다' })
          score -= 10
        } else {
          checks.push({ item: '키워드 빈도', status: 'pass', message: `키워드 ${keywordCount}회 - 적절합니다` })
        }
      }

      // 문단 구분 검사
      const paragraphs = writingContent.split('\n\n').filter(p => p.trim())
      if (paragraphs.length < 3) {
        checks.push({ item: '문단 구성', status: 'warning', message: '문단이 부족합니다', suggestion: '3-5개 문단으로 나눠 가독성을 높이세요' })
        score -= 10
      } else {
        checks.push({ item: '문단 구성', status: 'pass', message: `${paragraphs.length}개 문단 - 좋습니다` })
      }

      // 소제목 검사 (##, ** 등)
      if (writingContent.includes('##') || writingContent.includes('**')) {
        checks.push({ item: '소제목/강조', status: 'pass', message: '소제목이나 강조가 있습니다' })
      } else {
        checks.push({ item: '소제목/강조', status: 'warning', message: '소제목이 없습니다', suggestion: '소제목을 추가하면 가독성이 올라갑니다' })
        score -= 5
      }

      setWritingResult({
        score: Math.max(0, score),
        checks
      })

      toast.success('분석 완료!')
    } catch (error) {
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setWritingLoading(false)
    }
  }

  // 성과 인사이트 분석
  const handleInsight = async () => {
    if (!insightBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setInsightLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 2500))

      setInsightResult({
        blogId: insightBlogId,
        insights: [
          { category: '콘텐츠', title: '리뷰 글이 가장 인기', description: '리뷰 형식의 글이 평균 조회수 3.2배 높습니다', impact: 'high' },
          { category: '발행 시간', title: '화요일 오전이 최적', description: '화요일 오전 9-11시 발행 글이 30% 더 많은 조회수를 기록합니다', impact: 'high' },
          { category: '제목 패턴', title: '숫자가 포함된 제목', description: '"TOP 5", "3가지" 등 숫자가 있는 제목의 클릭율이 25% 높습니다', impact: 'medium' },
          { category: '글 길이', title: '2000자 이상 권장', description: '2000자 이상의 글이 상위 노출 확률 40% 높습니다', impact: 'medium' },
          { category: '이미지', title: '이미지 5장 이상', description: '이미지 5장 이상인 글의 체류시간이 2배 깁니다', impact: 'medium' },
          { category: '키워드', title: '롱테일 키워드 효과적', description: '3단어 이상 키워드가 경쟁이 낮아 상위 노출 유리합니다', impact: 'low' },
        ],
        bestPerforming: [
          { type: '리뷰/후기', performance: 85 },
          { type: '정보/가이드', performance: 72 },
          { type: '일상/에세이', performance: 45 },
          { type: '뉴스/소식', performance: 38 },
        ],
        recommendations: [
          '리뷰 형식의 글을 더 많이 작성하세요',
          '화요일~목요일 오전에 발행을 집중하세요',
          '제목에 숫자와 키워드를 포함하세요',
          '글 하나당 최소 5장의 이미지를 사용하세요',
          '2000자 이상의 깊이 있는 콘텐츠를 작성하세요'
        ]
      })

      toast.success('인사이트 분석 완료!')
    } catch (error) {
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setInsightLoading(false)
    }
  }

  // 상위 노출 예측 분석
  const handlePrediction = async () => {
    if (!predictionKeyword.trim()) {
      toast.error('키워드를 입력해주세요')
      return
    }

    setPredictionLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))

      const difficulty = Math.floor(Math.random() * 100)
      const successRate = Math.max(10, 100 - difficulty + Math.floor(Math.random() * 20))

      setPredictionResult({
        keyword: predictionKeyword,
        difficulty,
        successRate: Math.min(95, successRate),
        avgScore: 45 + Math.floor(Math.random() * 30),
        avgPosts: 100 + Math.floor(Math.random() * 200),
        avgNeighbors: 500 + Math.floor(Math.random() * 1000),
        recommendation: difficulty < 40 ? '도전 추천!' : difficulty < 70 ? '경쟁 보통' : '경쟁 치열',
        tips: [
          '제목에 키워드를 자연스럽게 포함하세요',
          '본문 2000자 이상 작성을 권장합니다',
          '관련 이미지 5장 이상 첨부하세요',
          '발행 후 24시간 내 이웃 소통을 활발히 하세요'
        ]
      })

      toast.success('분석 완료!')
    } catch (error) {
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setPredictionLoading(false)
    }
  }

  // 해시태그 추천
  const handleHashtag = async () => {
    if (!hashtagKeyword.trim()) {
      toast.error('키워드를 입력해주세요')
      return
    }

    setHashtagLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1500))

      const baseHashtags = [
        hashtagKeyword,
        `${hashtagKeyword}추천`,
        `${hashtagKeyword}맛집`,
        `${hashtagKeyword}리뷰`,
        `${hashtagKeyword}정보`,
        `오늘의${hashtagKeyword}`,
        `${hashtagKeyword}스타그램`,
        `${hashtagKeyword}일상`,
        `${hashtagKeyword}소통`,
        `${hashtagKeyword}좋아요`
      ]

      setHashtagResult({
        keyword: hashtagKeyword,
        hashtags: baseHashtags.map((tag, i) => ({
          tag: `#${tag.replace(/\s/g, '')}`,
          frequency: Math.floor(Math.random() * 10000) + 1000,
          relevance: Math.max(50, 100 - i * 5)
        }))
      })

      toast.success('해시태그 추천 완료!')
    } catch (error) {
      toast.error('추천 중 오류가 발생했습니다')
    } finally {
      setHashtagLoading(false)
    }
  }

  // 최적 발행 시간 분석
  const handleTiming = async () => {
    if (!timingBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setTimingLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))

      const days = ['월', '화', '수', '목', '금', '토', '일']
      const bestDays = days.map(day => ({
        day,
        score: Math.floor(Math.random() * 100)
      })).sort((a, b) => b.score - a.score)

      const bestHours = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        score: i >= 9 && i <= 22 ? Math.floor(Math.random() * 50) + 50 : Math.floor(Math.random() * 30)
      })).sort((a, b) => b.score - a.score)

      setTimingResult({
        bestDays,
        bestHours,
        recommendation: `${bestDays[0].day}요일 ${bestHours[0].hour}시에 발행하면 조회수가 최대 ${Math.floor(Math.random() * 30) + 20}% 상승할 수 있습니다.`
      })

      toast.success('분석 완료!')
    } catch (error) {
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setTimingLoading(false)
    }
  }

  // 리포트 생성
  const handleReport = async () => {
    if (!reportBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setReportLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 3000))
      toast.success(`${reportPeriod === 'weekly' ? '주간' : '월간'} 리포트가 생성되었습니다!`)
    } catch (error) {
      toast.error('리포트 생성 중 오류가 발생했습니다')
    } finally {
      setReportLoading(false)
    }
  }

  const getDifficultyColor = (difficulty: number) => {
    if (difficulty < 40) return 'text-green-500'
    if (difficulty < 70) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getDifficultyLabel = (difficulty: number) => {
    if (difficulty < 40) return '쉬움'
    if (difficulty < 70) return '보통'
    return '어려움'
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500'
    if (score >= 60) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getScoreGrade = (score: number) => {
    if (score >= 90) return 'A+'
    if (score >= 80) return 'A'
    if (score >= 70) return 'B+'
    if (score >= 60) return 'B'
    if (score >= 50) return 'C'
    return 'D'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 py-8 px-4">
      <div className="container mx-auto max-w-6xl">
        {/* Back Button */}
        <Link href="/">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-6 flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">홈으로</span>
          </motion.button>
        </Link>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 mb-4">
            <Crown className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-semibold text-purple-700">프리미엄 도구</span>
          </div>
          <h1 className="text-4xl font-bold mb-2">
            <span className="gradient-text">블로그 성장 도구</span>
          </h1>
          <p className="text-gray-600">AI 기반 분석으로 블로그를 성장시키세요</p>
        </motion.div>

        {/* Tabs - 2줄로 변경 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-3 mb-6"
        >
          <div className="grid grid-cols-4 gap-2 mb-2">
            {tabs.slice(0, 4).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-semibold transition-all text-sm ${
                  activeTab === tab.id
                    ? `bg-gradient-to-r ${tab.color} text-white shadow-lg`
                    : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {tabs.slice(4).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-semibold transition-all text-sm ${
                  activeTab === tab.id
                    ? `bg-gradient-to-r ${tab.color} text-white shadow-lg`
                    : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {/* AI 제목 생성기 */}
          {activeTab === 'title' && (
            <motion.div
              key="title"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500">
                    <PenTool className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">AI 제목 생성기</h2>
                    <p className="text-gray-600">클릭율 높은 제목을 AI가 자동 생성합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={titleKeyword}
                      onChange={(e) => setTitleKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleTitleGenerate()}
                      placeholder="주제 키워드 입력 (예: 제주도 맛집, 육아 꿀팁)"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none"
                      disabled={titleLoading}
                    />
                  </div>
                  <button
                    onClick={handleTitleGenerate}
                    disabled={titleLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {titleLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        생성하기
                      </>
                    )}
                  </button>
                </div>

                {titleResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">
                        "{titleResult.keyword}" 추천 제목
                      </h3>
                      <button
                        onClick={handleTitleGenerate}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-100 text-purple-700 font-medium hover:bg-purple-200 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        다시 생성
                      </button>
                    </div>

                    <div className="space-y-3">
                      {titleResult.titles.map((item, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="group flex items-center justify-between p-4 bg-white rounded-xl hover:shadow-md transition-all cursor-pointer"
                          onClick={() => {
                            navigator.clipboard.writeText(item.title)
                            toast.success('제목이 복사되었습니다!')
                          }}
                        >
                          <div className="flex items-center gap-4 flex-1">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                              i === 0 ? 'bg-gradient-to-r from-yellow-400 to-orange-500' :
                              i === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                              i === 2 ? 'bg-gradient-to-r from-amber-600 to-amber-700' :
                              'bg-gray-300'
                            }`}>
                              {i + 1}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-gray-800 group-hover:text-purple-600 transition-colors">
                                {item.title}
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">{item.type}</span>
                                <span className="text-xs px-2 py-0.5 bg-pink-100 text-pink-700 rounded">{item.emotion}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-600">{item.ctr.toFixed(1)}%</div>
                            <div className="text-xs text-gray-500">예상 CTR</div>
                          </div>
                          <Copy className="w-5 h-5 text-gray-400 ml-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 블루오션 키워드 발굴 */}
          {activeTab === 'blueocean' && (
            <motion.div
              key="blueocean"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500">
                    <Compass className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">블루오션 키워드 발굴</h2>
                    <p className="text-gray-600">경쟁은 낮고 검색량은 높은 숨은 키워드를 찾습니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={blueOceanKeyword}
                      onChange={(e) => setBlueOceanKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleBlueOcean()}
                      placeholder="기본 키워드 입력 (예: 맛집, 여행, 카페)"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-cyan-500 focus:outline-none"
                      disabled={blueOceanLoading}
                    />
                  </div>
                  <button
                    onClick={handleBlueOcean}
                    disabled={blueOceanLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {blueOceanLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Compass className="w-5 h-5" />
                        발굴하기
                      </>
                    )}
                  </button>
                </div>

                {blueOceanResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">
                        "{blueOceanResult.mainKeyword}" 연관 블루오션 키워드
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Zap className="w-4 h-4 text-yellow-500" />
                        기회지수 순 정렬
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      {blueOceanResult.keywords.map((item, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={`p-4 rounded-xl border-2 ${
                            i < 3 ? 'bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200' : 'bg-white border-gray-100'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {i < 3 && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                              <span className="font-semibold text-gray-800">{item.keyword}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {item.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
                              {item.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
                              {item.trend === 'stable' && <span className="text-gray-400">-</span>}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center text-sm">
                            <div className="bg-white/50 rounded-lg p-2">
                              <div className="font-bold text-blue-600">{item.searchVolume.toLocaleString()}</div>
                              <div className="text-xs text-gray-500">검색량</div>
                            </div>
                            <div className="bg-white/50 rounded-lg p-2">
                              <div className={`font-bold ${item.competition < 40 ? 'text-green-600' : item.competition < 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {item.competition}%
                              </div>
                              <div className="text-xs text-gray-500">경쟁도</div>
                            </div>
                            <div className="bg-white/50 rounded-lg p-2">
                              <div className="font-bold text-purple-600">{item.opportunity}</div>
                              <div className="text-xs text-gray-500">기회지수</div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <div className="mt-6 p-4 bg-cyan-50 rounded-xl border border-cyan-200">
                      <div className="flex items-start gap-3">
                        <Lightbulb className="w-5 h-5 text-cyan-600 mt-0.5" />
                        <div>
                          <div className="font-semibold text-cyan-800">블루오션 키워드 활용 팁</div>
                          <ul className="mt-2 space-y-1 text-sm text-cyan-700">
                            <li>• 기회지수가 높을수록 상위 노출이 쉽습니다</li>
                            <li>• 경쟁도 40% 미만인 키워드를 우선 공략하세요</li>
                            <li>• 트렌드 상승 키워드는 빠르게 선점하세요</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* AI 글쓰기 가이드 */}
          {activeTab === 'writing' && (
            <motion.div
              key="writing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">AI 글쓰기 가이드</h2>
                    <p className="text-gray-600">작성 중인 글의 SEO 점수를 실시간으로 체크합니다</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">타겟 키워드</label>
                    <input
                      type="text"
                      value={writingKeyword}
                      onChange={(e) => setWritingKeyword(e.target.value)}
                      placeholder="상위 노출 목표 키워드 (예: 강남 맛집)"
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">제목</label>
                    <input
                      type="text"
                      value={writingTitle}
                      onChange={(e) => setWritingTitle(e.target.value)}
                      placeholder="글 제목을 입력하세요"
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      본문 <span className="text-gray-400 font-normal">({writingContent.length}자)</span>
                    </label>
                    <textarea
                      value={writingContent}
                      onChange={(e) => setWritingContent(e.target.value)}
                      placeholder="글 본문을 붙여넣기하거나 직접 입력하세요..."
                      rows={8}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:outline-none resize-none"
                    />
                  </div>

                  <button
                    onClick={handleWritingGuide}
                    disabled={writingLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {writingLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        분석 중...
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5" />
                        SEO 점수 체크
                      </>
                    )}
                  </button>
                </div>

                {writingResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 점수 표시 */}
                    <div className="text-center py-8 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl">
                      <div className={`text-6xl font-bold ${getScoreColor(writingResult.score)} mb-2`}>
                        {writingResult.score}
                      </div>
                      <div className="text-2xl font-semibold text-gray-600 mb-1">
                        등급: {getScoreGrade(writingResult.score)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {writingResult.score >= 80 ? '상위 노출 가능성 높음!' :
                         writingResult.score >= 60 ? '조금 더 개선하면 좋습니다' :
                         '개선이 필요합니다'}
                      </div>
                    </div>

                    {/* 체크리스트 */}
                    <div className="space-y-3">
                      <h3 className="font-bold text-lg">SEO 체크리스트</h3>
                      {writingResult.checks.map((check, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-3 p-4 rounded-xl ${
                            check.status === 'pass' ? 'bg-green-50 border border-green-200' :
                            check.status === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                            'bg-red-50 border border-red-200'
                          }`}
                        >
                          <div className="mt-0.5">
                            {check.status === 'pass' && <CheckCircle className="w-5 h-5 text-green-500" />}
                            {check.status === 'warning' && <AlertCircle className="w-5 h-5 text-yellow-500" />}
                            {check.status === 'fail' && <XCircle className="w-5 h-5 text-red-500" />}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-gray-800">{check.item}</div>
                            <div className="text-sm text-gray-600">{check.message}</div>
                            {check.suggestion && (
                              <div className="text-sm text-blue-600 mt-1 flex items-center gap-1">
                                <Lightbulb className="w-4 h-4" />
                                {check.suggestion}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 성과 분석 인사이트 */}
          {activeTab === 'insight' && (
            <motion.div
              key="insight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500">
                    <LineChart className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">성과 분석 인사이트</h2>
                    <p className="text-gray-600">내 블로그의 성공 패턴을 AI가 분석합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={insightBlogId}
                      onChange={(e) => setInsightBlogId(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleInsight()}
                      placeholder="블로그 ID 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-amber-500 focus:outline-none"
                      disabled={insightLoading}
                    />
                  </div>
                  <button
                    onClick={handleInsight}
                    disabled={insightLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {insightLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <LineChart className="w-5 h-5" />
                        분석하기
                      </>
                    )}
                  </button>
                </div>

                {insightResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 인사이트 카드 */}
                    <div>
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-amber-500" />
                        발견된 인사이트
                      </h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        {insightResult.insights.map((insight, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={`p-4 rounded-xl border-l-4 ${
                              insight.impact === 'high' ? 'border-amber-500 bg-amber-50' :
                              insight.impact === 'medium' ? 'border-blue-500 bg-blue-50' :
                              'border-gray-400 bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs px-2 py-0.5 bg-white rounded font-medium text-gray-600">
                                {insight.category}
                              </span>
                              {insight.impact === 'high' && (
                                <span className="text-xs px-2 py-0.5 bg-amber-500 text-white rounded font-bold">
                                  중요
                                </span>
                              )}
                            </div>
                            <div className="font-semibold text-gray-800 mb-1">{insight.title}</div>
                            <div className="text-sm text-gray-600">{insight.description}</div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* 콘텐츠 유형별 성과 */}
                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">콘텐츠 유형별 성과</h3>
                      <div className="space-y-3">
                        {insightResult.bestPerforming.map((item, i) => (
                          <div key={i} className="flex items-center gap-4">
                            <div className="w-24 text-sm font-medium text-gray-600">{item.type}</div>
                            <div className="flex-1">
                              <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    i === 0 ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                                    'bg-gradient-to-r from-gray-400 to-gray-500'
                                  }`}
                                  style={{ width: `${item.performance}%` }}
                                />
                              </div>
                            </div>
                            <div className="w-12 text-right font-bold text-gray-700">{item.performance}%</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 추천 액션 */}
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Award className="w-5 h-5 text-amber-600" />
                        추천 액션
                      </h3>
                      <ul className="space-y-2">
                        {insightResult.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2 text-gray-700">
                            <CheckCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 상위 노출 예측 */}
          {activeTab === 'prediction' && (
            <motion.div
              key="prediction"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">상위 노출 예측</h2>
                    <p className="text-gray-600">키워드 경쟁도와 상위 노출 가능성을 분석합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={predictionKeyword}
                      onChange={(e) => setPredictionKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handlePrediction()}
                      placeholder="분석할 키워드 입력 (예: 강남 맛집)"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none"
                      disabled={predictionLoading}
                    />
                  </div>
                  <button
                    onClick={handlePrediction}
                    disabled={predictionLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {predictionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '분석하기'}
                  </button>
                </div>

                {predictionResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 text-center">
                        <div className="text-4xl font-bold gradient-text mb-2">{predictionResult.successRate}%</div>
                        <div className="text-sm text-gray-600">상위 노출 예측</div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 text-center">
                        <div className={`text-4xl font-bold ${getDifficultyColor(predictionResult.difficulty)} mb-2`}>
                          {getDifficultyLabel(predictionResult.difficulty)}
                        </div>
                        <div className="text-sm text-gray-600">키워드 난이도</div>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 text-center">
                        <div className="text-4xl font-bold text-green-600 mb-2">{predictionResult.recommendation}</div>
                        <div className="text-sm text-gray-600">추천</div>
                      </div>
                    </div>

                    <div className="bg-purple-50 rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-600" />
                        상위 노출 팁
                      </h3>
                      <ul className="space-y-2">
                        {predictionResult.tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-gray-700">
                            <span className="text-purple-500 mt-1">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 해시태그 추천 */}
          {activeTab === 'hashtag' && (
            <motion.div
              key="hashtag"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500">
                    <Hash className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">해시태그 추천</h2>
                    <p className="text-gray-600">상위 노출에 효과적인 해시태그를 추천합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={hashtagKeyword}
                      onChange={(e) => setHashtagKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleHashtag()}
                      placeholder="주제 키워드 입력 (예: 제주도 여행)"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-green-500 focus:outline-none"
                      disabled={hashtagLoading}
                    />
                  </div>
                  <button
                    onClick={handleHashtag}
                    disabled={hashtagLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {hashtagLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '추천받기'}
                  </button>
                </div>

                {hashtagResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">"{hashtagResult.keyword}" 추천 해시태그</h3>
                      <button
                        onClick={() => {
                          const tags = hashtagResult.hashtags.map(h => h.tag).join(' ')
                          navigator.clipboard.writeText(tags)
                          toast.success('클립보드에 복사되었습니다!')
                        }}
                        className="px-4 py-2 rounded-lg bg-green-100 text-green-700 font-medium hover:bg-green-200 transition-colors"
                      >
                        전체 복사
                      </button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      {hashtagResult.hashtags.map((hashtag, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center justify-between p-4 bg-white rounded-xl hover:shadow-md transition-all cursor-pointer"
                          onClick={() => {
                            navigator.clipboard.writeText(hashtag.tag)
                            toast.success(`${hashtag.tag} 복사됨!`)
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl font-bold text-green-500">#{i + 1}</span>
                            <div>
                              <div className="font-semibold text-gray-800">{hashtag.tag}</div>
                              <div className="text-sm text-gray-500">사용량: {hashtag.frequency.toLocaleString()}회</div>
                            </div>
                          </div>
                          <div className="text-sm font-medium text-green-600">관련도 {hashtag.relevance}%</div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 최적 발행 시간 */}
          {activeTab === 'timing' && (
            <motion.div
              key="timing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500">
                    <Clock className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">최적 발행 시간</h2>
                    <p className="text-gray-600">방문자 패턴을 분석하여 최적의 발행 시간을 추천합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={timingBlogId}
                      onChange={(e) => setTimingBlogId(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleTiming()}
                      placeholder="블로그 ID 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none"
                      disabled={timingLoading}
                    />
                  </div>
                  <button
                    onClick={handleTiming}
                    disabled={timingLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {timingLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '분석하기'}
                  </button>
                </div>

                {timingResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-2xl p-6 text-center">
                      <div className="text-xl font-bold text-orange-700">{timingResult.recommendation}</div>
                    </div>

                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">요일별 효과</h3>
                      <div className="grid grid-cols-7 gap-2">
                        {timingResult.bestDays.sort((a, b) =>
                          ['월', '화', '수', '목', '금', '토', '일'].indexOf(a.day) -
                          ['월', '화', '수', '목', '금', '토', '일'].indexOf(b.day)
                        ).map((day, i) => (
                          <div key={i} className="text-center">
                            <div className="text-sm text-gray-600 mb-2">{day.day}</div>
                            <div
                              className="mx-auto rounded-lg bg-gradient-to-t from-orange-500 to-red-500"
                              style={{ width: '40px', height: `${Math.max(20, day.score)}px`, opacity: day.score / 100 }}
                            />
                            <div className="text-xs text-gray-500 mt-1">{day.score}%</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">추천 발행 시간 TOP 5</h3>
                      <div className="space-y-3">
                        {timingResult.bestHours.slice(0, 5).map((hour, i) => (
                          <div key={i} className="flex items-center gap-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${i === 0 ? 'bg-orange-500' : 'bg-gray-400'}`}>
                              {i + 1}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{hour.hour}시</span>
                                <span className="text-sm text-orange-600">{hour.score}% 효과</span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full" style={{ width: `${hour.score}%` }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 자동 리포트 */}
          {activeTab === 'report' && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">자동 리포트</h2>
                    <p className="text-gray-600">블로그 성과를 한눈에 보는 리포트를 생성합니다</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={reportBlogId}
                      onChange={(e) => setReportBlogId(e.target.value)}
                      placeholder="블로그 ID 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
                      disabled={reportLoading}
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={() => setReportPeriod('weekly')}
                      className={`flex-1 py-3 rounded-xl font-semibold transition-all ${reportPeriod === 'weekly' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      주간 리포트
                    </button>
                    <button
                      onClick={() => setReportPeriod('monthly')}
                      className={`flex-1 py-3 rounded-xl font-semibold transition-all ${reportPeriod === 'monthly' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      월간 리포트
                    </button>
                  </div>

                  <button
                    onClick={handleReport}
                    disabled={reportLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {reportLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        리포트 생성 중...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        리포트 생성하기
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-white rounded-2xl p-6">
                  <h3 className="font-bold text-lg mb-4">리포트에 포함되는 내용</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      { icon: TrendingUp, label: '성장 추이 그래프', desc: '방문자, 조회수 변화' },
                      { icon: Eye, label: '인기 글 TOP 10', desc: '가장 많이 본 포스트' },
                      { icon: Users, label: '이웃 증가 현황', desc: '신규 이웃 분석' },
                      { icon: BarChart3, label: '지수 변화 분석', desc: '블로그 지수 추이' },
                      { icon: ThumbsUp, label: '참여도 분석', desc: '좋아요, 댓글 통계' },
                      { icon: Calendar, label: '발행 패턴', desc: '포스팅 빈도 분석' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="p-2 rounded-lg bg-blue-100">
                          <item.icon className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium">{item.label}</div>
                          <div className="text-sm text-gray-500">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
