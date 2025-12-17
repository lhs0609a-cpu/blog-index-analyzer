'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, Settings, Play, Pause, RefreshCw, Search,
  Plus, Trash2, RotateCcw, Download, Filter, Clock,
  Target, DollarSign, MousePointer, Eye, ShoppingCart,
  AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp,
  Zap, BarChart3, PieChart, Activity, ArrowUpRight, ArrowDownRight,
  Loader2, Save, Bell, History, Sparkles
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'

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
}

export default function AdOptimizerPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'dashboard' | 'keywords' | 'discover' | 'excluded' | 'settings' | 'logs'>('dashboard')
  const [isLoading, setIsLoading] = useState(false)
  const userId = user?.id || 1 // 인증된 사용자 ID 사용, 기본값 1

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
    core_terms: []
  })
  const [blacklistInput, setBlacklistInput] = useState('')
  const [coreTermsInput, setCoreTermsInput] = useState('')

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

  // 초기 로드
  useEffect(() => {
    loadDashboard()
    loadSettings()
  }, [loadDashboard, loadSettings])

  // 탭 변경 시 데이터 로드
  useEffect(() => {
    if (activeTab === 'excluded') loadExcludedKeywords()
    if (activeTab === 'logs') loadLogs()
  }, [activeTab, loadExcludedKeywords, loadLogs])

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
        core_terms: coreTermsInput.split(',').map(k => k.trim()).filter(k => k)
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
            { id: 'dashboard', label: '대시보드', icon: BarChart3 },
            { id: 'keywords', label: '키워드 관리', icon: Search },
            { id: 'discover', label: '키워드 발굴', icon: Sparkles },
            { id: 'excluded', label: '제외 키워드', icon: XCircle },
            { id: 'settings', label: '설정', icon: Settings },
            { id: 'logs', label: '로그', icon: History }
          ].map(tab => (
            <button
              key={tab.id}
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-6 shadow-sm"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-4">연관 키워드 발굴</h3>
              <p className="text-gray-600 mb-6">
                시드 키워드를 입력하면 관련성 높은 키워드를 자동으로 발굴합니다.
              </p>

              <div className="flex gap-3 mb-6">
                <input
                  type="text"
                  value={seedKeywords}
                  onChange={(e) => setSeedKeywords(e.target.value)}
                  placeholder="시드 키워드 입력 (쉼표로 구분)"
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
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
                  발굴하기
                </button>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">입찰 전략</label>
                  <select
                    value={settings.strategy}
                    onChange={(e) => setSettings({ ...settings, strategy: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="balanced">균형 (Balanced)</option>
                    <option value="target_roas">목표 ROAS</option>
                    <option value="target_position">목표 순위</option>
                    <option value="maximize_clicks">클릭 최대화</option>
                    <option value="minimize_cpc">CPC 최소화</option>
                  </select>
                </div>

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
    </div>
  )
}
