'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Clock, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Zap, BarChart3, DollarSign, Calendar, RefreshCw, Settings,
  ChevronDown, ChevronRight, Play, Pause, Target, Activity,
  ArrowUpRight, ArrowDownRight, Minus, Info, Bell, Lightbulb
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import { adGet, adPost } from '@/lib/api/adFetch'
import {
  PlatformSupportBanner,
  FEATURE_PLATFORMS,
  FEATURE_DESCRIPTIONS,
} from "@/components/ad-optimizer/PlatformSupportBanner"
import { ValuePropositionCompact } from "@/components/ad-optimizer/ValueProposition"

// 페이싱 상태별 스타일
const STATUS_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  on_track: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  underspending: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: TrendingDown },
  overspending: { bg: 'bg-orange-100', text: 'text-orange-700', icon: TrendingUp },
  depleted: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
  paused: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Pause }
}

// 심각도별 스타일
const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  critical: { bg: 'bg-red-50', border: 'border-red-300', icon: '🚨' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-300', icon: '⚠️' },
  info: { bg: 'bg-blue-50', border: 'border-blue-300', icon: 'ℹ️' }
}

// 플랫폼 아이콘
const PLATFORM_ICONS: Record<string, string> = {
  naver: '🟢',
  google: '🔵',
  meta: '🔷',
  kakao: '🟡'
}

interface Campaign {
  campaign_id: string
  campaign_name: string
  platform: string
  daily_budget: number
  monthly_budget: number
  spent_today: number
  spent_this_month: number
  remaining_today: number
  pacing_strategy: string
  pacing_status: string
  budget_utilization: number
  burn_rate_per_hour: number
  projected_eod_spend: number
}

interface PacingAlert {
  id: number
  campaign_id: string
  campaign_name: string
  platform: string
  alert_type: string
  severity: string
  message: string
  recommended_action: string
  created_at: string
}

interface Recommendation {
  id: number
  campaign_id: string
  recommendation_type: string
  title: string
  description: string
  current_strategy: string
  recommended_strategy: string
  expected_improvement: string
  priority: number
}

interface Strategy {
  id: string
  name: string
  description: string
  best_for: string
}

