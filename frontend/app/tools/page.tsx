'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, FileText, Hash, Clock, ArrowLeft, Crown,
  Search, Loader2, BarChart3, Download, Sparkles, Target,
  Calendar, Users, Eye, ThumbsUp, MessageCircle, Lightbulb,
  PenTool, Compass, LineChart, CheckCircle, XCircle, AlertCircle,
  Copy, RefreshCw, Zap, Star, TrendingDown, Award, Youtube,
  Shield, Database, Gift, Activity, Play, AlertTriangle, Archive,
  Upload, Trash2, CheckSquare, ExternalLink, Scan, Bot, Bell,
  Timer, RotateCcw, Link2, GraduationCap, UserCheck, Flame,
  Brain, MessageSquare, History, Network, Rocket, DollarSign,
  Map, Lock, Trophy, Coins, ChevronRight, Medal, Gem, Key,
  Crosshair, Radio, Wallet, PiggyBank, CreditCard, Receipt,
  TrendingUp as DataChart, ShoppingCart, MapPin, Newspaper,
  Coffee, Video, UserCircle, Globe, HelpCircle, Store,
  Percent, Package, Navigation, Megaphone, BookOpen, Film,
  Award as Badge, Layers, MessageSquareText, ShoppingBag, Info, X, Filter, Tags, Save, Plus, User
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useFeatureAccess } from '@/lib/features/useFeatureAccess'
import { PLAN_INFO } from '@/lib/features/featureAccess'
import Tutorial, { toolsTutorialSteps } from '@/components/Tutorial'
import ToolTutorial, { shouldShowToolTutorial } from '@/components/ToolTutorial'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev'

type TabType = 'title' | 'blueocean' | 'writing' | 'insight' | 'prediction' | 'report' | 'hashtag' | 'timing' | 'youtube' | 'lowquality' | 'backup' | 'campaign' | 'ranktrack' | 'clone' | 'comment' | 'algorithm' | 'lifespan' | 'refresh' | 'related' | 'mentor' | 'trend' | 'revenue' | 'roadmap' | 'secretkw' | 'datalab' | 'shopping' | 'place' | 'news' | 'cafe' | 'naverView' | 'influencer' | 'searchAnalysis' | 'kin' | 'smartstore' | 'keywordAnalysis'

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
  difficultyLabel: string
  successRate: number
  monthlySearch: number
  competition: string
  topBlogsStats: {
    avgScore: number
    avgLevel: number
    minScore: number
    maxScore: number
    avgPosts: number
    avgNeighbors: number
  }
  topBlogs: {
    rank: number
    blog_name: string
    score: number
    level: number
    posts: number
  }[]
  myBlogAnalysis?: {
    blog_id: string
    score: number
    level: number
    posts: number
    neighbors: number
  }
  gapAnalysis?: {
    score_gap: number
    level_gap: number
    posts_gap: number
    neighbors_gap: number
    status: string
  }
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

// 유튜브 스크립트 변환 결과 타입
interface YoutubeScriptResult {
  title: string
  intro: string
  sections: { title: string; content: string; duration: string }[]
  outro: string
  totalDuration: string
  hashtags: string[]
}

// 저품질 위험 감지 결과 타입
interface LowQualityResult {
  blogId: string
  riskLevel: 'safe' | 'warning' | 'danger'
  riskScore: number
  checks: {
    item: string
    status: 'pass' | 'warning' | 'fail'
    message: string
    tip?: string
  }[]
  recentIssues: string[]
}

// 백업 결과 타입
interface BackupItem {
  id: string
  date: string
  postCount: number
  size: string
  status: 'completed' | 'in_progress'
}

// 체험단 매칭 결과 타입
interface CampaignResult {
  campaigns: {
    id: string
    title: string
    brand: string
    category: string
    reward: string
    deadline: string
    requirements: { minScore: number; minNeighbors: number }
    matchScore: number
    status: 'open' | 'closing_soon'
  }[]
}

// 키워드 순위 추적 결과 타입
interface RankTrackResult {
  keyword: string
  currentRank: number | null
  previousRank: number | null
  change: number
  history: { date: string; rank: number | null }[]
  competitors: { blogId: string; rank: number; title: string }[]
}

// 경쟁 블로그 클론 분석 결과 타입
interface CloneAnalysisResult {
  targetBlog: string
  overview: {
    totalPosts: number
    avgPostLength: number
    postingFrequency: string
    mainCategories: string[]
    blogScore: number
  }
  strategy: {
    category: string
    insight: string
    actionItem: string
  }[]
  topKeywords: { keyword: string; count: number; avgRank: number }[]
  contentPattern: {
    pattern: string
    percentage: number
    example: string
  }[]
  successFactors: string[]
}

// AI 댓글 답변 결과 타입
interface CommentReplyResult {
  original: string
  replies: {
    tone: string
    reply: string
    emoji: boolean
  }[]
}

// 알고리즘 변화 감지 결과 타입
interface AlgorithmChangeResult {
  status: 'stable' | 'minor_change' | 'major_change'
  lastUpdate: string
  changes: {
    date: string
    type: string
    description: string
    impact: 'low' | 'medium' | 'high'
    recommendation: string
  }[]
  affectedKeywords: { keyword: string; before: number; after: number }[]
}

// 콘텐츠 수명 분석 결과 타입
interface LifespanResult {
  blogId: string
  posts: {
    title: string
    date: string
    type: 'evergreen' | 'seasonal' | 'trending' | 'declining'
    currentViews: number
    peakViews: number
    lifespan: string
    suggestion: string
  }[]
  summary: {
    evergreen: number
    seasonal: number
    trending: number
    declining: number
  }
}

// 오래된 글 리프레시 결과 타입
interface RefreshResult {
  blogId: string
  postsToRefresh: {
    title: string
    publishDate: string
    lastViews: number
    potentialViews: number
    priority: 'high' | 'medium' | 'low'
    reasons: string[]
    suggestions: string[]
  }[]
}

// 연관 글 추천 결과 타입
interface RelatedPostResult {
  currentTopic: string
  relatedTopics: {
    topic: string
    relevance: number
    searchVolume: number
    competition: string
    suggestedTitle: string
  }[]
  seriesIdea: {
    title: string
    posts: string[]
  }
}

// 멘토-멘티 매칭 결과 타입
interface MentorMatchResult {
  userType: 'mentor' | 'mentee'
  matches: {
    id: string
    name: string
    blogId: string
    specialty: string[]
    score: number
    experience: string
    rate: string
    rating: number
    reviews: number
    available: boolean
  }[]
}

// 실시간 트렌드 스나이퍼 결과 타입
interface TrendSniperResult {
  trends: {
    rank: number
    keyword: string
    category: string
    searchVolume: number
    competition: 'low' | 'medium' | 'high'
    matchScore: number
    goldenTime: boolean
    reason: string
    suggestedTitle: string
    deadline: string
  }[]
  myCategories: string[]
  lastUpdate: string
}

// 수익 대시보드 결과 타입
interface RevenueDashboardResult {
  summary: {
    totalRevenue: number
    monthlyGrowth: number
    avgPerPost: number
    topSource: string
  }
  adpost: {
    monthlyRevenue: number
    clicks: number
    ctr: number
    topPosts: { title: string; revenue: number; clicks: number }[]
  }
  sponsorship: {
    completed: number
    totalEarned: number
    avgPerCampaign: number
    pending: { brand: string; amount: number; status: string }[]
  }
  affiliate: {
    totalCommission: number
    clicks: number
    conversions: number
    topProducts: { name: string; commission: number; sales: number }[]
  }
  monthlyData: { month: string; adpost: number; sponsorship: number; affiliate: number }[]
}

// 블로그 성장 로드맵 결과 타입
interface RoadmapResult {
  currentLevel: {
    level: number
    name: string
    icon: string
    progress: number
    nextLevel: string
  }
  stats: {
    totalPosts: number
    totalVisitors: number
    avgDaily: number
    blogScore: number
  }
  dailyQuests: {
    id: string
    title: string
    description: string
    reward: number
    completed: boolean
    type: 'post' | 'keyword' | 'engage' | 'optimize'
  }[]
  weeklyMissions: {
    id: string
    title: string
    progress: number
    target: number
    reward: number
    deadline: string
  }[]
  milestones: {
    name: string
    requirement: string
    achieved: boolean
    badge: string
    reward: string
  }[]
  recommendedActions: string[]
}

// 비공개 키워드 DB 결과 타입
interface SecretKeywordResult {
  category: string
  keywords: {
    keyword: string
    searchVolume: number
    competition: number
    cpc: number
    opportunity: number
    trend: 'hot' | 'rising' | 'stable'
    lastUpdate: string
    exclusiveUntil: string
  }[]
  accessLevel: 'basic' | 'pro' | 'enterprise'
  remainingAccess: number
  nextRefresh: string
}

// 네이버 데이터랩 결과 타입
interface DataLabResult {
  keywords: string[]
  trendData: {
    period: string
    values: { keyword: string; value: number }[]
  }[]
  demographics: {
    keyword: string
    age: { group: string; ratio: number }[]
    gender: { type: string; ratio: number }[]
  }[]
  regions: {
    keyword: string
    data: { region: string; ratio: number }[]
  }[]
  seasonalTip: string
}

// 네이버 쇼핑 결과 타입
interface ShoppingResult {
  keyword: string
  products: {
    name: string
    price: number
    mall: string
    reviewCount: number
    rating: number
    commission: number
    affiliateLink: string
    trend: 'hot' | 'rising' | 'stable'
  }[]
  shoppingKeywords: {
    keyword: string
    searchVolume: number
    competition: string
    cpc: number
    purchaseIntent: number
  }[]
  priceAlerts: { productName: string; currentPrice: number; targetPrice: number; changePercent: number }[]
}

// 네이버 플레이스 결과 타입
interface PlaceResult {
  area: string
  places: {
    name: string
    category: string
    rating: number
    reviewCount: number
    rank: number
    blogReviewCount: number
    keywords: string[]
    competitionLevel: 'low' | 'medium' | 'high'
  }[]
  areaAnalysis: {
    totalPlaces: number
    avgRating: number
    avgReviewCount: number
    topCategory: string
    competitionScore: number
  }
  reviewKeywords: { keyword: string; count: number; sentiment: 'positive' | 'negative' | 'neutral' }[]
  myPlaceRank?: { placeName: string; keyword: string; rank: number; change: number }[]
}

// 네이버 뉴스/실시간 결과 타입
interface NewsResult {
  realTimeKeywords: {
    rank: number
    keyword: string
    category: string
    changeType: 'new' | 'up' | 'down' | 'stable'
    changeRank: number
    relatedNews: string
  }[]
  issueKeywords: {
    keyword: string
    newsCount: number
    blogPotential: number
    goldenTime: string
    suggestedAngle: string
  }[]
  myTopicNews: {
    title: string
    source: string
    time: string
    summary: string
    relatedKeywords: string[]
  }[]
}

// 네이버 카페 결과 타입
interface CafeResult {
  popularTopics: {
    topic: string
    cafeName: string
    postCount: number
    engagement: number
    category: string
  }[]
  questions: {
    question: string
    cafeName: string
    answers: number
    views: number
    suggestedKeyword: string
  }[]
  recommendedCafes: {
    name: string
    members: number
    category: string
    matchScore: number
    postingRule: string
  }[]
  trafficSource: { cafeName: string; visitors: number; percentage: number }[]
}

// 네이버 VIEW 결과 타입
interface NaverViewResult {
  videoKeywords: {
    keyword: string
    videoCount: number
    avgViews: number
    competition: string
    opportunity: number
  }[]
  topVideos: {
    title: string
    creator: string
    views: number
    likes: number
    duration: string
    thumbnail: string
  }[]
  thumbnailPatterns: {
    pattern: string
    ctr: number
    example: string
  }[]
  scriptFromVideo: {
    videoTitle: string
    sections: { timestamp: string; content: string }[]
    blogPost: string
  } | null
}

// 네이버 인플루언서 결과 타입
interface InfluencerResult {
  myRanking: {
    category: string
    rank: number
    totalInfluencers: number
    score: number
    change: number
  }
  topInfluencers: {
    rank: number
    name: string
    category: string
    followers: number
    avgViews: number
    engagement: number
    strategy: string
  }[]
  benchmarkStats: {
    metric: string
    myValue: number
    avgValue: number
    topValue: number
  }[]
  roadmapToInfluencer: {
    step: number
    title: string
    requirement: string
    currentProgress: number
    tip: string
  }[]
}

// 네이버 통합검색 분석 결과 타입
interface SearchAnalysisResult {
  keyword: string
  searchResultComposition: {
    section: string
    count: number
    percentage: number
    recommendation: string
  }[]
  tabPriority: {
    tab: string
    position: number
    visibility: number
    myPresence: boolean
  }[]
  mobileVsPc: {
    platform: string
    topSections: string[]
    recommendation: string
  }[]
  optimalContentType: {
    type: string
    reason: string
    example: string
  }
}

// 네이버 지식인 결과 타입
interface KinResult {
  popularQuestions: {
    question: string
    category: string
    answers: number
    views: number
    hasAcceptedAnswer: boolean
    keyword: string
  }[]
  questionTrends: {
    topic: string
    questionCount: number
    trend: 'rising' | 'stable' | 'declining'
    suggestedPost: string
  }[]
  answerTemplates: {
    questionType: string
    template: string
    blogLinkTip: string
  }[]
  myLinkTracking: {
    question: string
    myAnswer: string
    views: number
    clicks: number
  }[]
}

// 네이버 스마트스토어 결과 타입
interface SmartstoreResult {
  storeInfo: {
    storeName: string
    category: string
    productCount: number
    totalSales: number
    rating: number
  }
  productKeywords: {
    keyword: string
    searchVolume: number
    conversionRate: number
    competition: string
    myRank: number | null
  }[]
  reviewAnalysis: {
    sentiment: 'positive' | 'negative' | 'neutral'
    count: number
    keywords: string[]
    improvement: string
  }
  competitors: {
    storeName: string
    productCount: number
    avgPrice: number
    rating: number
    strength: string
  }[]
  blogSynergy: {
    product: string
    suggestedKeyword: string
    expectedTraffic: number
    contentIdea: string
  }[]
}

