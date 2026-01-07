'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Target, TrendingUp, TrendingDown, Users, MousePointer, ShoppingCart,
  DollarSign, Percent, Eye, BarChart3, RefreshCw, Settings,
  ChevronDown, ChevronRight, Zap, ArrowRight, Info, Lightbulb,
  Filter, PieChart, Activity, Award, AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import {
  PlatformSupportBanner,
  FEATURE_PLATFORMS,
  FEATURE_DESCRIPTIONS,
  PLATFORM_STYLES,
  PlatformBadge,
} from "@/components/ad-optimizer/PlatformSupportBanner"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr'

// 퍼널 단계별 스타일
const STAGE_STYLES: Record<string, { bg: string; text: string; border: string; icon: any; gradient: string }> = {
  tofu: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
    icon: Eye,
    gradient: 'from-blue-500 to-indigo-500'
  },
  mofu: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-300',
    icon: MousePointer,
    gradient: 'from-yellow-500 to-orange-500'
  },
  bofu: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
    icon: ShoppingCart,
    gradient: 'from-green-500 to-emerald-500'
  }
}

// 플랫폼 아이콘 - PLATFORM_STYLES에서 가져옴
const getPlatformIcon = (platform: string) => {
  const style = PLATFORM_STYLES[platform];
  return style?.icon || '📊';
};

interface Campaign {
  campaign_id: string
  campaign_name: string
  platform: string
  objective: string
  funnel_stage: string
  bidding_strategy: string
  daily_budget: number
  impressions: number
  reach: number
  clicks: number
  conversions: number
  spend: number
  revenue: number
  cpm: number
  cpc: number
  ctr: number
  cpa: number
  roas: number
  conversion_rate: number
}

interface StageMetrics {
  campaign_count: number
  total_budget: number
  total_spend: number
  total_impressions: number
  total_clicks: number
  total_conversions: number
  total_revenue: number
  avg_cpm: number
  avg_cpc: number
  avg_cpa: number
  avg_roas: number
}

interface FunnelFlow {
  tofu_reach: number
  mofu_clicks: number
  bofu_conversions: number
  tofu_to_mofu_rate: number
  mofu_to_bofu_rate: number
  overall_conversion_rate: number
}

interface Recommendation {
  id: number
  campaign_id: string
  campaign_name: string
  funnel_stage: string
  current_strategy: string
  recommended_strategy: string
  reason: string
  expected_improvement: string
  priority: number
}

interface AllocationStrategy {
  id: string
  name: string
  description: string
  split: { tofu: number; mofu: number; bofu: number }
}

