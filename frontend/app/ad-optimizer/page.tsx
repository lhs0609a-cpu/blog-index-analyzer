'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, Settings, Play, Pause, RefreshCw, Search,
  Plus, Trash2, RotateCcw, Download, Filter, Clock,
  Target, DollarSign, MousePointer, Eye, ShoppingCart,
  AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp,
  Zap, BarChart3, PieChart, Activity, ArrowUpRight, ArrowDownRight,
  Loader2, Save, Bell, History, Sparkles, Link2, Wallet, Flame
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import Tutorial, { adOptimizerTutorialSteps } from '@/components/Tutorial'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev'

// 타입 정의
interface DashboardStats {
  today_bid_changes: number
  today_excluded: number
  active_keywords: number
  is_auto_optimization: boolean
  strategy: string
  performance: {
    total_impressions: number
    total_clicks: number
    total_cost: number
    total_conversions: number
    total_revenue: number
    avg_ctr: number
    roas: number
    avg_position: number
    active_keywords: number
  }
}

interface BidChange {
  id: number
  keyword_id: string
  keyword_text: string
  old_bid: number
  new_bid: number
  change_amount: number
  change_ratio: number
  reason: string
  strategy: string
  changed_at: string
}

interface DiscoveredKeyword {
  id: number
  keyword: string
  monthly_search_count: number
  competition_level: string
  suggested_bid: number
  relevance_score: number
  potential_score: number
  status: string
}

interface ExcludedKeyword {
  id: number
  keyword_id: string
  keyword_text: string
  reason: string
  excluded_at: string
}

interface OptimizationSettings {
  strategy: string
  target_roas: number
  target_position: number
  target_cpa: number
  conversion_value: number
  max_bid_change_ratio: number
  min_bid: number
  max_bid: number
  min_ctr: number
  max_cost_no_conv: number
  min_quality_score: number
  evaluation_days: number
  optimization_interval: number
  is_auto_optimization: boolean
  blacklist_keywords: string[]
  core_terms: string[]
  conversion_keywords: string[]
}

// 새로운 타입들
interface AdAccount {
  customer_id: string
  name?: string
  is_connected: boolean
  last_sync_at?: string
  connection_error?: string
}

interface EfficiencySummary {
  total_saved: number
  savings_rate: number
  total_bid_changes: number
  roas_improvement: number
  ctr_improvement: number
  position_improvement: number
  total_conversions: number
  total_revenue: number
  avg_roas_before: number
  avg_roas_after: number
}

interface TrendingKeyword {
  keyword: string
  search_volume_current: number
  search_volume_change_rate: number
  competition_level: string
  suggested_bid: number
  opportunity_score: number
  trend_score: number
  recommendation_reason: string
}

