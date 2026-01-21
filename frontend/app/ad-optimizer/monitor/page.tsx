'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, TrendingUp, TrendingDown, Clock, Zap, Brain,
  AlertCircle, CheckCircle, Info, ChevronRight, ChevronDown,
  RefreshCw, Eye, BarChart3, DollarSign, Target, Gauge,
  ArrowUpRight, ArrowDownRight, Minus, Filter, Play, Pause
} from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr'

interface OptimizationAction {
  id: number
  platform: string
  action_type: string
  target_name: string
  old_value: string
  new_value: string
  reason: string
  created_at: string
  description?: string
}

interface Strategy {
  name: string
  description: string
  how_it_works: string[]
  best_for: string
  settings: string[]
}

interface PerformanceChange {
  current_period: {
    impressions: number
    clicks: number
    cost: number
    conversions: number
    revenue: number
  }
  previous_period: {
    impressions: number
    clicks: number
    cost: number
    conversions: number
    revenue: number
  }
  changes: {
    impressions: number
    clicks: number
    cost: number
    conversions: number
    revenue: number
  }
}

export default function OptimizationMonitorPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'live' | 'strategies' | 'history' | 'performance'>('live')
  const [liveActions, setLiveActions] = useState<OptimizationAction[]>([])
  const [strategies, setStrategies] = useState<Record<string, Strategy>>({})
  const [exclusionRules, setExclusionRules] = useState<Record<string, any>>({})
  const [performanceChanges, setPerformanceChanges] = useState<Record<string, PerformanceChange>>({})
  const [actionSummary, setActionSummary] = useState<any>(null)
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAutoRefresh, setIsAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // 실시간 피드 로드
  const loadLiveFeed = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/optimization/actions/live?user_id=${user?.id || 1}`)
      if (res.ok) {
        const data = await res.json()
        setLiveActions(data.feed || [])
      }
    } catch (error) {
      console.error('Failed to load live feed:', error)
    }
  }, [user?.id])

  // 전략 정보 로드
  const loadStrategies = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/optimization/strategies`)
      if (res.ok) {
        const data = await res.json()
        setStrategies(data.strategies || {})
        setExclusionRules(data.exclusion_rules || {})
      }
    } catch (error) {
      console.error('Failed to load strategies:', error)
    }
  }, [])

  // 성과 변화 로드
  const loadPerformanceChanges = useCallback(async () => {
    try {
      const platforms = ['naver_searchad', 'google_ads', 'meta_ads']
      const changes: Record<string, PerformanceChange> = {}

      await Promise.all(
        platforms.map(async (platform) => {
          try {
            const res = await fetch(
              `${API_BASE}/api/optimization/performance/comparison?user_id=${user?.id || 1}&platform=${platform}`
            )
            if (res.ok) {
              const data = await res.json()
              if (data.current_period?.cost) {
                changes[platform] = data
              }
            }
          } catch {
            // Skip failed platforms
          }
        })
      )

      setPerformanceChanges(changes)
    } catch (error) {
      console.error('Failed to load performance changes:', error)
    }
  }, [user?.id])

  // 액션 요약 로드
  const loadActionSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/optimization/actions/summary?user_id=${user?.id || 1}&days=7`)
      if (res.ok) {
        const data = await res.json()
        setActionSummary(data)
      }
    } catch (error) {
      console.error('Failed to load action summary:', error)
    }
  }, [user?.id])

  // 전체 데이터 로드
  const loadAllData = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([
      loadLiveFeed(),
      loadStrategies(),
      loadPerformanceChanges(),
      loadActionSummary()
    ])
    setLastRefresh(new Date())
    setIsLoading(false)
  }, [loadLiveFeed, loadStrategies, loadPerformanceChanges, loadActionSummary])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // 자동 새로고침
  useEffect(() => {
    if (!isAutoRefresh) return

    const interval = setInterval(() => {
      loadLiveFeed()
      setLastRefresh(new Date())
    }, 30000) // 30초마다

    return () => clearInterval(interval)
  }, [isAutoRefresh, loadLiveFeed])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(value)
  }

  const formatPercent = (value: number) => {
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  const getChangeIcon = (change: number) => {
    if (change > 0) return <ArrowUpRight className="w-4 h-4 text-green-500" />
    if (change < 0) return <ArrowDownRight className="w-4 h-4 text-red-500" />
    return <Minus className="w-4 h-4 text-gray-400" />
  }

  const platformNames: Record<string, string> = {
    naver_searchad: '네이버 검색광고',
    google_ads: 'Google Ads',
    meta_ads: 'Meta 광고'
  }

  const platformIcons: Record<string, string> = {
    naver_searchad: '🟢',
    google_ads: '🔵',
    meta_ads: '🔷'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* 헤더 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/ad-optimizer/unified" className="text-gray-500 hover:text-gray-700">
                ← 통합 광고
              </Link>
              <div className="w-px h-6 bg-gray-300" />
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">최적화 모니터</h1>
                  <p className="text-xs text-gray-500">실시간 최적화 현황 및 로직 확인</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                  isAutoRefresh
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {isAutoRefresh ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                자동 새로고침 {isAutoRefresh ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={loadAllData}
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <span className="text-xs text-gray-500">
                마지막 업데이트: {lastRefresh.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 요약 카드 */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">총 최적화 액션</p>
                <p className="text-2xl font-bold text-gray-900">
                  {actionSummary?.total_actions || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">활성 일수</p>
                <p className="text-2xl font-bold text-gray-900">
                  {actionSummary?.active_days || 0}일
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <Brain className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">연동 플랫폼</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(performanceChanges).length}개
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                <Target className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">사용 가능 전략</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(strategies).length}개
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'live', label: '실시간 피드', icon: Activity },
            { id: 'strategies', label: '최적화 전략', icon: Brain },
            { id: 'performance', label: '성과 변화', icon: TrendingUp },
            { id: 'history', label: '액션 히스토리', icon: Clock }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <AnimatePresence mode="wait">
          {activeTab === 'live' && (
            <motion.div
              key="live"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid lg:grid-cols-3 gap-6"
            >
              {/* 실시간 피드 */}
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-green-500" />
                    실시간 최적화 피드
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  </h3>
                  <span className="text-xs text-gray-500">최근 1시간</span>
                </div>
                <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                  {liveActions.length === 0 ? (
                    <div className="p-8 text-center">
                      <Activity className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                      <p className="text-gray-500">최근 최적화 액션이 없습니다</p>
                      <p className="text-sm text-gray-400 mt-1">
                        자동 최적화가 활성화되면 여기에 표시됩니다
                      </p>
                    </div>
                  ) : (
                    liveActions.map((action) => (
                      <div
                        key={action.id}
                        className="p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">
                            {platformIcons[action.platform] || '📊'}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-900">
                                {action.target}
                              </span>
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                                {action.action === 'bid_change' ? '입찰가 조정' : action.action}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-1">
                              {action.description || action.change}
                            </p>
                            <p className="text-xs text-gray-400">
                              {action.reason}
                            </p>
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {action.time_ago}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 사이드바: 현재 전략 */}
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white">
                  <div className="flex items-center gap-3 mb-4">
                    <Brain className="w-8 h-8" />
                    <div>
                      <h3 className="font-bold">현재 활성 전략</h3>
                      <p className="text-sm text-white/70">자동 최적화 규칙</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white/10 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Target className="w-4 h-4" />
                        <span className="font-medium text-sm">목표 ROAS</span>
                      </div>
                      <p className="text-2xl font-bold">300%</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <DollarSign className="w-4 h-4" />
                        <span className="font-medium text-sm">목표 CPA</span>
                      </div>
                      <p className="text-2xl font-bold">₩20,000</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Gauge className="w-4 h-4" />
                        <span className="font-medium text-sm">최대 변경폭</span>
                      </div>
                      <p className="text-2xl font-bold">±20%</p>
                    </div>
                  </div>
                </div>

                {/* 플랫폼별 상태 */}
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <h3 className="font-bold text-gray-900 mb-4">플랫폼별 상태</h3>
                  <div className="space-y-3">
                    {Object.entries(performanceChanges).map(([platform, data]) => (
                      <div
                        key={platform}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                      >
                        <div className="flex items-center gap-2">
                          <span>{platformIcons[platform]}</span>
                          <span className="font-medium text-gray-900 text-sm">
                            {platformNames[platform]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          {getChangeIcon(data.changes.revenue)}
                          <span className={
                            data.changes.revenue > 0 ? 'text-green-600' :
                            data.changes.revenue < 0 ? 'text-red-600' : 'text-gray-500'
                          }>
                            {formatPercent(data.changes.revenue)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'strategies' && (
            <motion.div
              key="strategies"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(strategies).map(([id, strategy]) => (
                  <div
                    key={id}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedStrategy(selectedStrategy === id ? null : id)}
                  >
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-gray-900">{strategy.name}</h3>
                        <ChevronDown
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            selectedStrategy === id ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{strategy.description}</p>
                      <div className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full inline-block">
                        {strategy.best_for}
                      </div>
                    </div>
                    <AnimatePresence>
                      {selectedStrategy === id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-gray-100"
                        >
                          <div className="p-5 bg-gray-50">
                            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                              <Info className="w-4 h-4 text-blue-500" />
                              작동 방식
                            </h4>
                            <ul className="space-y-2">
                              {strategy.how_it_works.map((step, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                                    {idx + 1}
                                  </span>
                                  {step}
                                </li>
                              ))}
                            </ul>
                            {strategy.settings.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-gray-200">
                                <h4 className="font-medium text-gray-900 mb-2">설정 항목</h4>
                                <div className="flex flex-wrap gap-2">
                                  {strategy.settings.map((setting, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 bg-white text-gray-600 text-xs rounded border"
                                    >
                                      {setting}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {/* 키워드 제외 규칙 */}
              <div className="mt-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">자동 키워드 제외 규칙</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  {Object.entries(exclusionRules).map(([id, rule]: [string, any]) => (
                    <div key={id} className="bg-white rounded-2xl shadow-sm p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-5 h-5 text-orange-500" />
                        <h3 className="font-bold text-gray-900">{rule.name}</h3>
                      </div>
                      <div className="space-y-2 text-sm">
                        <p className="text-gray-600">
                          <span className="font-medium">조건:</span> {rule.rule}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-medium">조치:</span> {rule.action}
                        </p>
                        <p className="text-gray-500 text-xs">{rule.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'performance' && (
            <motion.div
              key="performance"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {Object.keys(performanceChanges).length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">연동된 플랫폼이 없습니다</p>
                  <Link
                    href="/ad-optimizer/unified"
                    className="inline-block mt-4 text-indigo-600 hover:text-indigo-700"
                  >
                    플랫폼 연동하기 →
                  </Link>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(performanceChanges).map(([platform, data]) => (
                    <div key={platform} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                        <span className="text-3xl">{platformIcons[platform]}</span>
                        <div>
                          <h3 className="font-bold text-gray-900">{platformNames[platform]}</h3>
                          <p className="text-sm text-gray-500">최근 7일 vs 이전 7일 비교</p>
                        </div>
                      </div>
                      <div className="p-5">
                        <div className="grid grid-cols-5 gap-4">
                          {[
                            { label: '노출', key: 'impressions', format: (v: number) => v.toLocaleString() },
                            { label: '클릭', key: 'clicks', format: (v: number) => v.toLocaleString() },
                            { label: '비용', key: 'cost', format: formatCurrency },
                            { label: '전환', key: 'conversions', format: (v: number) => v.toLocaleString() },
                            { label: '매출', key: 'revenue', format: formatCurrency }
                          ].map((metric) => (
                            <div key={metric.key} className="text-center">
                              <p className="text-sm text-gray-500 mb-1">{metric.label}</p>
                              <p className="text-xl font-bold text-gray-900">
                                {metric.format(data.current_period[metric.key as keyof typeof data.current_period] || 0)}
                              </p>
                              <div className="flex items-center justify-center gap-1 mt-1">
                                {getChangeIcon(data.changes[metric.key as keyof typeof data.changes])}
                                <span className={`text-sm ${
                                  data.changes[metric.key as keyof typeof data.changes] > 0 ? 'text-green-600' :
                                  data.changes[metric.key as keyof typeof data.changes] < 0 ? 'text-red-600' : 'text-gray-500'
                                }`}>
                                  {formatPercent(data.changes[metric.key as keyof typeof data.changes] || 0)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-2xl shadow-sm"
            >
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">전체 액션 히스토리</h3>
              </div>
              <div className="p-4">
                {actionSummary?.by_platform && Object.keys(actionSummary.by_platform).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(actionSummary.by_platform).map(([platform, actions]: [string, any]) => (
                      <div key={platform} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xl">{platformIcons[platform]}</span>
                          <span className="font-medium text-gray-900">{platformNames[platform] || platform}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          {Object.entries(actions).map(([actionType, count]: [string, any]) => (
                            <div key={actionType} className="bg-gray-50 rounded-lg p-3 text-center">
                              <p className="text-2xl font-bold text-gray-900">{count}</p>
                              <p className="text-xs text-gray-500">{actionType}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">아직 최적화 액션이 없습니다</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