export default function BudgetPacingPage() {
  const { user, isAuthenticated } = useAuthStore()
  const userId = user?.id

  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'alerts' | 'strategies'>('overview')
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  // 데이터 상태
  const [summary, setSummary] = useState<any>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [alerts, setAlerts] = useState<PacingAlert[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [hourlyDistribution, setHourlyDistribution] = useState<any[]>([])

  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const [selectedStrategy, setSelectedStrategy] = useState('standard')

  // 인증 가드
  useEffect(() => {
    if (!isAuthenticated && !user) {
      window.location.href = '/login'
    }
  }, [isAuthenticated, user])

  // 데이터 로드 + 30초 자동 갱신
  useEffect(() => {
    loadAllData()
    const interval = setInterval(() => { loadAllData() }, 30000) // 30초마다 자동 갱신
    return () => clearInterval(interval)
  }, [userId])

  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadSummary(),
        loadCampaigns(),
        loadAlerts(),
        loadRecommendations(),
        loadStrategies(),
        loadHourlyDistribution()
      ])
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    try {
      const data = await adGet('/api/ads/budget-pacing/summary', { userId, showToast: false })
      setSummary(data)
    } catch (error) {
      console.error('Failed to load summary:', error)
    }
  }

  const loadCampaigns = async () => {
    try {
      const data = await adGet('/api/ads/budget-pacing/campaigns', { userId, showToast: false })
      setCampaigns(data.campaigns || [])
    } catch (error) {
      console.error('Failed to load campaigns:', error)
    }
  }

  const loadAlerts = async () => {
    try {
      const data = await adGet('/api/ads/budget-pacing/alerts', { userId, showToast: false })
      setAlerts(data.alerts || [])
    } catch (error) {
      console.error('Failed to load alerts:', error)
    }
  }

  const loadRecommendations = async () => {
    try {
      const data = await adGet('/api/ads/budget-pacing/recommendations', { userId, showToast: false })
      setRecommendations(data.recommendations || [])
    } catch (error) {
      console.error('Failed to load recommendations:', error)
    }
  }

  const loadStrategies = async () => {
    try {
      const data = await adGet('/api/ads/budget-pacing/strategies', { showToast: false })
      setStrategies(data.strategies || [])
    } catch (error) {
      console.error('Failed to load strategies:', error)
    }
  }

  const loadHourlyDistribution = async () => {
    try {
      const data = await adGet(`/api/ads/budget-pacing/hourly-distribution?strategy=${selectedStrategy}`, { userId, showToast: false })
      setHourlyDistribution(data.distribution || [])
    } catch (error) {
      console.error('Failed to load hourly distribution:', error)
    }
  }

  const runAnalysis = async () => {
    setAnalyzing(true)
    try {
      const data = await adPost('/api/ads/budget-pacing/analyze', {}, { userId })
      toast.success(`${data.analyzed_count}개 캠페인 분석 완료`)
      await loadAllData()
    } catch (error) {
      // adFetch already shows a toast on error
    } finally {
      setAnalyzing(false)
    }
  }

  const resolveAlert = async (alertId: number) => {
    try {
      await adPost(`/api/ads/budget-pacing/alerts/${alertId}/resolve`, undefined, { userId })
      toast.success('알림이 해결 처리되었습니다')
      loadAlerts()
    } catch (error) {
      // adFetch already shows a toast on error
    }
  }

  const applyRecommendation = async (recId: number) => {
    try {
      await adPost(`/api/ads/budget-pacing/recommendations/${recId}/apply`, undefined, { userId })
      toast.success('권장사항이 적용되었습니다')
      loadRecommendations()
    } catch (error) {
      // adFetch already shows a toast on error
    }
  }

  const changeStrategy = async (campaignId: string, newStrategy: string) => {
    try {
      await adPost('/api/ads/budget-pacing/strategy/change', { campaign_id: campaignId, new_strategy: newStrategy }, { userId })
      toast.success('전략이 변경되었습니다')
      loadCampaigns()
    } catch (error) {
      // adFetch already shows a toast on error
    }
  }

  // 현재 시간 기준 진행률 계산
  const currentHour = new Date().getHours()
  const expectedProgress = ((currentHour + 1) / 24) * 100

  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">로그인 확인 중...</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-cyan-500 mx-auto mb-4" />
          <p className="text-gray-600">데이터 로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-cyan-600 to-teal-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-8 h-8" />
                <h1 className="text-3xl font-bold">예산 페이싱</h1>
              </div>
              <p className="text-cyan-100">
                시간대별 예산 분배 최적화 및 소진 속도 모니터링
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/ad-optimizer/unified"
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition"
              >
                ← 대시보드
              </Link>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="flex items-center gap-2 px-4 py-2 bg-white text-cyan-600 rounded-lg hover:bg-cyan-50 transition disabled:opacity-50"
              >
                {analyzing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {analyzing ? '분석 중...' : '분석 실행'}
              </button>
            </div>
          </div>

          {/* 시간 진행률 바 */}
          <div className="mt-6 bg-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">오늘의 진행률</span>
              <span className="text-sm">{currentHour + 1}시간 경과 / 24시간</span>
            </div>
            <div className="h-3 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${expectedProgress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-cyan-200">
              <span>00:00</span>
              <span>현재 {currentHour}:00</span>
              <span>24:00</span>
            </div>
          </div>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {[
              { id: 'overview', label: '개요', icon: BarChart3 },
              { id: 'campaigns', label: '캠페인', icon: Target },
              { id: 'alerts', label: '알림', icon: Bell, count: alerts.length },
              { id: 'strategies', label: '전략 가이드', icon: Lightbulb }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-cyan-500 text-cyan-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Value Proposition */}
        <ValuePropositionCompact type="pacing" />

        {/* Platform Support Banner */}
        <PlatformSupportBanner
          title={FEATURE_DESCRIPTIONS.budgetPacing.title}
          description={FEATURE_DESCRIPTIONS.budgetPacing.description}
          platforms={FEATURE_PLATFORMS.budgetPacing}
          className="mb-6"
        />

        {/* 개요 탭 */}
        {activeTab === 'overview' && summary && (
          <div className="space-y-6">
            {/* 요약 카드들 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-cyan-100 rounded-lg">
                    <Target className="w-5 h-5 text-cyan-600" />
                  </div>
                  <span className="text-gray-500 text-sm">총 캠페인</span>
                </div>
                <p className="text-3xl font-bold">{summary.summary?.total_campaigns || 0}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-gray-500 text-sm">일일 예산</span>
                </div>
                <p className="text-3xl font-bold">
                  ₩{(summary.summary?.total_daily_budget || 0).toLocaleString()}
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Activity className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-gray-500 text-sm">오늘 지출</span>
                </div>
                <p className="text-3xl font-bold">
                  ₩{(summary.summary?.total_spent_today || 0).toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  사용률 {(summary.summary?.overall_utilization || 0).toFixed(1)}%
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-gray-500 text-sm">정상 비율</span>
                </div>
                <p className="text-3xl font-bold">
                  {(summary.summary?.on_track_rate || 0).toFixed(0)}%
                </p>
              </motion.div>
            </div>

            {/* 상태별 분포 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold mb-4">페이싱 상태 분포</h3>
                <div className="space-y-3">
                  {Object.entries(summary.summary?.status_distribution || {}).map(([status, count]) => {
                    const style = STATUS_STYLES[status] || STATUS_STYLES.on_track
                    const Icon = style.icon
                    const total = summary.summary?.total_campaigns || 1
                    const percentage = ((count as number) / total) * 100

                    return (
                      <div key={status} className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${style.bg}`}>
                          <Icon className={`w-4 h-4 ${style.text}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium capitalize">
                              {status === 'on_track' ? '정상' :
                               status === 'underspending' ? '미소진' :
                               status === 'overspending' ? '과소진' :
                               status === 'depleted' ? '소진완료' : '일시중지'}
                            </span>
                            <span className="text-sm text-gray-500">{count as number}개</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${style.bg} rounded-full`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold mb-4">알림 현황</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <p className="text-2xl font-bold text-red-600">
                      {summary.summary?.alerts_count?.critical || 0}
                    </p>
                    <p className="text-sm text-red-600">긴급</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <p className="text-2xl font-bold text-yellow-600">
                      {summary.summary?.alerts_count?.warning || 0}
                    </p>
                    <p className="text-sm text-yellow-600">경고</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">
                      {summary.summary?.alerts_count?.info || 0}
                    </p>
                    <p className="text-sm text-blue-600">정보</p>
                  </div>
                </div>

                {/* 권장사항 요약 */}
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">미적용 권장사항</span>
                    <span className="font-semibold">{recommendations.length}개</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 시간대별 예산 분포 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">시간대별 예산 분배 ({selectedStrategy})</h3>
                <select
                  value={selectedStrategy}
                  onChange={(e) => {
                    setSelectedStrategy(e.target.value)
                    loadHourlyDistribution()
                  }}
                  className="px-3 py-1.5 border rounded-lg text-sm"
                >
                  <option value="standard">표준</option>
                  <option value="accelerated">가속</option>
                  <option value="front_loaded">전반 집중</option>
                  <option value="back_loaded">후반 집중</option>
                </select>
              </div>
              <div className="flex items-end gap-1 h-40">
                {hourlyDistribution.map((item) => (
                  <div
                    key={item.hour}
                    className="flex-1 group relative"
                  >
                    <div
                      className={`w-full rounded-t transition-all ${
                        item.hour === currentHour
                          ? 'bg-cyan-500'
                          : item.hour < currentHour
                          ? 'bg-cyan-300'
                          : 'bg-gray-200'
                      }`}
                      style={{ height: `${item.percentage * 2}%` }}
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 hidden group-hover:block">
                      <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                        {item.hour_label}: {item.percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00</span>
              </div>
            </div>
          </div>
        )}

        {/* 캠페인 탭 */}
        {activeTab === 'campaigns' && (
          <div className="space-y-4">
            {campaigns.map((campaign) => {
              const statusStyle = STATUS_STYLES[campaign.pacing_status] || STATUS_STYLES.on_track
              const StatusIcon = statusStyle.icon
              const isExpanded = expandedCampaign === campaign.campaign_id

              return (
                <motion.div
                  key={campaign.campaign_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl shadow-sm overflow-hidden"
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedCampaign(isExpanded ? null : campaign.campaign_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{PLATFORM_ICONS[campaign.platform] || '📊'}</span>
                        <div>
                          <h3 className="font-semibold">{campaign.campaign_name}</h3>
                          <p className="text-sm text-gray-500">{campaign.platform}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${statusStyle.bg}`}>
                          <StatusIcon className={`w-4 h-4 ${statusStyle.text}`} />
                          <span className={`text-sm font-medium ${statusStyle.text}`}>
                            {campaign.pacing_status === 'on_track' ? '정상' :
                             campaign.pacing_status === 'underspending' ? '미소진' :
                             campaign.pacing_status === 'overspending' ? '과소진' :
                             campaign.pacing_status === 'depleted' ? '소진완료' : '일시중지'}
                          </span>
                        </div>
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </div>
                    </div>

                    {/* 예산 진행률 바 */}
                    <div className="mt-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span>₩{campaign.spent_today.toLocaleString()} / ₩{campaign.daily_budget.toLocaleString()}</span>
                        <span>{campaign.budget_utilization.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                        {/* 예상 진행률 마커 */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-gray-400 z-10"
                          style={{ left: `${expectedProgress}%` }}
                        />
                        {/* 실제 지출 바 */}
                        <div
                          className={`h-full rounded-full transition-all ${
                            campaign.pacing_status === 'on_track' ? 'bg-green-500' :
                            campaign.pacing_status === 'underspending' ? 'bg-yellow-500' :
                            campaign.pacing_status === 'overspending' ? 'bg-orange-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(campaign.budget_utilization, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>잔여: ₩{campaign.remaining_today.toLocaleString()}</span>
                        <span>예상 마감: ₩{campaign.projected_eod_spend.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* 확장 상세 */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      className="border-t bg-gray-50 p-4"
                    >
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs text-gray-500">시간당 소진율</p>
                          <p className="font-semibold">₩{campaign.burn_rate_per_hour.toLocaleString()}/h</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs text-gray-500">월간 예산</p>
                          <p className="font-semibold">₩{campaign.monthly_budget.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs text-gray-500">월간 지출</p>
                          <p className="font-semibold">₩{campaign.spent_this_month.toLocaleString()}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs text-gray-500">현재 전략</p>
                          <p className="font-semibold capitalize">{campaign.pacing_strategy}</p>
                        </div>
                      </div>

                      {/* 전략 변경 */}
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">전략 변경:</span>
                        <select
                          value={campaign.pacing_strategy}
                          onChange={(e) => changeStrategy(campaign.campaign_id, e.target.value)}
                          className="px-3 py-1.5 border rounded-lg text-sm"
                        >
                          <option value="standard">표준</option>
                          <option value="accelerated">가속</option>
                          <option value="front_loaded">전반 집중</option>
                          <option value="back_loaded">후반 집중</option>
                          <option value="performance">성과 기반</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        {/* 알림 탭 */}
        {activeTab === 'alerts' && (
          <div className="space-y-6">
            {/* 알림 목록 */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-4 border-b">
                <h3 className="font-semibold">활성 알림</h3>
              </div>
              <div className="divide-y">
                {alerts.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <p>활성 알림이 없습니다</p>
                  </div>
                ) : (
                  alerts.map((alert) => {
                    const severityStyle = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info

                    return (
                      <div
                        key={alert.id}
                        className={`p-4 ${severityStyle.bg} border-l-4 ${severityStyle.border}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <span className="text-xl">{severityStyle.icon}</span>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{alert.campaign_name}</span>
                                <span className="text-xs text-gray-500">
                                  {PLATFORM_ICONS[alert.platform]} {alert.platform}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700">{alert.message}</p>
                              <p className="text-sm text-blue-600 mt-1">
                                💡 {alert.recommended_action}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => resolveAlert(alert.id)}
                            className="text-sm text-gray-500 hover:text-gray-700"
                          >
                            해결
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* 권장사항 */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-4 border-b">
                <h3 className="font-semibold">최적화 권장사항</h3>
              </div>
              <div className="divide-y">
                {recommendations.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Lightbulb className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p>권장사항이 없습니다</p>
                  </div>
                ) : (
                  recommendations.map((rec) => (
                    <div key={rec.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              rec.priority === 1 ? 'bg-red-100 text-red-700' :
                              rec.priority === 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              우선순위 {rec.priority}
                            </span>
                            <span className="text-sm text-gray-500">{rec.recommendation_type}</span>
                          </div>
                          <h4 className="font-medium">{rec.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                          <p className="text-sm text-green-600 mt-1">
                            ✨ {rec.expected_improvement}
                          </p>
                        </div>
                        <button
                          onClick={() => applyRecommendation(rec.id)}
                          className="px-3 py-1.5 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600"
                        >
                          적용
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 전략 가이드 탭 */}
        {activeTab === 'strategies' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {strategies.map((strategy) => (
              <motion.div
                key={strategy.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl p-6 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${
                    strategy.id === 'standard' ? 'bg-blue-100' :
                    strategy.id === 'accelerated' ? 'bg-orange-100' :
                    strategy.id === 'front_loaded' ? 'bg-yellow-100' :
                    strategy.id === 'back_loaded' ? 'bg-purple-100' :
                    strategy.id === 'performance' ? 'bg-green-100' :
                    'bg-gray-100'
                  }`}>
                    {strategy.id === 'standard' ? <Minus className="w-6 h-6 text-blue-600" /> :
                     strategy.id === 'accelerated' ? <Zap className="w-6 h-6 text-orange-600" /> :
                     strategy.id === 'front_loaded' ? <ArrowUpRight className="w-6 h-6 text-yellow-600" /> :
                     strategy.id === 'back_loaded' ? <ArrowDownRight className="w-6 h-6 text-purple-600" /> :
                     strategy.id === 'performance' ? <TrendingUp className="w-6 h-6 text-green-600" /> :
                     <Settings className="w-6 h-6 text-gray-600" />}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{strategy.name}</h3>
                    <p className="text-gray-600 mt-1">{strategy.description}</p>
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm">
                        <span className="font-medium">추천:</span> {strategy.best_for}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