export default function FunnelBiddingPage() {
  const { user } = useAuthStore()
  const userId = user?.id || 1

  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'allocation' | 'guide'>('overview')
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  // 데이터 상태
  const [summary, setSummary] = useState<any>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stageMetrics, setStageMetrics] = useState<Record<string, StageMetrics>>({})
  const [funnelFlow, setFunnelFlow] = useState<FunnelFlow | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [allocation, setAllocation] = useState<any>(null)
  const [allocationStrategies, setAllocationStrategies] = useState<AllocationStrategy[]>([])

  const [selectedStage, setSelectedStage] = useState<string | null>(null)
  const [selectedStrategy, setSelectedStrategy] = useState('balanced')
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)

  // 데이터 로드
  useEffect(() => {
    loadAllData()
  }, [userId])

  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadSummary(),
        loadCampaigns(),
        loadStageMetrics(),
        loadFunnelFlow(),
        loadRecommendations(),
        loadAllocation(),
        loadAllocationStrategies()
      ])
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/funnel-bidding/summary?user_id=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setSummary(data.summary)
      }
    } catch (error) {
      console.error('Failed to load summary:', error)
    }
  }

  const loadCampaigns = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/funnel-bidding/campaigns?user_id=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns || [])
      }
    } catch (error) {
      console.error('Failed to load campaigns:', error)
    }
  }

  const loadStageMetrics = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/funnel-bidding/stage-metrics?user_id=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setStageMetrics(data.stage_metrics || {})
      }
    } catch (error) {
      console.error('Failed to load stage metrics:', error)
    }
  }

  const loadFunnelFlow = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/funnel-bidding/funnel-flow?user_id=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setFunnelFlow(data.funnel_flow)
      }
    } catch (error) {
      console.error('Failed to load funnel flow:', error)
    }
  }

  const loadRecommendations = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/funnel-bidding/recommendations?user_id=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setRecommendations(data.recommendations || [])
      }
    } catch (error) {
      console.error('Failed to load recommendations:', error)
    }
  }

  const loadAllocation = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/funnel-bidding/budget-allocation?user_id=${userId}&strategy=${selectedStrategy}`)
      if (res.ok) {
        const data = await res.json()
        setAllocation(data.allocation)
      }
    } catch (error) {
      console.error('Failed to load allocation:', error)
    }
  }

  const loadAllocationStrategies = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/funnel-bidding/allocation-strategies`)
      if (res.ok) {
        const data = await res.json()
        setAllocationStrategies(data.strategies || [])
      }
    } catch (error) {
      console.error('Failed to load strategies:', error)
    }
  }

  const runAnalysis = async () => {
    setAnalyzing(true)
    try {
      const res = await fetch(`${API_BASE}/api/ads/funnel-bidding/analyze?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      if (res.ok) {
        const data = await res.json()
        toast.success(`${data.analyzed_count}개 캠페인 분석 완료`)
        await loadAllData()
      }
    } catch (error) {
      toast.error('분석 실패')
    } finally {
      setAnalyzing(false)
    }
  }

  const applyAllocation = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/funnel-bidding/budget-allocation/apply?user_id=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: selectedStrategy })
      })

      if (res.ok) {
        toast.success('예산 배분이 적용되었습니다')
      }
    } catch (error) {
      toast.error('적용 실패')
    }
  }

  const applyRecommendation = async (recId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/funnel-bidding/recommendations/${recId}/apply?user_id=${userId}`, {
        method: 'POST'
      })
      if (res.ok) {
        toast.success('권장사항이 적용되었습니다')
        loadRecommendations()
      }
    } catch (error) {
      toast.error('적용 실패')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-4" />
          <p className="text-gray-600">데이터 로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Target className="w-8 h-8" />
                <h1 className="text-3xl font-bold">퍼널 기반 입찰</h1>
              </div>
              <p className="text-indigo-100">
                TOFU/MOFU/BOFU 마케팅 퍼널 단계별 입찰 전략 최적화
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
                className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg hover:bg-indigo-50 transition disabled:opacity-50"
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

          {/* 퍼널 시각화 */}
          {funnelFlow && (
            <div className="mt-6 bg-white/10 rounded-lg p-6">
              <div className="flex items-center justify-between">
                {/* TOFU */}
                <div className="flex-1 text-center">
                  <div className="w-32 h-20 mx-auto bg-blue-500/30 rounded-t-full flex items-center justify-center">
                    <div>
                      <Eye className="w-6 h-6 mx-auto mb-1" />
                      <p className="text-sm font-medium">TOFU</p>
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold">{funnelFlow.tofu_reach.toLocaleString()}</p>
                  <p className="text-xs text-indigo-200">도달</p>
                </div>

                {/* Arrow 1 */}
                <div className="flex flex-col items-center px-4">
                  <ArrowRight className="w-8 h-8 text-white/60" />
                  <p className="text-sm mt-1">{funnelFlow.tofu_to_mofu_rate.toFixed(1)}%</p>
                </div>

                {/* MOFU */}
                <div className="flex-1 text-center">
                  <div className="w-24 h-16 mx-auto bg-yellow-500/30 rounded-t-lg flex items-center justify-center">
                    <div>
                      <MousePointer className="w-5 h-5 mx-auto mb-1" />
                      <p className="text-sm font-medium">MOFU</p>
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold">{funnelFlow.mofu_clicks.toLocaleString()}</p>
                  <p className="text-xs text-indigo-200">클릭</p>
                </div>

                {/* Arrow 2 */}
                <div className="flex flex-col items-center px-4">
                  <ArrowRight className="w-8 h-8 text-white/60" />
                  <p className="text-sm mt-1">{funnelFlow.mofu_to_bofu_rate.toFixed(1)}%</p>
                </div>

                {/* BOFU */}
                <div className="flex-1 text-center">
                  <div className="w-16 h-12 mx-auto bg-green-500/30 rounded flex items-center justify-center">
                    <div>
                      <ShoppingCart className="w-4 h-4 mx-auto mb-1" />
                      <p className="text-xs font-medium">BOFU</p>
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-bold">{funnelFlow.bofu_conversions.toLocaleString()}</p>
                  <p className="text-xs text-indigo-200">전환</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/20 text-center">
                <p className="text-sm">
                  전체 전환율: <span className="font-bold text-lg">{funnelFlow.overall_conversion_rate.toFixed(2)}%</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {[
              { id: 'overview', label: '개요', icon: BarChart3 },
              { id: 'campaigns', label: '캠페인', icon: Target },
              { id: 'allocation', label: '예산 배분', icon: PieChart },
              { id: 'guide', label: '퍼널 가이드', icon: Lightbulb }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Platform Support Banner */}
        <PlatformSupportBanner
          title={FEATURE_DESCRIPTIONS.funnelBidding.title}
          description={FEATURE_DESCRIPTIONS.funnelBidding.description}
          platforms={FEATURE_PLATFORMS.funnelBidding}
          className="mb-6"
        />

        {/* 개요 탭 */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* 단계별 요약 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['tofu', 'mofu', 'bofu'].map((stage) => {
                const style = STAGE_STYLES[stage]
                const Icon = style.icon
                const metrics = stageMetrics[stage] || {}
                const stageName = stage === 'tofu' ? '인지' : stage === 'mofu' ? '고려' : '전환'
                const primaryKpi = stage === 'tofu' ? `CPM ₩${(metrics.avg_cpm || 0).toLocaleString()}` :
                                   stage === 'mofu' ? `CPC ₩${(metrics.avg_cpc || 0).toLocaleString()}` :
                                   `CPA ₩${(metrics.avg_cpa || 0).toLocaleString()}`

                return (
                  <motion.div
                    key={stage}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-gradient-to-br ${style.gradient} rounded-xl p-6 text-white shadow-lg`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg">
                          <Icon className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">{stage.toUpperCase()}</h3>
                          <p className="text-sm opacity-80">{stageName} 단계</p>
                        </div>
                      </div>
                      <span className="text-2xl font-bold">{metrics.campaign_count || 0}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="opacity-70">예산</p>
                        <p className="font-semibold">₩{(metrics.total_budget || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="opacity-70">지출</p>
                        <p className="font-semibold">₩{(metrics.total_spend || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="opacity-70">주요 KPI</p>
                        <p className="font-semibold">{primaryKpi}</p>
                      </div>
                      <div>
                        <p className="opacity-70">{stage === 'bofu' ? 'ROAS' : 'CTR'}</p>
                        <p className="font-semibold">
                          {stage === 'bofu'
                            ? `${(metrics.avg_roas || 0).toFixed(0)}%`
                            : `${(metrics.avg_ctr || 0).toFixed(2)}%`
                          }
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* 전체 요약 + 권장사항 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 전체 성과 */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-500" />
                  전체 성과
                </h3>
                {summary && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">총 캠페인</p>
                      <p className="text-2xl font-bold">{summary.total_campaigns}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">총 예산</p>
                      <p className="text-2xl font-bold">₩{summary.total_budget?.toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">총 지출</p>
                      <p className="text-2xl font-bold">₩{summary.total_spend?.toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">전체 ROAS</p>
                      <p className="text-2xl font-bold">{summary.overall_roas?.toFixed(0)}%</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">총 전환</p>
                      <p className="text-2xl font-bold">{summary.total_conversions?.toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">총 매출</p>
                      <p className="text-2xl font-bold">₩{summary.total_revenue?.toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* 권장사항 */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  입찰 최적화 권장사항
                </h3>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {recommendations.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">권장사항이 없습니다</p>
                  ) : (
                    recommendations.slice(0, 5).map((rec) => {
                      const stageStyle = STAGE_STYLES[rec.funnel_stage] || STAGE_STYLES.mofu

                      return (
                        <div
                          key={rec.id}
                          className={`p-3 rounded-lg border ${stageStyle.border} ${stageStyle.bg}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${stageStyle.bg} ${stageStyle.text}`}>
                                  {rec.funnel_stage.toUpperCase()}
                                </span>
                                <span className="text-sm font-medium">{rec.campaign_name}</span>
                              </div>
                              <p className="text-sm text-gray-600">{rec.reason}</p>
                              <p className="text-xs text-green-600 mt-1">✨ {rec.expected_improvement}</p>
                            </div>
                            <button
                              onClick={() => applyRecommendation(rec.id)}
                              className="ml-2 px-2 py-1 bg-indigo-500 text-white rounded text-xs hover:bg-indigo-600"
                            >
                              적용
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 캠페인 탭 */}
        {activeTab === 'campaigns' && (
          <div className="space-y-4">
            {/* 필터 */}
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-500">단계:</span>
                <select
                  value={selectedStage || ''}
                  onChange={(e) => setSelectedStage(e.target.value || null)}
                  className="px-3 py-1.5 border rounded-lg text-sm"
                >
                  <option value="">전체</option>
                  <option value="tofu">TOFU (인지)</option>
                  <option value="mofu">MOFU (고려)</option>
                  <option value="bofu">BOFU (전환)</option>
                </select>
              </div>
            </div>

            {/* 캠페인 목록 */}
            {campaigns
              .filter(c => !selectedStage || c.funnel_stage === selectedStage)
              .map((campaign) => {
                const stageStyle = STAGE_STYLES[campaign.funnel_stage] || STAGE_STYLES.mofu
                const StageIcon = stageStyle.icon
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
                          <div className={`p-2 rounded-lg ${stageStyle.bg}`}>
                            <StageIcon className={`w-5 h-5 ${stageStyle.text}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{campaign.campaign_name}</h3>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${stageStyle.bg} ${stageStyle.text}`}>
                                {campaign.funnel_stage.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">
                              {getPlatformIcon(campaign.platform)} {campaign.platform} · {campaign.objective}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-sm text-gray-500">
                              {campaign.funnel_stage === 'tofu' ? 'CPM' :
                               campaign.funnel_stage === 'mofu' ? 'CPC' : 'CPA'}
                            </p>
                            <p className="font-semibold">
                              ₩{(campaign.funnel_stage === 'tofu' ? campaign.cpm :
                                 campaign.funnel_stage === 'mofu' ? campaign.cpc : campaign.cpa).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-500">지출</p>
                            <p className="font-semibold">₩{campaign.spend.toLocaleString()}</p>
                          </div>
                          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        className="border-t bg-gray-50 p-4"
                      >
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div className="bg-white p-3 rounded-lg">
                            <p className="text-xs text-gray-500">노출수</p>
                            <p className="font-semibold">{campaign.impressions.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <p className="text-xs text-gray-500">클릭수</p>
                            <p className="font-semibold">{campaign.clicks.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <p className="text-xs text-gray-500">CTR</p>
                            <p className="font-semibold">{campaign.ctr.toFixed(2)}%</p>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <p className="text-xs text-gray-500">전환수</p>
                            <p className="font-semibold">{campaign.conversions.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <p className="text-xs text-gray-500">ROAS</p>
                            <p className="font-semibold">{campaign.roas.toFixed(0)}%</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-4 text-sm">
                          <span className="text-gray-500">입찰 전략:</span>
                          <span className="font-medium">{campaign.bidding_strategy}</span>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                )
              })}
          </div>
        )}

        {/* 예산 배분 탭 */}
        {activeTab === 'allocation' && allocation && (
          <div className="space-y-6">
            {/* 전략 선택 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold mb-4">예산 배분 전략 선택</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {allocationStrategies.map((strategy) => (
                  <button
                    key={strategy.id}
                    onClick={() => {
                      setSelectedStrategy(strategy.id)
                      loadAllocation()
                    }}
                    className={`p-4 rounded-lg border-2 text-left transition ${
                      selectedStrategy === strategy.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <h4 className="font-semibold">{strategy.name}</h4>
                    <p className="text-sm text-gray-500 mt-1">{strategy.description}</p>
                    <div className="flex gap-2 mt-3">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        TOFU {strategy.split.tofu}%
                      </span>
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                        MOFU {strategy.split.mofu}%
                      </span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        BOFU {strategy.split.bofu}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 현재 vs 권장 비교 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">현재 vs 권장 배분</h3>
                <button
                  onClick={applyAllocation}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
                >
                  권장 배분 적용
                </button>
              </div>

              <div className="space-y-6">
                {['tofu', 'mofu', 'bofu'].map((stage) => {
                  const style = STAGE_STYLES[stage]
                  const stageData = allocation[stage] || {}
                  const current = stageData.current_pct || 0
                  const recommended = stageData.percentage || 0
                  const diff = recommended - current

                  return (
                    <div key={stage}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${style.bg} ${style.text}`}>
                            {stage.toUpperCase()}
                          </span>
                          <span className="text-gray-500">₩{stageData.budget?.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span>현재: {current.toFixed(1)}%</span>
                          <span>→</span>
                          <span className="font-semibold">권장: {recommended.toFixed(1)}%</span>
                          {diff !== 0 && (
                            <span className={diff > 0 ? 'text-green-600' : 'text-red-600'}>
                              ({diff > 0 ? '+' : ''}{diff.toFixed(1)}%p)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-4 bg-gray-100 rounded-full overflow-hidden relative">
                        {/* 현재 */}
                        <div
                          className={`absolute top-0 left-0 h-full ${style.bg} opacity-50`}
                          style={{ width: `${current}%` }}
                        />
                        {/* 권장 마커 */}
                        <div
                          className="absolute top-0 bottom-0 w-1 bg-indigo-600"
                          style={{ left: `${recommended}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {allocation.adjustment_needed && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-800">조정이 필요합니다</p>
                      <p className="text-sm text-yellow-700 mt-1">{allocation.recommendation}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 퍼널 가이드 탭 */}
        {activeTab === 'guide' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['tofu', 'mofu', 'bofu'].map((stage) => {
              const style = STAGE_STYLES[stage]
              const Icon = style.icon
              const title = stage === 'tofu' ? 'Top of Funnel (인지)' :
                           stage === 'mofu' ? 'Middle of Funnel (고려)' : 'Bottom of Funnel (전환)'
              const objectives = stage === 'tofu' ? ['브랜드 인지도', '도달', '동영상 조회'] :
                                stage === 'mofu' ? ['트래픽', '참여', '앱 설치', '리드 생성'] :
                                ['전환', '카탈로그 판매', '매장 방문']
              const kpi = stage === 'tofu' ? 'CPM / 도달률' :
                         stage === 'mofu' ? 'CPC / CTR' : 'CPA / ROAS'
              const tips = stage === 'tofu' ? [
                '넓은 타겟팅으로 최대 도달 확보',
                '브랜드 스토리 중심 크리에이티브',
                '동영상/이미지 광고 활용',
                '빈도 캡 설정으로 피로도 방지'
              ] : stage === 'mofu' ? [
                'TOFU 참여자 리타겟팅',
                '제품/서비스 상세 정보 제공',
                '행동 유도 CTA 포함',
                '랜딩 페이지 최적화 필수'
              ] : [
                '장바구니 이탈자 리타겟팅',
                '프로모션/할인 오퍼 활용',
                '긴급성 부여 메시지',
                '간편한 전환 경로 제공'
              ]

              return (
                <motion.div
                  key={stage}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl shadow-sm overflow-hidden"
                >
                  <div className={`bg-gradient-to-r ${style.gradient} p-6 text-white`}>
                    <div className="flex items-center gap-3 mb-2">
                      <Icon className="w-8 h-8" />
                      <div>
                        <h3 className="font-bold text-lg">{stage.toUpperCase()}</h3>
                        <p className="text-sm opacity-80">{title}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">캠페인 목표</h4>
                      <div className="flex flex-wrap gap-2">
                        {objectives.map((obj) => (
                          <span key={obj} className={`px-2 py-1 rounded text-sm ${style.bg} ${style.text}`}>
                            {obj}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">주요 KPI</h4>
                      <p className="font-semibold">{kpi}</p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">최적화 팁</h4>
                      <ul className="space-y-2">
                        {tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-indigo-500">•</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
