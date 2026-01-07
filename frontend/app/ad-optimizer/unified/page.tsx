'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, Settings, Check, X, ChevronRight, ChevronDown, Search,
  Link2, Unlink, Play, Pause, RefreshCw, BarChart3, TrendingUp,
  DollarSign, Target, AlertCircle, ExternalLink, Clock, Shield,
  Loader2, Filter, Grid, List, Star, Sparkles, ArrowRight, ArrowUpRight,
  ArrowDownRight, PieChart, Activity, Wallet, MousePointer, Eye,
  ShoppingCart, Percent, Brain, Lightbulb, Award, Flame, Bell, Globe,
  HelpCircle, BookOpen, PlayCircle
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
import AdOptimizerTutorial, { TutorialStartButton } from '@/components/ad-optimizer/AdOptimizerTutorial'
import { FeatureHelpCard, QuickStartGuide } from '@/components/ad-optimizer/FeatureHelpCard'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr'

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

  // 튜토리얼 상태
  const [showTutorial, setShowTutorial] = useState(false)
  const [tutorialCompleted, setTutorialCompleted] = useState(false)

  // 튜토리얼 완료 여부 확인
  useEffect(() => {
    const completed = localStorage.getItem('ad_optimizer_tutorial_completed') === 'true'
    setTutorialCompleted(completed)
  }, [])

  // 대시보드 탭 상태
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedCategory, setSelectedCategory] = useState<PlatformCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [connectedPlatforms, setConnectedPlatforms] = useState<Record<string, ConnectedPlatform>>({})
  const [isLoading, setIsLoading] = useState(true)

  // AI 인사이트 (API에서 로드)
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(false)

  // 예산 배분 (API에서 로드)
  const [budgetAllocations, setBudgetAllocations] = useState<BudgetAllocation[]>([])
  const [budgetLoading, setBudgetLoading] = useState(false)

  // 최적화 로그 (API에서 로드)
  const [optimizationLogs, setOptimizationLogs] = useState<OptimizationLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // 대시보드 요약 (API에서 로드)
  const [dashboardSummary, setDashboardSummary] = useState<{
    total_spend: number
    total_conversions: number
    total_revenue: number
    avg_roas: number
  } | null>(null)

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
      setConnectedPlatforms({})
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  // 대시보드 요약 로드
  const loadDashboardSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ads/dashboard/summary?user_id=${user?.id || 1}`)
      if (res.ok) {
        const data = await res.json()
        setDashboardSummary(data.summary)
      }
    } catch (error) {
      console.error('Failed to load dashboard summary:', error)
    }
  }, [user?.id])

  // AI 인사이트 로드 (이상 징후 감지)
  const loadAIInsights = useCallback(async () => {
    setInsightsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/ads/cross-platform/anomalies?user_id=${user?.id || 1}`)
      if (res.ok) {
        const data = await res.json()
        // anomalies를 AIInsight 형식으로 변환
        const insights: AIInsight[] = (data.anomalies || []).map((a: any, idx: number) => ({
          id: String(idx + 1),
          type: a.severity === 'high' ? 'warning' : a.severity === 'medium' ? 'opportunity' : 'tip',
          title: a.title || a.metric,
          description: a.description || `${a.platform}에서 ${a.metric} 이상 감지`,
          impact: a.impact || `변동: ${a.change_percent?.toFixed(1)}%`,
          action: a.recommendation,
          platform: a.platform,
          timestamp: a.detected_at || new Date().toISOString()
        }))
        setAiInsights(insights)
      }
    } catch (error) {
      console.error('Failed to load AI insights:', error)
      // 연동된 플랫폼이 없으면 빈 배열
      setAiInsights([])
    } finally {
      setInsightsLoading(false)
    }
  }, [user?.id])

  // 예산 배분 로드
  const loadBudgetAllocations = useCallback(async () => {
    setBudgetLoading(true)
    try {
      // 연동된 플랫폼별 성과 데이터 조회
      const connectedIds = Object.entries(connectedPlatforms)
        .filter(([_, p]) => p.is_connected)
        .map(([id]) => id)

      if (connectedIds.length === 0) {
        setBudgetAllocations([])
        return
      }

      const platformIcons: Record<string, string> = {
        'naver_searchad': '🟢',
        'google_ads': '🔵',
        'meta_ads': '🔷',
        'kakao_moment': '💛',
        'tiktok_ads': '🎵',
        'coupang_ads': '🛒',
        'criteo': '🔴'
      }

      const platformNames: Record<string, string> = {
        'naver_searchad': '네이버 검색광고',
        'google_ads': 'Google Ads',
        'meta_ads': 'Meta 광고',
        'kakao_moment': '카카오모먼트',
        'tiktok_ads': 'TikTok Ads',
        'coupang_ads': '쿠팡 광고',
        'criteo': '크리테오'
      }

      const allocations: BudgetAllocation[] = await Promise.all(
        connectedIds.map(async (platformId) => {
          try {
            const res = await fetch(`${API_BASE}/api/ads/platforms/${platformId}/performance?user_id=${user?.id || 1}&days=7`)
            if (res.ok) {
              const data = await res.json()
              const perf = data.performance || {}
              return {
                platformId,
                name: platformNames[platformId] || platformId,
                icon: platformIcons[platformId] || '📊',
                currentBudget: perf.cost || 0,
                suggestedBudget: perf.roas > 300 ? perf.cost * 1.3 : perf.cost * 0.8,
                performance: perf.roas || 0,
                trend: perf.roas > 350 ? 'up' : perf.roas < 250 ? 'down' : 'stable' as 'up' | 'down' | 'stable'
              }
            }
          } catch (e) {
            console.error(`Failed to load performance for ${platformId}:`, e)
          }
          return {
            platformId,
            name: platformNames[platformId] || platformId,
            icon: platformIcons[platformId] || '📊',
            currentBudget: 0,
            suggestedBudget: 0,
            performance: 0,
            trend: 'stable' as 'up' | 'down' | 'stable'
          }
        })
      )

      setBudgetAllocations(allocations.filter(a => a.currentBudget > 0 || a.performance > 0))
    } catch (error) {
      console.error('Failed to load budget allocations:', error)
      setBudgetAllocations([])
    } finally {
      setBudgetLoading(false)
    }
  }, [user?.id, connectedPlatforms])

  // 최적화 로그 로드 (크로스 플랫폼 리포트에서)
  const loadOptimizationLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/ads/cross-platform/report?user_id=${user?.id || 1}&days=7`)
      if (res.ok) {
        const data = await res.json()
        const report = data.report || {}

        // 추천사항을 로그 형식으로 변환
        const logs: OptimizationLog[] = (report.recommendations || []).map((rec: any, idx: number) => ({
          id: String(idx + 1),
          platform: rec.platform || '전체',
          icon: rec.platform === 'naver_searchad' ? '🟢' :
                rec.platform === 'google_ads' ? '🔵' :
                rec.platform === 'meta_ads' ? '🔷' :
                rec.platform === 'kakao_moment' ? '💛' : '📊',
          action: rec.action || rec.type || '최적화',
          result: rec.description || rec.message,
          savedAmount: rec.expected_savings,
          timestamp: rec.created_at || '방금 전'
        }))

        setOptimizationLogs(logs)
      }
    } catch (error) {
      console.error('Failed to load optimization logs:', error)
      setOptimizationLogs([])
    } finally {
      setLogsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (hasAccess) {
      loadConnectedPlatforms()
      loadDashboardSummary()
      loadAIInsights()
      loadOptimizationLogs()
    }
  }, [hasAccess, loadConnectedPlatforms, loadDashboardSummary, loadAIInsights, loadOptimizationLogs])

  // 연동된 플랫폼이 변경되면 예산 배분 데이터 로드
  useEffect(() => {
    if (Object.keys(connectedPlatforms).length > 0) {
      loadBudgetAllocations()
    }
  }, [connectedPlatforms, loadBudgetAllocations])

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

  // 인트로 화면 - 인스타그램 스타일 깔끔한 디자인
  if (showIntro) {
    return (
      <div className="min-h-screen bg-white">
        {/* 상단 그라데이션 바 */}
        <div className="h-1 w-full bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600" />

        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* 상단 네비게이션 */}
          <motion.nav
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-16"
          >
            <Link href="/tools" className="text-gray-400 hover:text-gray-600 transition-colors text-sm">
              ← 도구 목록
            </Link>
            <span className="text-xs font-medium text-gray-400 tracking-wider">PRO</span>
          </motion.nav>

          {/* 메인 히어로 */}
          <div className="text-center mb-16">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 mb-8"
            >
              <Zap className="w-10 h-10 text-white" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 tracking-tight"
            >
              광고 자동 최적화
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg text-gray-500 max-w-md mx-auto"
            >
              AI가 24시간 광고 성과를 분석하고<br />자동으로 최적화합니다
            </motion.p>
          </div>

          {/* 플랫폼 아이콘 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex justify-center items-center gap-4 mb-16"
          >
            {[
              { icon: "🟢", name: "네이버" },
              { icon: "🔵", name: "구글" },
              { icon: "🔷", name: "메타" },
              { icon: "💛", name: "카카오" },
              { icon: "🎵", name: "틱톡" },
            ].map((platform, idx) => (
              <motion.div
                key={idx}
                whileHover={{ y: -2 }}
                className="flex flex-col items-center gap-1"
              >
                <span className="text-2xl">{platform.icon}</span>
                <span className="text-xs text-gray-400">{platform.name}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* 기능 카드 - 미니멀 스타일 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="grid md:grid-cols-2 gap-4 mb-16"
          >
            {[
              { icon: <Globe className="w-5 h-5" />, title: "멀티 플랫폼 통합", desc: "8개 광고 플랫폼을 한 곳에서" },
              { icon: <Brain className="w-5 h-5" />, title: "AI 실시간 최적화", desc: "입찰가, 예산 자동 조정" },
              { icon: <TrendingUp className="w-5 h-5" />, title: "ROAS 극대화", desc: "성과 기반 예산 재배분" },
              { icon: <Bell className="w-5 h-5" />, title: "이상 징후 감지", desc: "문제 발생 시 즉시 알림" },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="flex items-start gap-4 p-5 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-600">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-0.5">{feature.title}</h3>
                  <p className="text-sm text-gray-500">{feature.desc}</p>
                </div>
              </div>
            ))}
          </motion.div>

          {/* 성과 지표 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex justify-center gap-12 mb-16"
          >
            {[
              { value: "30%+", label: "ROAS 개선" },
              { value: "24/7", label: "자동 최적화" },
              { value: "50%", label: "시간 절약" }
            ].map((stat, idx) => (
              <div key={idx} className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* CTA 버튼 - 인스타 스타일 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col items-center gap-4"
          >
            <button
              onClick={() => setShowTutorial(true)}
              className="w-full max-w-sm py-4 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
            >
              시작하기
            </button>

            <button
              onClick={() => setShowIntro(false)}
              className="text-gray-400 hover:text-gray-600 text-sm transition-colors"
            >
              이미 사용해 보셨나요? 바로 시작 →
            </button>
          </motion.div>

          {/* 튜토리얼 모달 */}
          <AdOptimizerTutorial
            isOpen={showTutorial}
            onClose={() => setShowTutorial(false)}
            onComplete={() => {
              // 튜토리얼 완료 시 상태 업데이트 (순서 중요)
              setTutorialCompleted(true)
              setShowTutorial(false)
              // 약간의 지연 후 인트로 화면 숨김 (애니메이션 완료 대기)
              setTimeout(() => {
                setShowIntro(false)
              }, 100)
            }}
          />
        </div>

        {/* 하단 */}
        <div className="absolute bottom-6 left-0 right-0 text-center">
          <p className="text-xs text-gray-300">BLANK AI</p>
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
  const avgRoas = (() => {
    const platformsWithRoas = Object.values(connectedPlatforms).filter(p => p.stats?.roas && p.stats.roas > 0)
    if (platformsWithRoas.length === 0) return 0
    const totalRoas = platformsWithRoas.reduce((sum, p) => sum + (p.stats?.roas || 0), 0)
    return totalRoas / platformsWithRoas.length
  })()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 그라데이션 바 */}
      <div className="h-1 w-full bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600" />

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/tools" className="text-gray-400 hover:text-gray-600 text-sm">
                ← 도구
              </Link>
              <h1 className="text-lg font-semibold text-gray-900">광고 자동 최적화</h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTutorial(true)}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                <Bell className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 탭 네비게이션 - 인스타 스타일 */}
          <div className="flex gap-8 mt-4 border-t border-gray-100 pt-3 -mb-px">
            {[
              { id: 'overview', label: '대시보드' },
              { id: 'platforms', label: '플랫폼' },
              { id: 'budget', label: '예산' },
              { id: 'insights', label: '인사이트' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as DashboardTab)}
                className={`pb-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-gray-900'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* ==================== OVERVIEW TAB ==================== */}
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {/* 튜토리얼 배너 - 미완료 시에만 표시 */}
            {!tutorialCompleted && (
              <div className="mb-6 p-4 bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl border border-pink-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">처음이신가요?</p>
                      <p className="text-sm text-gray-500">5분이면 설정을 완료할 수 있어요</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTutorial(true)}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    시작하기
                  </button>
                </div>
              </div>
            )}

            {/* 통계 요약 - 인스타 스타일 */}
            <div className="grid grid-cols-4 gap-6 mb-8">
              {[
                { label: '연동 플랫폼', value: totalConnected, suffix: `/${AD_PLATFORMS.length}` },
                { label: '실행 중', value: totalActive, suffix: '' },
                { label: '총 광고비', value: `₩${(totalSpend / 10000).toFixed(0)}`, suffix: '만' },
                { label: 'ROAS', value: avgRoas.toFixed(0), suffix: '%' },
              ].map((stat, idx) => (
                <div key={idx} className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {stat.value}<span className="text-lg text-gray-400">{stat.suffix}</span>
                  </p>
                  <p className="text-sm text-gray-400 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="h-px bg-gray-100 mb-8" />

            {/* 퀵 스타트 가이드 - 연동된 플랫폼이 없을 때 표시 */}
            {totalConnected === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-6"
              >
                <QuickStartGuide />
              </motion.div>
            )}

            {/* 최적화 도구 - 인스타 스타일 */}
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">최적화 도구</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {[
                  { href: '/ad-optimizer/hourly-bidding', icon: <Clock className="w-5 h-5" />, title: '시간대별 입찰', desc: '비용 15-25% 절감' },
                  { href: '/ad-optimizer/anomaly-detection', icon: <Bell className="w-5 h-5" />, title: '이상 징후 감지', desc: '실시간 모니터링' },
                  { href: '/ad-optimizer/budget-reallocation', icon: <PieChart className="w-5 h-5" />, title: '예산 재분배', desc: 'ROAS 10-20% 개선' },
                  { href: '/ad-optimizer/creative-fatigue', icon: <Flame className="w-5 h-5" />, title: '크리에이티브 분석', desc: '교체 시점 추천' },
                ].map((tool, idx) => (
                  <Link key={idx} href={tool.href}>
                    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer group">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-600 group-hover:bg-gray-100 transition-colors">
                        {tool.icon}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{tool.title}</h4>
                        <p className="text-sm text-gray-400">{tool.desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* 추가 도구 */}
            <div className="mb-8">
              <div className="grid md:grid-cols-2 gap-3">
                <Link href="/ad-optimizer/naver-quality">
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer group">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-600 group-hover:bg-gray-100 transition-colors">
                      <Award className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">품질지수 최적화</h4>
                      <p className="text-sm text-gray-400">네이버 광고 품질 개선</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                  </div>
                </Link>
                <Link href="/ad-optimizer/funnel-bidding">
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer group">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-600 group-hover:bg-gray-100 transition-colors">
                      <Target className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">퍼널 기반 입찰</h4>
                      <p className="text-sm text-gray-400">단계별 전략 적용</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                  </div>
                </Link>
              </div>
            </div>

            {/* 플랫폼별 기능 지원 - 심플 테이블 */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">기능</th>
                    <th className="px-3 py-3 text-center text-xs text-gray-400">네이버</th>
                    <th className="px-3 py-3 text-center text-xs text-gray-400">구글</th>
                    <th className="px-3 py-3 text-center text-xs text-gray-400">메타</th>
                    <th className="px-3 py-3 text-center text-xs text-gray-400">카카오</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-700">시간대별 입찰</td>
                    <td className="px-3 py-2.5 text-center"><Check className="w-4 h-4 text-gray-900 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><Check className="w-4 h-4 text-gray-900 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><Check className="w-4 h-4 text-gray-900 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><X className="w-4 h-4 text-gray-200 mx-auto" /></td>
                  </tr>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-700">예산 재분배</td>
                    <td className="px-3 py-2.5 text-center"><Check className="w-4 h-4 text-gray-900 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><Check className="w-4 h-4 text-gray-900 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><Check className="w-4 h-4 text-gray-900 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><X className="w-4 h-4 text-gray-200 mx-auto" /></td>
                  </tr>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-700">크리에이티브 피로도</td>
                    <td className="px-3 py-2.5 text-center"><X className="w-4 h-4 text-gray-200 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><Clock className="w-4 h-4 text-gray-400 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><Check className="w-4 h-4 text-gray-900 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><Check className="w-4 h-4 text-gray-900 mx-auto" /></td>
                  </tr>
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-700">품질지수 최적화</td>
                    <td className="px-3 py-2.5 text-center"><Check className="w-4 h-4 text-gray-900 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><Clock className="w-4 h-4 text-gray-400 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><X className="w-4 h-4 text-gray-200 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><X className="w-4 h-4 text-gray-200 mx-auto" /></td>
                  </tr>
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-gray-50 flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1"><Check className="w-3 h-3" /> 지원</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 준비 중</span>
                <Link href="/ad-optimizer/setup-guide" className="ml-auto hover:text-gray-600">연동 가이드 →</Link>
              </div>
            </div>

            {/* 대시보드 2열 레이아웃 */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* 왼쪽: 플랫폼 성과 요약 + 최적화 피드 */}
              <div className="lg:col-span-2 space-y-6">
                {/* 플랫폼별 성과 */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-50 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">플랫폼별 성과</h3>
                    <button
                      onClick={() => setActiveTab('platforms')}
                      className="text-sm text-gray-500 hover:text-gray-900"
                    >
                      전체 보기 →
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    {budgetLoading ? (
                      <div className="py-8 text-center">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" />
                      </div>
                    ) : budgetAllocations.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-sm text-gray-400">연동된 플랫폼이 없습니다</p>
                        <button
                          onClick={() => setActiveTab('platforms')}
                          className="mt-2 text-sm text-gray-900 hover:underline"
                        >
                          플랫폼 연동하기 →
                        </button>
                      </div>
                    ) : (
                      budgetAllocations.slice(0, 4).map((platform, idx) => (
                        <div
                          key={platform.platformId}
                          className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <span className="text-xl">{platform.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-900">{platform.name}</span>
                              <span className="text-sm text-gray-900">
                                {platform.performance}%
                              </span>
                            </div>
                            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${Math.min(platform.performance / 5, 100)}%` }}
                                className="h-full rounded-full bg-gray-900"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 실시간 최적화 피드 */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">최적화 활동</h3>
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    </div>
                    <span className="text-xs text-gray-400">실시간</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {logsLoading ? (
                      <div className="p-8 text-center">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" />
                      </div>
                    ) : optimizationLogs.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="text-sm text-gray-400">연동된 플랫폼이 없습니다</p>
                        <button
                          onClick={() => setActiveTab('platforms')}
                          className="mt-2 text-sm text-gray-900 hover:underline"
                        >
                          플랫폼 연동하기 →
                        </button>
                      </div>
                    ) : (
                      optimizationLogs.map((log, idx) => (
                        <div
                          key={log.id}
                          className="px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-lg">{log.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-sm font-medium text-gray-900">{log.platform}</span>
                                <span className="text-xs text-gray-400">{log.action}</span>
                              </div>
                              <p className="text-sm text-gray-500 truncate">{log.result}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-xs text-gray-400">{log.timestamp}</span>
                              {log.savedAmount && (
                                <p className="text-xs text-gray-900 mt-0.5">
                                  +₩{log.savedAmount.toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
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
                    {insightsLoading ? (
                      <div className="text-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-white/50" />
                      </div>
                    ) : aiInsights.length === 0 ? (
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
                        <Sparkles className="w-6 h-6 mx-auto text-white/50 mb-2" />
                        <p className="text-sm text-white/70">플랫폼 연동 후 AI가 분석합니다</p>
                      </div>
                    ) : (
                      aiInsights.slice(0, 3).map((insight, idx) => (
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
                      ))
                    )}
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
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <PieChart className="w-5 h-5 text-indigo-500" />
                      플랫폼별 예산 배분
                    </h3>
                    <FeatureHelpCard featureId="budget-reallocation" variant="button" />
                  </div>
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-500" />
                AI 분석 결과
              </h3>
              <FeatureHelpCard featureId="anomaly-detection" variant="button" />
            </div>
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

      {/* 플로팅 도움말 버튼 */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1, type: 'spring' }}
        onClick={() => setShowTutorial(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all z-40 hover:scale-110 group"
        title="도움말 및 설정 가이드"
      >
        <HelpCircle className="w-6 h-6 group-hover:rotate-12 transition-transform" />
      </motion.button>

      {/* 튜토리얼 모달 (대시보드용) */}
      <AdOptimizerTutorial
        isOpen={showTutorial}
        onClose={() => setShowTutorial(false)}
        onComplete={() => {
          setTutorialCompleted(true)
          setShowTutorial(false)
        }}
      />
    </div>
  )
}
