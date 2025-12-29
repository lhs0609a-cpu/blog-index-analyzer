'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, Settings, Check, X, ChevronRight, ChevronDown, Search,
  Link2, Unlink, Play, Pause, RefreshCw, BarChart3, TrendingUp,
  DollarSign, Target, AlertCircle, ExternalLink, Clock, Shield,
  Loader2, Filter, Grid, List, Star, Sparkles, ArrowRight, ArrowUpRight,
  ArrowDownRight, PieChart, Activity, Wallet, MousePointer, Eye,
  ShoppingCart, Percent, Brain, Lightbulb, Award, Flame, Bell, Globe
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import { useFeature } from '@/lib/features/useFeatureAccess'
import {
  AD_PLATFORMS,
  PLATFORM_CATEGORIES,
  getPlatformsByCategory,
  AdPlatform,
  PlatformCategory
} from '../platforms'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev'

// 대시보드 탭 타입
type DashboardTab = 'overview' | 'platforms' | 'budget' | 'insights'

// AI 인사이트 타입
interface AIInsight {
  id: string
  type: 'opportunity' | 'warning' | 'success' | 'tip'
  title: string
  description: string
  impact: string
  action?: string
  platform?: string
  timestamp: string
}

// 예산 배분 타입
interface BudgetAllocation {
  platformId: string
  name: string
  icon: string
  currentBudget: number
  suggestedBudget: number
  performance: number
  trend: 'up' | 'down' | 'stable'
}

// 최적화 활동 로그 타입
interface OptimizationLog {
  id: string
  platform: string
  icon: string
  action: string
  result: string
  savedAmount?: number
  timestamp: string
}

// 연동된 플랫폼 상태 타입
interface ConnectedPlatform {
  platform_id: string
  is_connected: boolean
  is_active: boolean
  last_sync_at?: string
  account_name?: string
  stats?: {
    total_spend: number
    total_conversions: number
    roas: number
    optimizations_today: number
  }
}