export default function AdOptimizerPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'connect' | 'dashboard' | 'efficiency' | 'trending' | 'keywords' | 'discover' | 'excluded' | 'settings' | 'logs'>('connect')
  const [isLoading, setIsLoading] = useState(false)
  const userId = user?.id || 1 // 인증된 사용자 ID 사용, 기본값 1

  // 계정 연동 상태
  const [adAccount, setAdAccount] = useState<AdAccount | null>(null)
  const [connectForm, setConnectForm] = useState({
    customer_id: '',
    api_key: '',
    secret_key: '',
    name: ''
  })
  const [isConnecting, setIsConnecting] = useState(false)

  // 효율 추적 상태
  const [efficiency, setEfficiency] = useState<EfficiencySummary | null>(null)
  const [efficiencyHistory, setEfficiencyHistory] = useState<any[]>([])

  // 트렌드 키워드 상태
  const [trendingKeywords, setTrendingKeywords] = useState<TrendingKeyword[]>([])
  const [isRefreshingTrending, setIsRefreshingTrending] = useState(false)

  // 대시보드 상태
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [recentChanges, setRecentChanges] = useState<BidChange[]>([])
  const [isAutoRunning, setIsAutoRunning] = useState(false)

  // 키워드 발굴 상태
  const [seedKeywords, setSeedKeywords] = useState('')
  const [discoveredKeywords, setDiscoveredKeywords] = useState<DiscoveredKeyword[]>([])
  const [isDiscovering, setIsDiscovering] = useState(false)

  // 제외 키워드 상태
  const [excludedKeywords, setExcludedKeywords] = useState<ExcludedKeyword[]>([])

  // 설정 상태
  const [settings, setSettings] = useState<OptimizationSettings>({
    strategy: 'balanced',
    target_roas: 300,
    target_position: 3,
    target_cpa: 20000,
    conversion_value: 59400,
    max_bid_change_ratio: 0.2,
    min_bid: 70,
    max_bid: 100000,
    min_ctr: 0.01,
    max_cost_no_conv: 50000,
    min_quality_score: 4,
    evaluation_days: 7,
    optimization_interval: 60,
    is_auto_optimization: false,
    blacklist_keywords: [],
    core_terms: [],
    conversion_keywords: ['가격', '비용', '구독', '결제', '신청', '구매', '추천', '비교', '후기']
  })
  const [blacklistInput, setBlacklistInput] = useState('')
  const [coreTermsInput, setCoreTermsInput] = useState('')
  const [conversionKeywordsInput, setConversionKeywordsInput] = useState('')
  const [isDiscoveringConversion, setIsDiscoveringConversion] = useState(false)

  // 로그 상태
  const [logs, setLogs] = useState<any[]>([])

  // 대시보드 데이터 로드
  const loadDashboard = useCallback(async () => {
    try {
      const [dashRes, changesRes] = await Promise.all([
        fetch(`${API_BASE}/api/naver-ad/dashboard?user_id=${userId}`),
        fetch(`${API_BASE}/api/naver-ad/bids/history?user_id=${userId}&limit=20`)
      ])

      if (dashRes.ok) {
        const dashData = await dashRes.json()
        setDashboardStats(dashData.data)
        setIsAutoRunning(dashData.data.is_auto_optimization)
      }

      if (changesRes.ok) {
        const changesData = await changesRes.json()
        setRecentChanges(changesData.history || [])
      }
    } catch (error) {
      console.error('Dashboard load error:', error)
    }
  }, [userId])

  // 설정 로드
  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/settings?user_id=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setSettings(data.data)
        setBlacklistInput(data.data.blacklist_keywords?.join(', ') || '')
        setCoreTermsInput(data.data.core_terms?.join(', ') || '')
        setConversionKeywordsInput(data.data.conversion_keywords?.join(', ') || '가격, 비용, 구독, 결제, 신청, 구매, 추천, 비교, 후기')
      }
    } catch (error) {
      console.error('Settings load error:', error)
    }
  }, [userId])

  // 제외 키워드 로드
  const loadExcludedKeywords = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/keywords/excluded?user_id=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setExcludedKeywords(data.keywords || [])
      }
    } catch (error) {
      console.error('Excluded keywords load error:', error)
    }
  }, [userId])

  // 로그 로드
  const loadLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/logs?user_id=${userId}&limit=50`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
      }
    } catch (error) {
      console.error('Logs load error:', error)
    }
  }, [userId])

  // 계정 연동 상태 로드
  const loadAccountStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/account/status?user_id=${userId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          setAdAccount(data.data)
        }
      }
    } catch (error) {
      console.error('Account status load error:', error)
    }
  }, [userId])

  // 효율 요약 로드
  const loadEfficiency = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/efficiency/summary?user_id=${userId}&days=7`)
      if (res.ok) {
        const data = await res.json()
        setEfficiency(data.data)
      }
    } catch (error) {
      console.error('Efficiency load error:', error)
    }
  }, [userId])

  // 효율 히스토리 로드 (차트용)
  const loadEfficiencyHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/efficiency/history?user_id=${userId}&days=30`)
      if (res.ok) {
        const data = await res.json()
        setEfficiencyHistory(data.data || [])
      }
    } catch (error) {
      console.error('Efficiency history load error:', error)
    }
  }, [userId])

  // 트렌드 키워드 로드
  const loadTrendingKeywords = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/trending/keywords?user_id=${userId}&limit=20`)
      if (res.ok) {
        const data = await res.json()
        setTrendingKeywords(data.data || [])
      }
    } catch (error) {
      console.error('Trending keywords load error:', error)
    }
  }, [userId])

  // 계정 연동
  const connectAccount = async () => {
    if (!connectForm.customer_id || !connectForm.api_key || !connectForm.secret_key) {
      toast.error('모든 필수 항목을 입력해주세요')
      return
    }

    setIsConnecting(true)
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/account/connect?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectForm)
      })

      if (res.ok) {
        const data = await res.json()
        toast.success('계정이 연동되었습니다!')
        setAdAccount({
          customer_id: connectForm.customer_id,
          name: connectForm.name,
          is_connected: true
        })
        setActiveTab('dashboard')
        loadDashboard()
      } else {
        const error = await res.json()
        toast.error(error.detail || '계정 연동 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    } finally {
      setIsConnecting(false)
    }
  }

  // 계정 연동 해제
  const disconnectAccount = async () => {
    if (!confirm('정말로 계정 연동을 해제하시겠습니까?')) return

    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/account/disconnect?user_id=${userId}`, {
        method: 'POST'
      })

      if (res.ok) {
        toast.success('계정 연동이 해제되었습니다')
        setAdAccount(null)
        setConnectForm({ customer_id: '', api_key: '', secret_key: '', name: '' })
        setActiveTab('connect')
      } else {
        toast.error('연동 해제 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    }
  }

  // 트렌드 키워드 새로고침
  const refreshTrendingKeywords = async () => {
    setIsRefreshingTrending(true)
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/trending/refresh?user_id=${userId}`, {
        method: 'POST'
      })

      if (res.ok) {
        toast.success('트렌드 키워드가 업데이트되었습니다')
        loadTrendingKeywords()
      } else {
        toast.error('업데이트 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    } finally {
      setIsRefreshingTrending(false)
    }
  }

  // 트렌드 키워드를 캠페인에 추가
  const addTrendingToCampaign = async (keyword: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/trending/add-to-campaign?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword })
      })

      if (res.ok) {
        toast.success(`"${keyword}" 키워드가 캠페인에 추가되었습니다`)
        loadTrendingKeywords()
      } else {
        toast.error('추가 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    }
  }

  // 초기 로드
  useEffect(() => {
    loadAccountStatus()
    loadDashboard()
    loadSettings()
  }, [loadAccountStatus, loadDashboard, loadSettings])

  // 탭 변경 시 데이터 로드
  useEffect(() => {
    if (activeTab === 'excluded') loadExcludedKeywords()
    if (activeTab === 'logs') loadLogs()
    if (activeTab === 'efficiency') {
      loadEfficiency()
      loadEfficiencyHistory()
    }
    if (activeTab === 'trending') loadTrendingKeywords()
  }, [activeTab, loadExcludedKeywords, loadLogs, loadEfficiency, loadEfficiencyHistory, loadTrendingKeywords])

  // 자동 새로고침 (1분마다)
  useEffect(() => {
    if (isAutoRunning) {
      const interval = setInterval(loadDashboard, 60000)
      return () => clearInterval(interval)
    }
  }, [isAutoRunning, loadDashboard])

  // 자동 최적화 시작/중지
  const toggleAutoOptimization = async () => {
    setIsLoading(true)
    try {
      const endpoint = isAutoRunning ? 'stop' : 'start'
      const res = await fetch(`${API_BASE}/api/naver-ad/optimization/${endpoint}?user_id=${userId}`, {
        method: 'POST'
      })

      if (res.ok) {
        setIsAutoRunning(!isAutoRunning)
        toast.success(isAutoRunning ? '자동 최적화가 중지되었습니다' : '자동 최적화가 시작되었습니다')
        loadDashboard()
      } else {
        toast.error('작업 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    } finally {
      setIsLoading(false)
    }
  }

  // 1회 최적화 실행
  const runOptimizationOnce = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/optimization/run-once?user_id=${userId}`, {
        method: 'POST'
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.changes?.length || 0}개 키워드 최적화 완료`)
        loadDashboard()
      } else {
        toast.error('최적화 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    } finally {
      setIsLoading(false)
    }
  }

  // 키워드 발굴
  const discoverKeywords = async () => {
    if (!seedKeywords.trim()) {
      toast.error('시드 키워드를 입력해주세요')
      return
    }

    setIsDiscovering(true)
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/keywords/discover?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed_keywords: seedKeywords.split(',').map(k => k.trim()),
          max_keywords: 50,
          min_search_volume: 100,
          max_competition: 0.85,
          auto_add: false
        })
      })

      if (res.ok) {
        const data = await res.json()
        setDiscoveredKeywords(data.keywords || [])
        toast.success(`${data.discovered}개 키워드 발굴 완료`)
      } else {
        toast.error('키워드 발굴 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    } finally {
      setIsDiscovering(false)
    }
  }

  // 설정 저장
  const saveSettings = async () => {
    setIsLoading(true)
    try {
      const updatedSettings = {
        ...settings,
        blacklist_keywords: blacklistInput.split(',').map(k => k.trim()).filter(k => k),
        core_terms: coreTermsInput.split(',').map(k => k.trim()).filter(k => k),
        conversion_keywords: conversionKeywordsInput.split(',').map(k => k.trim()).filter(k => k)
      }

      const res = await fetch(`${API_BASE}/api/naver-ad/settings?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      })

      if (res.ok) {
        toast.success('설정이 저장되었습니다')
        loadSettings()
      } else {
        toast.error('저장 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    } finally {
      setIsLoading(false)
    }
  }

  // 전환 키워드 발굴
  const discoverConversionKeywords = async () => {
    if (!seedKeywords.trim()) {
      toast.error('시드 키워드를 입력해주세요')
      return
    }

    setIsDiscoveringConversion(true)
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/keywords/discover-conversion?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed_keywords: seedKeywords.split(',').map(k => k.trim()),
          max_keywords: 50,
          min_search_volume: 50,
          max_competition: 0.85,
          auto_add: false
        })
      })

      if (res.ok) {
        const data = await res.json()
        setDiscoveredKeywords(data.keywords || [])
        toast.success(`전환 키워드 ${data.discovered}개 발굴 완료!`)
      } else {
        toast.error('전환 키워드 발굴 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    } finally {
      setIsDiscoveringConversion(false)
    }
  }

  // 비효율 키워드 평가
  const evaluateKeywords = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/keywords/evaluate?user_id=${userId}`, {
        method: 'POST'
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.excluded?.length || 0}개 키워드 제외됨`)
        loadExcludedKeywords()
        loadDashboard()
      } else {
        toast.error('평가 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    } finally {
      setIsLoading(false)
    }
  }

  // 제외 키워드 복원
  const restoreKeyword = async (keywordId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/naver-ad/keywords/restore/${keywordId}?user_id=${userId}`, {
        method: 'POST'
      })

      if (res.ok) {
        toast.success('키워드가 복원되었습니다')
        loadExcludedKeywords()
      } else {
        toast.error('복원 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    }
  }

  // 포맷 함수들
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num?.toLocaleString() || '0'
  }

  const formatCurrency = (num: number) => {
    return '₩' + (num || 0).toLocaleString()
  }

  const formatPercent = (num: number) => {
    return (num * 100).toFixed(2) + '%'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* 헤더 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/tools" className="text-gray-500 hover:text-gray-700">
                ← 도구로 돌아가기
              </Link>
              <div className="w-px h-6 bg-gray-300" />
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">네이버 광고 자동 최적화</h1>
                  <p className="text-xs text-gray-500">실시간 입찰가 최적화 시스템</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* 자동 최적화 상태 */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                isAutoRunning ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                <div className={`w-2 h-2 rounded-full ${isAutoRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                <span className="text-sm font-medium">
                  {isAutoRunning ? '자동 최적화 실행 중' : '자동 최적화 중지됨'}
                </span>
              </div>

              <button
                id="ad-auto-btn"
                onClick={toggleAutoOptimization}
                disabled={isLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  isAutoRunning
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isAutoRunning ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {isAutoRunning ? '중지' : '시작'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 탭 네비게이션 */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { id: 'connect', label: '계정 연동', icon: Link2 },
            { id: 'dashboard', label: '대시보드', icon: BarChart3 },
            { id: 'efficiency', label: '효율 추적', icon: Wallet },
            { id: 'trending', label: '트렌드 키워드', icon: Flame },
            { id: 'keywords', label: '키워드 관리', icon: Search },
            { id: 'discover', label: '키워드 발굴', icon: Sparkles },
            { id: 'excluded', label: '제외 키워드', icon: XCircle },
            { id: 'settings', label: '설정', icon: Settings },
            { id: 'logs', label: '로그', icon: History }
          ].map(tab => (
            <button
              key={tab.id}
              id={`ad-${tab.id}-tab`}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* 계정 연동 탭 */}
        {activeTab === 'connect' && (
          <div className="space-y-6">
            {/* 연동 상태 */}
            {adAccount?.is_connected ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-white"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">계정 연동됨</h3>
                      <p className="text-green-100">고객 ID: {adAccount.customer_id}</p>
                      {adAccount.name && <p className="text-green-100 text-sm">{adAccount.name}</p>}
                      {adAccount.last_sync_at && (
                        <p className="text-green-200 text-xs mt-1">
                          마지막 동기화: {new Date(adAccount.last_sync_at).toLocaleString('ko-KR')}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={disconnectAccount}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors"
                  >
                    연동 해제
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-8 shadow-sm"
              >
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Link2 className="w-10 h-10 text-blue-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">네이버 검색광고 계정 연동</h2>
                  <p className="text-gray-600">
                    API 자격 증명을 입력하여 광고 계정을 연동하세요.<br />
                    연동 후 실시간 자동 최적화가 가능합니다.
                  </p>
                </div>

                <div className="max-w-lg mx-auto space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      고객 ID (Customer ID) *
                    </label>
                    <input
                      type="text"
                      value={connectForm.customer_id}
                      onChange={(e) => setConnectForm({ ...connectForm, customer_id: e.target.value })}
                      placeholder="네이버 광고 고객 ID"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      API 키 (API Key) *
                    </label>
                    <input
                      type="password"
                      value={connectForm.api_key}
                      onChange={(e) => setConnectForm({ ...connectForm, api_key: e.target.value })}
                      placeholder="API 액세스 라이선스 키"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      비밀 키 (Secret Key) *
                    </label>
                    <input
                      type="password"
                      value={connectForm.secret_key}
                      onChange={(e) => setConnectForm({ ...connectForm, secret_key: e.target.value })}
                      placeholder="API 비밀 키"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      계정 이름 (선택사항)
                    </label>
                    <input
                      type="text"
                      value={connectForm.name}
                      onChange={(e) => setConnectForm({ ...connectForm, name: e.target.value })}
                      placeholder="식별을 위한 계정 이름"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <button
                    onClick={connectAccount}
                    disabled={isConnecting}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 mt-6"
                  >
                    {isConnecting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Link2 className="w-5 h-5" />
                    )}
                    계정 연동하기
                  </button>
                </div>

                <div className="mt-8 p-4 bg-gray-50 rounded-xl">
                  <h4 className="font-medium text-gray-900 mb-2">API 키 발급 방법</h4>
                  <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                    <li>네이버 검색광고 센터 로그인</li>
                    <li>도구 → API 관리 메뉴 클릭</li>
                    <li>API 라이선스 키 발급 신청</li>
                    <li>발급된 키 정보 입력</li>
                  </ol>
                </div>
              </motion.div>
            )}

            {/* 연동 이점 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid md:grid-cols-3 gap-4"
            >
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">실시간 자동 최적화</h3>
                <p className="text-sm text-gray-600">24시간 자동으로 입찰가를 조정하여 광고 효율을 극대화합니다.</p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                  <Wallet className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">비용 절감 추적</h3>
                <p className="text-sm text-gray-600">얼마나 비용을 절감했는지 실시간으로 확인할 수 있습니다.</p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                  <Flame className="w-6 h-6 text-orange-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">트렌드 키워드 추천</h3>
                <p className="text-sm text-gray-600">검색량이 급상승하는 키워드를 자동으로 추천받습니다.</p>
              </div>
            </motion.div>
          </div>
        )}

        {/* 효율 추적 탭 */}
        {activeTab === 'efficiency' && (
          <div className="space-y-6">
            {/* 효율 요약 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 text-white"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <span className="text-sm text-green-100">총 절감액</span>
                </div>
                <p className="text-3xl font-bold">
                  {formatCurrency(efficiency?.total_saved || 0)}
                </p>
                <p className="text-green-200 text-sm mt-1">
                  절감률: {((efficiency?.savings_rate || 0) * 100).toFixed(1)}%
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm text-gray-500">ROAS 개선</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  +{((efficiency?.roas_improvement || 0) * 100).toFixed(1)}%
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  {efficiency?.avg_roas_before?.toFixed(0)}% → {efficiency?.avg_roas_after?.toFixed(0)}%
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-2xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <MousePointer className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-sm text-gray-500">CTR 개선</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  +{((efficiency?.ctr_improvement || 0) * 100).toFixed(2)}%
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-2xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="text-sm text-gray-500">입찰 조정</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {efficiency?.total_bid_changes || 0}회
                </p>
              </motion.div>
            </div>

            {/* 성과 비교 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-2xl p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">최적화 전후 비교</h3>
                <button
                  onClick={() => { loadEfficiency(); loadEfficiencyHistory(); }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                  <h4 className="font-medium text-red-800 mb-3 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    최적화 전 (평균)
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-red-600">ROAS</span>
                      <span className="font-semibold text-red-800">{efficiency?.avg_roas_before?.toFixed(0) || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-600">비효율 지출</span>
                      <span className="font-semibold text-red-800">높음</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                  <h4 className="font-medium text-green-800 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    최적화 후 (평균)
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-600">ROAS</span>
                      <span className="font-semibold text-green-800">{efficiency?.avg_roas_after?.toFixed(0) || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-600">절감된 비용</span>
                      <span className="font-semibold text-green-800">{formatCurrency(efficiency?.total_saved || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 효율 히스토리 */}
            {efficiencyHistory.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-white rounded-2xl p-6 shadow-sm"
              >
                <h3 className="text-lg font-bold text-gray-900 mb-4">일별 절감 내역</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-gray-500 border-b">
                        <th className="pb-3">날짜</th>
                        <th className="pb-3 text-right">비용 전</th>
                        <th className="pb-3 text-right">비용 후</th>
                        <th className="pb-3 text-right">절감액</th>
                        <th className="pb-3 text-right">ROAS 변화</th>
                      </tr>
                    </thead>
                    <tbody>
                      {efficiencyHistory.slice(0, 10).map((item, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-3">{new Date(item.date).toLocaleDateString('ko-KR')}</td>
                          <td className="py-3 text-right text-gray-500">{formatCurrency(item.cost_before)}</td>
                          <td className="py-3 text-right">{formatCurrency(item.cost_after)}</td>
                          <td className="py-3 text-right text-green-600 font-semibold">
                            -{formatCurrency(item.cost_saved)}
                          </td>
                          <td className="py-3 text-right">
                            <span className="text-green-600">
                              {item.roas_before?.toFixed(0)}% → {item.roas_after?.toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* 트렌드 키워드 탭 */}
        {activeTab === 'trending' && (
          <div className="space-y-6">
            {/* 헤더 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl p-6 text-white"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                    <Flame className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">트렌드 키워드 추천</h2>
                    <p className="text-orange-100">검색량이 급상승하는 키워드를 놓치지 마세요</p>
                  </div>
                </div>
                <button
                  onClick={refreshTrendingKeywords}
                  disabled={isRefreshingTrending}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors"
                >
                  {isRefreshingTrending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  새로고침
                </button>
              </div>
            </motion.div>

            {/* 트렌드 키워드 목록 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl p-6 shadow-sm"
            >
              {trendingKeywords.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Flame className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>트렌드 키워드를 불러오는 중...</p>
                  <button
                    onClick={refreshTrendingKeywords}
                    className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    트렌드 키워드 가져오기
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {trendingKeywords.map((kw, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-sm">
                            {idx + 1}
                          </span>
                          <div>
                            <h4 className="font-semibold text-gray-900">{kw.keyword}</h4>
                            <p className="text-sm text-gray-500">{kw.recommendation_reason}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-gray-500">검색량</p>
                          <p className="font-semibold">{formatNumber(kw.search_volume_current)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">변화율</p>
                          <p className={`font-semibold ${kw.search_volume_change_rate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {kw.search_volume_change_rate >= 0 ? '+' : ''}{(kw.search_volume_change_rate * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">기회점수</p>
                          <p className="font-semibold text-purple-600">{(kw.opportunity_score * 100).toFixed(0)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">추천입찰가</p>
                          <p className="font-semibold">{formatCurrency(kw.suggested_bid)}</p>
                        </div>
                        <button
                          onClick={() => addTrendingToCampaign(kw.keyword)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          캠페인 추가
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* 대시보드 탭 */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* 통계 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Search className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm text-gray-500">활성 키워드</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {formatNumber(dashboardStats?.active_keywords || 0)}
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-sm text-gray-500">오늘 입찰 변경</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {dashboardStats?.today_bid_changes || 0}
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-2xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="text-sm text-gray-500">ROAS</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {(dashboardStats?.performance?.roas || 0).toFixed(0)}%
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-2xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <Target className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-sm text-gray-500">전략</span>
                </div>
                <p className="text-xl font-bold text-gray-900 capitalize">
                  {dashboardStats?.strategy || 'balanced'}
                </p>
              </motion.div>
            </div>

            {/* 성과 요약 */}
            <div className="grid md:grid-cols-2 gap-6">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-2xl p-6 shadow-sm"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-gray-900">주간 성과 요약</h3>
                  <button
                    onClick={loadDashboard}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">총 노출수</span>
                    <span className="font-semibold">{formatNumber(dashboardStats?.performance?.total_impressions || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">총 클릭수</span>
                    <span className="font-semibold">{formatNumber(dashboardStats?.performance?.total_clicks || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">평균 CTR</span>
                    <span className="font-semibold">{formatPercent(dashboardStats?.performance?.avg_ctr || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">총 비용</span>
                    <span className="font-semibold">{formatCurrency(dashboardStats?.performance?.total_cost || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">총 전환</span>
                    <span className="font-semibold">{dashboardStats?.performance?.total_conversions || 0}건</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">총 매출</span>
                    <span className="font-semibold text-green-600">{formatCurrency(dashboardStats?.performance?.total_revenue || 0)}</span>
                  </div>
                </div>
              </motion.div>

              {/* 빠른 실행 */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-2xl p-6 shadow-sm"
              >
                <h3 className="text-lg font-bold text-gray-900 mb-6">빠른 실행</h3>

                <div className="space-y-3">
                  <button
                    onClick={runOptimizationOnce}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    입찰 최적화 1회 실행
                  </button>

                  <button
                    onClick={evaluateKeywords}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
                    비효율 키워드 평가
                  </button>

                  <button
                    onClick={() => setActiveTab('discover')}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    키워드 발굴하기
                  </button>
                </div>
              </motion.div>
            </div>

            {/* 최근 입찰 변경 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">최근 입찰 변경</h3>
                <span className="text-sm text-gray-500">1분마다 자동 갱신</span>
              </div>

              {recentChanges.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  아직 입찰 변경 내역이 없습니다
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-gray-500 border-b">
                        <th className="pb-3">키워드</th>
                        <th className="pb-3 text-right">이전</th>
                        <th className="pb-3 text-right">변경</th>
                        <th className="pb-3">사유</th>
                        <th className="pb-3 text-right">시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentChanges.slice(0, 10).map((change, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-3 font-medium">{change.keyword_text}</td>
                          <td className="py-3 text-right text-gray-500">{formatCurrency(change.old_bid)}</td>
                          <td className="py-3 text-right">
                            <span className={`flex items-center justify-end gap-1 ${
                              change.new_bid > change.old_bid ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {change.new_bid > change.old_bid ? (
                                <ArrowUpRight className="w-4 h-4" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4" />
                              )}
                              {formatCurrency(change.new_bid)}
                            </span>
                          </td>
                          <td className="py-3 text-sm text-gray-600">{change.reason}</td>
                          <td className="py-3 text-right text-sm text-gray-500">
                            {new Date(change.changed_at).toLocaleTimeString('ko-KR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* 키워드 발굴 탭 */}
        {activeTab === 'discover' && (
          <div className="space-y-6">
            {/* 전환 키워드 발굴 안내 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-white"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Target className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-2">💰 전환 키워드를 싸게 사는 법</h3>
                  <p className="text-green-100 text-sm">
                    구매의도가 높은 키워드(가격, 추천, 비교 등)를 자동으로 발굴합니다.
                    전환 키워드 발굴 버튼을 사용하면 전환 가능성이 높은 키워드만 추출됩니다.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl p-6 shadow-sm"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-4">키워드 발굴</h3>
              <p className="text-gray-600 mb-6">
                시드 키워드를 입력하면 관련성 높은 키워드를 자동으로 발굴합니다.
              </p>

              <div className="space-y-4 mb-6">
                <input
                  type="text"
                  value={seedKeywords}
                  onChange={(e) => setSeedKeywords(e.target.value)}
                  placeholder="시드 키워드 입력 (쉼표로 구분) - 예: 블로그 분석, 블로그 지수, 키워드 분석"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex gap-3">
                  <button
                    onClick={discoverConversionKeywords}
                    disabled={isDiscoveringConversion}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-medium transition-all disabled:opacity-50 shadow-lg shadow-green-500/30"
                  >
                    {isDiscoveringConversion ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Target className="w-4 h-4" />
                    )}
                    🔥 전환 키워드 발굴 (추천)
                  </button>
                  <button
                    onClick={discoverKeywords}
                    disabled={isDiscovering}
                    className="flex items-center gap-2 px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    {isDiscovering ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    전체 발굴
                  </button>
                </div>
              </div>

              {/* 발굴된 키워드 목록 */}
              {discoveredKeywords.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-gray-500 border-b">
                        <th className="pb-3">키워드</th>
                        <th className="pb-3 text-right">월간 검색량</th>
                        <th className="pb-3 text-center">경쟁도</th>
                        <th className="pb-3 text-right">추천 입찰가</th>
                        <th className="pb-3 text-right">관련성</th>
                        <th className="pb-3 text-right">잠재력</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discoveredKeywords.map((kw, idx) => (
                        <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-3 font-medium">{kw.keyword}</td>
                          <td className="py-3 text-right">{formatNumber(kw.monthly_search_count)}</td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              kw.competition_level === 'LOW' ? 'bg-green-100 text-green-700' :
                              kw.competition_level === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {kw.competition_level === 'LOW' ? '낮음' :
                               kw.competition_level === 'MEDIUM' ? '보통' : '높음'}
                            </span>
                          </td>
                          <td className="py-3 text-right">{formatCurrency(kw.suggested_bid)}</td>
                          <td className="py-3 text-right">{(kw.relevance_score * 100).toFixed(0)}%</td>
                          <td className="py-3 text-right font-semibold text-purple-600">
                            {kw.potential_score.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* 제외 키워드 탭 */}
        {activeTab === 'excluded' && (
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">제외된 키워드</h3>
                <span className="text-sm text-gray-500">{excludedKeywords.length}개</span>
              </div>

              {excludedKeywords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  제외된 키워드가 없습니다
                </div>
              ) : (
                <div className="space-y-3">
                  {excludedKeywords.map((kw, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div>
                        <p className="font-medium text-gray-900">{kw.keyword_text}</p>
                        <p className="text-sm text-gray-500">{kw.reason}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(kw.excluded_at).toLocaleString('ko-KR')}
                        </p>
                      </div>
                      <button
                        onClick={() => restoreKeyword(kw.keyword_id)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        복원
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* 설정 탭 */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-6 shadow-sm"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-6">최적화 설정</h3>

              <div className="grid md:grid-cols-2 gap-6">
                {/* 입찰 전략 */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">입찰 전략</label>
                  <select
                    value={settings.strategy}
                    onChange={(e) => setSettings({ ...settings, strategy: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="balanced">균형 (Balanced)</option>
                    <option value="target_roas">목표 ROAS</option>
                    <option value="target_position">목표 순위</option>
                    <option value="target_cpa">🎯 목표 CPA (전환 최적화)</option>
                    <option value="maximize_conversions">🔥 전환수 최대화</option>
                    <option value="maximize_clicks">클릭 최대화</option>
                    <option value="minimize_cpc">CPC 최소화</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {settings.strategy === 'target_cpa' && '💡 전환당 비용(CPA) 기준으로 입찰가를 자동 조정합니다. 전환 데이터가 있는 키워드에 효과적입니다.'}
                    {settings.strategy === 'maximize_conversions' && '💡 전환 발생 키워드에 예산을 집중 투자합니다. 전환 없는 키워드는 최소 입찰로 전환합니다.'}
                  </p>
                </div>

                {/* 전환 최적화 설정 (CPA 전략일 때만 표시) */}
                {(settings.strategy === 'target_cpa' || settings.strategy === 'maximize_conversions') && (
                  <>
                    <div className="md:col-span-2 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                      <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        전환 최적화 설정
                      </h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-green-700 mb-2">목표 CPA (전환당 비용)</label>
                          <div className="relative">
                            <input
                              type="number"
                              value={settings.target_cpa}
                              onChange={(e) => setSettings({ ...settings, target_cpa: Number(e.target.value) })}
                              className="w-full px-4 py-3 border border-green-200 rounded-xl focus:ring-2 focus:ring-green-500 bg-white"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">원</span>
                          </div>
                          <p className="mt-1 text-xs text-green-600">전환 1건당 허용 가능한 최대 광고비</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-green-700 mb-2">전환 가치 (LTV)</label>
                          <div className="relative">
                            <input
                              type="number"
                              value={settings.conversion_value}
                              onChange={(e) => setSettings({ ...settings, conversion_value: Number(e.target.value) })}
                              className="w-full px-4 py-3 border border-green-200 rounded-xl focus:ring-2 focus:ring-green-500 bg-white"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">원</span>
                          </div>
                          <p className="mt-1 text-xs text-green-600">고객 1명의 평균 생애 가치 (예: 월 9,900원 × 6개월 = 59,400원)</p>
                        </div>
                      </div>
                      <div className="mt-3 p-3 bg-white/60 rounded-lg">
                        <p className="text-sm text-green-800">
                          <strong>예상 ROAS:</strong> {settings.conversion_value && settings.target_cpa ? ((settings.conversion_value / settings.target_cpa) * 100).toFixed(0) : 0}%
                          {' '}| <strong>손익분기 CPA:</strong> {formatCurrency(settings.conversion_value || 0)}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* 목표 ROAS */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">목표 ROAS (%)</label>
                  <input
                    type="number"
                    value={settings.target_roas}
                    onChange={(e) => setSettings({ ...settings, target_roas: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 목표 순위 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">목표 순위</label>
                  <input
                    type="number"
                    value={settings.target_position}
                    onChange={(e) => setSettings({ ...settings, target_position: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 최대 변경폭 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">최대 입찰 변경폭 (%)</label>
                  <input
                    type="number"
                    value={settings.max_bid_change_ratio * 100}
                    onChange={(e) => setSettings({ ...settings, max_bid_change_ratio: Number(e.target.value) / 100 })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 최소 입찰가 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">최소 입찰가 (원)</label>
                  <input
                    type="number"
                    value={settings.min_bid}
                    onChange={(e) => setSettings({ ...settings, min_bid: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 최대 입찰가 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">최대 입찰가 (원)</label>
                  <input
                    type="number"
                    value={settings.max_bid}
                    onChange={(e) => setSettings({ ...settings, max_bid: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 최소 CTR */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">최소 CTR (제외 기준)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.min_ctr}
                    onChange={(e) => setSettings({ ...settings, min_ctr: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 전환없이 최대 비용 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">전환 없이 최대 비용 (원)</label>
                  <input
                    type="number"
                    value={settings.max_cost_no_conv}
                    onChange={(e) => setSettings({ ...settings, max_cost_no_conv: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 최적화 주기 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">최적화 주기 (초)</label>
                  <input
                    type="number"
                    value={settings.optimization_interval}
                    onChange={(e) => setSettings({ ...settings, optimization_interval: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 평가 기간 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">평가 기간 (일)</label>
                  <input
                    type="number"
                    value={settings.evaluation_days}
                    onChange={(e) => setSettings({ ...settings, evaluation_days: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 블랙리스트 키워드 */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">제외할 키워드 패턴 (쉼표 구분)</label>
                <input
                  type="text"
                  value={blacklistInput}
                  onChange={(e) => setBlacklistInput(e.target.value)}
                  placeholder="무료, 공짜, 저렴"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 핵심 키워드 */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">핵심 키워드 (쉼표 구분)</label>
                <input
                  type="text"
                  value={coreTermsInput}
                  onChange={(e) => setCoreTermsInput(e.target.value)}
                  placeholder="브랜드명, 핵심제품"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={saveSettings}
                disabled={isLoading}
                className="mt-6 flex items-center justify-center gap-2 w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                설정 저장
              </button>
            </motion.div>
          </div>
        )}

        {/* 로그 탭 */}
        {activeTab === 'logs' && (
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">최적화 로그</h3>
                <button
                  onClick={loadLogs}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {logs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  로그가 없습니다
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {logs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        log.log_type === 'optimization_start' ? 'bg-green-100' :
                        log.log_type === 'optimization_stop' ? 'bg-red-100' :
                        log.log_type === 'keyword_discovery' ? 'bg-purple-100' :
                        log.log_type === 'keyword_evaluation' ? 'bg-orange-100' :
                        'bg-blue-100'
                      }`}>
                        {log.log_type === 'optimization_start' ? <Play className="w-4 h-4 text-green-600" /> :
                         log.log_type === 'optimization_stop' ? <Pause className="w-4 h-4 text-red-600" /> :
                         log.log_type === 'keyword_discovery' ? <Sparkles className="w-4 h-4 text-purple-600" /> :
                         log.log_type === 'keyword_evaluation' ? <Filter className="w-4 h-4 text-orange-600" /> :
                         <Activity className="w-4 h-4 text-blue-600" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{log.message}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(log.created_at).toLocaleString('ko-KR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </main>

      {/* 튜토리얼 */}
      <Tutorial
        steps={adOptimizerTutorialSteps}
        tutorialKey="ad-optimizer"
        onComplete={() => toast.success('광고 최적화 튜토리얼을 완료했습니다!')}
      />
    </div>
  )
}