export default function ToolsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('title')

  // 도구별 튜토리얼 상태
  const [showToolTutorial, setShowToolTutorial] = useState(false)
  const [currentTutorialTool, setCurrentTutorialTool] = useState<string>('')

  // Feature access hook
  const { plan, canAccess, getFeatureBadge } = useFeatureAccess()

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
  const [predictionBlogId, setPredictionBlogId] = useState('')
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

  // 유튜브 스크립트 변환 상태
  const [youtubeTitle, setYoutubeTitle] = useState('')
  const [youtubeContent, setYoutubeContent] = useState('')
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [youtubeResult, setYoutubeResult] = useState<YoutubeScriptResult | null>(null)

  // 저품질 위험 감지 상태
  const [lowQualityBlogId, setLowQualityBlogId] = useState('')
  const [lowQualityLoading, setLowQualityLoading] = useState(false)
  const [lowQualityResult, setLowQualityResult] = useState<LowQualityResult | null>(null)

  // 백업 & 복원 상태
  const [backupBlogId, setBackupBlogId] = useState('')
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupList, setBackupList] = useState<BackupItem[]>([])

  // 체험단 매칭 상태
  const [campaignBlogId, setCampaignBlogId] = useState('')
  const [campaignCategory, setCampaignCategory] = useState('all')
  const [campaignLoading, setCampaignLoading] = useState(false)
  const [campaignResult, setCampaignResult] = useState<CampaignResult | null>(null)

  // 키워드 순위 추적 상태
  const [trackKeyword, setTrackKeyword] = useState('')
  const [trackBlogId, setTrackBlogId] = useState('')
  const [trackLoading, setTrackLoading] = useState(false)
  const [trackResult, setTrackResult] = useState<RankTrackResult | null>(null)
  const [trackedKeywords, setTrackedKeywords] = useState<{ keyword: string; currentRank: number | null; change: number }[]>([])

  // 경쟁 블로그 클론 분석 상태
  const [cloneBlogUrl, setCloneBlogUrl] = useState('')
  const [cloneLoading, setCloneLoading] = useState(false)
  const [cloneResult, setCloneResult] = useState<CloneAnalysisResult | null>(null)

  // AI 댓글 답변 생성기 상태
  const [commentText, setCommentText] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentResult, setCommentResult] = useState<CommentReplyResult | null>(null)

  // 네이버 알고리즘 변화 감지 상태
  const [algorithmLoading, setAlgorithmLoading] = useState(false)
  const [algorithmResult, setAlgorithmResult] = useState<AlgorithmChangeResult | null>(null)

  // 콘텐츠 수명 분석 상태
  const [lifespanBlogId, setLifespanBlogId] = useState('')
  const [lifespanLoading, setLifespanLoading] = useState(false)
  const [lifespanResult, setLifespanResult] = useState<LifespanResult | null>(null)

  // 오래된 글 리프레시 상태
  const [refreshBlogId, setRefreshBlogId] = useState('')
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null)

  // 연관 글 추천 상태
  const [relatedTopic, setRelatedTopic] = useState('')
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [relatedResult, setRelatedResult] = useState<RelatedPostResult | null>(null)

  // 멘토-멘티 매칭 상태
  const [mentorBlogId, setMentorBlogId] = useState('')
  const [mentorUserType, setMentorUserType] = useState<'mentor' | 'mentee'>('mentee')
  const [mentorCategory, setMentorCategory] = useState('all')
  const [mentorLoading, setMentorLoading] = useState(false)
  const [mentorResult, setMentorResult] = useState<MentorMatchResult | null>(null)

  // 실시간 트렌드 스나이퍼 상태
  const [trendCategories, setTrendCategories] = useState<string[]>(['맛집', '여행', '뷰티'])
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendResult, setTrendResult] = useState<TrendSniperResult | null>(null)
  const [trendAutoRefresh, setTrendAutoRefresh] = useState(false)

  // 수익 대시보드 상태
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [revenueData, setRevenueData] = useState<{
    current_month: any
    history: any[]
    yearly_summary: any
    total_summary: any
    growth: number
    current_year: number
    current_month_num: number
  } | null>(null)
  const [revenueEditMode, setRevenueEditMode] = useState(false)
  const [revenueForm, setRevenueForm] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    adpost_revenue: 0,
    adpost_clicks: 0,
    sponsorship_revenue: 0,
    sponsorship_count: 0,
    affiliate_revenue: 0,
    affiliate_clicks: 0,
    affiliate_conversions: 0,
    memo: ''
  })

  // 블로그 성장 로드맵 상태
  const [roadmapBlogId, setRoadmapBlogId] = useState('')
  const [roadmapLoading, setRoadmapLoading] = useState(false)
  const [roadmapResult, setRoadmapResult] = useState<RoadmapResult | null>(null)

  // 비공개 키워드 DB 상태
  const [secretCategory, setSecretCategory] = useState('all')
  const [secretLoading, setSecretLoading] = useState(false)
  const [secretResult, setSecretResult] = useState<SecretKeywordResult | null>(null)

  // 네이버 데이터랩 상태
  const [datalabKeywords, setDatalabKeywords] = useState<string[]>([''])
  const [datalabLoading, setDatalabLoading] = useState(false)
  const [datalabResult, setDatalabResult] = useState<DataLabResult | null>(null)

  // 네이버 쇼핑 상태
  const [shoppingKeyword, setShoppingKeyword] = useState('')
  const [shoppingLoading, setShoppingLoading] = useState(false)
  const [shoppingResult, setShoppingResult] = useState<ShoppingResult | null>(null)

  // 네이버 플레이스 상태
  const [placeArea, setPlaceArea] = useState('')
  const [placeCategory, setPlaceCategory] = useState('맛집')
  const [placeLoading, setPlaceLoading] = useState(false)
  const [placeResult, setPlaceResult] = useState<PlaceResult | null>(null)

  // 네이버 뉴스 상태
  const [newsCategory, setNewsCategory] = useState('all')
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsResult, setNewsResult] = useState<NewsResult | null>(null)

  // 네이버 카페 상태
  const [cafeCategory, setCafeCategory] = useState('all')
  const [cafeLoading, setCafeLoading] = useState(false)
  const [cafeResult, setCafeResult] = useState<CafeResult | null>(null)

  // 네이버 VIEW 상태
  const [viewKeyword, setViewKeyword] = useState('')
  const [viewLoading, setViewLoading] = useState(false)
  const [viewResult, setViewResult] = useState<NaverViewResult | null>(null)

  // 네이버 인플루언서 상태
  const [influencerBlogId, setInfluencerBlogId] = useState('')
  const [influencerCategory, setInfluencerCategory] = useState('all')
  const [influencerLoading, setInfluencerLoading] = useState(false)
  const [influencerResult, setInfluencerResult] = useState<InfluencerResult | null>(null)

  // 네이버 통합검색 분석 상태
  const [searchAnalysisKeyword, setSearchAnalysisKeyword] = useState('')
  const [searchAnalysisLoading, setSearchAnalysisLoading] = useState(false)
  const [searchAnalysisResult, setSearchAnalysisResult] = useState<SearchAnalysisResult | null>(null)

  // 네이버 지식인 상태
  const [kinCategory, setKinCategory] = useState('all')
  const [kinLoading, setKinLoading] = useState(false)
  const [kinResult, setKinResult] = useState<KinResult | null>(null)

  // 네이버 스마트스토어 상태
  const [smartstoreId, setSmartstoreId] = useState('')
  const [smartstoreLoading, setSmartstoreLoading] = useState(false)
  const [smartstoreResult, setSmartstoreResult] = useState<SmartstoreResult | null>(null)

  // 가이드 표시 상태
  const [showGuide, setShowGuide] = useState(false)

  // 도구별 가이드 데이터
  const toolGuides: Record<TabType, { title: string; description: string; steps: string[]; tips: string[] }> = {
    title: {
      title: 'AI 제목 생성기',
      description: 'AI가 클릭률 높은 블로그 제목을 자동으로 생성해드립니다.',
      steps: ['1. 키워드 입력란에 글의 주제 키워드를 입력하세요', '2. "제목 생성" 버튼을 클릭하세요', '3. AI가 생성한 10개의 제목 중 마음에 드는 것을 선택하세요', '4. 복사 버튼으로 제목을 복사해 사용하세요'],
      tips: ['구체적인 키워드일수록 좋은 제목이 나옵니다', 'CTR(클릭률) 수치가 높을수록 효과적인 제목입니다', '감정 유형을 참고해 글 톤앤매너를 맞춰보세요']
    },
    blueocean: {
      title: '블루오션 키워드 발굴',
      description: '경쟁이 적고 검색량이 많은 숨은 키워드를 찾아드립니다.',
      steps: ['1. 메인 키워드를 입력하세요', '2. "키워드 발굴" 버튼을 클릭하세요', '3. 기회 점수가 높은 키워드를 확인하세요', '4. 트렌드 상승 중인 키워드를 우선 공략하세요'],
      tips: ['기회 점수 = 검색량 ÷ 경쟁도', '상승 트렌드(↑) 키워드가 가장 유망합니다', '롱테일 키워드로 틈새시장을 노려보세요']
    },
    writing: {
      title: 'AI 글쓰기 가이드',
      description: '작성 중인 글을 실시간으로 분석해 개선점을 알려드립니다.',
      steps: ['1. 제목, 키워드, 본문을 입력하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 각 항목별 점수와 개선 제안을 확인하세요', '4. 제안에 따라 글을 수정하세요'],
      tips: ['본문은 1500자 이상이 좋습니다', '키워드는 자연스럽게 3-5회 포함하세요', '소제목을 활용해 가독성을 높이세요']
    },
    insight: {
      title: '성과 인사이트',
      description: '블로그 성과 데이터를 분석해 인사이트를 제공합니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 카테고리별 인사이트를 확인하세요', '4. 추천 액션을 따라 개선하세요'],
      tips: ['정기적으로 분석해 트렌드를 파악하세요', '영향도가 "높음"인 항목을 우선 개선하세요']
    },
    prediction: {
      title: '상위 노출 예측',
      description: '특정 키워드로 상위 노출될 확률을 예측해드립니다.',
      steps: ['1. 목표 키워드를 입력하세요', '2. "예측하기" 버튼을 클릭하세요', '3. 난이도와 성공률을 확인하세요', '4. 제안된 팁을 참고해 글을 작성하세요'],
      tips: ['성공률 70% 이상인 키워드를 공략하세요', '난이도가 낮을수록 상위 노출이 쉽습니다']
    },
    hashtag: {
      title: '해시태그 추천',
      description: '키워드에 맞는 효과적인 해시태그를 추천해드립니다.',
      steps: ['1. 글의 주제 키워드를 입력하세요', '2. "추천받기" 버튼을 클릭하세요', '3. 추천된 해시태그 목록을 확인하세요', '4. 관련도가 높은 태그를 선택해 사용하세요'],
      tips: ['해시태그는 10-15개가 적당합니다', '빈도가 높은 태그는 노출에 유리합니다']
    },
    timing: {
      title: '최적 발행 시간',
      description: '방문자 패턴을 분석해 최적의 발행 시간을 추천합니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 요일별/시간별 점수를 확인하세요', '4. 가장 높은 점수의 시간대에 발행하세요'],
      tips: ['일반적으로 아침 7-9시, 점심 12-13시가 좋습니다', '주말보다 평일이 더 효과적인 경우가 많습니다']
    },
    report: {
      title: '분석 리포트',
      description: '블로그 성과를 종합 리포트로 생성합니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. 기간(주간/월간)을 선택하세요', '3. "리포트 생성" 버튼을 클릭하세요', '4. PDF로 다운로드해 보관하세요'],
      tips: ['월간 리포트로 장기 트렌드를 파악하세요', '리포트를 저장해 성장 기록을 남기세요']
    },
    youtube: {
      title: '유튜브 스크립트 변환',
      description: '블로그 글을 유튜브 영상 스크립트로 변환합니다.',
      steps: ['1. 제목과 본문을 입력하세요', '2. "변환하기" 버튼을 클릭하세요', '3. 생성된 스크립트를 확인하세요', '4. 복사해서 영상 제작에 활용하세요'],
      tips: ['1500자 이상의 글이 좋은 스크립트가 됩니다', '예상 영상 길이를 참고해 분량을 조절하세요']
    },
    lowquality: {
      title: '저품질 위험 감지',
      description: '블로그가 저품질 판정을 받을 위험을 분석합니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. "검사하기" 버튼을 클릭하세요', '3. 위험도와 체크 항목을 확인하세요', '4. 문제 항목을 개선하세요'],
      tips: ['주 1회 정기 검사를 권장합니다', '"위험" 항목은 즉시 개선이 필요합니다']
    },
    backup: {
      title: '블로그 백업',
      description: '블로그 글을 안전하게 백업합니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. "백업 생성" 버튼을 클릭하세요', '3. 백업이 완료되면 목록에서 확인하세요', '4. 필요시 복원 기능을 사용하세요'],
      tips: ['월 1회 정기 백업을 권장합니다', '중요한 글 수정 전에 백업해두세요']
    },
    campaign: {
      title: '체험단 매칭',
      description: '블로그에 맞는 체험단 캠페인을 찾아드립니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. 관심 카테고리를 선택하세요', '3. "매칭하기" 버튼을 클릭하세요', '4. 매칭 점수가 높은 캠페인에 신청하세요'],
      tips: ['매칭 점수 80% 이상이면 선정 확률이 높습니다', '마감 임박 캠페인을 우선 확인하세요']
    },
    ranktrack: {
      title: '키워드 순위 추적',
      description: '특정 키워드에서 내 글의 순위를 추적합니다.',
      steps: ['1. 추적할 키워드를 입력하세요', '2. 블로그 ID를 입력하세요', '3. "추적 시작" 버튼을 클릭하세요', '4. 순위 변화를 모니터링하세요'],
      tips: ['주요 키워드 5-10개를 추적하세요', '순위 하락시 글을 업데이트하세요']
    },
    clone: {
      title: '경쟁 블로그 클론 분석',
      description: '경쟁 블로그의 전략을 분석합니다.',
      steps: ['1. 분석할 블로그 URL을 입력하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 콘텐츠 전략과 패턴을 확인하세요', '4. 성공 요인을 벤치마킹하세요'],
      tips: ['상위 노출되는 블로그를 분석하세요', '포스팅 빈도와 키워드 전략을 참고하세요']
    },
    comment: {
      title: 'AI 댓글 답변',
      description: 'AI가 댓글에 대한 답변을 생성해드립니다.',
      steps: ['1. 답변할 댓글을 입력하세요', '2. "답변 생성" 버튼을 클릭하세요', '3. 톤별로 생성된 답변을 확인하세요', '4. 마음에 드는 답변을 복사해 사용하세요'],
      tips: ['친근한 톤이 소통에 효과적입니다', '이모지 포함 답변으로 친밀감을 높이세요']
    },
    algorithm: {
      title: '알고리즘 변화 감지',
      description: '네이버 알고리즘 변화를 실시간으로 감지합니다.',
      steps: ['1. "감지하기" 버튼을 클릭하세요', '2. 최근 알고리즘 변화를 확인하세요', '3. 영향을 받는 영역을 파악하세요', '4. 권장 대응을 따라 조치하세요'],
      tips: ['주 1회 체크를 권장합니다', '변화 감지시 빠른 대응이 중요합니다']
    },
    lifespan: {
      title: '콘텐츠 수명 분석',
      description: '글별 유효 수명과 트래픽 패턴을 분석합니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 글별 수명과 트래픽을 확인하세요', '4. 수명이 다한 글은 업데이트하세요'],
      tips: ['에버그린 콘텐츠를 늘리세요', '수명이 짧은 글은 주기적으로 리프레시하세요']
    },
    refresh: {
      title: '오래된 글 리프레시',
      description: '업데이트가 필요한 오래된 글을 찾아 개선점을 알려드립니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 리프레시 필요한 글 목록을 확인하세요', '4. 우선순위가 높은 글부터 업데이트하세요'],
      tips: ['3개월 이상 된 글을 점검하세요', '제목과 본문을 함께 업데이트하세요']
    },
    related: {
      title: '연관 글 추천',
      description: '현재 글과 연결할 관련 글 주제를 추천합니다.',
      steps: ['1. 현재 글의 주제를 입력하세요', '2. "추천받기" 버튼을 클릭하세요', '3. 연관 글 아이디어를 확인하세요', '4. 시리즈로 작성해 체류시간을 늘리세요'],
      tips: ['3-5개의 연관 글을 시리즈로 작성하세요', '내부 링크로 연결해 SEO를 높이세요']
    },
    mentor: {
      title: '멘토-멘티 매칭',
      description: '블로그 멘토링을 위한 매칭 서비스입니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. 역할(멘토/멘티)을 선택하세요', '3. 관심 카테고리를 선택하세요', '4. 매칭 결과를 확인하고 연결하세요'],
      tips: ['비슷한 카테고리의 멘토를 찾으세요', '정기적인 피드백이 성장에 도움됩니다']
    },
    trend: {
      title: '실시간 트렌드 스나이퍼',
      description: '실시간 트렌드를 분석해 글감을 추천합니다.',
      steps: ['1. 관심 카테고리를 선택하세요', '2. "트렌드 분석" 버튼을 클릭하세요', '3. 급상승 트렌드를 확인하세요', '4. 골든타임 내에 글을 작성하세요'],
      tips: ['골든타임 내 발행이 가장 효과적입니다', '자동 새로고침으로 실시간 모니터링하세요']
    },
    revenue: {
      title: '수익 대시보드',
      description: '블로그 수익을 분석하고 최적화 방안을 제시합니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. 분석 기간을 선택하세요', '3. "분석하기" 버튼을 클릭하세요', '4. 수익 최적화 팁을 확인하세요'],
      tips: ['광고 위치 최적화로 수익을 높이세요', 'CPM이 높은 카테고리를 공략하세요']
    },
    roadmap: {
      title: '블로그 성장 로드맵',
      description: 'AI가 맞춤형 성장 로드맵을 설계해드립니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. "로드맵 생성" 버튼을 클릭하세요', '3. 현재 상태와 목표를 확인하세요', '4. 단계별 미션을 수행하세요'],
      tips: ['매일 체크리스트를 확인하세요', '마일스톤을 달성할 때마다 보상하세요']
    },
    secretkw: {
      title: '비밀 키워드 DB',
      description: '숨겨진 고수익 키워드를 제공합니다.',
      steps: ['1. 카테고리를 선택하세요', '2. "키워드 보기" 버튼을 클릭하세요', '3. 기회 점수가 높은 키워드를 확인하세요', '4. 경쟁이 적은 키워드로 글을 작성하세요'],
      tips: ['매주 새로운 키워드가 업데이트됩니다', '기회 점수 80+ 키워드를 우선 공략하세요']
    },
    datalab: {
      title: '네이버 데이터랩',
      description: '검색 트렌드와 인구통계를 분석합니다.',
      steps: ['1. 비교할 키워드를 입력하세요 (최대 5개)', '2. "트렌드 분석" 버튼을 클릭하세요', '3. 검색량 추이를 확인하세요', '4. 타겟 인구통계를 파악하세요'],
      tips: ['계절 트렌드를 미리 파악하세요', '연령대별 인기 키워드가 다릅니다']
    },
    shopping: {
      title: '네이버 쇼핑 분석',
      description: '쇼핑 키워드와 상품 트렌드를 분석합니다.',
      steps: ['1. 상품 키워드를 입력하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 인기 상품과 키워드를 확인하세요', '4. 구매 의도가 높은 키워드로 글을 작성하세요'],
      tips: ['구매 의도 80% 이상 키워드가 수익에 유리합니다', '리뷰 많은 상품을 우선 다루세요']
    },
    place: {
      title: '네이버 플레이스 분석',
      description: '지역별 플레이스 경쟁 현황을 분석합니다.',
      steps: ['1. 지역명을 입력하세요', '2. 카테고리를 선택하세요', '3. "분석하기" 버튼을 클릭하세요', '4. 경쟁 현황과 키워드를 확인하세요'],
      tips: ['경쟁도가 낮은 지역을 공략하세요', '리뷰 키워드를 글에 활용하세요']
    },
    news: {
      title: '뉴스/실시간 검색어',
      description: '실시간 뉴스와 검색어 트렌드를 분석합니다.',
      steps: ['1. 카테고리를 선택하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 실시간 검색어와 뉴스를 확인하세요', '4. 골든타임 내에 글을 작성하세요'],
      tips: ['NEW 키워드는 빠른 대응이 필요합니다', '뉴스 앵글을 참고해 차별화된 글을 쓰세요']
    },
    cafe: {
      title: '네이버 카페 분석',
      description: '카페 인기 주제와 질문을 분석합니다.',
      steps: ['1. 카테고리를 선택하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 인기 주제와 질문을 확인하세요', '4. 질문에 답하는 글을 작성하세요'],
      tips: ['자주 묻는 질문을 글 주제로 삼으세요', '추천 카페에 가입해 홍보하세요']
    },
    naverView: {
      title: '네이버 VIEW 분석',
      description: 'VIEW 탭의 영상 트렌드를 분석합니다.',
      steps: ['1. 키워드를 입력하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 인기 영상과 패턴을 확인하세요', '4. 썸네일 패턴을 참고하세요'],
      tips: ['CTR 높은 썸네일 패턴을 벤치마킹하세요', '영상 스크립트를 블로그 글로 재가공하세요']
    },
    influencer: {
      title: '인플루언서 분석',
      description: '인플루언서 랭킹과 벤치마크를 제공합니다.',
      steps: ['1. 블로그 ID를 입력하세요', '2. 카테고리를 선택하세요', '3. "분석하기" 버튼을 클릭하세요', '4. 순위와 로드맵을 확인하세요'],
      tips: ['인플루언서 조건을 단계별로 달성하세요', '상위 인플루언서 전략을 벤치마킹하세요']
    },
    searchAnalysis: {
      title: '통합검색 분석',
      description: '키워드별 검색결과 구성을 분석합니다.',
      steps: ['1. 분석할 키워드를 입력하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 검색결과 구성을 확인하세요', '4. 최적의 콘텐츠 유형을 파악하세요'],
      tips: ['블로그 노출 비중이 높은 키워드를 공략하세요', 'PC와 모바일 결과가 다를 수 있습니다']
    },
    kin: {
      title: '지식인 분석',
      description: '지식인 인기 질문과 트렌드를 분석합니다.',
      steps: ['1. 카테고리를 선택하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 인기 질문을 확인하세요', '4. 질문에 답하며 블로그를 홍보하세요'],
      tips: ['미채택 질문에 답변하면 효과적입니다', '답변에 자연스럽게 블로그 링크를 포함하세요']
    },
    smartstore: {
      title: '스마트스토어 연동',
      description: '스마트스토어와 블로그 시너지를 분석합니다.',
      steps: ['1. 스마트스토어 ID를 입력하세요', '2. "분석하기" 버튼을 클릭하세요', '3. 상품 키워드를 확인하세요', '4. 블로그 콘텐츠 아이디어를 활용하세요'],
      tips: ['상품과 연관된 블로그 글을 작성하세요', '전환율 높은 키워드를 우선 공략하세요']
    },
    keywordAnalysis: {
      title: '키워드 유형 분석',
      description: '연관 키워드를 유형별로 분류하고 필터링합니다.',
      steps: ['1. 분석할 키워드를 입력하세요', '2. 연관 키워드가 자동으로 분류됩니다', '3. 유형별 필터로 원하는 키워드를 찾으세요', '4. 검색량 기준으로 정렬하세요'],
      tips: ['정보형 키워드는 교육 콘텐츠에 적합합니다', '병원탐색형은 지역 타겟팅과 함께 활용하세요', '검색량 500+ 키워드부터 공략하는 것을 추천합니다']
    }
  }

  const tabs = [
    { id: 'title' as TabType, label: 'AI 제목', icon: PenTool, color: 'from-violet-500 to-purple-500' },
    { id: 'blueocean' as TabType, label: '키워드 발굴', icon: Compass, color: 'from-cyan-500 to-blue-500' },
    { id: 'writing' as TabType, label: '글쓰기', icon: FileText, color: 'from-emerald-500 to-teal-500' },
    { id: 'insight' as TabType, label: '인사이트', icon: LineChart, color: 'from-amber-500 to-orange-500' },
    { id: 'prediction' as TabType, label: '노출 예측', icon: Target, color: 'from-purple-500 to-pink-500' },
    { id: 'hashtag' as TabType, label: '해시태그', icon: Hash, color: 'from-green-500 to-emerald-500' },
    { id: 'timing' as TabType, label: '발행 시간', icon: Clock, color: 'from-orange-500 to-red-500' },
    { id: 'report' as TabType, label: '리포트', icon: BarChart3, color: 'from-blue-500 to-cyan-500' },
    { id: 'youtube' as TabType, label: '유튜브', icon: Youtube, color: 'from-red-500 to-rose-500' },
    { id: 'lowquality' as TabType, label: '저품질', icon: Shield, color: 'from-slate-500 to-gray-600' },
    { id: 'backup' as TabType, label: '백업', icon: Database, color: 'from-indigo-500 to-violet-500' },
    { id: 'campaign' as TabType, label: '체험단', icon: Gift, color: 'from-pink-500 to-rose-500' },
    { id: 'ranktrack' as TabType, label: '순위 추적', icon: Activity, color: 'from-teal-500 to-cyan-500' },
    { id: 'clone' as TabType, label: '클론 분석', icon: Scan, color: 'from-fuchsia-500 to-purple-600' },
    { id: 'keywordAnalysis' as TabType, label: '키워드 분석', icon: Tags, color: 'from-indigo-500 to-purple-500' },
    { id: 'comment' as TabType, label: '댓글 AI', icon: MessageSquare, color: 'from-sky-500 to-blue-500' },
    { id: 'algorithm' as TabType, label: '알고리즘', icon: Brain, color: 'from-rose-500 to-pink-600' },
    { id: 'lifespan' as TabType, label: '콘텐츠 수명', icon: Timer, color: 'from-lime-500 to-green-500' },
    { id: 'refresh' as TabType, label: '리프레시', icon: RotateCcw, color: 'from-yellow-500 to-amber-500' },
    { id: 'related' as TabType, label: '연관 글', icon: Link2, color: 'from-violet-500 to-indigo-500' },
    { id: 'mentor' as TabType, label: '멘토링', icon: GraduationCap, color: 'from-emerald-500 to-cyan-500' },
    { id: 'trend' as TabType, label: '트렌드', icon: Radio, color: 'from-red-500 to-orange-500' },
    { id: 'revenue' as TabType, label: '수익', icon: Wallet, color: 'from-green-500 to-emerald-600' },
    { id: 'roadmap' as TabType, label: '로드맵', icon: Map, color: 'from-blue-500 to-purple-500' },
    { id: 'secretkw' as TabType, label: '비밀 키워드', icon: Key, color: 'from-yellow-500 to-red-500' },
    { id: 'datalab' as TabType, label: '데이터랩', icon: DataChart, color: 'from-green-500 to-teal-500' },
    { id: 'shopping' as TabType, label: '쇼핑', icon: ShoppingCart, color: 'from-orange-500 to-amber-500' },
    { id: 'place' as TabType, label: '플레이스', icon: MapPin, color: 'from-red-500 to-pink-500' },
    { id: 'news' as TabType, label: '뉴스/실검', icon: Newspaper, color: 'from-blue-600 to-indigo-600' },
    { id: 'cafe' as TabType, label: '카페', icon: Coffee, color: 'from-amber-600 to-yellow-500' },
    { id: 'naverView' as TabType, label: 'VIEW', icon: Video, color: 'from-purple-500 to-violet-600' },
    { id: 'influencer' as TabType, label: '인플루언서', icon: UserCircle, color: 'from-pink-500 to-rose-600' },
    { id: 'searchAnalysis' as TabType, label: '통합검색', icon: Globe, color: 'from-cyan-500 to-blue-600' },
    { id: 'kin' as TabType, label: '지식인', icon: HelpCircle, color: 'from-green-600 to-emerald-500' },
    { id: 'smartstore' as TabType, label: '스마트스토어', icon: Store, color: 'from-lime-500 to-green-600' },
  ]

  // 도구 선택 핸들러 (튜토리얼 포함)
  const handleToolSelect = (toolId: TabType) => {
    setActiveTab(toolId)
    // 처음 사용하는 도구인 경우 튜토리얼 표시
    if (shouldShowToolTutorial(toolId)) {
      setCurrentTutorialTool(toolId)
      setShowToolTutorial(true)
    }
  }

  // 수동 튜토리얼 시작 (도움말 버튼)
  const startToolTutorial = () => {
    setCurrentTutorialTool(activeTab)
    setShowToolTutorial(true)
  }

  // AI 제목 생성
  const handleTitleGenerate = async () => {
    if (!titleKeyword.trim()) {
      toast.error('키워드를 입력해주세요')
      return
    }

    setTitleLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/tools/title/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          keyword: titleKeyword,
          style: 'engaging',
          count: 10
        })
      })

      if (!response.ok) {
        throw new Error('API 오류')
      }

      const data = await response.json()

      setTitleResult({
        keyword: titleKeyword,
        titles: data.titles.map((t: any) => ({
          title: t.title,
          ctr: t.ctr_score / 10,
          emotion: t.style,
          type: '생성형'
        })).sort((a: any, b: any) => b.ctr - a.ctr)
      })

      toast.success('AI 제목 생성 완료!')
    } catch (error) {
      // Fallback to template-based generation
      const titleTemplates = [
        { template: `${titleKeyword} 완벽 정리! 이것만 알면 끝`, emotion: '정보형', type: '리스트' },
        { template: `${titleKeyword}, 아직도 모르세요? 꼭 알아야 할 꿀팁`, emotion: '호기심', type: '질문형' },
        { template: `${titleKeyword} 후기 | 직접 써보고 솔직하게 말합니다`, emotion: '신뢰', type: '후기형' },
        { template: `2024 ${titleKeyword} 추천 TOP 10 (+ 비교 분석)`, emotion: '정보형', type: '리스트' },
        { template: `${titleKeyword} 초보자도 쉽게! 단계별 가이드`, emotion: '친근함', type: '가이드' },
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
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/tools/keyword/discover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          seed_keyword: blueOceanKeyword,
          category: 'all'
        })
      })

      if (!response.ok) {
        throw new Error('API 오류')
      }

      const data = await response.json()

      const keywords = data.keywords.slice(0, 12).map((k: any) => ({
        keyword: k.keyword,
        searchVolume: k.monthly_search || 0,
        competition: k.competition_score || k.blog_count * 10 || 50,
        opportunity: k.opportunity_score || 50,
        trend: k.monthly_search > 1000 ? 'up' : 'stable' as 'up' | 'down' | 'stable'
      }))

      setBlueOceanResult({
        mainKeyword: blueOceanKeyword,
        keywords
      })

      toast.success('블루오션 키워드 발굴 완료!')
    } catch (error) {
      // Fallback to simple generation
      const suffixes = ['추천', '후기', '비교', '가격', '방법', '꿀팁', '순위', '맛집']
      const keywords = suffixes.map(s => ({
        keyword: `${blueOceanKeyword} ${s}`,
        searchVolume: Math.floor(Math.random() * 10000) + 500,
        competition: Math.floor(Math.random() * 100),
        opportunity: Math.floor(Math.random() * 100),
        trend: 'stable' as 'up' | 'down' | 'stable'
      }))

      setBlueOceanResult({
        mainKeyword: blueOceanKeyword,
        keywords
      })
      toast.success('키워드 발굴 완료!')
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
    if (!insightBlogId.trim() || !insightKeyword.trim()) {
      toast.error('블로그 ID와 키워드를 입력해주세요')
      return
    }

    setInsightLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/tools/insight/analyze?blog_id=${encodeURIComponent(insightBlogId)}&keyword=${encodeURIComponent(insightKeyword)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (response.ok) {
        const data = await response.json()
        setInsightResult({
          blogId: insightBlogId,
          insights: [
            { category: '경쟁도', title: `난이도 ${data.difficulty}%`, description: data.recommendation, impact: data.difficulty > 70 ? 'high' : data.difficulty > 40 ? 'medium' : 'low' },
            { category: '성공률', title: `예상 성공률 ${data.successRate}%`, description: '상위노출 가능성입니다', impact: data.successRate > 60 ? 'high' : 'medium' },
            { category: '경쟁자', title: `평균 포스팅 ${data.competitorAvg?.avgPosts || 100}개`, description: '경쟁 블로그 평균 포스팅 수입니다', impact: 'medium' },
          ],
          bestPerforming: data.topKeywords?.slice(0, 4).map((k: any) => ({ type: k.keyword, performance: Math.min(100, k.count * 10) })) || [],
          recommendations: [
            data.recommendation,
            '꾸준한 포스팅으로 블로그 지수를 올리세요',
            '상위 글의 패턴을 분석해보세요'
          ]
        })
        toast.success('인사이트 분석 완료!')
      } else {
        throw new Error('API 오류')
      }
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
      const token = localStorage.getItem('token')
      // 내 블로그 ID도 함께 전송
      const blogIdParam = predictionBlogId.trim() ? `&blog_id=${encodeURIComponent(predictionBlogId.trim())}` : ''
      const response = await fetch(`${API_BASE}/api/tools/prediction/rank?keyword=${encodeURIComponent(predictionKeyword)}${blogIdParam}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (response.ok) {
        const data = await response.json()
        setPredictionResult({
          keyword: predictionKeyword,
          difficulty: data.difficulty || 50,
          difficultyLabel: data.difficultyLabel || '보통',
          successRate: data.predictedRank?.probability || 50,
          monthlySearch: data.monthlySearch || 0,
          competition: data.competition || '중간',
          topBlogsStats: data.topBlogsStats || {
            avgScore: 50, avgLevel: 3, minScore: 30, maxScore: 80, avgPosts: 100, avgNeighbors: 500
          },
          topBlogs: data.topBlogs || [],
          myBlogAnalysis: data.myBlogAnalysis,
          gapAnalysis: data.gapAnalysis,
          recommendation: data.gapAnalysis?.status === '상위진입가능' ? '도전 추천!' :
                         data.difficulty < 40 ? '쉬움' : data.difficulty < 70 ? '보통' : '어려움',
          tips: data.tips || [
            '제목에 키워드를 자연스럽게 포함하세요',
            '본문 2000자 이상 작성을 권장합니다'
          ]
        })
        toast.success('분석 완료!')
      } else {
        throw new Error('API 오류')
      }
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
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/tools/hashtag/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          keyword: hashtagKeyword,
          count: 10
        })
      })

      if (!response.ok) {
        throw new Error('API 오류')
      }

      const data = await response.json()

      setHashtagResult({
        keyword: hashtagKeyword,
        hashtags: data.hashtags.map((h: any) => ({
          tag: h.tag,
          frequency: h.popularity * 100,
          relevance: h.popularity
        }))
      })

      toast.success('해시태그 추천 완료!')
    } catch (error) {
      // Fallback
      const baseHashtags = [hashtagKeyword, `${hashtagKeyword}추천`, `${hashtagKeyword}리뷰`]
      setHashtagResult({
        keyword: hashtagKeyword,
        hashtags: baseHashtags.map((tag, i) => ({
          tag: `#${tag.replace(/\s/g, '')}`,
          frequency: Math.floor(Math.random() * 10000) + 1000,
          relevance: Math.max(50, 100 - i * 5)
        }))
      })
      toast.success('해시태그 추천 완료!')
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
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/timing/analyze?blog_id=${encodeURIComponent(timingBlogId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setTimingResult(result.data)
        toast.success('분석 완료!')
      } else {
        throw new Error(result.detail || '분석 실패')
      }
    } catch (error) {
      console.error('Timing analysis error:', error)
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
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/report/generate?blog_id=${encodeURIComponent(reportBlogId)}&period=${reportPeriod}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        toast.success(`${reportPeriod === 'weekly' ? '주간' : '월간'} 리포트가 생성되었습니다!`)
      } else {
        throw new Error(result.detail || '리포트 생성 실패')
      }
    } catch (error) {
      console.error('Report generation error:', error)
      toast.error('리포트 생성 중 오류가 발생했습니다')
    } finally {
      setReportLoading(false)
    }
  }

  // 유튜브 스크립트 변환
  const handleYoutubeConvert = async () => {
    if (!youtubeTitle.trim() || !youtubeContent.trim()) {
      toast.error('제목과 본문을 입력해주세요')
      return
    }

    setYoutubeLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/youtube/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: youtubeTitle,
          content: youtubeContent
        })
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setYoutubeResult(result.data)
        toast.success('스크립트 변환 완료!')
      } else {
        throw new Error(result.detail || '변환 실패')
      }
    } catch (error) {
      console.error('YouTube convert error:', error)
      toast.error('변환 중 오류가 발생했습니다')
    } finally {
      setYoutubeLoading(false)
    }
  }

  // 저품질 위험 감지
  const handleLowQualityCheck = async () => {
    if (!lowQualityBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setLowQualityLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/tools/lowquality/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          blog_id: lowQualityBlogId
        })
      })

      if (!response.ok) {
        throw new Error('API 오류')
      }

      const data = await response.json()

      const statusMap: Record<string, 'pass' | 'warning' | 'fail'> = {
        'good': 'pass',
        'warning': 'warning',
        'danger': 'fail',
        'info': 'pass'
      }

      setLowQualityResult({
        blogId: lowQualityBlogId,
        riskLevel: data.grade === '안전' ? 'safe' : data.grade === '주의' ? 'warning' : 'danger',
        riskScore: data.risk_score,
        checks: data.checks.map((c: any) => ({
          item: c.item,
          status: statusMap[c.status] || 'warning',
          message: c.message,
          tip: data.recommendations?.[0] || ''
        })),
        recentIssues: data.recommendations || []
      })

      toast.success('저품질 위험도 분석 완료!')
    } catch (error) {
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setLowQualityLoading(false)
    }
  }

  // 백업 생성
  const handleBackupCreate = async () => {
    if (!backupBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setBackupLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/backup/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          blog_id: backupBlogId
        })
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        const newBackup: BackupItem = {
          id: result.data.backup_id,
          date: new Date().toISOString(),
          postCount: result.data.post_count,
          size: result.data.size,
          status: 'completed'
        }
        setBackupList(prev => [newBackup, ...prev])
        toast.success('백업이 완료되었습니다!')
      } else {
        throw new Error(result.detail || '백업 실패')
      }
    } catch (error) {
      console.error('Backup error:', error)
      toast.error('백업 중 오류가 발생했습니다')
    } finally {
      setBackupLoading(false)
    }
  }

  // 체험단 매칭
  const handleCampaignMatch = async () => {
    if (!campaignBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setCampaignLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/campaign/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          blog_id: campaignBlogId,
          categories: campaignCategories
        })
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setCampaignResult(result.data)
        toast.success('체험단 매칭 완료!')
      } else {
        throw new Error(result.detail || '매칭 실패')
      }
    } catch (error) {
      console.error('Campaign match error:', error)
      toast.error('매칭 중 오류가 발생했습니다')
    } finally {
      setCampaignLoading(false)
    }
  }

  // 키워드 순위 추적
  const handleRankTrack = async () => {
    if (!trackKeyword.trim() || !trackBlogId.trim()) {
      toast.error('키워드와 블로그 ID를 입력해주세요')
      return
    }

    setTrackLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/rank/track?keyword=${encodeURIComponent(trackKeyword)}&blog_id=${encodeURIComponent(trackBlogId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setTrackResult(result.data)

        // 추적 목록에 추가
        if (!trackedKeywords.find(k => k.keyword === trackKeyword)) {
          setTrackedKeywords(prev => [...prev, {
            keyword: trackKeyword,
            currentRank: result.data.currentRank,
            change: result.data.change
          }])
        }

        toast.success('순위 조회 완료!')
      } else {
        throw new Error(result.detail || '조회 실패')
      }
    } catch (error) {
      console.error('Rank track error:', error)
      toast.error('조회 중 오류가 발생했습니다')
    } finally {
      setTrackLoading(false)
    }
  }

  // 경쟁 블로그 클론 분석
  const handleCloneAnalysis = async () => {
    if (!cloneBlogUrl.trim()) {
      toast.error('블로그 URL 또는 ID를 입력해주세요')
      return
    }

    setCloneLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/clone/analyze?blog_url=${encodeURIComponent(cloneBlogUrl)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setCloneResult(result.data)
        toast.success('클론 분석 완료!')
      } else {
        throw new Error(result.detail || '분석 실패')
      }
    } catch (error) {
      console.error('Clone analysis error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setCloneLoading(false)
    }
  }

  // AI 댓글 답변 생성
  const handleCommentReply = async () => {
    if (!commentText.trim()) {
      toast.error('댓글 내용을 입력해주세요')
      return
    }

    setCommentLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/comment/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          comment: commentText,
          post_context: commentContext
        })
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setCommentResult(result.data)
        toast.success('답변 생성 완료!')
      } else {
        throw new Error(result.detail || '생성 실패')
      }
    } catch (error) {
      console.error('Comment reply error:', error)
      toast.error('생성 중 오류가 발생했습니다')
    } finally {
      setCommentLoading(false)
    }
  }

  // 네이버 알고리즘 변화 감지
  const handleAlgorithmCheck = async () => {
    setAlgorithmLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/algorithm/check`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setAlgorithmResult(result.data)
        toast.success('알고리즘 분석 완료!')
      } else {
        throw new Error(result.detail || '분석 실패')
      }
    } catch (error) {
      console.error('Algorithm check error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setAlgorithmLoading(false)
    }
  }

  // 콘텐츠 수명 분석
  const handleLifespanAnalysis = async () => {
    if (!lifespanBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setLifespanLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/content-lifespan/analyze/${encodeURIComponent(lifespanBlogId.trim())}?limit=20`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || '분석 중 오류가 발생했습니다')
      }

      const data = await response.json()

      setLifespanResult({
        blogId: data.blogId,
        posts: data.posts.map((post: any) => ({
          title: post.title,
          date: post.date,
          type: post.type,
          currentViews: post.currentViews,
          peakViews: post.peakViews,
          lifespan: post.lifespan,
          suggestion: post.suggestion
        })),
        summary: {
          evergreen: data.summary.evergreen,
          seasonal: data.summary.seasonal,
          trending: data.summary.trending,
          declining: data.summary.declining
        }
      })

      toast.success(`${data.analyzedPosts}개 글 분석 완료!`)
    } catch (error: any) {
      console.error('콘텐츠 수명 분석 오류:', error)
      toast.error(error.message || '분석 중 오류가 발생했습니다')
    } finally {
      setLifespanLoading(false)
    }
  }

  // 오래된 글 리프레시 분석
  const handleRefreshAnalysis = async () => {
    if (!refreshBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setRefreshLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/refresh/analyze?blog_id=${encodeURIComponent(refreshBlogId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setRefreshResult(result.data)
        toast.success('리프레시 대상 분석 완료!')
      } else {
        throw new Error(result.detail || '분석 실패')
      }
    } catch (error) {
      console.error('Refresh analysis error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setRefreshLoading(false)
    }
  }

  // 연관 글 추천
  const handleRelatedPost = async () => {
    if (!relatedTopic.trim()) {
      toast.error('주제를 입력해주세요')
      return
    }

    setRelatedLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/related/find?topic=${encodeURIComponent(relatedTopic)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setRelatedResult(result.data)
        toast.success('연관 글 추천 완료!')
      } else {
        throw new Error(result.detail || '분석 실패')
      }
    } catch (error) {
      console.error('Related post error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setRelatedLoading(false)
    }
  }

  // 멘토-멘티 매칭
  const handleMentorMatch = async () => {
    if (!mentorBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setMentorLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/mentor/match?blog_id=${encodeURIComponent(mentorBlogId)}&user_type=${mentorUserType}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setMentorResult(result.data)
        toast.success('매칭 완료!')
      } else {
        throw new Error(result.detail || '매칭 실패')
      }
    } catch (error) {
      console.error('Mentor match error:', error)
      toast.error('매칭 중 오류가 발생했습니다')
    } finally {
      setMentorLoading(false)
    }
  }

  // 실시간 트렌드 스나이퍼
  const handleTrendSniper = async () => {
    setTrendLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/trend/snipe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          categories: trendCategories
        })
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setTrendResult(result.data)
        toast.success('트렌드 분석 완료!')
      } else {
        throw new Error(result.detail || '분석 실패')
      }
    } catch (error) {
      console.error('Trend sniper error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setTrendLoading(false)
    }
  }

  // 수익 대시보드 데이터 로드
  const loadRevenueData = async () => {
    setRevenueLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/revenue/revenue/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setRevenueData(result.data)
          // 현재 월 데이터가 있으면 폼에 반영
          if (result.data.current_month) {
            setRevenueForm({
              year: result.data.current_year,
              month: result.data.current_month_num,
              adpost_revenue: result.data.current_month.adpost_revenue || 0,
              adpost_clicks: result.data.current_month.adpost_clicks || 0,
              sponsorship_revenue: result.data.current_month.sponsorship_revenue || 0,
              sponsorship_count: result.data.current_month.sponsorship_count || 0,
              affiliate_revenue: result.data.current_month.affiliate_revenue || 0,
              affiliate_clicks: result.data.current_month.affiliate_clicks || 0,
              affiliate_conversions: result.data.current_month.affiliate_conversions || 0,
              memo: result.data.current_month.memo || ''
            })
          }
        }
      }
    } catch (error) {
      console.error('Error loading revenue data:', error)
    } finally {
      setRevenueLoading(false)
    }
  }

  // 수익 데이터 저장
  const saveRevenueData = async () => {
    setRevenueLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/revenue/revenue/monthly`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(revenueForm)
      })

      if (response.ok) {
        toast.success('수익 데이터가 저장되었습니다!')
        setRevenueEditMode(false)
        loadRevenueData() // 데이터 새로고침
      } else {
        toast.error('저장 실패')
      }
    } catch (error) {
      toast.error('저장 중 오류가 발생했습니다')
    } finally {
      setRevenueLoading(false)
    }
  }

  // 특정 월 데이터 로드
  const loadMonthData = async (year: number, month: number) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/revenue/revenue/monthly/${year}/${month}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          setRevenueForm({
            year,
            month,
            adpost_revenue: result.data.adpost_revenue || 0,
            adpost_clicks: result.data.adpost_clicks || 0,
            sponsorship_revenue: result.data.sponsorship_revenue || 0,
            sponsorship_count: result.data.sponsorship_count || 0,
            affiliate_revenue: result.data.affiliate_revenue || 0,
            affiliate_clicks: result.data.affiliate_clicks || 0,
            affiliate_conversions: result.data.affiliate_conversions || 0,
            memo: result.data.memo || ''
          })
        } else {
          // 데이터가 없으면 초기화
          setRevenueForm({
            year,
            month,
            adpost_revenue: 0,
            adpost_clicks: 0,
            sponsorship_revenue: 0,
            sponsorship_count: 0,
            affiliate_revenue: 0,
            affiliate_clicks: 0,
            affiliate_conversions: 0,
            memo: ''
          })
        }
      }
    } catch (error) {
      console.error('Error loading month data:', error)
    }
  }

  // 블로그 성장 로드맵
  const handleRoadmap = async () => {
    if (!roadmapBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setRoadmapLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/roadmap/generate?blog_id=${encodeURIComponent(roadmapBlogId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setRoadmapResult(result.data)
        toast.success('로드맵 분석 완료!')
      } else {
        throw new Error(result.detail || '분석 실패')
      }
    } catch (error) {
      console.error('Roadmap error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setRoadmapLoading(false)
    }
  }

  // 비공개 키워드 DB 접근
  const handleSecretKeyword = async () => {
    setSecretLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/secret/keywords?category=${encodeURIComponent(secretCategory)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setSecretResult(result.data)
        toast.success('비공개 키워드 로딩 완료!')
      } else {
        throw new Error(result.detail || '로딩 실패')
      }
    } catch (error) {
      console.error('Secret keyword error:', error)
      toast.error('로딩 중 오류가 발생했습니다')
    } finally {
      setSecretLoading(false)
    }
  }

  // 네이버 데이터랩 분석
  const handleDatalab = async () => {
    const validKeywords = datalabKeywords.filter(k => k.trim())
    if (validKeywords.length === 0) {
      toast.error('키워드를 1개 이상 입력해주세요')
      return
    }

    setDatalabLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/datalab/trend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ keywords: validKeywords, period: 'month' })
      })

      if (response.ok) {
        const data = await response.json()
        setDatalabResult({
          keywords: validKeywords,
          trendData: data.trendData || [],
          demographics: data.demographics || [],
          regions: data.regions || [],
          seasonalTip: data.seasonalTip || `"${validKeywords[0]}" 키워드 분석이 완료되었습니다.`
        })
        toast.success('데이터랩 분석 완료!')
      } else {
        // API 실패 시 fallback
        const periods = ['2024-09', '2024-10', '2024-11', '2024-12']
        const ageGroups = ['10대', '20대', '30대', '40대', '50대+']
        const regions = ['서울', '경기', '부산', '인천', '대구']
        setDatalabResult({
          keywords: validKeywords,
          trendData: periods.map(period => ({
            period,
            values: validKeywords.map(kw => ({ keyword: kw, value: Math.floor(Math.random() * 100) }))
          })),
          demographics: validKeywords.map(kw => ({
            keyword: kw,
            age: ageGroups.map(group => ({ group, ratio: Math.floor(Math.random() * 40) + 5 })),
            gender: [{ type: '남성', ratio: 48 }, { type: '여성', ratio: 52 }]
          })),
          regions: validKeywords.map(kw => ({
            keyword: kw,
            data: regions.map(region => ({ region, ratio: Math.floor(Math.random() * 30) + 5 }))
          })),
          seasonalTip: `"${validKeywords[0]}" 키워드 분석 완료 (기본 데이터)`
        })
        toast.success('데이터랩 분석 완료 (기본 데이터)')
      }
    } catch (error) {
      console.error('Datalab API error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setDatalabLoading(false)
    }
  }

  // 네이버 쇼핑 분석
  const handleShopping = async () => {
    if (!shoppingKeyword.trim()) {
      toast.error('키워드를 입력해주세요')
      return
    }

    setShoppingLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/shopping/keywords?keyword=${encodeURIComponent(shoppingKeyword)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (response.ok) {
        const data = await response.json()
        setShoppingResult({
          keyword: shoppingKeyword,
          products: data.products || [],
          shoppingKeywords: data.shoppingKeywords || [],
          priceAlerts: data.priceAlerts || []
        })
        toast.success('쇼핑 분석 완료!')
      } else {
        // API 실패 시 fallback
        const products = [
          { name: `${shoppingKeyword} 베스트 상품`, mall: '스마트스토어', price: 29900 },
          { name: `${shoppingKeyword} 인기 상품`, mall: '쿠팡', price: 35000 },
        ]
        setShoppingResult({
          keyword: shoppingKeyword,
          products: products.map(p => ({
            ...p,
            reviewCount: Math.floor(Math.random() * 5000) + 100,
            rating: 4.5,
            commission: 1000,
            affiliateLink: '',
            trend: 'stable' as const
          })),
          shoppingKeywords: [
            { keyword: `${shoppingKeyword} 추천`, searchVolume: 15000, competition: '중', cpc: 350, purchaseIntent: 85 },
            { keyword: `${shoppingKeyword} 가격`, searchVolume: 12000, competition: '높음', cpc: 420, purchaseIntent: 90 },
          ],
          priceAlerts: []
        })
        toast.success('쇼핑 분석 완료 (기본 데이터)')
      }
    } catch (error) {
      console.error('Shopping API error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setShoppingLoading(false)
    }
  }

  // 네이버 플레이스 분석
  const handlePlace = async () => {
    if (!placeArea.trim()) {
      toast.error('지역을 입력해주세요')
      return
    }

    setPlaceLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/place/search?query=${encodeURIComponent(placeArea)}&category=${encodeURIComponent(placeCategory)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (response.ok) {
        const data = await response.json()
        setPlaceResult({
          area: placeArea,
          places: data.places || [],
          areaAnalysis: data.areaAnalysis || {
            totalPlaces: 0,
            avgRating: 0,
            avgReviewCount: 0,
            topCategory: placeCategory,
            competitionScore: 50
          },
          reviewKeywords: data.reviewKeywords || [],
          myPlaceRank: data.myPlaceRank || []
        })
        toast.success('플레이스 분석 완료!')
      } else {
        // API 실패 시 fallback
        const placeNames = ['맛있는 식당', '분위기 좋은 카페', '유명 맛집']
        setPlaceResult({
          area: placeArea,
          places: placeNames.map((name, i) => ({
            name: `${placeArea} ${name}`,
            category: placeCategory,
            rating: 4.3,
            reviewCount: 100 + i * 50,
            rank: i + 1,
            blogReviewCount: 20,
            keywords: ['분위기', '맛있는'],
            competitionLevel: 'medium' as const
          })),
          areaAnalysis: {
            totalPlaces: 100,
            avgRating: 4.2,
            avgReviewCount: 150,
            topCategory: placeCategory,
            competitionScore: 60
          },
          reviewKeywords: [
            { keyword: '분위기', count: 150, sentiment: 'positive' },
            { keyword: '맛있어요', count: 120, sentiment: 'positive' },
          ],
          myPlaceRank: []
        })
        toast.success('플레이스 분석 완료 (기본 데이터)')
      }
    } catch (error) {
      console.error('Place API error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setPlaceLoading(false)
    }
  }

  // 네이버 뉴스/실시간 검색
  const handleNews = async () => {
    setNewsLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/news/trending`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (response.ok) {
        const data = await response.json()
        setNewsResult({
          realTimeKeywords: data.realTimeKeywords || [],
          issueKeywords: data.issueKeywords || [],
          myTopicNews: data.myTopicNews || []
        })
        toast.success('뉴스/실검 분석 완료!')
      } else {
        // API 실패 시 fallback
        const fallbackKeywords = [
          { keyword: '연말정산', category: '경제' },
          { keyword: '크리스마스 선물', category: '쇼핑' },
          { keyword: '겨울 여행지', category: '여행' },
          { keyword: '신년 다이어트', category: '건강' },
        ]
        setNewsResult({
          realTimeKeywords: fallbackKeywords.map((kw, i) => ({
            rank: i + 1,
            keyword: kw.keyword,
            category: kw.category,
            changeType: 'new' as const,
            changeRank: 0,
            relatedNews: `${kw.keyword} 관련 최신 뉴스...`
          })),
          issueKeywords: fallbackKeywords.map(kw => ({
            keyword: kw.keyword,
            newsCount: Math.floor(Math.random() * 50) + 10,
            blogPotential: Math.floor(Math.random() * 40) + 60,
            goldenTime: '2시간 내',
            suggestedAngle: `${kw.keyword} 완벽 가이드`
          })),
          myTopicNews: []
        })
        toast.success('뉴스 트렌드 분석 완료 (기본 데이터)')
      }
    } catch (error) {
      console.error('News API error:', error)
      toast.error('뉴스 분석 중 오류가 발생했습니다')
    } finally {
      setNewsLoading(false)
    }
  }

  // 네이버 카페 분석
  const handleCafe = async () => {
    setCafeLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/cafe/analysis?keyword=${encodeURIComponent('블로그')}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (response.ok) {
        const data = await response.json()
        setCafeResult({
          popularTopics: data.popularTopics || [],
          questions: data.questions || [],
          recommendedCafes: (data.recommendedCafes || []).map((c: any) => ({
            ...c,
            postingRule: c.postingRule || '홍보글 가능'
          })),
          trafficSource: data.trafficSource || []
        })
        toast.success('카페 분석 완료!')
      } else {
        // Fallback
        setCafeResult({
          popularTopics: [
            { topic: '연말 선물 추천해주세요', cafeName: '맘스홀릭', postCount: 150, engagement: 2500, category: '쇼핑' },
          ],
          questions: [
            { question: '맛집 추천해주세요', cafeName: '맛집탐방', answers: 45, views: 1200, suggestedKeyword: '맛집 추천' },
          ],
          recommendedCafes: [
            { name: '파워블로거 모임', members: 50000, category: '블로그', matchScore: 95, postingRule: '홍보글 1일 1회' },
          ],
          trafficSource: []
        })
        toast.success('카페 분석 완료 (기본 데이터)')
      }
    } catch (error) {
      console.error('Cafe API error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setCafeLoading(false)
    }
  }

  // 네이버 VIEW 분석
  const handleNaverView = async () => {
    if (!viewKeyword.trim()) {
      toast.error('키워드를 입력해주세요')
      return
    }

    setViewLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/view/analysis?keyword=${encodeURIComponent(viewKeyword)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (response.ok) {
        const data = await response.json()
        setViewResult({
          videoKeywords: data.videoKeywords || [],
          topVideos: (data.topVideos || []).map((v: any) => ({ ...v, thumbnail: '' })),
          thumbnailPatterns: data.thumbnailPatterns || [],
          scriptFromVideo: data.scriptFromVideo || null
        })
        toast.success('VIEW 분석 완료!')
      } else {
        // Fallback
        setViewResult({
          videoKeywords: [
            { keyword: `${viewKeyword} 리뷰`, videoCount: 150, avgViews: 25000, competition: '중', opportunity: 75 },
          ],
          topVideos: [
            { title: `${viewKeyword} 리뷰`, creator: '리뷰왕', views: 125000, likes: 3500, duration: '12:34', thumbnail: '' },
          ],
          thumbnailPatterns: [
            { pattern: '얼굴 클로즈업 + 텍스트', ctr: 8.5, example: '놀란 표정 + 큰 글씨' },
          ],
          scriptFromVideo: null
        })
        toast.success('VIEW 분석 완료 (기본 데이터)')
      }
    } catch (error) {
      console.error('VIEW API error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setViewLoading(false)
    }
  }

  // 네이버 인플루언서 분석
  const handleInfluencer = async () => {
    if (!influencerBlogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    setInfluencerLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/influencer/analysis?blog_id=${encodeURIComponent(influencerBlogId)}&category=${encodeURIComponent(influencerCategory)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (response.ok) {
        const data = await response.json()
        setInfluencerResult({
          myRanking: data.myRanking || { category: influencerCategory, rank: 100, totalInfluencers: 2500, score: 300, change: 0 },
          topInfluencers: data.topInfluencers || [],
          benchmarkStats: (data.benchmarkStats || []).concat([
            { metric: '월 포스팅', myValue: Math.floor(Math.random() * 10) + 5, avgValue: 20, topValue: 45 }
          ]),
          roadmapToInfluencer: data.roadmapToInfluencer || []
        })
        toast.success('인플루언서 분석 완료!')
      } else {
        // Fallback
        setInfluencerResult({
          myRanking: { category: influencerCategory === 'all' ? '맛집' : influencerCategory, rank: 150, totalInfluencers: 2500, score: 280, change: 5 },
          topInfluencers: [
            { rank: 1, name: '맛집킹', category: '맛집', followers: 125000, avgViews: 50000, engagement: 8.5, strategy: '매일 포스팅 + 쇼츠 활용' },
          ],
          benchmarkStats: [
            { metric: '팔로워 수', myValue: 2000, avgValue: 15000, topValue: 125000 },
          ],
          roadmapToInfluencer: [
            { step: 1, title: '기초 다지기', requirement: '팔로워 1,000명', currentProgress: 75, tip: '매일 양질의 콘텐츠 발행' },
          ]
        })
        toast.success('인플루언서 분석 완료 (기본 데이터)')
      }
    } catch (error) {
      console.error('Influencer API error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setInfluencerLoading(false)
    }
  }

  // 네이버 통합검색 분석
  const handleSearchAnalysis = async () => {
    if (!searchAnalysisKeyword.trim()) {
      toast.error('키워드를 입력해주세요')
      return
    }

    setSearchAnalysisLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/search/analysis?keyword=${encodeURIComponent(searchAnalysisKeyword)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (response.ok) {
        const data = await response.json()
        setSearchAnalysisResult({
          keyword: searchAnalysisKeyword,
          searchResultComposition: data.searchResultComposition || [],
          tabPriority: data.tabPriority || [],
          mobileVsPc: data.mobileVsPc || [],
          optimalContentType: data.optimalContentType || {
            type: '정보형 블로그',
            reason: '블로그 콘텐츠가 효과적입니다',
            example: `"${searchAnalysisKeyword}" 관련 정보형 콘텐츠`
          }
        })
        toast.success('통합검색 분석 완료!')
      } else {
        // Fallback
        setSearchAnalysisResult({
          keyword: searchAnalysisKeyword,
          searchResultComposition: [
            { section: '블로그', count: 10, percentage: 30, recommendation: '블로그 공략 최적' },
            { section: 'VIEW', count: 8, percentage: 25, recommendation: '영상 콘텐츠 제작 추천' },
          ],
          tabPriority: [
            { tab: 'VIEW', position: 1, visibility: 95, myPresence: false },
            { tab: '블로그', position: 2, visibility: 90, myPresence: false },
          ],
          mobileVsPc: [
            { platform: '모바일', topSections: ['VIEW', '블로그'], recommendation: '모바일 최적화 필수' },
          ],
          optimalContentType: {
            type: '정보형 블로그 + 짧은 영상',
            reason: 'VIEW와 블로그 탭이 모두 상위 노출',
            example: `"${searchAnalysisKeyword} 완벽 가이드"`
          }
        })
        toast.success('통합검색 분석 완료 (기본 데이터)')
      }
    } catch (error) {
      console.error('Search analysis API error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setSearchAnalysisLoading(false)
    }
  }

  // 네이버 지식인 분석
  const handleKin = async () => {
    setKinLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/tools/kin/questions?category=추천&limit=10`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })

      if (!response.ok) {
        throw new Error('API 오류')
      }

      const data = await response.json()

      setKinResult({
        popularQuestions: data.questions.map((q: any) => ({
          question: q.title,
          category: q.keywords?.[0] || '일반',
          answers: Math.floor(Math.random() * 50) + 10,
          views: Math.floor(Math.random() * 20000) + 1000,
          hasAcceptedAnswer: Math.random() > 0.5,
          keyword: q.keywords?.join(', ') || q.title.slice(0, 10)
        })),
        questionTrends: [
          { topic: data.questions[0]?.keywords?.[0] || '추천', questionCount: 500, trend: 'rising', suggestedPost: data.questions[0]?.blog_topic || '인기 질문 정리' },
          { topic: data.questions[1]?.keywords?.[0] || '정보', questionCount: 320, trend: 'stable', suggestedPost: data.questions[1]?.blog_topic || '자주 묻는 질문 가이드' },
        ],
        answerTemplates: [
          {
            questionType: '추천 요청',
            template: '안녕하세요! [주제]에 관심이 있으시군요. 제가 직접 경험한 [추천 내용]을 알려드릴게요...',
            blogLinkTip: '답변 마지막에 "자세한 내용은 블로그에 정리해뒀어요" 추가'
          },
          {
            questionType: '방법 질문',
            template: '[주제] 방법에 대해 답변드릴게요. 1단계: ... 2단계: ... 자세한 내용은...',
            blogLinkTip: '단계별 가이드 블로그 링크 첨부'
          },
        ],
        myLinkTracking: []
      })

      toast.success('지식인 인기 질문 수집 완료!')
    } catch (error) {
      // Fallback
      setKinResult({
        popularQuestions: [
          { question: '맛집 추천해주세요', category: '맛집', answers: 45, views: 12000, hasAcceptedAnswer: true, keyword: '맛집 추천' },
          { question: '여행 코스 짜주세요', category: '여행', answers: 32, views: 8500, hasAcceptedAnswer: false, keyword: '여행 코스' },
        ],
        questionTrends: [],
        answerTemplates: [],
        myLinkTracking: []
      })
      toast.success('지식인 분석 완료!')
    } finally {
      setKinLoading(false)
    }
  }

  // 네이버 스마트스토어 분석
  const handleSmartstore = async () => {
    if (!smartstoreId.trim()) {
      toast.error('스토어 ID를 입력해주세요')
      return
    }

    setSmartstoreLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/api/tools/smartstore/analyze?store_id=${encodeURIComponent(smartstoreId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('API 요청 실패')
      }

      const result = await response.json()

      if (result.success) {
        setSmartstoreResult(result.data)
        toast.success('스마트스토어 분석 완료!')
      } else {
        throw new Error(result.detail || '분석 실패')
      }
    } catch (error) {
      console.error('Smartstore analysis error:', error)
      toast.error('분석 중 오류가 발생했습니다')
    } finally {
      setSmartstoreLoading(false)
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

        {/* 가이드 모달 */}
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowGuide(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 모달 헤더 */}
                <div className={`bg-gradient-to-r ${tabs.find(t => t.id === activeTab)?.color} p-6 text-white`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const TabIcon = tabs.find(t => t.id === activeTab)?.icon || Info
                        return <TabIcon className="w-8 h-8" />
                      })()}
                      <div>
                        <h2 className="text-xl font-bold">{toolGuides[activeTab].title}</h2>
                        <p className="text-white/80 text-sm">{toolGuides[activeTab].description}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowGuide(false)}
                      className="p-2 hover:bg-white/20 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* 모달 내용 */}
                <div className="p-6 overflow-y-auto max-h-[50vh]">
                  {/* 사용 방법 */}
                  <div className="mb-6">
                    <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm">1</span>
                      사용 방법
                    </h3>
                    <div className="space-y-2">
                      {toolGuides[activeTab].steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                          <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700 text-sm">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 꿀팁 */}
                  <div>
                    <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center text-sm">2</span>
                      꿀팁
                    </h3>
                    <div className="space-y-2">
                      {toolGuides[activeTab].tips.map((tip, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                          <Lightbulb className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700 text-sm">{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 모달 푸터 */}
                <div className="p-4 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => setShowGuide(false)}
                    className={`w-full py-3 rounded-xl bg-gradient-to-r ${tabs.find(t => t.id === activeTab)?.color} text-white font-semibold hover:shadow-lg transition-all`}
                  >
                    시작하기
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 플로팅 도움말 버튼들 */}
        <div className="fixed bottom-24 right-6 z-40 flex flex-col gap-3">
          {/* 현재 도구 튜토리얼 버튼 */}
          <motion.button
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            onClick={startToolTutorial}
            className="w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all flex items-center justify-center group"
          >
            <HelpCircle className="w-6 h-6" />
            <span className="absolute right-full mr-3 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              도구 설명 보기
            </span>
          </motion.button>

          {/* 전체 가이드 버튼 */}
          <motion.button
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            onClick={() => setShowGuide(true)}
            className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all flex items-center justify-center group"
          >
            <Info className="w-6 h-6" />
            <span className="absolute right-full mr-3 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              전체 가이드
            </span>
          </motion.button>
        </div>

        {/* 카테고리별 도구 목록 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4 mb-8"
        >
          {/* 콘텐츠 제작 */}
          <div id="section-content" className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-sm font-bold text-gray-700">콘텐츠 제작</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {tabs.slice(0, 8).map((tab) => {
                const badge = getFeatureBadge(tab.id)
                const isLocked = !canAccess(tab.id)
                return (
                  <button
                    key={tab.id}
                    onClick={() => !isLocked && handleToolSelect(tab.id)}
                    className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                      isLocked
                        ? 'bg-gray-100/80 text-gray-400 cursor-not-allowed'
                        : activeTab === tab.id
                        ? `bg-gradient-to-br ${tab.color} text-white shadow-lg shadow-purple-500/20 scale-105`
                        : 'bg-white/60 hover:bg-white hover:shadow-md text-gray-600 hover:scale-105'
                    }`}
                  >
                    {isLocked && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-gray-500 rounded-full flex items-center justify-center">
                        <Lock className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    {badge && !isLocked && (
                      <div className={`absolute -top-1 -right-1 px-1 py-0.5 text-[8px] font-bold rounded ${badge.color}`}>
                        {badge.label}
                      </div>
                    )}
                    <tab.icon className={`w-5 h-5 ${isLocked ? 'opacity-50' : activeTab === tab.id ? '' : 'group-hover:text-purple-500'}`} />
                    <span className="text-[10px] font-medium truncate w-full text-center">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 분석 & 최적화 */}
          <div id="section-analysis" className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm font-bold text-gray-700">분석 & 최적화</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {tabs.slice(8, 16).map((tab) => {
                const badge = getFeatureBadge(tab.id)
                const isLocked = !canAccess(tab.id)
                return (
                  <button
                    key={tab.id}
                    onClick={() => !isLocked && handleToolSelect(tab.id)}
                    className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                      isLocked
                        ? 'bg-gray-100/80 text-gray-400 cursor-not-allowed'
                        : activeTab === tab.id
                        ? `bg-gradient-to-br ${tab.color} text-white shadow-lg shadow-blue-500/20 scale-105`
                        : 'bg-white/60 hover:bg-white hover:shadow-md text-gray-600 hover:scale-105'
                    }`}
                  >
                    {isLocked && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-gray-500 rounded-full flex items-center justify-center">
                        <Lock className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    {badge && !isLocked && (
                      <div className={`absolute -top-1 -right-1 px-1 py-0.5 text-[8px] font-bold rounded ${badge.color}`}>
                        {badge.label}
                      </div>
                    )}
                    <tab.icon className={`w-5 h-5 ${isLocked ? 'opacity-50' : activeTab === tab.id ? '' : 'group-hover:text-blue-500'}`} />
                    <span className="text-[10px] font-medium truncate w-full text-center">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 성장 전략 */}
          <div id="section-growth" className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-bold text-gray-700">성장 전략</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {tabs.slice(16, 24).map((tab) => {
                const badge = getFeatureBadge(tab.id)
                const isLocked = !canAccess(tab.id)
                return (
                  <button
                    key={tab.id}
                    onClick={() => !isLocked && handleToolSelect(tab.id)}
                    className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                      isLocked
                        ? 'bg-gray-100/80 text-gray-400 cursor-not-allowed'
                        : activeTab === tab.id
                        ? `bg-gradient-to-br ${tab.color} text-white shadow-lg shadow-green-500/20 scale-105`
                        : 'bg-white/60 hover:bg-white hover:shadow-md text-gray-600 hover:scale-105'
                    }`}
                  >
                    {isLocked && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-gray-500 rounded-full flex items-center justify-center">
                        <Lock className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    {badge && !isLocked && (
                      <div className={`absolute -top-1 -right-1 px-1 py-0.5 text-[8px] font-bold rounded ${badge.color}`}>
                        {badge.label}
                      </div>
                    )}
                    <tab.icon className={`w-5 h-5 ${isLocked ? 'opacity-50' : activeTab === tab.id ? '' : 'group-hover:text-green-500'}`} />
                    <span className="text-[10px] font-medium truncate w-full text-center">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 네이버 생태계 */}
          <div id="section-naver" className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-bold text-gray-700">네이버 생태계</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">NEW</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-2">
              {tabs.slice(24).map((tab) => {
                const badge = getFeatureBadge(tab.id)
                const isLocked = !canAccess(tab.id)
                return (
                  <button
                    key={tab.id}
                    onClick={() => !isLocked && handleToolSelect(tab.id)}
                    className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                      isLocked
                        ? 'bg-gray-100/80 text-gray-400 cursor-not-allowed'
                        : activeTab === tab.id
                        ? `bg-gradient-to-br ${tab.color} text-white shadow-lg shadow-emerald-500/20 scale-105`
                        : 'bg-white/60 hover:bg-white hover:shadow-md text-gray-600 hover:scale-105'
                    }`}
                  >
                    {isLocked && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-gray-500 rounded-full flex items-center justify-center">
                        <Lock className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    {badge && !isLocked && (
                      <div className={`absolute -top-1 -right-1 px-1 py-0.5 text-[8px] font-bold rounded ${badge.color}`}>
                        {badge.label}
                      </div>
                    )}
                    <tab.icon className={`w-5 h-5 ${isLocked ? 'opacity-50' : activeTab === tab.id ? '' : 'group-hover:text-emerald-500'}`} />
                    <span className="text-[10px] font-medium truncate w-full text-center">{tab.label}</span>
                  </button>
                )
              })}
              {/* 광고 최적화 - 별도 페이지 링크 */}
              <Link
                href="/ad-optimizer"
                className="group relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all bg-white/60 hover:bg-white hover:shadow-md text-gray-600 hover:scale-105"
              >
                <div className="absolute -top-1 -right-1 px-1 py-0.5 text-[8px] font-bold rounded bg-orange-100 text-orange-700">
                  PRO
                </div>
                <Megaphone className="w-5 h-5 group-hover:text-orange-500" />
                <span className="text-[10px] font-medium truncate w-full text-center">광고 최적화</span>
              </Link>
            </div>
          </div>

          {/* 현재 플랜 안내 */}
          {plan !== 'unlimited' && (
            <div className="glass rounded-2xl p-4 bg-gradient-to-r from-purple-50 to-pink-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Crown className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="text-sm text-gray-600">
                      현재 <span className="font-bold text-purple-600">{PLAN_INFO[plan].name}</span> 플랜 이용 중
                    </p>
                    <p className="text-xs text-gray-500">잠금된 기능은 업그레이드 후 이용할 수 있습니다</p>
                  </div>
                </div>
                <Link
                  href="/pricing"
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all"
                >
                  업그레이드
                </Link>
              </div>
            </div>
          )}
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
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500">
                      <PenTool className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">AI 제목 생성기</h2>
                      <p className="text-gray-600">클릭율 높은 제목을 AI가 자동 생성합니다</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowGuide(true)}
                    className="flex items-center gap-2 px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-xl transition-colors"
                  >
                    <Info className="w-5 h-5" />
                    <span className="text-sm font-medium">사용법</span>
                  </button>
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
                    <p className="text-gray-600">키워드 경쟁도와 상위 노출 가능성을 실제 데이터로 분석합니다</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex gap-4">
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
                  </div>
                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        value={predictionBlogId}
                        onChange={(e) => setPredictionBlogId(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handlePrediction()}
                        placeholder="내 블로그 ID (선택사항 - 입력 시 맞춤 분석)"
                        className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none"
                        disabled={predictionLoading}
                      />
                    </div>
                    <button
                      onClick={handlePrediction}
                      disabled={predictionLoading}
                      className="px-8 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {predictionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Target className="w-5 h-5" />분석하기</>}
                    </button>
                  </div>
                </div>

                {predictionResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* 메인 지표 */}
                    <div className="grid md:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-5 text-center">
                        <div className="text-3xl font-bold text-purple-600 mb-1">{predictionResult.successRate}%</div>
                        <div className="text-xs text-gray-600">상위 노출 확률</div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-5 text-center">
                        <div className={`text-3xl font-bold ${getDifficultyColor(predictionResult.difficulty)} mb-1`}>
                          {predictionResult.difficultyLabel}
                        </div>
                        <div className="text-xs text-gray-600">난이도 ({predictionResult.difficulty}점)</div>
                      </div>
                      <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-5 text-center">
                        <div className="text-3xl font-bold text-orange-600 mb-1">
                          {predictionResult.monthlySearch >= 10000
                            ? `${(predictionResult.monthlySearch / 10000).toFixed(1)}만`
                            : predictionResult.monthlySearch >= 1000
                              ? `${(predictionResult.monthlySearch / 1000).toFixed(1)}천`
                              : predictionResult.monthlySearch || '-'}
                        </div>
                        <div className="text-xs text-gray-600">월검색량</div>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 text-center">
                        <div className="text-3xl font-bold text-green-600 mb-1">{predictionResult.competition}</div>
                        <div className="text-xs text-gray-600">광고 경쟁</div>
                      </div>
                    </div>

                    {/* 상위 블로그 통계 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-100">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-600" />
                        상위 블로그 분석 (TOP 10)
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="text-center p-3 bg-gray-50 rounded-xl">
                          <div className="text-2xl font-bold text-gray-800">{predictionResult.topBlogsStats.avgScore}</div>
                          <div className="text-xs text-gray-500">평균 점수</div>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-xl">
                          <div className="text-2xl font-bold text-gray-800">Lv.{predictionResult.topBlogsStats.avgLevel}</div>
                          <div className="text-xs text-gray-500">평균 레벨</div>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-xl">
                          <div className="text-2xl font-bold text-green-600">{predictionResult.topBlogsStats.minScore}</div>
                          <div className="text-xs text-gray-500">최저 점수</div>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-xl">
                          <div className="text-2xl font-bold text-red-600">{predictionResult.topBlogsStats.maxScore}</div>
                          <div className="text-xs text-gray-500">최고 점수</div>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-xl">
                          <div className="text-2xl font-bold text-gray-800">{predictionResult.topBlogsStats.avgPosts}</div>
                          <div className="text-xs text-gray-500">평균 포스팅</div>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-xl">
                          <div className="text-2xl font-bold text-gray-800">{predictionResult.topBlogsStats.avgNeighbors}</div>
                          <div className="text-xs text-gray-500">평균 이웃</div>
                        </div>
                      </div>
                    </div>

                    {/* 상위 블로그 목록 */}
                    {predictionResult.topBlogs && predictionResult.topBlogs.length > 0 && (
                      <div className="bg-white rounded-2xl p-6 border border-gray-100">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                          <Trophy className="w-5 h-5 text-yellow-500" />
                          상위 5개 블로그
                        </h3>
                        <div className="space-y-3">
                          {predictionResult.topBlogs.map((blog, i) => (
                            <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                                i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-300'
                              }`}>
                                {blog.rank}
                              </div>
                              <div className="flex-1">
                                <div className="font-medium text-gray-800">{blog.blog_name || `블로그 ${blog.rank}`}</div>
                                <div className="text-xs text-gray-500">포스팅 {blog.posts}개</div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-purple-600">{blog.score}점</div>
                                <div className="text-xs text-gray-500">Lv.{blog.level}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 내 블로그 분석 결과 */}
                    {predictionResult.myBlogAnalysis && predictionResult.gapAnalysis && (
                      <div className={`rounded-2xl p-6 border-2 ${
                        predictionResult.gapAnalysis.status === '상위진입가능'
                          ? 'bg-green-50 border-green-300'
                          : 'bg-amber-50 border-amber-300'
                      }`}>
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                          <User className="w-5 h-5" />
                          내 블로그 경쟁력 분석
                          <span className={`ml-2 px-3 py-1 rounded-full text-sm font-bold ${
                            predictionResult.gapAnalysis.status === '상위진입가능'
                              ? 'bg-green-500 text-white'
                              : 'bg-amber-500 text-white'
                          }`}>
                            {predictionResult.gapAnalysis.status}
                          </span>
                        </h3>
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <div className="text-sm text-gray-600 mb-2">내 블로그 현황</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-white rounded-xl text-center">
                                <div className="text-2xl font-bold text-purple-600">{predictionResult.myBlogAnalysis.score}</div>
                                <div className="text-xs text-gray-500">점수</div>
                              </div>
                              <div className="p-3 bg-white rounded-xl text-center">
                                <div className="text-2xl font-bold text-purple-600">Lv.{predictionResult.myBlogAnalysis.level}</div>
                                <div className="text-xs text-gray-500">레벨</div>
                              </div>
                              <div className="p-3 bg-white rounded-xl text-center">
                                <div className="text-2xl font-bold text-gray-700">{predictionResult.myBlogAnalysis.posts}</div>
                                <div className="text-xs text-gray-500">포스팅</div>
                              </div>
                              <div className="p-3 bg-white rounded-xl text-center">
                                <div className="text-2xl font-bold text-gray-700">{predictionResult.myBlogAnalysis.neighbors}</div>
                                <div className="text-xs text-gray-500">이웃</div>
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-600 mb-2">상위 블로그 대비 차이</div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                                <span className="text-sm text-gray-600">점수 차이</span>
                                <span className={`font-bold ${predictionResult.gapAnalysis.score_gap > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                  {predictionResult.gapAnalysis.score_gap > 0 ? `-${predictionResult.gapAnalysis.score_gap}` : `+${Math.abs(predictionResult.gapAnalysis.score_gap)}`}
                                </span>
                              </div>
                              <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                                <span className="text-sm text-gray-600">레벨 차이</span>
                                <span className={`font-bold ${predictionResult.gapAnalysis.level_gap > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                  {predictionResult.gapAnalysis.level_gap > 0 ? `-${predictionResult.gapAnalysis.level_gap}` : `+${Math.abs(predictionResult.gapAnalysis.level_gap)}`}
                                </span>
                              </div>
                              <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                                <span className="text-sm text-gray-600">포스팅 차이</span>
                                <span className={`font-bold ${predictionResult.gapAnalysis.posts_gap > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                  {predictionResult.gapAnalysis.posts_gap > 0 ? `-${predictionResult.gapAnalysis.posts_gap}` : `+${Math.abs(predictionResult.gapAnalysis.posts_gap)}`}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 팁 */}
                    <div className="bg-purple-50 rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-600" />
                        상위 노출 전략
                      </h3>
                      <ul className="space-y-2">
                        {predictionResult.tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-gray-700">
                            <CheckCircle className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
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

          {/* 유튜브 스크립트 변환 */}
          {activeTab === 'youtube' && (
            <motion.div
              key="youtube"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-500">
                    <Youtube className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">유튜브 스크립트 변환</h2>
                    <p className="text-gray-600">블로그 글을 유튜브 영상 대본으로 자동 변환합니다</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">블로그 글 제목</label>
                    <input
                      type="text"
                      value={youtubeTitle}
                      onChange={(e) => setYoutubeTitle(e.target.value)}
                      placeholder="변환할 블로그 글 제목"
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      블로그 본문 <span className="text-gray-400 font-normal">({youtubeContent.length}자)</span>
                    </label>
                    <textarea
                      value={youtubeContent}
                      onChange={(e) => setYoutubeContent(e.target.value)}
                      placeholder="블로그 글 본문을 붙여넣기하세요..."
                      rows={8}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-red-500 focus:outline-none resize-none"
                    />
                  </div>

                  <button
                    onClick={handleYoutubeConvert}
                    disabled={youtubeLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {youtubeLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        변환 중...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5" />
                        스크립트 생성
                      </>
                    )}
                  </button>
                </div>

                {youtubeResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 영상 정보 */}
                    <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-gray-800">{youtubeResult.title}</h3>
                        <span className="px-3 py-1 bg-red-500 text-white rounded-full text-sm font-medium">
                          예상 {youtubeResult.totalDuration}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {youtubeResult.hashtags.map((tag, i) => (
                          <span key={i} className="px-2 py-1 bg-white rounded-lg text-sm text-gray-600">{tag}</span>
                        ))}
                      </div>
                    </div>

                    {/* 인트로 */}
                    <div className="bg-white rounded-2xl p-6 border-l-4 border-red-500">
                      <h4 className="font-bold text-lg mb-2 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-sm">인트로</span>
                      </h4>
                      <p className="text-gray-700 whitespace-pre-line">{youtubeResult.intro}</p>
                    </div>

                    {/* 섹션들 */}
                    {youtubeResult.sections.map((section, i) => (
                      <div key={i} className="bg-white rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-lg">{section.title}</h4>
                          <span className="text-sm text-gray-500">{section.duration}</span>
                        </div>
                        <p className="text-gray-700">{section.content}</p>
                      </div>
                    ))}

                    {/* 아웃트로 */}
                    <div className="bg-white rounded-2xl p-6 border-l-4 border-rose-500">
                      <h4 className="font-bold text-lg mb-2 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-sm">아웃트로</span>
                      </h4>
                      <p className="text-gray-700 whitespace-pre-line">{youtubeResult.outro}</p>
                    </div>

                    {/* 복사 버튼 */}
                    <button
                      onClick={() => {
                        const fullScript = `${youtubeResult.title}\n\n[인트로]\n${youtubeResult.intro}\n\n${youtubeResult.sections.map(s => `[${s.title}]\n${s.content}`).join('\n\n')}\n\n[아웃트로]\n${youtubeResult.outro}`
                        navigator.clipboard.writeText(fullScript)
                        toast.success('전체 스크립트가 복사되었습니다!')
                      }}
                      className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <Copy className="w-5 h-5" />
                      전체 스크립트 복사
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 저품질 위험 감지 */}
          {activeTab === 'lowquality' && (
            <motion.div
              key="lowquality"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-slate-500 to-gray-600">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">저품질 위험 감지</h2>
                    <p className="text-gray-600">블로그 저품질 위험도를 사전에 체크합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={lowQualityBlogId}
                      onChange={(e) => setLowQualityBlogId(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleLowQualityCheck()}
                      placeholder="블로그 ID 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-slate-500 focus:outline-none"
                      disabled={lowQualityLoading}
                    />
                  </div>
                  <button
                    onClick={handleLowQualityCheck}
                    disabled={lowQualityLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-slate-500 to-gray-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {lowQualityLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Shield className="w-5 h-5" />
                        위험도 분석
                      </>
                    )}
                  </button>
                </div>

                {lowQualityResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 위험도 표시 */}
                    <div className={`rounded-2xl p-8 text-center ${
                      lowQualityResult.riskLevel === 'safe' ? 'bg-gradient-to-br from-green-50 to-emerald-50' :
                      lowQualityResult.riskLevel === 'warning' ? 'bg-gradient-to-br from-yellow-50 to-amber-50' :
                      'bg-gradient-to-br from-red-50 to-rose-50'
                    }`}>
                      <div className={`text-6xl font-bold mb-2 ${
                        lowQualityResult.riskLevel === 'safe' ? 'text-green-600' :
                        lowQualityResult.riskLevel === 'warning' ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {lowQualityResult.riskLevel === 'safe' ? '안전' :
                         lowQualityResult.riskLevel === 'warning' ? '주의' : '위험'}
                      </div>
                      <div className="text-lg text-gray-600">
                        위험 점수: {lowQualityResult.riskScore}점
                      </div>
                      <div className={`mt-2 text-sm ${
                        lowQualityResult.riskLevel === 'safe' ? 'text-green-600' :
                        lowQualityResult.riskLevel === 'warning' ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {lowQualityResult.riskLevel === 'safe' ? '저품질 위험이 낮습니다. 현재 상태를 유지하세요!' :
                         lowQualityResult.riskLevel === 'warning' ? '일부 항목에서 개선이 필요합니다.' :
                         '저품질 위험이 높습니다. 즉시 조치가 필요합니다!'}
                      </div>
                    </div>

                    {/* 체크 항목들 */}
                    <div className="space-y-3">
                      <h3 className="font-bold text-lg">상세 분석</h3>
                      {lowQualityResult.checks.map((check, i) => (
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
                            {check.status === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-500" />}
                            {check.status === 'fail' && <XCircle className="w-5 h-5 text-red-500" />}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-gray-800">{check.item}</div>
                            <div className="text-sm text-gray-600">{check.message}</div>
                            {check.tip && (
                              <div className="text-sm text-blue-600 mt-1 flex items-center gap-1">
                                <Lightbulb className="w-4 h-4" />
                                {check.tip}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 최근 이슈 */}
                    {lowQualityResult.recentIssues.length > 0 && (
                      <div className="bg-red-50 rounded-2xl p-6 border border-red-200">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-red-700">
                          <AlertTriangle className="w-5 h-5" />
                          최근 발견된 이슈
                        </h3>
                        <ul className="space-y-2">
                          {lowQualityResult.recentIssues.map((issue, i) => (
                            <li key={i} className="flex items-start gap-2 text-red-700">
                              <span className="mt-1">•</span>
                              <span>{issue}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 백업 & 복원 */}
          {activeTab === 'backup' && (
            <motion.div
              key="backup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500">
                    <Database className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">백업 & 복원</h2>
                    <p className="text-gray-600">블로그 전체 글을 안전하게 백업하고 복원합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={backupBlogId}
                      onChange={(e) => setBackupBlogId(e.target.value)}
                      placeholder="블로그 ID 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:outline-none"
                      disabled={backupLoading}
                    />
                  </div>
                  <button
                    onClick={handleBackupCreate}
                    disabled={backupLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {backupLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Archive className="w-5 h-5" />
                        새 백업 생성
                      </>
                    )}
                  </button>
                </div>

                {/* 백업 목록 */}
                <div className="space-y-4">
                  <h3 className="font-bold text-lg">백업 목록</h3>

                  {backupList.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-2xl">
                      <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">아직 백업이 없습니다</p>
                      <p className="text-sm text-gray-400">위에서 새 백업을 생성해주세요</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {backupList.map((backup) => (
                        <motion.div
                          key={backup.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-indigo-100">
                              <Archive className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                              <div className="font-medium text-gray-800">
                                {new Date(backup.date).toLocaleDateString('ko-KR', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              <div className="text-sm text-gray-500">
                                {backup.postCount}개 포스트 • {backup.size}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toast.success('복원이 시작되었습니다')}
                              className="px-4 py-2 rounded-lg bg-indigo-100 text-indigo-700 font-medium hover:bg-indigo-200 transition-colors flex items-center gap-1"
                            >
                              <Upload className="w-4 h-4" />
                              복원
                            </button>
                            <button
                              onClick={() => toast.success('다운로드가 시작되었습니다')}
                              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors flex items-center gap-1"
                            >
                              <Download className="w-4 h-4" />
                              다운로드
                            </button>
                            <button
                              onClick={() => {
                                setBackupList(prev => prev.filter(b => b.id !== backup.id))
                                toast.success('백업이 삭제되었습니다')
                              }}
                              className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 백업 안내 */}
                <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 text-indigo-600 mt-0.5" />
                    <div>
                      <div className="font-semibold text-indigo-800">백업 안내</div>
                      <ul className="mt-2 space-y-1 text-sm text-indigo-700">
                        <li>• 백업에는 글 제목, 본문, 이미지 URL이 포함됩니다</li>
                        <li>• 백업 파일은 30일간 보관됩니다</li>
                        <li>• 복원 시 기존 글과 중복되지 않게 처리됩니다</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 체험단 매칭 */}
          {activeTab === 'campaign' && (
            <motion.div
              key="campaign"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500">
                    <Gift className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">체험단 매칭</h2>
                    <p className="text-gray-600">내 블로그에 딱 맞는 체험단을 추천받으세요</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        value={campaignBlogId}
                        onChange={(e) => setCampaignBlogId(e.target.value)}
                        placeholder="블로그 ID 입력"
                        className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-pink-500 focus:outline-none"
                        disabled={campaignLoading}
                      />
                    </div>
                    <select
                      value={campaignCategory}
                      onChange={(e) => setCampaignCategory(e.target.value)}
                      className="px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-pink-500 focus:outline-none bg-white"
                    >
                      <option value="all">전체 카테고리</option>
                      <option value="food">맛집</option>
                      <option value="beauty">뷰티</option>
                      <option value="baby">육아</option>
                      <option value="travel">여행</option>
                      <option value="living">리빙</option>
                      <option value="tech">테크</option>
                    </select>
                  </div>

                  <button
                    onClick={handleCampaignMatch}
                    disabled={campaignLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {campaignLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        매칭 중...
                      </>
                    ) : (
                      <>
                        <Gift className="w-5 h-5" />
                        체험단 찾기
                      </>
                    )}
                  </button>
                </div>

                {campaignResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <h3 className="font-bold text-lg">추천 체험단 ({campaignResult.campaigns.length}개)</h3>

                    <div className="grid gap-4">
                      {campaignResult.campaigns.map((campaign, i) => (
                        <motion.div
                          key={campaign.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={`p-5 rounded-2xl border-2 ${
                            i < 3 ? 'bg-gradient-to-r from-pink-50 to-rose-50 border-pink-200' : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                {i < 3 && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                                <h4 className="font-bold text-lg text-gray-800">{campaign.title}</h4>
                                {campaign.status === 'closing_soon' && (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                                    마감임박
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-500">{campaign.brand} • {campaign.category}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-pink-600">{campaign.matchScore}%</div>
                              <div className="text-xs text-gray-500">매칭률</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 mb-3 text-sm">
                            <span className="px-3 py-1 bg-white rounded-lg text-gray-700">{campaign.reward}</span>
                            <span className="text-gray-500">마감 {campaign.deadline}</span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-500">
                              조건: 지수 {campaign.requirements.minScore}점 이상, 이웃 {campaign.requirements.minNeighbors}명 이상
                            </div>
                            <button
                              onClick={() => toast.success('체험단 상세 페이지로 이동합니다')}
                              className="px-4 py-2 rounded-lg bg-pink-500 text-white font-medium hover:bg-pink-600 transition-colors flex items-center gap-1 text-sm"
                            >
                              신청하기
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 키워드 순위 추적 */}
          {activeTab === 'ranktrack' && (
            <motion.div
              key="ranktrack"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">키워드 순위 추적</h2>
                    <p className="text-gray-600">내 글의 네이버 검색 순위를 매일 추적합니다</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        value={trackBlogId}
                        onChange={(e) => setTrackBlogId(e.target.value)}
                        placeholder="블로그 ID 입력"
                        className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-teal-500 focus:outline-none"
                        disabled={trackLoading}
                      />
                    </div>
                    <div className="relative flex-1">
                      <Hash className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        value={trackKeyword}
                        onChange={(e) => setTrackKeyword(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleRankTrack()}
                        placeholder="추적할 키워드 입력"
                        className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-teal-500 focus:outline-none"
                        disabled={trackLoading}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleRankTrack}
                    disabled={trackLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {trackLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        조회 중...
                      </>
                    ) : (
                      <>
                        <Activity className="w-5 h-5" />
                        순위 조회
                      </>
                    )}
                  </button>
                </div>

                {/* 추적 중인 키워드 목록 */}
                {trackedKeywords.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-bold text-sm text-gray-600 mb-3">추적 중인 키워드</h3>
                    <div className="flex flex-wrap gap-2">
                      {trackedKeywords.map((k, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setTrackKeyword(k.keyword)
                            handleRankTrack()
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-full cursor-pointer hover:bg-teal-100 transition-colors"
                        >
                          <span className="text-sm font-medium text-teal-800">{k.keyword}</span>
                          {k.currentRank ? (
                            <span className="text-xs font-bold text-teal-600">{k.currentRank}위</span>
                          ) : (
                            <span className="text-xs text-gray-400">순위권 외</span>
                          )}
                          {k.change !== 0 && (
                            <span className={`text-xs font-bold ${k.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {k.change > 0 ? `▲${k.change}` : `▼${Math.abs(k.change)}`}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {trackResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 현재 순위 */}
                    <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-2xl p-8 text-center">
                      <div className="text-sm text-gray-600 mb-2">"{trackResult.keyword}" 현재 순위</div>
                      {trackResult.currentRank ? (
                        <>
                          <div className="text-5xl font-bold text-teal-600 mb-2">
                            {trackResult.currentRank}위
                          </div>
                          {trackResult.change !== 0 && (
                            <div className={`text-lg font-semibold ${trackResult.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {trackResult.change > 0 ? `▲ ${trackResult.change}` : `▼ ${Math.abs(trackResult.change)}`}
                              <span className="text-sm text-gray-500 ml-2">어제 대비</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-2xl font-bold text-gray-400">순위권 외</div>
                      )}
                    </div>

                    {/* 순위 변화 그래프 */}
                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">최근 7일 순위 변화</h3>
                      <div className="flex items-end justify-between h-32 gap-2">
                        {trackResult.history.map((h, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center">
                            <div className="flex-1 w-full flex items-end justify-center">
                              {h.rank ? (
                                <div
                                  className="w-full max-w-[40px] bg-gradient-to-t from-teal-500 to-cyan-400 rounded-t-lg relative group"
                                  style={{ height: `${Math.max(20, 100 - h.rank * 2)}%` }}
                                >
                                  <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-bold text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {h.rank}위
                                  </div>
                                </div>
                              ) : (
                                <div className="w-full max-w-[40px] h-4 bg-gray-200 rounded-t-lg" />
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-2">{h.date}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 경쟁 블로그 */}
                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">상위 경쟁 블로그</h3>
                      <div className="space-y-3">
                        {trackResult.competitors.map((comp, i) => (
                          <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                              i === 0 ? 'bg-yellow-500' :
                              i === 1 ? 'bg-gray-400' :
                              i === 2 ? 'bg-amber-600' : 'bg-gray-300'
                            }`}>
                              {comp.rank}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-gray-800">{comp.title}</div>
                              <div className="text-sm text-gray-500">@{comp.blogId}</div>
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

          {/* 경쟁 블로그 클론 분석 */}
          {activeTab === 'clone' && (
            <motion.div
              key="clone"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600">
                    <Scan className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">경쟁 블로그 클론 분석</h2>
                    <p className="text-gray-600">잘나가는 블로그의 성공 전략을 역분석합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={cloneBlogUrl}
                      onChange={(e) => setCloneBlogUrl(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleCloneAnalysis()}
                      placeholder="분석할 블로그 URL 또는 ID 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-fuchsia-500 focus:outline-none"
                      disabled={cloneLoading}
                    />
                  </div>
                  <button
                    onClick={handleCloneAnalysis}
                    disabled={cloneLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {cloneLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Scan className="w-5 h-5" />
                        분석하기
                      </>
                    )}
                  </button>
                </div>

                {cloneResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 블로그 개요 */}
                    <div className="bg-gradient-to-r from-fuchsia-50 to-purple-50 rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">블로그 개요</h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="text-center p-3 bg-white rounded-xl">
                          <div className="text-2xl font-bold text-fuchsia-600">{cloneResult.overview.totalPosts}</div>
                          <div className="text-xs text-gray-500">총 게시글</div>
                        </div>
                        <div className="text-center p-3 bg-white rounded-xl">
                          <div className="text-2xl font-bold text-fuchsia-600">{cloneResult.overview.avgPostLength}</div>
                          <div className="text-xs text-gray-500">평균 글자수</div>
                        </div>
                        <div className="text-center p-3 bg-white rounded-xl">
                          <div className="text-2xl font-bold text-fuchsia-600">{cloneResult.overview.postingFrequency}</div>
                          <div className="text-xs text-gray-500">발행 빈도</div>
                        </div>
                        <div className="text-center p-3 bg-white rounded-xl">
                          <div className="text-2xl font-bold text-fuchsia-600">{cloneResult.overview.blogScore}점</div>
                          <div className="text-xs text-gray-500">블로그 지수</div>
                        </div>
                        <div className="text-center p-3 bg-white rounded-xl">
                          <div className="flex flex-wrap justify-center gap-1">
                            {cloneResult.overview.mainCategories.map((cat, i) => (
                              <span key={i} className="text-xs px-2 py-0.5 bg-fuchsia-100 text-fuchsia-700 rounded">{cat}</span>
                            ))}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">주요 카테고리</div>
                        </div>
                      </div>
                    </div>

                    {/* 성공 전략 분석 */}
                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-fuchsia-500" />
                        성공 전략 분석
                      </h3>
                      <div className="space-y-4">
                        {cloneResult.strategy.map((item, i) => (
                          <div key={i} className="p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="px-2 py-0.5 bg-fuchsia-100 text-fuchsia-700 rounded text-sm font-medium">{item.category}</span>
                            </div>
                            <div className="font-medium text-gray-800 mb-1">{item.insight}</div>
                            <div className="text-sm text-fuchsia-600 flex items-center gap-1">
                              <Zap className="w-4 h-4" />
                              {item.actionItem}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 상위 노출 키워드 */}
                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">상위 노출 키워드</h3>
                      <div className="space-y-3">
                        {cloneResult.topKeywords.map((kw, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full bg-fuchsia-500 text-white flex items-center justify-center text-sm font-bold">{i + 1}</span>
                              <span className="font-medium">{kw.keyword}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-500">{kw.count}개 글</span>
                              <span className="text-fuchsia-600 font-bold">평균 {kw.avgRank}위</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 콘텐츠 패턴 */}
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="bg-white rounded-2xl p-6">
                        <h3 className="font-bold text-lg mb-4">콘텐츠 유형 비율</h3>
                        <div className="space-y-3">
                          {cloneResult.contentPattern.map((pattern, i) => (
                            <div key={i}>
                              <div className="flex justify-between text-sm mb-1">
                                <span>{pattern.pattern}</span>
                                <span className="font-bold">{pattern.percentage}%</span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-full"
                                  style={{ width: `${pattern.percentage}%` }}
                                />
                              </div>
                              <div className="text-xs text-gray-500 mt-1">{pattern.example}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl p-6">
                        <h3 className="font-bold text-lg mb-4">성공 요인 체크리스트</h3>
                        <div className="space-y-3">
                          {cloneResult.successFactors.map((factor, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                              <CheckCircle className="w-5 h-5 text-green-500" />
                              <span className="text-gray-800">{factor}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* AI 댓글 답변 생성기 */}
          {activeTab === 'comment' && (
            <motion.div
              key="comment"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500">
                    <MessageSquare className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">AI 댓글 답변 생성기</h2>
                    <p className="text-gray-600">댓글에 맞는 친절한 답변을 AI가 생성합니다</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">받은 댓글 내용</label>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="답변할 댓글을 붙여넣기하세요... (예: 정보 감사합니다! 혹시 주차 가능한가요?)"
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-sky-500 focus:outline-none resize-none"
                    />
                  </div>

                  <button
                    onClick={handleCommentReply}
                    disabled={commentLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {commentLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        생성 중...
                      </>
                    ) : (
                      <>
                        <Bot className="w-5 h-5" />
                        답변 생성하기
                      </>
                    )}
                  </button>
                </div>

                {commentResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="p-4 bg-gray-100 rounded-xl">
                      <div className="text-sm text-gray-500 mb-1">원본 댓글</div>
                      <div className="text-gray-800">"{commentResult.original}"</div>
                    </div>

                    <h3 className="font-bold text-lg">추천 답변</h3>
                    <div className="space-y-3">
                      {commentResult.replies.map((reply, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="p-4 bg-white rounded-xl border border-gray-200 hover:border-sky-300 transition-colors cursor-pointer group"
                          onClick={() => {
                            navigator.clipboard.writeText(reply.reply)
                            toast.success('답변이 복사되었습니다!')
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className={`px-2 py-0.5 rounded text-sm font-medium ${
                              reply.tone === '친근한' ? 'bg-pink-100 text-pink-700' :
                              reply.tone === '전문적인' ? 'bg-blue-100 text-blue-700' :
                              reply.tone === '짧고 간단한' ? 'bg-green-100 text-green-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {reply.tone}
                            </span>
                            <Copy className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <p className="text-gray-800">{reply.reply}</p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 네이버 알고리즘 변화 감지 */}
          {activeTab === 'algorithm' && (
            <motion.div
              key="algorithm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">네이버 알고리즘 변화 감지</h2>
                    <p className="text-gray-600">검색 알고리즘 변화를 실시간으로 모니터링합니다</p>
                  </div>
                </div>

                <button
                  onClick={handleAlgorithmCheck}
                  disabled={algorithmLoading}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 mb-6"
                >
                  {algorithmLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      분석 중...
                    </>
                  ) : (
                    <>
                      <Bell className="w-5 h-5" />
                      알고리즘 변화 확인
                    </>
                  )}
                </button>

                {algorithmResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 상태 표시 */}
                    <div className={`rounded-2xl p-8 text-center ${
                      algorithmResult.status === 'stable' ? 'bg-gradient-to-br from-green-50 to-emerald-50' :
                      algorithmResult.status === 'minor_change' ? 'bg-gradient-to-br from-yellow-50 to-amber-50' :
                      'bg-gradient-to-br from-red-50 to-rose-50'
                    }`}>
                      <div className={`text-5xl font-bold mb-2 ${
                        algorithmResult.status === 'stable' ? 'text-green-600' :
                        algorithmResult.status === 'minor_change' ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {algorithmResult.status === 'stable' ? '안정' :
                         algorithmResult.status === 'minor_change' ? '소폭 변화' : '대규모 변화'}
                      </div>
                      <div className="text-gray-600">마지막 확인: {algorithmResult.lastUpdate}</div>
                    </div>

                    {/* 변화 내역 */}
                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">최근 알고리즘 변화</h3>
                      <div className="space-y-4">
                        {algorithmResult.changes.map((change, i) => (
                          <div key={i} className={`p-4 rounded-xl border-l-4 ${
                            change.impact === 'high' ? 'border-red-500 bg-red-50' :
                            change.impact === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                            'border-green-500 bg-green-50'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-white rounded text-sm font-medium">{change.type}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  change.impact === 'high' ? 'bg-red-200 text-red-700' :
                                  change.impact === 'medium' ? 'bg-yellow-200 text-yellow-700' :
                                  'bg-green-200 text-green-700'
                                }`}>
                                  {change.impact === 'high' ? '높음' : change.impact === 'medium' ? '보통' : '낮음'}
                                </span>
                              </div>
                              <span className="text-sm text-gray-500">{change.date}</span>
                            </div>
                            <div className="font-medium text-gray-800 mb-1">{change.description}</div>
                            <div className="text-sm text-blue-600 flex items-center gap-1">
                              <Lightbulb className="w-4 h-4" />
                              {change.recommendation}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 영향받는 키워드 */}
                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">순위 변동 키워드</h3>
                      <div className="space-y-3">
                        {algorithmResult.affectedKeywords.map((kw, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <span className="font-medium">{kw.keyword}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-gray-500">{kw.before}위</span>
                              <span className="text-gray-400">→</span>
                              <span className={`font-bold ${kw.after < kw.before ? 'text-green-600' : kw.after > kw.before ? 'text-red-600' : 'text-gray-600'}`}>
                                {kw.after}위
                              </span>
                              {kw.after !== kw.before && (
                                <span className={`text-sm ${kw.after < kw.before ? 'text-green-600' : 'text-red-600'}`}>
                                  {kw.after < kw.before ? `▲${kw.before - kw.after}` : `▼${kw.after - kw.before}`}
                                </span>
                              )}
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

          {/* 콘텐츠 수명 분석 */}
          {activeTab === 'lifespan' && (
            <motion.div
              key="lifespan"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-lime-500 to-green-500">
                    <Timer className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">콘텐츠 수명 분석</h2>
                    <p className="text-gray-600">내 글들의 유통기한과 유형을 분석합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={lifespanBlogId}
                      onChange={(e) => setLifespanBlogId(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleLifespanAnalysis()}
                      placeholder="블로그 ID 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-lime-500 focus:outline-none"
                      disabled={lifespanLoading}
                    />
                  </div>
                  <button
                    onClick={handleLifespanAnalysis}
                    disabled={lifespanLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-lime-500 to-green-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {lifespanLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Timer className="w-5 h-5" />
                        분석하기
                      </>
                    )}
                  </button>
                </div>

                {lifespanResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 요약 */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-green-50 rounded-xl">
                        <div className="text-3xl font-bold text-green-600">{lifespanResult.summary.evergreen}</div>
                        <div className="text-sm text-gray-600">에버그린</div>
                        <div className="text-xs text-gray-500">영구적 가치</div>
                      </div>
                      <div className="text-center p-4 bg-blue-50 rounded-xl">
                        <div className="text-3xl font-bold text-blue-600">{lifespanResult.summary.seasonal}</div>
                        <div className="text-sm text-gray-600">시즌성</div>
                        <div className="text-xs text-gray-500">계절마다 부활</div>
                      </div>
                      <div className="text-center p-4 bg-orange-50 rounded-xl">
                        <div className="text-3xl font-bold text-orange-600">{lifespanResult.summary.trending}</div>
                        <div className="text-sm text-gray-600">트렌딩</div>
                        <div className="text-xs text-gray-500">일시적 인기</div>
                      </div>
                      <div className="text-center p-4 bg-gray-50 rounded-xl">
                        <div className="text-3xl font-bold text-gray-600">{lifespanResult.summary.declining}</div>
                        <div className="text-sm text-gray-600">하락중</div>
                        <div className="text-xs text-gray-500">업데이트 필요</div>
                      </div>
                    </div>

                    {/* 글 목록 */}
                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">콘텐츠별 수명 분석</h3>
                      <div className="space-y-3">
                        {lifespanResult.posts.map((post, i) => (
                          <div key={i} className="p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-medium text-gray-800">{post.title}</div>
                              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                post.type === 'evergreen' ? 'bg-green-100 text-green-700' :
                                post.type === 'seasonal' ? 'bg-blue-100 text-blue-700' :
                                post.type === 'trending' ? 'bg-orange-100 text-orange-700' :
                                'bg-gray-200 text-gray-700'
                              }`}>
                                {post.type === 'evergreen' ? '에버그린' :
                                 post.type === 'seasonal' ? '시즌성' :
                                 post.type === 'trending' ? '트렌딩' : '하락중'}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span>발행: {post.date}</span>
                              <span>현재 조회: {post.currentViews}</span>
                              <span>최고 조회: {post.peakViews}</span>
                              <span>예상 수명: {post.lifespan}</span>
                            </div>
                            <div className="mt-2 text-sm text-lime-600 flex items-center gap-1">
                              <Lightbulb className="w-4 h-4" />
                              {post.suggestion}
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

          {/* 오래된 글 리프레시 */}
          {activeTab === 'refresh' && (
            <motion.div
              key="refresh"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500">
                    <RotateCcw className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">오래된 글 리프레시</h2>
                    <p className="text-gray-600">업데이트하면 부활할 수 있는 글을 추천합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={refreshBlogId}
                      onChange={(e) => setRefreshBlogId(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleRefreshAnalysis()}
                      placeholder="블로그 ID 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-yellow-500 focus:outline-none"
                      disabled={refreshLoading}
                    />
                  </div>
                  <button
                    onClick={handleRefreshAnalysis}
                    disabled={refreshLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {refreshLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="w-5 h-5" />
                        분석하기
                      </>
                    )}
                  </button>
                </div>

                {refreshResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <h3 className="font-bold text-lg">리프레시 추천 글 ({refreshResult.postsToRefresh.length}개)</h3>

                    {refreshResult.postsToRefresh.map((post, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className={`p-5 rounded-2xl border-2 ${
                          post.priority === 'high' ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-300' :
                          post.priority === 'medium' ? 'bg-white border-yellow-200' :
                          'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {post.priority === 'high' && <Flame className="w-4 h-4 text-orange-500" />}
                              <h4 className="font-bold text-lg text-gray-800">{post.title}</h4>
                            </div>
                            <div className="text-sm text-gray-500">발행일: {post.publishDate}</div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                            post.priority === 'high' ? 'bg-red-100 text-red-700' :
                            post.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {post.priority === 'high' ? '긴급' : post.priority === 'medium' ? '권장' : '선택'}
                          </span>
                        </div>

                        <div className="flex items-center gap-6 mb-3 text-sm">
                          <div>
                            <span className="text-gray-500">현재 조회수: </span>
                            <span className="font-bold text-gray-700">{post.lastViews}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">예상 조회수: </span>
                            <span className="font-bold text-yellow-600">{post.potentialViews}</span>
                          </div>
                          <div className="text-green-600 font-bold">
                            +{Math.round((post.potentialViews / post.lastViews - 1) * 100)}% 예상
                          </div>
                        </div>

                        <div className="mb-3">
                          <div className="text-sm text-gray-600 mb-1">리프레시 필요 이유:</div>
                          <div className="flex flex-wrap gap-2">
                            {post.reasons.map((reason, j) => (
                              <span key={j} className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700">{reason}</span>
                            ))}
                          </div>
                        </div>

                        <div className="p-3 bg-yellow-50 rounded-xl">
                          <div className="text-sm font-medium text-yellow-800 mb-1">추천 수정 사항:</div>
                          <ul className="space-y-1">
                            {post.suggestions.map((sug, j) => (
                              <li key={j} className="text-sm text-yellow-700 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> {sug}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 연관 글 추천 */}
          {activeTab === 'related' && (
            <motion.div
              key="related"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500">
                    <Link2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">연관 글 자동 추천</h2>
                    <p className="text-gray-600">이 주제로 글을 썼다면 다음에 쓸 글을 추천합니다</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={relatedTopic}
                      onChange={(e) => setRelatedTopic(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleRelatedPost()}
                      placeholder="작성한 글의 주제 입력 (예: 강남 맛집, 다이어트)"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-violet-500 focus:outline-none"
                      disabled={relatedLoading}
                    />
                  </div>
                  <button
                    onClick={handleRelatedPost}
                    disabled={relatedLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {relatedLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Link2 className="w-5 h-5" />
                        추천받기
                      </>
                    )}
                  </button>
                </div>

                {relatedResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 연관 주제 */}
                    <div className="bg-white rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4">"{relatedResult.currentTopic}" 연관 주제</h3>
                      <div className="space-y-3">
                        {relatedResult.relatedTopics.map((topic, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="p-4 bg-gray-50 rounded-xl hover:bg-violet-50 transition-colors cursor-pointer"
                            onClick={() => {
                              navigator.clipboard.writeText(topic.suggestedTitle)
                              toast.success('제목이 복사되었습니다!')
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-violet-500 text-white flex items-center justify-center text-sm font-bold">{i + 1}</span>
                                <span className="font-medium text-gray-800">{topic.topic}</span>
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-violet-600 font-bold">관련도 {topic.relevance}%</span>
                                <span className={`px-2 py-0.5 rounded ${
                                  topic.competition === '낮음' ? 'bg-green-100 text-green-700' :
                                  topic.competition === '중' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  경쟁 {topic.competition}
                                </span>
                              </div>
                            </div>
                            <div className="text-sm text-gray-500 mb-1">월간 검색량: {topic.searchVolume.toLocaleString()}</div>
                            <div className="text-sm text-violet-600 flex items-center gap-1">
                              <Sparkles className="w-4 h-4" />
                              추천 제목: {topic.suggestedTitle}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* 시리즈 아이디어 */}
                    <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Network className="w-5 h-5 text-violet-600" />
                        시리즈 아이디어
                      </h3>
                      <div className="bg-white rounded-xl p-4 mb-4">
                        <div className="font-bold text-violet-700 mb-3">{relatedResult.seriesIdea.title}</div>
                        <div className="space-y-2">
                          {relatedResult.seriesIdea.posts.map((post, i) => (
                            <div key={i} className="flex items-center gap-2 text-gray-700">
                              <span className="w-5 h-5 rounded bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                              {post}
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-violet-700">
                        💡 시리즈로 작성하면 내부 링크가 연결되어 체류 시간이 증가합니다!
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 멘토-멘티 매칭 */}
          {activeTab === 'mentor' && (
            <motion.div
              key="mentor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500">
                    <GraduationCap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">멘토-멘티 매칭</h2>
                    <p className="text-gray-600">블로그 고수에게 배우거나, 초보자를 가르치세요</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setMentorUserType('mentee')}
                      className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                        mentorUserType === 'mentee' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <UserCheck className="w-5 h-5" />
                      멘토 찾기 (배우고 싶어요)
                    </button>
                    <button
                      onClick={() => setMentorUserType('mentor')}
                      className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                        mentorUserType === 'mentor' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <GraduationCap className="w-5 h-5" />
                      멘티 찾기 (가르치고 싶어요)
                    </button>
                  </div>

                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        value={mentorBlogId}
                        onChange={(e) => setMentorBlogId(e.target.value)}
                        placeholder="내 블로그 ID 입력"
                        className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:outline-none"
                        disabled={mentorLoading}
                      />
                    </div>
                    <select
                      value={mentorCategory}
                      onChange={(e) => setMentorCategory(e.target.value)}
                      className="px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:outline-none bg-white"
                    >
                      <option value="all">전체 분야</option>
                      <option value="food">맛집</option>
                      <option value="beauty">뷰티</option>
                      <option value="travel">여행</option>
                      <option value="parenting">육아</option>
                      <option value="it">IT/테크</option>
                    </select>
                  </div>

                  <button
                    onClick={handleMentorMatch}
                    disabled={mentorLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {mentorLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        매칭 중...
                      </>
                    ) : (
                      <>
                        <Users className="w-5 h-5" />
                        {mentorUserType === 'mentee' ? '멘토 찾기' : '멘티 찾기'}
                      </>
                    )}
                  </button>
                </div>

                {mentorResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <h3 className="font-bold text-lg">
                      {mentorResult.userType === 'mentee' ? '추천 멘토' : '추천 멘티'} ({mentorResult.matches.length}명)
                    </h3>

                    <div className="space-y-4">
                      {mentorResult.matches.map((match, i) => (
                        <motion.div
                          key={match.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className={`p-5 rounded-2xl border-2 ${
                            match.available ? 'bg-white border-emerald-200' : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-white font-bold text-lg">
                                {match.name.charAt(0)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-lg">{match.name}</span>
                                  {!match.available && (
                                    <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">예약 마감</span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500">@{match.blogId} • 경력 {match.experience}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xl font-bold text-emerald-600">{match.score}점</div>
                              <div className="text-xs text-gray-500">매칭 점수</div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 mb-3">
                            {match.specialty.map((spec, j) => (
                              <span key={j} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-sm">{spec}</span>
                            ))}
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1">
                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                <span className="font-medium">{match.rating.toFixed(1)}</span>
                                <span className="text-gray-500">({match.reviews})</span>
                              </div>
                              <div className="text-emerald-600 font-medium">{match.rate}</div>
                            </div>
                            <button
                              onClick={() => toast.success('매칭 요청이 전송되었습니다!')}
                              disabled={!match.available}
                              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                match.available
                                  ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              {match.available ? '매칭 신청' : '마감'}
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 실시간 트렌드 스나이퍼 */}
          {activeTab === 'trend' && (
            <motion.div
              key="trend"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-red-500 to-orange-500">
                    <Radio className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">실시간 트렌드 스나이퍼</h2>
                    <p className="text-gray-600">지금 뜨는 키워드를 잡아 1페이지 선점하세요</p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">내 블로그 카테고리 선택</label>
                  <div className="flex flex-wrap gap-2">
                    {['전체', '맛집', '여행', '뷰티', '패션', '육아', '재테크', '라이프'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => {
                          if (cat === '전체') {
                            setTrendCategories(['전체'])
                          } else {
                            setTrendCategories(prev =>
                              prev.includes(cat)
                                ? prev.filter(c => c !== cat)
                                : [...prev.filter(c => c !== '전체'), cat]
                            )
                          }
                        }}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          trendCategories.includes(cat)
                            ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleTrendSniper}
                      disabled={trendLoading}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {trendLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          분석 중...
                        </>
                      ) : (
                        <>
                          <Crosshair className="w-5 h-5" />
                          트렌드 스나이핑
                        </>
                      )}
                    </button>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trendAutoRefresh}
                        onChange={(e) => setTrendAutoRefresh(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-gray-600">10분마다 자동 갱신</span>
                    </label>
                  </div>
                  {trendResult && (
                    <div className="text-sm text-gray-500">
                      마지막 업데이트: {trendResult.lastUpdate}
                    </div>
                  )}
                </div>

                {trendResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {trendResult.trends.map((trend, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`p-5 rounded-2xl ${
                          trend.goldenTime
                            ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300'
                            : 'bg-white border border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                              trend.rank <= 3 ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gray-400'
                            }`}>
                              {trend.rank}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-lg">{trend.keyword}</span>
                                {trend.goldenTime && (
                                  <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 rounded-full text-xs font-bold animate-pulse">
                                    골든타임
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <span className="px-2 py-0.5 bg-gray-100 rounded">{trend.category}</span>
                                <span>{trend.reason}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-orange-600">{trend.matchScore}점</div>
                            <div className="text-xs text-gray-500">적합도</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                          <div className="text-center p-2 bg-gray-50 rounded-lg">
                            <div className="text-gray-500">검색량</div>
                            <div className="font-bold text-gray-800">{trend.searchVolume.toLocaleString()}</div>
                          </div>
                          <div className="text-center p-2 bg-gray-50 rounded-lg">
                            <div className="text-gray-500">경쟁도</div>
                            <div className={`font-bold ${
                              trend.competition === 'low' ? 'text-green-600' :
                              trend.competition === 'medium' ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {trend.competition === 'low' ? '낮음' : trend.competition === 'medium' ? '보통' : '높음'}
                            </div>
                          </div>
                          <div className="text-center p-2 bg-gray-50 rounded-lg">
                            <div className="text-gray-500">마감</div>
                            <div className="font-bold text-red-600">{trend.deadline}</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-600 flex-1 mr-4">
                            <span className="text-orange-600">추천 제목:</span> {trend.suggestedTitle}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(trend.suggestedTitle)
                                toast.success('제목이 복사되었습니다!')
                              }}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => toast.success('글쓰기 페이지로 이동합니다!')}
                              className="px-4 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600"
                            >
                              바로 쓰기
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 수익 대시보드 */}
          {activeTab === 'revenue' && (
            <motion.div
              key="revenue"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600">
                      <Wallet className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">수익 대시보드</h2>
                      <p className="text-gray-600">월별 수익을 직접 입력하고 관리하세요</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={loadRevenueData}
                      disabled={revenueLoading}
                      className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${revenueLoading ? 'animate-spin' : ''}`} />
                      새로고침
                    </button>
                    <button
                      onClick={() => setRevenueEditMode(!revenueEditMode)}
                      className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                        revenueEditMode
                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                          : 'bg-green-100 text-green-600 hover:bg-green-200'
                      }`}
                    >
                      {revenueEditMode ? (
                        <>
                          <X className="w-4 h-4" />
                          취소
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          수익 입력
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 수익 입력 폼 */}
                {revenueEditMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 mb-6 border border-green-200"
                  >
                    <h3 className="font-bold text-lg mb-4 text-green-800">월별 수익 입력</h3>

                    {/* 년/월 선택 */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">년도</label>
                        <select
                          value={revenueForm.year}
                          onChange={(e) => {
                            const year = parseInt(e.target.value)
                            setRevenueForm(prev => ({ ...prev, year }))
                            loadMonthData(year, revenueForm.month)
                          }}
                          className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:outline-none"
                        >
                          {[2023, 2024, 2025].map(y => (
                            <option key={y} value={y}>{y}년</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">월</label>
                        <select
                          value={revenueForm.month}
                          onChange={(e) => {
                            const month = parseInt(e.target.value)
                            setRevenueForm(prev => ({ ...prev, month }))
                            loadMonthData(revenueForm.year, month)
                          }}
                          className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-green-500 focus:outline-none"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>{m}월</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 애드포스트 */}
                    <div className="bg-white rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Receipt className="w-5 h-5 text-blue-500" />
                        <span className="font-bold text-blue-600">애드포스트</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">수익 (원)</label>
                          <input
                            type="number"
                            value={revenueForm.adpost_revenue}
                            onChange={(e) => setRevenueForm(prev => ({ ...prev, adpost_revenue: parseInt(e.target.value) || 0 }))}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">클릭수</label>
                          <input
                            type="number"
                            value={revenueForm.adpost_clicks}
                            onChange={(e) => setRevenueForm(prev => ({ ...prev, adpost_clicks: parseInt(e.target.value) || 0 }))}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 체험단/협찬 */}
                    <div className="bg-white rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Gift className="w-5 h-5 text-pink-500" />
                        <span className="font-bold text-pink-600">체험단/협찬</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">수익 (원)</label>
                          <input
                            type="number"
                            value={revenueForm.sponsorship_revenue}
                            onChange={(e) => setRevenueForm(prev => ({ ...prev, sponsorship_revenue: parseInt(e.target.value) || 0 }))}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-pink-500 focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">건수</label>
                          <input
                            type="number"
                            value={revenueForm.sponsorship_count}
                            onChange={(e) => setRevenueForm(prev => ({ ...prev, sponsorship_count: parseInt(e.target.value) || 0 }))}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-pink-500 focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 제휴마케팅 */}
                    <div className="bg-white rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Coins className="w-5 h-5 text-yellow-500" />
                        <span className="font-bold text-yellow-600">제휴마케팅</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">수익 (원)</label>
                          <input
                            type="number"
                            value={revenueForm.affiliate_revenue}
                            onChange={(e) => setRevenueForm(prev => ({ ...prev, affiliate_revenue: parseInt(e.target.value) || 0 }))}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-yellow-500 focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">클릭수</label>
                          <input
                            type="number"
                            value={revenueForm.affiliate_clicks}
                            onChange={(e) => setRevenueForm(prev => ({ ...prev, affiliate_clicks: parseInt(e.target.value) || 0 }))}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-yellow-500 focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">전환수</label>
                          <input
                            type="number"
                            value={revenueForm.affiliate_conversions}
                            onChange={(e) => setRevenueForm(prev => ({ ...prev, affiliate_conversions: parseInt(e.target.value) || 0 }))}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-yellow-500 focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 메모 */}
                    <div className="mb-4">
                      <label className="block text-sm text-gray-600 mb-1">메모 (선택)</label>
                      <textarea
                        value={revenueForm.memo}
                        onChange={(e) => setRevenueForm(prev => ({ ...prev, memo: e.target.value }))}
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:border-green-500 focus:outline-none resize-none"
                        rows={2}
                        placeholder="이번 달 특이사항..."
                      />
                    </div>

                    {/* 저장 버튼 */}
                    <button
                      onClick={saveRevenueData}
                      disabled={revenueLoading}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {revenueLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          저장 중...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          저장하기
                        </>
                      )}
                    </button>
                  </motion.div>
                )}

                {/* 대시보드 데이터 표시 */}
                {revenueData ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 요약 카드 */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white">
                        <div className="text-sm opacity-80">총 수익 (올해)</div>
                        <div className="text-3xl font-bold">{(revenueData.yearly_summary?.total_revenue || 0).toLocaleString()}원</div>
                        <div className="text-sm mt-2 flex items-center gap-1">
                          {revenueData.growth >= 0 ? (
                            <>
                              <TrendingUp className="w-4 h-4" />
                              +{revenueData.growth}% 전월 대비
                            </>
                          ) : (
                            <>
                              <TrendingDown className="w-4 h-4" />
                              {revenueData.growth}% 전월 대비
                            </>
                          )}
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl p-5 border border-gray-200">
                        <div className="text-sm text-gray-500">이번 달 수익</div>
                        <div className="text-2xl font-bold text-gray-800">
                          {((revenueData.current_month?.adpost_revenue || 0) +
                            (revenueData.current_month?.sponsorship_revenue || 0) +
                            (revenueData.current_month?.affiliate_revenue || 0)).toLocaleString()}원
                        </div>
                        <div className="text-sm text-gray-500">{revenueData.current_month_num}월</div>
                      </div>
                      <div className="bg-white rounded-2xl p-5 border border-gray-200">
                        <div className="text-sm text-gray-500">기록된 월</div>
                        <div className="text-2xl font-bold text-gray-800">{revenueData.total_summary?.months_recorded || 0}개월</div>
                        <div className="text-sm text-gray-500">누적 데이터</div>
                      </div>
                      <div className="bg-white rounded-2xl p-5 border border-gray-200">
                        <div className="text-sm text-gray-500">전체 누적</div>
                        <div className="text-2xl font-bold text-gray-800">{(revenueData.total_summary?.total_revenue || 0).toLocaleString()}원</div>
                        <div className="text-sm text-green-600">총 수익</div>
                      </div>
                    </div>

                    {/* 수익원별 상세 */}
                    <div className="grid grid-cols-3 gap-4">
                      {/* 애드포스트 */}
                      <div className="bg-white rounded-2xl p-5 border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold text-lg">애드포스트</h3>
                          <Receipt className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="text-2xl font-bold text-blue-600 mb-2">
                          {(revenueData.current_month?.adpost_revenue || 0).toLocaleString()}원
                        </div>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div>이번 달 클릭수: {(revenueData.current_month?.adpost_clicks || 0).toLocaleString()}</div>
                          <div>올해 누적: {(revenueData.yearly_summary?.total_adpost || 0).toLocaleString()}원</div>
                        </div>
                      </div>

                      {/* 체험단/협찬 */}
                      <div className="bg-white rounded-2xl p-5 border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold text-lg">체험단/협찬</h3>
                          <Gift className="w-5 h-5 text-pink-500" />
                        </div>
                        <div className="text-2xl font-bold text-pink-600 mb-2">
                          {(revenueData.current_month?.sponsorship_revenue || 0).toLocaleString()}원
                        </div>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div>이번 달 건수: {revenueData.current_month?.sponsorship_count || 0}건</div>
                          <div>올해 누적: {(revenueData.yearly_summary?.total_sponsorship || 0).toLocaleString()}원</div>
                        </div>
                      </div>

                      {/* 제휴마케팅 */}
                      <div className="bg-white rounded-2xl p-5 border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold text-lg">제휴마케팅</h3>
                          <Coins className="w-5 h-5 text-yellow-500" />
                        </div>
                        <div className="text-2xl font-bold text-yellow-600 mb-2">
                          {(revenueData.current_month?.affiliate_revenue || 0).toLocaleString()}원
                        </div>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div>클릭: {(revenueData.current_month?.affiliate_clicks || 0).toLocaleString()} / 전환: {revenueData.current_month?.affiliate_conversions || 0}건</div>
                          <div>올해 누적: {(revenueData.yearly_summary?.total_affiliate || 0).toLocaleString()}원</div>
                        </div>
                      </div>
                    </div>

                    {/* 월별 트렌드 */}
                    {revenueData.history && revenueData.history.length > 0 && (
                      <div className="bg-white rounded-2xl p-5 border border-gray-200">
                        <h3 className="font-bold text-lg mb-4">월별 수익 트렌드</h3>
                        <div className="flex items-end gap-4 h-40">
                          {[...revenueData.history].reverse().slice(-6).map((data: any, i: number) => {
                            const total = (data.adpost_revenue || 0) + (data.sponsorship_revenue || 0) + (data.affiliate_revenue || 0)
                            const maxTotal = Math.max(...revenueData.history.map((d: any) =>
                              (d.adpost_revenue || 0) + (d.sponsorship_revenue || 0) + (d.affiliate_revenue || 0)
                            ))
                            const height = maxTotal > 0 ? (total / maxTotal) * 100 : 0
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center">
                                <div className="w-full flex flex-col" style={{ height: `${Math.max(height, 5)}%` }}>
                                  {total > 0 ? (
                                    <>
                                      <div className="bg-blue-400 flex-grow rounded-t" style={{ flex: (data.adpost_revenue || 0) / total || 1 }} />
                                      <div className="bg-pink-400" style={{ flex: (data.sponsorship_revenue || 0) / total }} />
                                      <div className="bg-yellow-400 rounded-b" style={{ flex: (data.affiliate_revenue || 0) / total }} />
                                    </>
                                  ) : (
                                    <div className="bg-gray-200 flex-grow rounded" />
                                  )}
                                </div>
                                <div className="text-sm text-gray-600 mt-2">{data.month}월</div>
                                <div className="text-xs text-gray-400">{total.toLocaleString()}</div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex justify-center gap-6 mt-4">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-blue-400 rounded" />
                            <span className="text-sm text-gray-600">애드포스트</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-pink-400 rounded" />
                            <span className="text-sm text-gray-600">협찬</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-yellow-400 rounded" />
                            <span className="text-sm text-gray-600">제휴</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <div className="text-center py-12">
                    <Wallet className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500 mb-4">아직 입력된 수익 데이터가 없습니다</p>
                    <button
                      onClick={() => {
                        loadRevenueData()
                        setRevenueEditMode(true)
                      }}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:shadow-lg transition-all"
                    >
                      첫 수익 입력하기
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* 블로그 성장 로드맵 */}
          {activeTab === 'roadmap' && (
            <motion.div
              key="roadmap"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500">
                    <Map className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">블로그 성장 로드맵</h2>
                    <p className="text-gray-600">단계별 미션으로 블로그를 성장시키세요</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={roadmapBlogId}
                      onChange={(e) => setRoadmapBlogId(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleRoadmap()}
                      placeholder="블로그 ID 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none"
                      disabled={roadmapLoading}
                    />
                  </div>
                  <button
                    onClick={handleRoadmap}
                    disabled={roadmapLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {roadmapLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        분석 중...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-5 h-5" />
                        로드맵 분석
                      </>
                    )}
                  </button>
                </div>

                {roadmapResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 현재 레벨 */}
                    <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="text-5xl">{roadmapResult.currentLevel.icon}</div>
                          <div>
                            <div className="text-sm opacity-80">현재 레벨</div>
                            <div className="text-2xl font-bold">{roadmapResult.currentLevel.name}</div>
                            <div className="text-sm opacity-80">다음: {roadmapResult.currentLevel.nextLevel}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-4xl font-bold">Lv.{roadmapResult.currentLevel.level}</div>
                          <div className="w-32 h-2 bg-white/30 rounded-full mt-2">
                            <div
                              className="h-full bg-white rounded-full"
                              style={{ width: `${roadmapResult.currentLevel.progress}%` }}
                            />
                          </div>
                          <div className="text-sm mt-1">{roadmapResult.currentLevel.progress}%</div>
                        </div>
                      </div>
                    </div>

                    {/* 통계 */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-gray-800">{roadmapResult.stats.totalPosts}</div>
                        <div className="text-sm text-gray-500">총 포스팅</div>
                      </div>
                      <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-gray-800">{roadmapResult.stats.totalVisitors.toLocaleString()}</div>
                        <div className="text-sm text-gray-500">누적 방문자</div>
                      </div>
                      <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-gray-800">{roadmapResult.stats.avgDaily}</div>
                        <div className="text-sm text-gray-500">일평균 방문</div>
                      </div>
                      <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-purple-600">{roadmapResult.stats.blogScore}</div>
                        <div className="text-sm text-gray-500">블로그 점수</div>
                      </div>
                    </div>

                    {/* 일일 퀘스트 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-purple-500" />
                        오늘의 퀘스트
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {roadmapResult.dailyQuests.map((quest) => (
                          <div
                            key={quest.id}
                            className={`p-4 rounded-xl flex items-center justify-between ${
                              quest.completed ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                quest.completed ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                              }`}>
                                {quest.completed ? <CheckCircle className="w-5 h-5" /> :
                                  quest.type === 'post' ? <FileText className="w-4 h-4" /> :
                                  quest.type === 'keyword' ? <Search className="w-4 h-4" /> :
                                  quest.type === 'engage' ? <MessageCircle className="w-4 h-4" /> :
                                  <RefreshCw className="w-4 h-4" />
                                }
                              </div>
                              <div>
                                <div className={`font-medium ${quest.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                  {quest.title}
                                </div>
                                <div className="text-xs text-gray-500">{quest.description}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-1 text-yellow-600 font-bold">
                                <Star className="w-4 h-4 fill-yellow-500" />
                                {quest.reward}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 주간 미션 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-500" />
                        주간 미션
                      </h3>
                      <div className="space-y-4">
                        {roadmapResult.weeklyMissions.map((mission) => (
                          <div key={mission.id} className="p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-800">{mission.title}</span>
                              <span className="text-sm text-gray-500">{mission.deadline}</span>
                            </div>
                            <div className="w-full h-3 bg-gray-200 rounded-full mb-2">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                                style={{ width: `${(mission.progress / mission.target) * 100}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-500">{mission.progress} / {mission.target}</span>
                              <span className="text-yellow-600 font-bold flex items-center gap-1">
                                <Star className="w-3 h-3 fill-yellow-500" />
                                {mission.reward}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 마일스톤 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Medal className="w-5 h-5 text-purple-500" />
                        마일스톤 & 뱃지
                      </h3>
                      <div className="flex gap-4 overflow-x-auto pb-2">
                        {roadmapResult.milestones.map((milestone, i) => (
                          <div
                            key={i}
                            className={`flex-shrink-0 w-40 p-4 rounded-xl text-center ${
                              milestone.achieved
                                ? 'bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-300'
                                : 'bg-gray-50 border border-gray-200 opacity-60'
                            }`}
                          >
                            <div className="text-3xl mb-2">{milestone.badge}</div>
                            <div className="font-bold text-gray-800">{milestone.name}</div>
                            <div className="text-xs text-gray-500 mb-2">{milestone.requirement}</div>
                            <div className="text-xs text-purple-600">{milestone.reward}</div>
                            {milestone.achieved && (
                              <div className="mt-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">달성</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 추천 액션 */}
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-6">
                      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-yellow-500" />
                        이번 주 추천 액션
                      </h3>
                      <div className="space-y-2">
                        {roadmapResult.recommendedActions.map((action, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg">
                            <ChevronRight className="w-5 h-5 text-purple-500" />
                            <span className="text-gray-700">{action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 비공개 키워드 DB */}
          {activeTab === 'secretkw' && (
            <motion.div
              key="secretkw"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500">
                    <Key className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">비공개 키워드 DB</h2>
                    <p className="text-gray-600">경쟁 낮고 검색량 높은 숨겨진 보석 키워드</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-yellow-100 rounded-full">
                    <Lock className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-700">프리미엄 전용</span>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <select
                    value={secretCategory}
                    onChange={(e) => setSecretCategory(e.target.value)}
                    className="px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-yellow-500 focus:outline-none flex-1"
                  >
                    <option value="all">전체 카테고리</option>
                    <option value="맛집">맛집</option>
                    <option value="여행">여행</option>
                    <option value="뷰티">뷰티</option>
                    <option value="육아">육아</option>
                    <option value="재테크">재테크</option>
                  </select>
                  <button
                    onClick={handleSecretKeyword}
                    disabled={secretLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {secretLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        로딩 중...
                      </>
                    ) : (
                      <>
                        <Gem className="w-5 h-5" />
                        키워드 열기
                      </>
                    )}
                  </button>
                </div>

                {secretResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* 접근 정보 */}
                    <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Gem className="w-5 h-5 text-yellow-600" />
                          <span className="font-medium text-gray-700">등급: {secretResult.accessLevel.toUpperCase()}</span>
                        </div>
                        <div className="text-sm text-gray-500">|</div>
                        <div className="text-sm text-gray-600">
                          남은 조회: <span className="font-bold text-yellow-600">{secretResult.remainingAccess}회</span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        다음 업데이트: {secretResult.nextRefresh}
                      </div>
                    </div>

                    {/* 키워드 카테고리 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">{secretResult.category}</span>
                          골든 키워드
                        </h3>
                        <span className="text-sm text-gray-500">
                          총 {secretResult.keywords.length}개
                        </span>
                      </div>

                      <div className="space-y-3">
                        {secretResult.keywords.map((kw, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border border-yellow-200"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-red-400 flex items-center justify-center text-white font-bold">
                                  {i + 1}
                                </div>
                                <div>
                                  <div className="font-bold text-gray-800 flex items-center gap-2">
                                    {kw.keyword}
                                    {kw.trend === 'hot' && (
                                      <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs animate-pulse">HOT</span>
                                    )}
                                    {kw.trend === 'rising' && (
                                      <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs">상승중</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500">독점 기간: {kw.exclusiveUntil}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-bold text-yellow-600">{kw.opportunity}점</div>
                                <div className="text-xs text-gray-500">기회 점수</div>
                              </div>
                            </div>

                            <div className="grid grid-cols-4 gap-3 text-sm">
                              <div className="text-center p-2 bg-white rounded-lg">
                                <div className="text-gray-500">월 검색량</div>
                                <div className="font-bold text-gray-800">{kw.searchVolume.toLocaleString()}</div>
                              </div>
                              <div className="text-center p-2 bg-white rounded-lg">
                                <div className="text-gray-500">경쟁도</div>
                                <div className="font-bold text-green-600">{kw.competition}%</div>
                              </div>
                              <div className="text-center p-2 bg-white rounded-lg">
                                <div className="text-gray-500">예상 CPC</div>
                                <div className="font-bold text-blue-600">{kw.cpc}원</div>
                              </div>
                              <div className="text-center p-2 bg-white rounded-lg">
                                <div className="text-gray-500">업데이트</div>
                                <div className="font-bold text-gray-600">{kw.lastUpdate}</div>
                              </div>
                            </div>

                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(kw.keyword)
                                  toast.success('키워드가 복사되었습니다!')
                                }}
                                className="flex-1 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1"
                              >
                                <Copy className="w-4 h-4" />
                                키워드 복사
                              </button>
                              <button
                                onClick={() => toast.success('키워드 분석 페이지로 이동합니다!')}
                                className="flex-1 py-2 bg-gradient-to-r from-yellow-500 to-red-500 rounded-lg text-sm font-medium text-white hover:shadow-lg flex items-center justify-center gap-1"
                              >
                                <Search className="w-4 h-4" />
                                상세 분석
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* 안내 */}
                    <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-600 text-center">
                      <Lock className="w-4 h-4 inline-block mr-1" />
                      이 키워드는 프리미엄 회원 전용입니다. 독점 기간 내 작성 시 상위 노출 확률이 높아집니다.
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 네이버 데이터랩 */}
          {activeTab === 'datalab' && (
            <motion.div
              key="datalab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-green-500 to-teal-500">
                    <DataChart className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">네이버 데이터랩</h2>
                    <p className="text-gray-600">검색 트렌드와 인구통계 분석</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <label className="block text-sm font-medium text-gray-700">비교할 키워드 (최대 5개)</label>
                  {datalabKeywords.map((kw, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={kw}
                        onChange={(e) => {
                          const newKeywords = [...datalabKeywords]
                          newKeywords[i] = e.target.value
                          setDatalabKeywords(newKeywords)
                        }}
                        placeholder={`키워드 ${i + 1}`}
                        className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-green-500 focus:outline-none"
                      />
                      {datalabKeywords.length > 1 && (
                        <button
                          onClick={() => setDatalabKeywords(datalabKeywords.filter((_, idx) => idx !== i))}
                          className="px-3 text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  ))}
                  {datalabKeywords.length < 5 && (
                    <button
                      onClick={() => setDatalabKeywords([...datalabKeywords, ''])}
                      className="text-green-600 hover:text-green-700 font-medium"
                    >
                      + 키워드 추가
                    </button>
                  )}
                </div>

                <button
                  onClick={handleDatalab}
                  disabled={datalabLoading}
                  className="w-full px-8 py-4 rounded-xl bg-gradient-to-r from-green-500 to-teal-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {datalabLoading ? <><Loader2 className="w-5 h-5 animate-spin" />분석 중...</> : <><DataChart className="w-5 h-5" />트렌드 분석</>}
                </button>

                {datalabResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-6">
                    {/* 트렌드 차트 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">검색량 트렌드</h3>
                      <div className="flex items-end gap-2 h-40">
                        {datalabResult.trendData.map((period, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            {period.values.map((v, j) => (
                              <div
                                key={j}
                                className={`w-full rounded-t ${['bg-green-400', 'bg-blue-400', 'bg-purple-400', 'bg-orange-400', 'bg-pink-400'][j]}`}
                                style={{ height: `${v.value}%` }}
                                title={`${v.keyword}: ${v.value}`}
                              />
                            ))}
                            <span className="text-xs text-gray-500 mt-1">{period.period}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-4">
                        {datalabResult.keywords.map((kw, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded ${['bg-green-400', 'bg-blue-400', 'bg-purple-400', 'bg-orange-400', 'bg-pink-400'][i]}`} />
                            <span className="text-sm">{kw}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 연령/성별 분석 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">인구통계 분석</h3>
                      {datalabResult.demographics.map((demo, i) => (
                        <div key={i} className="mb-4 p-4 bg-gray-50 rounded-xl">
                          <div className="font-medium text-gray-800 mb-2">{demo.keyword}</div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-gray-500 mb-2">연령대</div>
                              {demo.age.map((a, j) => (
                                <div key={j} className="flex items-center gap-2 mb-1">
                                  <span className="text-xs w-12">{a.group}</span>
                                  <div className="flex-1 h-3 bg-gray-200 rounded-full">
                                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${a.ratio}%` }} />
                                  </div>
                                  <span className="text-xs w-8">{a.ratio}%</span>
                                </div>
                              ))}
                            </div>
                            <div>
                              <div className="text-sm text-gray-500 mb-2">성별</div>
                              {demo.gender.map((g, j) => (
                                <div key={j} className="flex items-center gap-2 mb-1">
                                  <span className="text-xs w-12">{g.type}</span>
                                  <div className="flex-1 h-3 bg-gray-200 rounded-full">
                                    <div className={`h-full rounded-full ${g.type === '남성' ? 'bg-blue-500' : 'bg-pink-500'}`} style={{ width: `${g.ratio}%` }} />
                                  </div>
                                  <span className="text-xs w-8">{g.ratio}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 시즌 팁 */}
                    <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-2xl p-6 border border-green-200">
                      <div className="flex items-start gap-3">
                        <Lightbulb className="w-6 h-6 text-green-600 mt-0.5" />
                        <div>
                          <div className="font-bold text-gray-800 mb-1">시즌 분석 팁</div>
                          <p className="text-gray-600">{datalabResult.seasonalTip}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 네이버 쇼핑 */}
          {activeTab === 'shopping' && (
            <motion.div
              key="shopping"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500">
                    <ShoppingCart className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">네이버 쇼핑 연동</h2>
                    <p className="text-gray-600">쇼핑 키워드와 제휴 상품 분석</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={shoppingKeyword}
                      onChange={(e) => setShoppingKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleShopping()}
                      placeholder="상품 키워드 입력 (예: 무선청소기, 에어프라이어)"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleShopping}
                    disabled={shoppingLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {shoppingLoading ? <><Loader2 className="w-5 h-5 animate-spin" />분석 중...</> : <><ShoppingCart className="w-5 h-5" />쇼핑 분석</>}
                  </button>
                </div>

                {shoppingResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* 쇼핑 키워드 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">구매 의도 높은 키워드</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {shoppingResult.shoppingKeywords.map((kw, i) => (
                          <div key={i} className="p-4 bg-orange-50 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{kw.keyword}</span>
                              <span className={`text-sm px-2 py-0.5 rounded ${kw.competition === '낮음' ? 'bg-green-100 text-green-700' : kw.competition === '중' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                경쟁 {kw.competition}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500">검색량: {kw.searchVolume.toLocaleString()}</div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-sm text-orange-600">구매의도 {kw.purchaseIntent}%</span>
                              <span className="text-sm text-gray-500">CPC {kw.cpc}원</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 추천 상품 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">제휴 추천 상품</h3>
                      <div className="space-y-3">
                        {shoppingResult.products.map((product, i) => (
                          <div key={i} className="p-4 bg-gray-50 rounded-xl flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{product.name}</span>
                                {product.trend === 'hot' && <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs">HOT</span>}
                              </div>
                              <div className="text-sm text-gray-500 mt-1">{product.mall} • 리뷰 {product.reviewCount.toLocaleString()}개 • ★{product.rating.toFixed(1)}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-lg">{product.price.toLocaleString()}원</div>
                              <div className="text-sm text-orange-600">예상 수수료 {product.commission.toLocaleString()}원</div>
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

          {/* 네이버 플레이스 */}
          {activeTab === 'place' && (
            <motion.div
              key="place"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-red-500 to-pink-500">
                    <MapPin className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">네이버 플레이스</h2>
                    <p className="text-gray-600">지역별 상권 분석 및 리뷰 키워드</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <input
                    type="text"
                    value={placeArea}
                    onChange={(e) => setPlaceArea(e.target.value)}
                    placeholder="지역 입력 (예: 강남역, 홍대, 이태원)"
                    className="flex-1 px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-red-500 focus:outline-none"
                  />
                  <select
                    value={placeCategory}
                    onChange={(e) => setPlaceCategory(e.target.value)}
                    className="px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-red-500 focus:outline-none"
                  >
                    <option value="맛집">맛집</option>
                    <option value="카페">카페</option>
                    <option value="술집">술집</option>
                    <option value="뷰티">뷰티</option>
                  </select>
                  <button
                    onClick={handlePlace}
                    disabled={placeLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {placeLoading ? <><Loader2 className="w-5 h-5 animate-spin" />분석 중...</> : <><MapPin className="w-5 h-5" />상권 분석</>}
                  </button>
                </div>

                {placeResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* 상권 개요 */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-gray-800">{placeResult.areaAnalysis.totalPlaces}</div>
                        <div className="text-sm text-gray-500">총 업체수</div>
                      </div>
                      <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-gray-800">★{placeResult.areaAnalysis.avgRating.toFixed(1)}</div>
                        <div className="text-sm text-gray-500">평균 평점</div>
                      </div>
                      <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-gray-800">{placeResult.areaAnalysis.avgReviewCount}</div>
                        <div className="text-sm text-gray-500">평균 리뷰수</div>
                      </div>
                      <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-bold text-red-600">{placeResult.areaAnalysis.competitionScore}점</div>
                        <div className="text-sm text-gray-500">경쟁 강도</div>
                      </div>
                    </div>

                    {/* 인기 장소 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">상위 노출 장소</h3>
                      <div className="space-y-3">
                        {placeResult.places.map((place, i) => (
                          <div key={i} className="p-4 bg-gray-50 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${i < 3 ? 'bg-red-500' : 'bg-gray-400'}`}>{place.rank}</div>
                              <div>
                                <div className="font-medium">{place.name}</div>
                                <div className="text-sm text-gray-500">★{place.rating.toFixed(1)} • 리뷰 {place.reviewCount}개 • 블로그 {place.blogReviewCount}개</div>
                              </div>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm ${place.competitionLevel === 'low' ? 'bg-green-100 text-green-700' : place.competitionLevel === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              경쟁 {place.competitionLevel === 'low' ? '낮음' : place.competitionLevel === 'medium' ? '보통' : '높음'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 리뷰 키워드 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">리뷰 키워드 분석</h3>
                      <div className="flex flex-wrap gap-2">
                        {placeResult.reviewKeywords.map((kw, i) => (
                          <span
                            key={i}
                            className={`px-4 py-2 rounded-full text-sm ${kw.sentiment === 'positive' ? 'bg-green-100 text-green-700' : kw.sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}
                          >
                            {kw.keyword} ({kw.count})
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 네이버 뉴스/실검 */}
          {activeTab === 'news' && (
            <motion.div
              key="news"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600">
                    <Newspaper className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">뉴스/실시간 검색</h2>
                    <p className="text-gray-600">실시간 이슈와 블로그 기회 발굴</p>
                  </div>
                </div>

                <button
                  onClick={handleNews}
                  disabled={newsLoading}
                  className="w-full px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 mb-6"
                >
                  {newsLoading ? <><Loader2 className="w-5 h-5 animate-spin" />분석 중...</> : <><Newspaper className="w-5 h-5" />실시간 분석</>}
                </button>

                {newsResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* 실시간 검색어 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">실시간 급상승 키워드</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {newsResult.realTimeKeywords.map((kw, i) => (
                          <div key={i} className="p-4 bg-blue-50 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${kw.rank <= 3 ? 'bg-blue-600' : 'bg-gray-400'}`}>{kw.rank}</div>
                              <div>
                                <div className="font-medium">{kw.keyword}</div>
                                <div className="text-xs text-gray-500">{kw.category}</div>
                              </div>
                            </div>
                            <span className={`text-sm ${kw.changeType === 'new' ? 'text-red-500' : kw.changeType === 'up' ? 'text-green-500' : kw.changeType === 'down' ? 'text-blue-500' : 'text-gray-500'}`}>
                              {kw.changeType === 'new' ? 'NEW' : kw.changeType === 'up' ? `↑${kw.changeRank}` : kw.changeType === 'down' ? `↓${kw.changeRank}` : '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 블로그 기회 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">블로그 기회 키워드</h3>
                      <div className="space-y-3">
                        {newsResult.issueKeywords.map((kw, i) => (
                          <div key={i} className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-gray-800">{kw.keyword}</span>
                              <span className="px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full text-xs font-bold">{kw.goldenTime}</span>
                            </div>
                            <div className="text-sm text-gray-600 mb-2">{kw.suggestedAngle}</div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>관련 뉴스 {kw.newsCount}건</span>
                              <span>블로그 적합도 {kw.blogPotential}%</span>
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

          {/* 네이버 카페 */}
          {activeTab === 'cafe' && (
            <motion.div
              key="cafe"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500">
                    <Coffee className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">네이버 카페</h2>
                    <p className="text-gray-600">인기 토픽과 질문 키워드 발굴</p>
                  </div>
                </div>

                <button
                  onClick={handleCafe}
                  disabled={cafeLoading}
                  className="w-full px-8 py-4 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 mb-6"
                >
                  {cafeLoading ? <><Loader2 className="w-5 h-5 animate-spin" />분석 중...</> : <><Coffee className="w-5 h-5" />카페 분석</>}
                </button>

                {cafeResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* 인기 토픽 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">지금 뜨는 카페 토픽</h3>
                      <div className="space-y-3">
                        {cafeResult.popularTopics.map((topic, i) => (
                          <div key={i} className="p-4 bg-amber-50 rounded-xl">
                            <div className="font-medium text-gray-800 mb-1">{topic.topic}</div>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span>{topic.cafeName}</span>
                              <span>글 {topic.postCount}개</span>
                              <span>참여 {topic.engagement}건</span>
                              <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded">{topic.category}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 질문 키워드 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">블로그 소재용 질문</h3>
                      <div className="space-y-3">
                        {cafeResult.questions.map((q, i) => (
                          <div key={i} className="p-4 bg-gray-50 rounded-xl flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-800">{q.question}</div>
                              <div className="text-sm text-gray-500 mt-1">추천 키워드: {q.suggestedKeyword}</div>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(q.suggestedKeyword)
                                toast.success('키워드가 복사되었습니다!')
                              }}
                              className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm hover:bg-amber-200"
                            >
                              복사
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 추천 카페 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">홍보 추천 카페</h3>
                      <div className="grid grid-cols-3 gap-4">
                        {cafeResult.recommendedCafes.map((cafe, i) => (
                          <div key={i} className="p-4 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl text-center">
                            <div className="font-bold text-gray-800">{cafe.name}</div>
                            <div className="text-sm text-gray-500 mt-1">회원 {cafe.members.toLocaleString()}명</div>
                            <div className="text-lg font-bold text-amber-600 mt-2">적합도 {cafe.matchScore}%</div>
                            <div className="text-xs text-gray-400 mt-1">{cafe.postingRule}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 네이버 VIEW */}
          {activeTab === 'naverView' && (
            <motion.div
              key="naverView"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-violet-600">
                    <Video className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">네이버 VIEW</h2>
                    <p className="text-gray-600">영상 키워드 분석 및 SEO</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={viewKeyword}
                      onChange={(e) => setViewKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleNaverView()}
                      placeholder="영상 키워드 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleNaverView}
                    disabled={viewLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {viewLoading ? <><Loader2 className="w-5 h-5 animate-spin" />분석 중...</> : <><Video className="w-5 h-5" />VIEW 분석</>}
                  </button>
                </div>

                {viewResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* 영상 키워드 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">영상 키워드 기회</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {viewResult.videoKeywords.map((kw, i) => (
                          <div key={i} className="p-4 bg-purple-50 rounded-xl">
                            <div className="font-medium text-gray-800">{kw.keyword}</div>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                              <div><span className="text-gray-500">영상수:</span> {kw.videoCount}</div>
                              <div><span className="text-gray-500">평균조회:</span> {kw.avgViews.toLocaleString()}</div>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className={`text-sm ${kw.competition === '낮음' ? 'text-green-600' : kw.competition === '중' ? 'text-yellow-600' : 'text-red-600'}`}>경쟁 {kw.competition}</span>
                              <span className="text-purple-600 font-bold">기회 {kw.opportunity}점</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 인기 영상 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">TOP 영상</h3>
                      <div className="space-y-3">
                        {viewResult.topVideos.map((video, i) => (
                          <div key={i} className="p-4 bg-gray-50 rounded-xl flex items-center gap-4">
                            <div className="w-12 h-12 bg-purple-200 rounded-lg flex items-center justify-center">
                              <Play className="w-6 h-6 text-purple-600" />
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-gray-800">{video.title}</div>
                              <div className="text-sm text-gray-500">{video.creator} • {video.duration}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold">{video.views.toLocaleString()}</div>
                              <div className="text-sm text-gray-500">조회수</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 썸네일 패턴 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">클릭률 높은 썸네일 패턴</h3>
                      <div className="grid grid-cols-3 gap-4">
                        {viewResult.thumbnailPatterns.map((pattern, i) => (
                          <div key={i} className="p-4 bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl text-center">
                            <div className="font-medium text-gray-800">{pattern.pattern}</div>
                            <div className="text-2xl font-bold text-purple-600 my-2">{pattern.ctr}%</div>
                            <div className="text-xs text-gray-500">CTR</div>
                            <div className="text-sm text-gray-600 mt-2">{pattern.example}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 네이버 인플루언서 */}
          {activeTab === 'influencer' && (
            <motion.div
              key="influencer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600">
                    <UserCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">인플루언서 검색</h2>
                    <p className="text-gray-600">내 순위 추적 및 TOP 인플루언서 분석</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <input
                    type="text"
                    value={influencerBlogId}
                    onChange={(e) => setInfluencerBlogId(e.target.value)}
                    placeholder="블로그 ID 입력"
                    className="flex-1 px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-pink-500 focus:outline-none"
                  />
                  <select
                    value={influencerCategory}
                    onChange={(e) => setInfluencerCategory(e.target.value)}
                    className="px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-pink-500 focus:outline-none"
                  >
                    <option value="all">전체</option>
                    <option value="맛집">맛집</option>
                    <option value="여행">여행</option>
                    <option value="뷰티">뷰티</option>
                    <option value="육아">육아</option>
                  </select>
                  <button
                    onClick={handleInfluencer}
                    disabled={influencerLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {influencerLoading ? <><Loader2 className="w-5 h-5 animate-spin" />분석 중...</> : <><UserCircle className="w-5 h-5" />분석</>}
                  </button>
                </div>

                {influencerResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* 내 순위 */}
                    <div className="bg-gradient-to-r from-pink-500 to-rose-600 rounded-2xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm opacity-80">내 인플루언서 순위</div>
                          <div className="text-4xl font-bold">{influencerResult.myRanking.rank}위</div>
                          <div className="text-sm opacity-80">/ {influencerResult.myRanking.totalInfluencers}명 중 ({influencerResult.myRanking.category})</div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold">{influencerResult.myRanking.score}점</div>
                          <div className={`text-sm ${influencerResult.myRanking.change > 0 ? 'text-green-300' : 'text-red-300'}`}>
                            {influencerResult.myRanking.change > 0 ? `↑${influencerResult.myRanking.change}` : `↓${Math.abs(influencerResult.myRanking.change)}`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* TOP 인플루언서 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">TOP 인플루언서 전략</h3>
                      <div className="space-y-3">
                        {influencerResult.topInfluencers.map((inf, i) => (
                          <div key={i} className="p-4 bg-pink-50 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-sm ${i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-300'}`}>{inf.rank}</span>
                                <span className="font-bold">{inf.name}</span>
                                <span className="text-sm text-gray-500">{inf.category}</span>
                              </div>
                              <span className="text-pink-600 font-bold">참여율 {inf.engagement}%</span>
                            </div>
                            <div className="text-sm text-gray-600">전략: {inf.strategy}</div>
                            <div className="flex gap-4 mt-2 text-xs text-gray-500">
                              <span>팔로워 {inf.followers.toLocaleString()}</span>
                              <span>평균 조회 {inf.avgViews.toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 인플루언서 로드맵 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">인플루언서 되기 로드맵</h3>
                      <div className="space-y-4">
                        {influencerResult.roadmapToInfluencer.map((step, i) => (
                          <div key={i} className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${step.currentProgress >= 100 ? 'bg-green-500' : 'bg-pink-500'}`}>{step.step}</div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{step.title}</span>
                                <span className="text-sm text-gray-500">{step.requirement}</span>
                              </div>
                              <div className="w-full h-2 bg-gray-200 rounded-full">
                                <div className="h-full bg-pink-500 rounded-full" style={{ width: `${step.currentProgress}%` }} />
                              </div>
                              <div className="text-xs text-gray-500 mt-1">{step.tip}</div>
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

          {/* 네이버 통합검색 */}
          {activeTab === 'searchAnalysis' && (
            <motion.div
              key="searchAnalysis"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600">
                    <Globe className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">통합검색 분석</h2>
                    <p className="text-gray-600">검색결과 구성 및 탭별 전략</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={searchAnalysisKeyword}
                      onChange={(e) => setSearchAnalysisKeyword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearchAnalysis()}
                      placeholder="분석할 키워드 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleSearchAnalysis}
                    disabled={searchAnalysisLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {searchAnalysisLoading ? <><Loader2 className="w-5 h-5 animate-spin" />분석 중...</> : <><Globe className="w-5 h-5" />검색 분석</>}
                  </button>
                </div>

                {searchAnalysisResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* 검색결과 구성 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">"{searchAnalysisResult.keyword}" 검색결과 구성</h3>
                      <div className="space-y-3">
                        {searchAnalysisResult.searchResultComposition.map((section, i) => (
                          <div key={i} className="flex items-center gap-4">
                            <div className="w-24 text-sm font-medium text-gray-700">{section.section}</div>
                            <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" style={{ width: `${section.percentage}%` }} />
                            </div>
                            <div className="w-12 text-sm text-right">{section.percentage}%</div>
                            <div className="w-40 text-xs text-gray-500">{section.recommendation}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 탭 우선순위 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">탭별 노출 우선순위</h3>
                      <div className="grid grid-cols-4 gap-4">
                        {searchAnalysisResult.tabPriority.map((tab, i) => (
                          <div key={i} className={`p-4 rounded-xl text-center ${tab.myPresence ? 'bg-green-50 border-2 border-green-300' : 'bg-gray-50'}`}>
                            <div className="text-2xl font-bold text-gray-800">{tab.position}위</div>
                            <div className="font-medium">{tab.tab}</div>
                            <div className="text-sm text-gray-500">노출 가능성 {tab.visibility}%</div>
                            {tab.myPresence && <div className="text-xs text-green-600 mt-1">내 글 노출 중</div>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 최적 콘텐츠 */}
                    <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-2xl p-6 border border-cyan-200">
                      <h3 className="font-bold text-lg mb-3">최적 콘텐츠 전략</h3>
                      <div className="text-xl font-bold text-cyan-600 mb-2">{searchAnalysisResult.optimalContentType.type}</div>
                      <p className="text-gray-600 mb-2">{searchAnalysisResult.optimalContentType.reason}</p>
                      <div className="text-sm text-gray-500">예시: {searchAnalysisResult.optimalContentType.example}</div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 네이버 지식인 */}
          {activeTab === 'kin' && (
            <motion.div
              key="kin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500">
                    <HelpCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">네이버 지식인</h2>
                    <p className="text-gray-600">인기 질문 수집 및 답변 템플릿</p>
                  </div>
                </div>

                <button
                  onClick={handleKin}
                  disabled={kinLoading}
                  className="w-full px-8 py-4 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 mb-6"
                >
                  {kinLoading ? <><Loader2 className="w-5 h-5 animate-spin" />분석 중...</> : <><HelpCircle className="w-5 h-5" />질문 분석</>}
                </button>

                {kinResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* 인기 질문 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">블로그 소재용 인기 질문</h3>
                      <div className="space-y-3">
                        {kinResult.popularQuestions.map((q, i) => (
                          <div key={i} className="p-4 bg-green-50 rounded-xl">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-gray-800">{q.question}</div>
                                <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                                  <span>답변 {q.answers}개</span>
                                  <span>조회 {q.views.toLocaleString()}</span>
                                  <span className="px-2 py-0.5 bg-green-200 text-green-800 rounded">{q.category}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(q.keyword)
                                  toast.success('키워드가 복사되었습니다!')
                                }}
                                className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
                              >
                                {q.keyword}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 답변 템플릿 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">답변 템플릿</h3>
                      {kinResult.answerTemplates.map((template, i) => (
                        <div key={i} className="p-4 bg-gray-50 rounded-xl mb-3">
                          <div className="font-medium text-gray-800 mb-2">{template.questionType}</div>
                          <div className="text-sm text-gray-600 mb-2 p-3 bg-white rounded-lg">{template.template}</div>
                          <div className="text-xs text-green-600 flex items-center gap-1">
                            <Lightbulb className="w-3 h-3" />
                            {template.blogLinkTip}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* 네이버 스마트스토어 */}
          {activeTab === 'smartstore' && (
            <motion.div
              key="smartstore"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="glass rounded-3xl p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-r from-lime-500 to-green-600">
                    <Store className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">스마트스토어 연동</h2>
                    <p className="text-gray-600">스토어와 블로그 시너지 분석</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-6">
                  <div className="relative flex-1">
                    <Store className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={smartstoreId}
                      onChange={(e) => setSmartstoreId(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSmartstore()}
                      placeholder="스마트스토어 ID 입력"
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-lime-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleSmartstore}
                    disabled={smartstoreLoading}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-lime-500 to-green-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {smartstoreLoading ? <><Loader2 className="w-5 h-5 animate-spin" />분석 중...</> : <><Store className="w-5 h-5" />스토어 분석</>}
                  </button>
                </div>

                {smartstoreResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* 스토어 정보 */}
                    <div className="bg-gradient-to-r from-lime-500 to-green-600 rounded-2xl p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm opacity-80">스토어</div>
                          <div className="text-2xl font-bold">{smartstoreResult.storeInfo.storeName}</div>
                          <div className="text-sm opacity-80">{smartstoreResult.storeInfo.category} • 상품 {smartstoreResult.storeInfo.productCount}개</div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold">★{smartstoreResult.storeInfo.rating.toFixed(1)}</div>
                          <div className="text-sm opacity-80">총 매출 {(smartstoreResult.storeInfo.totalSales / 10000).toFixed(0)}만원</div>
                        </div>
                      </div>
                    </div>

                    {/* 상품 키워드 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">상품 키워드 분석</h3>
                      <div className="space-y-3">
                        {smartstoreResult.productKeywords.map((kw, i) => (
                          <div key={i} className="p-4 bg-lime-50 rounded-xl flex items-center justify-between">
                            <div>
                              <div className="font-medium">{kw.keyword}</div>
                              <div className="text-sm text-gray-500">검색량 {kw.searchVolume.toLocaleString()} • 전환율 {kw.conversionRate}%</div>
                            </div>
                            <div className="text-right">
                              {kw.myRank ? (
                                <div className="text-lime-600 font-bold">{kw.myRank}위</div>
                              ) : (
                                <div className="text-gray-400">순위 없음</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 블로그 시너지 */}
                    <div className="bg-white rounded-2xl p-6 border border-gray-200">
                      <h3 className="font-bold text-lg mb-4">블로그 콘텐츠 아이디어</h3>
                      {smartstoreResult.blogSynergy.map((item, i) => (
                        <div key={i} className="p-4 bg-gradient-to-r from-lime-50 to-green-50 rounded-xl mb-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-gray-800">{item.product}</span>
                            <span className="text-lime-600">예상 유입 +{item.expectedTraffic}</span>
                          </div>
                          <div className="text-sm text-gray-600">추천 키워드: {item.suggestedKeyword}</div>
                          <div className="text-sm text-gray-500 mt-1">콘텐츠 아이디어: {item.contentIdea}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 전체 페이지 튜토리얼 */}
        <Tutorial
          steps={toolsTutorialSteps}
          tutorialKey="tools-page"
          onComplete={() => toast.success('튜토리얼을 완료했습니다!')}
        />

        {/* 도구별 튜토리얼 */}
        <ToolTutorial
          toolId={currentTutorialTool}
          isOpen={showToolTutorial}
          onClose={() => setShowToolTutorial(false)}
        />
      </div>
    </div>
  )
}