export default function UnifiedAdOptimizerPage() {
  const { isAuthenticated, user } = useAuthStore()
  const { allowed: hasAccess, isLocked } = useFeature('adOptimizer')

  // 인트로 화면 상태
  const [showIntro, setShowIntro] = useState(true)

  // 대시보드 탭 상태
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedCategory, setSelectedCategory] = useState<PlatformCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [connectedPlatforms, setConnectedPlatforms] = useState<Record<string, ConnectedPlatform>>({})
  const [isLoading, setIsLoading] = useState(true)

  // AI 인사이트 (데모 데이터)
  const [aiInsights] = useState<AIInsight[]>([
    {
      id: '1',
      type: 'opportunity',
      title: '네이버 검색광고 전환율 개선 기회',
      description: '오후 2-4시 시간대 CPC를 15% 상향 조정하면 전환율이 23% 증가할 것으로 예상됩니다.',
      impact: '예상 전환 +47건/주',
      action: '입찰가 자동 조정',
      platform: 'naver_searchad',
      timestamp: new Date().toISOString()
    },
    {
      id: '2',
      type: 'warning',
      title: '메타 광고 예산 소진 임박',
      description: '현재 소진 속도로 예산이 3일 후 소진됩니다. 예산 증액 또는 입찰가 조정을 권장합니다.',
      impact: '남은 예산: ₩120,000',
      platform: 'meta_ads',
      timestamp: new Date().toISOString()
    },
    {
      id: '3',
      type: 'success',
      title: '카카오모먼트 ROAS 목표 달성',
      description: '이번 주 ROAS가 목표치 400%를 넘어 467%를 달성했습니다.',
      impact: 'ROAS +67% 초과 달성',
      platform: 'kakao_moment',
      timestamp: new Date().toISOString()
    },
    {
      id: '4',
      type: 'tip',
      title: 'A/B 테스트 결과',
      description: '새로운 광고 소재 B가 기존 대비 18% 높은 CTR을 기록 중입니다. 전체 적용을 권장합니다.',
      impact: 'CTR 1.2% → 1.42%',
      action: '전체 적용',
      timestamp: new Date().toISOString()
    }
  ])

  // 예산 배분 (데모 데이터)
  const [budgetAllocations] = useState<BudgetAllocation[]>([
    { platformId: 'naver_searchad', name: '네이버 검색광고', icon: '🟢', currentBudget: 5000000, suggestedBudget: 6500000, performance: 342, trend: 'up' },
    { platformId: 'google_ads', name: 'Google Ads', icon: '🔵', currentBudget: 3000000, suggestedBudget: 2500000, performance: 285, trend: 'down' },
    { platformId: 'meta_ads', name: 'Meta 광고', icon: '🔷', currentBudget: 2000000, suggestedBudget: 2800000, performance: 412, trend: 'up' },
    { platformId: 'kakao_moment', name: '카카오모먼트', icon: '💛', currentBudget: 1500000, suggestedBudget: 1800000, performance: 467, trend: 'up' },
    { platformId: 'tiktok_ads', name: 'TikTok Ads', icon: '🎵', currentBudget: 1000000, suggestedBudget: 1200000, performance: 523, trend: 'stable' }
  ])

  // 최적화 로그 (데모 데이터)
  const [optimizationLogs] = useState<OptimizationLog[]>([
    { id: '1', platform: '네이버', icon: '🟢', action: '입찰가 조정', result: '"블로그 마케팅" 키워드 CPC ₩450 → ₩520', savedAmount: 12000, timestamp: '2분 전' },
    { id: '2', platform: 'Meta', icon: '🔷', action: '타겟 최적화', result: '25-34세 여성 타겟 강화', timestamp: '5분 전' },
    { id: '3', platform: 'Google', icon: '🔵', action: '성과 낮은 키워드 중지', result: '5개 키워드 일시 중지', savedAmount: 35000, timestamp: '12분 전' },
    { id: '4', platform: '카카오', icon: '💛', action: '시간대별 예산 배분', result: '오후 시간대 예산 +20%', timestamp: '18분 전' },
    { id: '5', platform: '네이버', icon: '🟢', action: '광고 소재 교체', result: 'CTR 높은 소재로 변경', timestamp: '25분 전' }
  ])

  // 연동 모달 상태
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<AdPlatform | null>(null)
  const [connectForm, setConnectForm] = useState<Record<string, string>>({})
  const [isConnecting, setIsConnecting] = useState(false)

  // 연동 상태 로드
  const loadConnectedPlatforms = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/ads/platforms/status?user_id=${user?.id || 1}`)
      if (res.ok) {
        const data = await res.json()
        setConnectedPlatforms(data.platforms || {})
      }
    } catch (error) {
      // 연동된 플랫폼이 없으면 빈 객체
      setConnectedPlatforms({
        'naver_searchad': {
          platform_id: 'naver_searchad',
          is_connected: true,
          is_active: true,
          last_sync_at: new Date().toISOString(),
          account_name: '테스트 계정',
          stats: {
            total_spend: 1250000,
            total_conversions: 47,
            roas: 342,
            optimizations_today: 23
          }
        }
      })
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (hasAccess) {
      loadConnectedPlatforms()
    }
  }, [hasAccess, loadConnectedPlatforms])

  // 플랫폼 필터링
  const filteredPlatforms = AD_PLATFORMS.filter(platform => {
    const matchesCategory = selectedCategory === 'all' || platform.category === selectedCategory
    const matchesSearch = platform.nameKo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         platform.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // 플랫폼 연동 모달 열기
  const openConnectModal = (platform: AdPlatform) => {
    setSelectedPlatform(platform)
    setConnectForm({})
    setConnectModalOpen(true)
  }

  // 플랫폼 연동
  const connectPlatform = async () => {
    if (!selectedPlatform) return

    // 필수 필드 체크
    const missingFields = selectedPlatform.requiredFields.filter(field => !connectForm[field.name])
    if (missingFields.length > 0) {
      toast.error('모든 필수 항목을 입력해주세요')
      return
    }

    setIsConnecting(true)
    try {
      const res = await fetch(`${API_BASE}/api/ads/platforms/${selectedPlatform.id}/connect?user_id=${user?.id || 1}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectForm)
      })

      if (res.ok) {
        toast.success(`${selectedPlatform.nameKo} 연동 완료!`)
        setConnectModalOpen(false)
        loadConnectedPlatforms()
      } else {
        const error = await res.json()
        toast.error(error.detail || '연동 실패')
      }
    } catch (error) {
      toast.error('서버 오류가 발생했습니다')
    } finally {
      setIsConnecting(false)
    }
  }

  // 플랫폼 연동 해제
  const disconnectPlatform = async (platformId: string) => {
    if (!confirm('정말로 연동을 해제하시겠습니까?')) return

    try {
      const res = await fetch(`${API_BASE}/api/ads/platforms/${platformId}/disconnect?user_id=${user?.id || 1}`, {
        method: 'POST'
      })

      if (res.ok) {
        toast.success('연동이 해제되었습니다')
        loadConnectedPlatforms()
      } else {
        toast.error('연동 해제 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    }
  }

  // 최적화 시작/중지
  const toggleOptimization = async (platformId: string, isActive: boolean) => {
    try {
      const endpoint = isActive ? 'stop' : 'start'
      const res = await fetch(`${API_BASE}/api/ads/platforms/${platformId}/optimization/${endpoint}?user_id=${user?.id || 1}`, {
        method: 'POST'
      })

      if (res.ok) {
        toast.success(isActive ? '최적화가 중지되었습니다' : '최적화가 시작되었습니다')
        loadConnectedPlatforms()
      }
    } catch (error) {
      toast.error('서버 오류')
    }
  }

  // 인트로 화면
  if (showIntro) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 overflow-hidden">
        {/* 배경 효과 */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-pink-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 container mx-auto px-4 py-12">
          {/* 헤더 */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.8 }}
              className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-2xl shadow-purple-500/30 mb-6"
            >
              <Zap className="w-12 h-12 text-white" />
            </motion.div>
            <h1 className="text-5xl font-bold text-white mb-4">
              통합 광고 <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">자동 최적화</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              네이버, 구글, 메타, 카카오 등 모든 광고 플랫폼을<br />
              AI가 24시간 자동으로 최적화합니다
            </p>
          </motion.div>

          {/* 주요 기능 카드 */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              {
                icon: <Globe className="w-8 h-8" />,
                title: "멀티 플랫폼 통합",
                description: "네이버 검색광고, Google Ads, Meta 광고, 카카오모먼트 등 주요 광고 플랫폼을 한 곳에서 관리",
                gradient: "from-green-400 to-emerald-500",
                delay: 0.1
              },
              {
                icon: <Brain className="w-8 h-8" />,
                title: "AI 실시간 최적화",
                description: "머신러닝 기반으로 입찰가, 예산, 타겟팅을 24시간 자동 조정하여 최고의 성과 달성",
                gradient: "from-blue-400 to-indigo-500",
                delay: 0.2
              },
              {
                icon: <Wallet className="w-8 h-8" />,
                title: "스마트 예산 배분",
                description: "플랫폼별 ROAS를 분석하여 성과가 좋은 채널에 예산을 자동으로 재배분",
                gradient: "from-orange-400 to-red-500",
                delay: 0.3
              },
              {
                icon: <Sparkles className="w-8 h-8" />,
                title: "AI 인사이트",
                description: "성과 개선 기회, 위험 요소, 최적화 팁을 AI가 실시간으로 분석하여 제안",
                gradient: "from-purple-400 to-pink-500",
                delay: 0.4
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: feature.delay }}
                className="group"
              >
                <div className="h-full bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-1">
                  <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                    <div className="text-white">{feature.icon}</div>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* 지원 플랫폼 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 mb-12"
          >
            <h2 className="text-center text-lg font-semibold text-gray-400 mb-6">지원 광고 플랫폼</h2>
            <div className="flex flex-wrap justify-center items-center gap-8">
              {[
                { name: "네이버 검색광고", icon: "🟢" },
                { name: "Google Ads", icon: "🔵" },
                { name: "Meta 광고", icon: "🔷" },
                { name: "카카오모먼트", icon: "💛" },
                { name: "TikTok Ads", icon: "🎵" },
                { name: "트위터 Ads", icon: "🐦" },
                { name: "네이버 GFA", icon: "📱" },
                { name: "쿠팡 광고", icon: "🛒" }
              ].map((platform, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + idx * 0.05 }}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10"
                >
                  <span className="text-xl">{platform.icon}</span>
                  <span className="text-white text-sm font-medium">{platform.name}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* 기대 효과 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="grid md:grid-cols-3 gap-6 mb-12"
          >
            {[
              { value: "30%+", label: "평균 ROAS 개선", color: "text-green-400" },
              { value: "24/7", label: "자동 최적화", color: "text-blue-400" },
              { value: "50%", label: "관리 시간 절감", color: "text-purple-400" }
            ].map((stat, idx) => (
              <div key={idx} className="text-center p-6 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
                <div className={`text-4xl font-bold ${stat.color} mb-2`}>{stat.value}</div>
                <div className="text-gray-400">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* CTA 버튼 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="text-center"
          >
            <button
              onClick={() => setShowIntro(false)}
              className="inline-flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white text-lg font-bold rounded-2xl hover:shadow-2xl hover:shadow-purple-500/30 hover:scale-105 transition-all duration-300"
            >
              <Zap className="w-6 h-6" />
              시작하기
              <ChevronRight className="w-5 h-5" />
            </button>
            <p className="mt-4 text-gray-500 text-sm">
              Pro 플랜 이상에서 사용 가능합니다
            </p>
          </motion.div>
        </div>
      </div>
    )
  }

  // 프로 플랜 미만 접근 제한
  if (isLocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 max-w-lg text-center"
        >
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">프로 플랜 전용 기능</h1>
          <p className="text-gray-300 mb-6">
            통합 광고 최적화는 Pro 플랜 이상에서 사용할 수 있습니다.
          </p>
          <Link
            href="/pricing"
            className="inline-block px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium"
          >
            플랜 업그레이드
          </Link>
        </motion.div>
      </div>
    )
  }

  // 통계 요약
  const totalConnected = Object.values(connectedPlatforms).filter(p => p.is_connected).length
  const totalActive = Object.values(connectedPlatforms).filter(p => p.is_active).length
  const totalSpend = Object.values(connectedPlatforms).reduce((sum, p) => sum + (p.stats?.total_spend || 0), 0)
  const avgRoas = Object.values(connectedPlatforms).filter(p => p.stats?.roas).reduce((sum, p, _, arr) => sum + (p.stats?.roas || 0) / arr.length, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* 헤더 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/tools" className="text-gray-500 hover:text-gray-700">
                ← 도구
              </Link>
              <div className="w-px h-6 bg-gray-300" />
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">통합 광고 자동 최적화</h1>
                  <p className="text-xs text-gray-500">모든 광고 플랫폼을 한 곳에서</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <Bell className="w-5 h-5" />
              </button>
              <Link
                href="/ad-optimizer"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                네이버 광고 상세 →
              </Link>
            </div>
          </div>

          {/* 탭 네비게이션 */}
          <div className="flex gap-1 mt-4 -mb-px">
            {[
              { id: 'overview', label: '대시보드', icon: <PieChart className="w-4 h-4" /> },
              { id: 'platforms', label: '플랫폼 관리', icon: <Grid className="w-4 h-4" /> },
              { id: 'budget', label: '예산 최적화', icon: <Wallet className="w-4 h-4" /> },
              { id: 'insights', label: 'AI 인사이트', icon: <Brain className="w-4 h-4" /> }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as DashboardTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-xl transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-indigo-600 border-t border-x border-gray-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* ==================== OVERVIEW TAB ==================== */}
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* 통계 요약 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-5 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Link2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm text-gray-500">연동된 플랫폼</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{totalConnected}<span className="text-lg text-gray-400">/{AD_PLATFORMS.length}</span></p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl p-5 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <Play className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-sm text-gray-500">최적화 실행 중</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{totalActive}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-2xl p-5 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="text-sm text-gray-500">총 광고비</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">₩{(totalSpend / 10000).toFixed(0)}<span className="text-lg text-gray-400">만</span></p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-2xl p-5 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-sm text-gray-500">평균 ROAS</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{avgRoas.toFixed(0)}<span className="text-lg text-gray-400">%</span></p>
              </motion.div>
            </div>

            {/* 대시보드 2열 레이아웃 */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* 왼쪽: 플랫폼 성과 요약 + 최적화 피드 */}
              <div className="lg:col-span-2 space-y-6">
                {/* 플랫폼별 성과 */}
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-indigo-500" />
                      플랫폼별 성과
                    </h3>
                    <button
                      onClick={() => setActiveTab('platforms')}
                      className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      전체 보기 <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    {budgetAllocations.slice(0, 4).map((platform, idx) => (
                      <motion.div
                        key={platform.platformId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <span className="text-2xl">{platform.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900 truncate">{platform.name}</span>
                            <span className={`text-sm font-bold ${
                              platform.performance >= 400 ? 'text-green-600' :
                              platform.performance >= 300 ? 'text-blue-600' : 'text-orange-600'
                            }`}>
                              ROAS {platform.performance}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(platform.performance / 5, 100)}%` }}
                                transition={{ duration: 0.8, delay: idx * 0.1 }}
                                className={`h-full rounded-full ${
                                  platform.performance >= 400 ? 'bg-green-500' :
                                  platform.performance >= 300 ? 'bg-blue-500' : 'bg-orange-500'
                                }`}
                              />
                            </div>
                            <span className={`text-xs flex items-center gap-1 ${
                              platform.trend === 'up' ? 'text-green-600' :
                              platform.trend === 'down' ? 'text-red-600' : 'text-gray-500'
                            }`}>
                              {platform.trend === 'up' && <ArrowUpRight className="w-3 h-3" />}
                              {platform.trend === 'down' && <ArrowDownRight className="w-3 h-3" />}
                              {platform.trend === 'stable' && '━'}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* 실시간 최적화 피드 */}
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-green-500" />
                      실시간 최적화 활동
                      <span className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </h3>
                    <span className="text-xs text-gray-500">자동 업데이트 중</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {optimizationLogs.map((log, idx) => (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xl">{log.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-900">{log.platform}</span>
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">{log.action}</span>
                            </div>
                            <p className="text-sm text-gray-600 truncate">{log.result}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-gray-400">{log.timestamp}</span>
                            {log.savedAmount && (
                              <p className="text-xs font-medium text-green-600 mt-1">
                                +₩{log.savedAmount.toLocaleString()} 절감
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 오른쪽: AI 인사이트 */}
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <Brain className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold">AI 인사이트</h3>
                      <p className="text-sm text-white/70">실시간 분석 결과</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {aiInsights.slice(0, 3).map((insight, idx) => (
                      <motion.div
                        key={insight.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-white/10 backdrop-blur-sm rounded-xl p-3"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {insight.type === 'opportunity' && <Sparkles className="w-4 h-4 text-yellow-300" />}
                          {insight.type === 'warning' && <AlertCircle className="w-4 h-4 text-orange-300" />}
                          {insight.type === 'success' && <Check className="w-4 h-4 text-green-300" />}
                          {insight.type === 'tip' && <Lightbulb className="w-4 h-4 text-blue-300" />}
                          <span className="font-medium text-sm">{insight.title}</span>
                        </div>
                        <p className="text-xs text-white/80">{insight.impact}</p>
                      </motion.div>
                    ))}
                  </div>
                  <button
                    onClick={() => setActiveTab('insights')}
                    className="w-full mt-4 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    전체 인사이트 보기 <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {/* 빠른 작업 */}
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    빠른 작업
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setActiveTab('platforms')}
                      className="w-full p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors flex items-center gap-3"
                    >
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Link2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">새 플랫폼 연동</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('budget')}
                      className="w-full p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors flex items-center gap-3"
                    >
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <Wallet className="w-4 h-4 text-green-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">예산 재배분</span>
                    </button>
                    <button className="w-full p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                        <RefreshCw className="w-4 h-4 text-purple-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">수동 최적화 실행</span>
                    </button>
                  </div>
                </div>

                {/* 오늘의 하이라이트 */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl p-5 border border-green-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Award className="w-5 h-5 text-green-600" />
                    <h3 className="font-bold text-green-800">오늘의 성과</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-700">47</p>
                      <p className="text-xs text-green-600">최적화 횟수</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-700">₩82K</p>
                      <p className="text-xs text-green-600">예상 절감액</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-700">+12%</p>
                      <p className="text-xs text-green-600">CTR 개선</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-700">+8%</p>
                      <p className="text-xs text-green-600">전환율 상승</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ==================== PLATFORMS TAB ==================== */}
        {activeTab === 'platforms' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* 필터 바 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* 검색 */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="플랫폼 검색..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 카테고리 필터 */}
            <div className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                전체 ({AD_PLATFORMS.length})
              </button>
              {Object.entries(PLATFORM_CATEGORIES).map(([key, { name, icon }]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key as PlatformCategory)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === key
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {icon} {name}
                </button>
              ))}
            </div>

            {/* 보기 모드 */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 플랫폼 그리드 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
            {filteredPlatforms.map((platform, idx) => {
              const connected = connectedPlatforms[platform.id]
              const isConnected = connected?.is_connected
              const isActive = connected?.is_active

              return (
                <motion.div
                  key={platform.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
                    viewMode === 'list' ? 'flex items-center' : ''
                  }`}
                >
                  {/* 플랫폼 헤더 */}
                  <div className={`bg-gradient-to-r ${platform.color} p-4 ${viewMode === 'list' ? 'w-48' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{platform.icon}</span>
                      <div>
                        <h3 className="font-bold text-white">{platform.nameKo}</h3>
                        <p className="text-xs text-white/70">{platform.name}</p>
                      </div>
                    </div>
                  </div>

                  {/* 플랫폼 내용 */}
                  <div className={`p-4 ${viewMode === 'list' ? 'flex-1 flex items-center justify-between' : ''}`}>
                    {viewMode === 'grid' && (
                      <>
                        <p className="text-sm text-gray-600 mb-3">{platform.description}</p>

                        {/* 기능 태그 */}
                        <div className="flex flex-wrap gap-1 mb-4">
                          {platform.features.slice(0, 3).map((feature, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                            >
                              {feature}
                            </span>
                          ))}
                          {platform.features.length > 3 && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                              +{platform.features.length - 3}
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    {/* 연동 상태 & 버튼 */}
                    <div className={`flex items-center gap-2 ${viewMode === 'list' ? '' : 'justify-between'}`}>
                      {platform.comingSoon ? (
                        <span className="px-3 py-1.5 bg-gray-100 text-gray-500 text-sm rounded-lg">
                          Coming Soon
                        </span>
                      ) : isConnected ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                            <span className="text-sm text-gray-600">
                              {isActive ? '최적화 중' : '연동됨'}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => toggleOptimization(platform.id, isActive || false)}
                              className={`p-2 rounded-lg transition-colors ${
                                isActive
                                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                  : 'bg-green-100 text-green-600 hover:bg-green-200'
                              }`}
                              title={isActive ? '최적화 중지' : '최적화 시작'}
                            >
                              {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => disconnectPlatform(platform.id)}
                              className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                              title="연동 해제"
                            >
                              <Unlink className="w-4 h-4" />
                            </button>
                            <Link
                              href={`/ad-optimizer/${platform.id}`}
                              className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                              title="상세 설정"
                            >
                              <Settings className="w-4 h-4" />
                            </Link>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => openConnectModal(platform)}
                          className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${platform.color} text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity`}
                        >
                          <Link2 className="w-4 h-4" />
                          연동하기
                        </button>
                      )}
                    </div>

                    {/* 연동된 경우 통계 표시 */}
                    {viewMode === 'grid' && isConnected && connected.stats && (
                      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-500">오늘 최적화</p>
                          <p className="font-semibold text-gray-900">{connected.stats.optimizations_today}회</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">ROAS</p>
                          <p className="font-semibold text-green-600">{connected.stats.roas}%</p>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

            {filteredPlatforms.length === 0 && (
              <div className="text-center py-20 text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>검색 결과가 없습니다</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ==================== BUDGET TAB ==================== */}
        {activeTab === 'budget' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* 예산 요약 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm text-gray-500">총 예산</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">₩{(budgetAllocations.reduce((s, p) => s + p.currentBudget, 0) / 10000).toFixed(0)}<span className="text-lg text-gray-400">만</span></p>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-sm text-gray-500">AI 권장 증액</span>
                </div>
                <p className="text-3xl font-bold text-green-600">+₩230<span className="text-lg text-green-400">만</span></p>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                    <Target className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="text-sm text-gray-500">예상 ROAS</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">412<span className="text-lg text-gray-400">%</span></p>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <Percent className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-sm text-gray-500">최적화 잠재력</span>
                </div>
                <p className="text-3xl font-bold text-purple-600">+18<span className="text-lg text-purple-400">%</span></p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* 예산 배분 리스트 */}
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-indigo-500" />
                    플랫폼별 예산 배분
                  </h3>
                  <button className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    AI 최적화 적용
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  {budgetAllocations.map((platform, idx) => {
                    const budgetDiff = platform.suggestedBudget - platform.currentBudget
                    const isIncrease = budgetDiff > 0

                    return (
                      <motion.div
                        key={platform.platformId}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="p-4 border border-gray-100 rounded-xl hover:border-indigo-200 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{platform.icon}</span>
                            <div>
                              <h4 className="font-medium text-gray-900">{platform.name}</h4>
                              <span className={`text-xs ${platform.performance >= 400 ? 'text-green-600' : 'text-gray-500'}`}>
                                ROAS {platform.performance}%
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">₩{(platform.currentBudget / 10000).toFixed(0)}만</p>
                            <p className={`text-sm font-medium ${isIncrease ? 'text-green-600' : 'text-red-600'}`}>
                              {isIncrease ? '↑' : '↓'} ₩{Math.abs(budgetDiff / 10000).toFixed(0)}만 권장
                            </p>
                          </div>
                        </div>

                        {/* 예산 슬라이더 */}
                        <div className="relative">
                          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${(platform.currentBudget / budgetAllocations.reduce((s, p) => s + p.currentBudget, 0)) * 100}%` }}
                            />
                          </div>
                          {/* 권장 위치 마커 */}
                          <div
                            className="absolute top-0 w-1 h-3 bg-green-500 rounded-full"
                            style={{
                              left: `${(platform.suggestedBudget / (budgetAllocations.reduce((s, p) => s + p.currentBudget, 0) + 2300000)) * 100}%`,
                              marginLeft: '-2px'
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                          <span>현재: {((platform.currentBudget / budgetAllocations.reduce((s, p) => s + p.currentBudget, 0)) * 100).toFixed(1)}%</span>
                          <span className="text-green-600">권장: {((platform.suggestedBudget / (budgetAllocations.reduce((s, p) => s + p.suggestedBudget, 0))) * 100).toFixed(1)}%</span>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>

              {/* 예산 최적화 인사이트 */}
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <Brain className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold">AI 예산 분석</h3>
                      <p className="text-sm text-white/70">성과 기반 추천</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <ArrowUpRight className="w-4 h-4 text-green-300" />
                        <span className="font-medium text-sm">네이버 예산 증액 권장</span>
                      </div>
                      <p className="text-xs text-white/80">ROAS가 평균 이상이며, 경쟁 키워드 점유율 확대 가능</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <ArrowDownRight className="w-4 h-4 text-orange-300" />
                        <span className="font-medium text-sm">Google Ads 예산 조정</span>
                      </div>
                      <p className="text-xs text-white/80">최근 7일 전환율 하락, 타겟팅 재검토 필요</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Flame className="w-4 h-4 text-yellow-300" />
                        <span className="font-medium text-sm">Meta 광고 스케일업</span>
                      </div>
                      <p className="text-xs text-white/80">리타겟팅 캠페인 성과 우수, 확장 여력 있음</p>
                    </div>
                  </div>
                </div>

                {/* 예산 히스토리 */}
                <div className="bg-white rounded-2xl shadow-sm p-5">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-500" />
                    예산 변경 이력
                  </h3>
                  <div className="space-y-3">
                    {[
                      { date: '12/28', platform: '네이버', change: '+₩50만', reason: 'AI 자동 증액' },
                      { date: '12/25', platform: 'Meta', change: '+₩30만', reason: '수동 조정' },
                      { date: '12/22', platform: 'Google', change: '-₩20만', reason: 'AI 자동 감액' }
                    ].map((log, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <span className="text-xs text-gray-400">{log.date}</span>
                          <p className="text-sm font-medium text-gray-900">{log.platform}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${log.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>{log.change}</p>
                          <span className="text-xs text-gray-500">{log.reason}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ==================== INSIGHTS TAB ==================== */}
        {activeTab === 'insights' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* 인사이트 요약 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl p-5 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Sparkles className="w-6 h-6" />
                  <span className="text-sm text-white/80">기회 발견</span>
                </div>
                <p className="text-3xl font-bold">{aiInsights.filter(i => i.type === 'opportunity').length}</p>
              </div>

              <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl p-5 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <AlertCircle className="w-6 h-6" />
                  <span className="text-sm text-white/80">주의 필요</span>
                </div>
                <p className="text-3xl font-bold">{aiInsights.filter(i => i.type === 'warning').length}</p>
              </div>

              <div className="bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl p-5 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Check className="w-6 h-6" />
                  <span className="text-sm text-white/80">성공 사례</span>
                </div>
                <p className="text-3xl font-bold">{aiInsights.filter(i => i.type === 'success').length}</p>
              </div>

              <div className="bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl p-5 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Lightbulb className="w-6 h-6" />
                  <span className="text-sm text-white/80">최적화 팁</span>
                </div>
                <p className="text-3xl font-bold">{aiInsights.filter(i => i.type === 'tip').length}</p>
              </div>
            </div>

            {/* 인사이트 리스트 */}
            <div className="space-y-4">
              {aiInsights.map((insight, idx) => (
                <motion.div
                  key={insight.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`bg-white rounded-2xl shadow-sm overflow-hidden border-l-4 ${
                    insight.type === 'opportunity' ? 'border-l-yellow-500' :
                    insight.type === 'warning' ? 'border-l-red-500' :
                    insight.type === 'success' ? 'border-l-green-500' : 'border-l-blue-500'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        insight.type === 'opportunity' ? 'bg-yellow-100' :
                        insight.type === 'warning' ? 'bg-red-100' :
                        insight.type === 'success' ? 'bg-green-100' : 'bg-blue-100'
                      }`}>
                        {insight.type === 'opportunity' && <Sparkles className="w-6 h-6 text-yellow-600" />}
                        {insight.type === 'warning' && <AlertCircle className="w-6 h-6 text-red-600" />}
                        {insight.type === 'success' && <Check className="w-6 h-6 text-green-600" />}
                        {insight.type === 'tip' && <Lightbulb className="w-6 h-6 text-blue-600" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-bold text-gray-900">{insight.title}</h4>
                          {insight.platform && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                              {AD_PLATFORMS.find(p => p.id === insight.platform)?.nameKo || insight.platform}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 mb-3">{insight.description}</p>
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-medium ${
                            insight.type === 'opportunity' ? 'text-yellow-600' :
                            insight.type === 'warning' ? 'text-red-600' :
                            insight.type === 'success' ? 'text-green-600' : 'text-blue-600'
                          }`}>
                            {insight.impact}
                          </span>
                          {insight.action && (
                            <button className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              insight.type === 'opportunity' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' :
                              insight.type === 'warning' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                              insight.type === 'success' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                              'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            }`}>
                              {insight.action}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* 추가 인사이트 요청 */}
            <div className="mt-6 text-center">
              <button className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center gap-2 mx-auto">
                <RefreshCw className="w-4 h-4" />
                더 많은 인사이트 분석하기
              </button>
            </div>
          </motion.div>
        )}
      </main>

      {/* 연동 모달 */}
      <AnimatePresence>
        {connectModalOpen && selectedPlatform && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setConnectModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 모달 헤더 */}
              <div className={`bg-gradient-to-r ${selectedPlatform.color} p-6`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{selectedPlatform.icon}</span>
                    <div>
                      <h2 className="text-xl font-bold text-white">{selectedPlatform.nameKo}</h2>
                      <p className="text-sm text-white/70">{selectedPlatform.name} 연동</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConnectModalOpen(false)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* 모달 내용 */}
              <div className="p-6">
                <p className="text-gray-600 mb-6">{selectedPlatform.description}</p>

                {/* 기능 목록 */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <h4 className="font-medium text-gray-900 mb-3">연동 시 사용 가능한 기능</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedPlatform.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-500" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 입력 필드 */}
                <div className="space-y-4 mb-6">
                  {selectedPlatform.requiredFields.map((field) => (
                    <div key={field.name}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label} *
                      </label>
                      <input
                        type={field.type}
                        value={connectForm[field.name] || ''}
                        onChange={(e) => setConnectForm({ ...connectForm, [field.name]: e.target.value })}
                        placeholder={field.placeholder}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {field.helpText && (
                        <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* 가이드 링크 */}
                {selectedPlatform.setupGuideUrl && (
                  <a
                    href={selectedPlatform.setupGuideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 mb-6"
                  >
                    <ExternalLink className="w-4 h-4" />
                    API 키 발급 방법 보기
                  </a>
                )}

                {/* 버튼 */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setConnectModalOpen(false)}
                    className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={connectPlatform}
                    disabled={isConnecting}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r ${selectedPlatform.color} text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50`}
                  >
                    {isConnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    연동하기
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
