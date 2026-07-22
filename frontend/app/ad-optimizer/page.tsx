'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, Settings, Play, Pause, RefreshCw, Search,
  Plus, Download, Filter, Clock,
  Target, DollarSign,
  AlertTriangle, CheckCircle,
  Zap, BarChart3, ArrowUpRight, ArrowDownRight,
  Loader2, Save, Sparkles, Link2, Wallet, Flame,
  Star, Check, X, ChevronLeft
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import { useRequireAuth } from '@/lib/hooks/useRequireAuth'
import { adGet, adPost, adDelete } from '@/lib/api/adFetch'
import { useFeature } from '@/lib/features/useFeatureAccess'
import Tutorial, { adOptimizerTutorialSteps } from '@/components/Tutorial'
import ValueProposition from '@/components/ad-optimizer/ValueProposition'
import AccountSetupWizard from '@/components/ad-optimizer/AccountSetupWizard'
import QuickConnectForm from '@/components/ad-optimizer/QuickConnectForm'

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
  default_bid?: number
}

const ACTIVE_CID_KEY = 'blank.ad.activeCustomerId'

export default function AdOptimizerPage() {
  const { isAuthenticated, user } = useAuthStore()
  const { allowed: hasAccess, isLocked, upgradeHint } = useFeature('adOptimizer')
  const [activeTab, setActiveTab] = useState<'connect' | 'discover' | 'dashboard' | 'settings'>('connect')
  const [isLoading, setIsLoading] = useState(false)
  const userId = user?.id

  // 계정 연동 상태 (다중 계정 지원)
  // adAccounts: 사용자의 모든 광고주 리스트
  // activeCustomerId: 현재 화면에서 선택된 활성 계정
  // adAccount: 활성 계정의 단수 별칭 — 다른 탭들의 호환을 위해 유지
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([])
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null)
  const [adAccount, setAdAccount] = useState<AdAccount | null>(null)
  const [showAddWizard, setShowAddWizard] = useState(false)
  // 계정 추가 모드: 기본 'quick'(키만 바로 입력), 'tutorial'(8단계 가이드)
  const [addMode, setAddMode] = useState<'quick' | 'tutorial'>('quick')

  // 대시보드 상태
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [recentChanges, setRecentChanges] = useState<BidChange[]>([])
  const [isAutoRunning, setIsAutoRunning] = useState(false)

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

  // 미인증 시 로그인 리다이렉트
  useEffect(() => {
    if (!isAuthenticated && !user) {
      window.location.href = '/login'
    }
  }, [isAuthenticated, user])

  // 모든 Hook 선언 후 조건부 return
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

  // 프로 플랜 미만 사용자 접근 제한 - 프리미엄 유도 팝업
  if (isLocked) {
    return (
      <div className="min-h-screen bg-slate-950 pt-24 flex items-center justify-center p-4 overflow-hidden relative">
        {/* 모던 배경 */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#0064FF] opacity-5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-600 opacity-10 rounded-full blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 max-w-md w-full"
        >
          {/* 프리미엄 카드 */}
          <div className="relative bg-slate-900 backdrop-blur-xl rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
            {/* 헤더 */}
            <div className="relative px-8 pt-10 pb-8">
              {/* 아이콘 */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                className="relative mx-auto w-16 h-16 mb-6"
              >
                <div className="w-full h-full bg-gradient-to-br from-[#0064FF] via-[#3182F6] to-[#4A9AF6] rounded-2xl flex items-center justify-center shadow-lg">
                  <Zap className="w-8 h-8 text-white" />
                </div>
              </motion.div>

              {/* 타이틀 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-center"
              >
                <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
                  AI 광고 자동 최적화
                </h1>
                <p className="text-slate-400 text-sm">
                  잠자는 동안에도 AI가 수익을 극대화합니다
                </p>
              </motion.div>
            </div>

            {/* 핵심 지표 */}
            <div className="px-6 pb-6">
              <div className="flex gap-3 mb-8">
                {[
                  { value: '1분', label: '자동 조정 주기', color: 'text-blue-400' },
                  { value: '342%', label: '평균 ROAS', color: 'text-emerald-400' },
                  { value: '-38%', label: '광고비 절감', color: 'text-amber-400' },
                ].map((stat, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + idx * 0.1 }}
                    className="flex-1 bg-slate-800 rounded-xl p-4 text-center"
                  >
                    <p className={`text-2xl font-bold ${stat.color}`}>
                      {stat.value}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
                  </motion.div>
                ))}
              </div>

              {/* 기능 리스트 */}
              <div className="space-y-2 mb-8">
                {[
                  { icon: Clock, text: '실시간 입찰가 최적화', badge: '24/7' },
                  { icon: TrendingUp, text: 'ROAS 기반 예산 자동 배분', badge: 'AI' },
                  { icon: Target, text: '비효율 키워드 자동 중단', badge: '절감' },
                  { icon: Flame, text: '트렌드 키워드 자동 발굴', badge: '기회' },
                ].map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + idx * 0.08 }}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
                      <item.icon className="w-4 h-4 text-slate-400" />
                    </div>
                    <span className="flex-1 text-sm text-slate-300">{item.text}</span>
                    <span className="px-2 py-0.5 bg-slate-700 text-xs font-semibold text-slate-400 rounded-md uppercase">
                      {item.badge}
                    </span>
                  </motion.div>
                ))}
              </div>

              {/* 비교 카드 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="grid grid-cols-2 gap-3 mb-8"
              >
                <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full" />
                    <span className="text-xs font-semibold text-slate-500 uppercase">수동 관리</span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-500">
                    <li className="flex items-center gap-2">
                      <X className="w-3 h-3" />
                      <span>매일 3시간+ 모니터링</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <X className="w-3 h-3" />
                      <span>감에 의존한 조정</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <X className="w-3 h-3" />
                      <span>기회 손실 발생</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-emerald-800">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">AI 최적화</span>
                    </div>
                    <ul className="space-y-2 text-xs text-slate-300">
                      <li className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>100% 자동 운영</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>데이터 기반 최적화</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>24시간 기회 포착</span>
                      </li>
                    </ul>
                  </div>
                </motion.div>

                {/* 후기 - 심플 */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.1 }}
                  className="mb-8 px-1"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex -space-x-2">
                      {['from-[#0064FF] to-[#3182F6]', 'from-blue-500 to-cyan-500', 'from-emerald-500 to-green-500'].map((gradient, i) => (
                        <div key={i} className={`w-7 h-7 bg-gradient-to-br ${gradient} rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-white`}>
                          {['K', 'L', 'P'][i]}
                        </div>
                      ))}
                    </div>
                    <div className="flex text-amber-400 text-xs gap-0.5">
                      {[...Array(5)].map((_, i) => <Star key={i} className="w-3 h-3 fill-current" />)}
                    </div>
                    <span className="text-slate-500 text-xs">4.9/5</span>
                  </div>
                  <p className="text-sm text-slate-400 italic leading-relaxed">
                    &ldquo;광고 관리 시간이 0이 되었는데, ROAS는 오히려 2배로 올랐어요&rdquo;
                  </p>
                </motion.div>

                {/* CTA */}
                <div className="space-y-3">
                  <motion.div
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Link
                      href="/pricing"
                      className="relative block w-full py-4 text-center rounded-xl font-semibold text-white overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-[#0064FF] via-[#3182F6] to-[#4A9AF6]" />
                      <div className="absolute inset-0 bg-gradient-to-r from-[#0064FF] via-[#3182F6] to-[#4A9AF6] opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="relative flex items-center justify-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        프로 플랜 시작하기
                        <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">₩19,900/월</span>
                      </span>
                    </Link>
                  </motion.div>

                  <Link
                    href="/tools"
                    className="block w-full py-3 text-slate-500 text-center text-sm hover:text-slate-300 transition-colors"
                  >
                    다른 기능 둘러보기 →
                  </Link>
              </div>

              {/* 보장 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                className="mt-4 text-center"
              >
                <p className="text-gray-500 text-xs flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  7일 내 전액 환불 · 언제든 해지 가능 · 위약금 0원
                </p>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  // 대시보드 데이터 로드
  const loadDashboard = useCallback(async () => {
    try {
      const [dashData, changesData] = await Promise.all([
        adGet('/api/naver-ad/dashboard', { userId }),
        adGet('/api/naver-ad/bids/history?limit=20', { userId })
      ])

      if (dashData?.data) {
        setDashboardStats(dashData.data)
        setIsAutoRunning(dashData.data.is_auto_optimization)
      }

      if (changesData) {
        setRecentChanges(changesData.history || [])
      }
    } catch (error) {
      console.error('Dashboard load error:', error)
    }
  }, [userId])

  // 설정 로드
  const loadSettings = useCallback(async () => {
    try {
      const data = await adGet('/api/naver-ad/settings', { userId })
      if (data?.data) {
        setSettings(data.data)
        setBlacklistInput(data.data.blacklist_keywords?.join(', ') || '')
        setCoreTermsInput(data.data.core_terms?.join(', ') || '')
        setConversionKeywordsInput(data.data.conversion_keywords?.join(', ') || '가격, 비용, 구독, 결제, 신청, 구매, 추천, 비교, 후기')
      }
    } catch (error) {
      console.error('Settings load error:', error)
    }
  }, [userId])

  // 광고주 계정 리스트 로드 — /keyword-pool/accounts 가 사용자의 모든 활성 광고주 반환
  // 활성 계정은 localStorage 우선 → 없으면 첫 번째 → 빈 배열이면 null
  const loadAccounts = useCallback(async () => {
    try {
      const data = await adGet<{ success: boolean; accounts: AdAccount[] }>(
        '/api/naver-ad/keyword-pool/accounts',
        { userId }
      )
      const list = data?.accounts || []
      setAdAccounts(list)

      let nextCid: string | null = null
      if (list.length > 0) {
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_CID_KEY) : null
        const valid = stored && list.some(a => a.customer_id === stored)
        nextCid = valid ? stored : list[0].customer_id
        if (typeof window !== 'undefined' && nextCid) {
          window.localStorage.setItem(ACTIVE_CID_KEY, nextCid)
        }
      }
      setActiveCustomerId(nextCid)
      setAdAccount(nextCid ? list.find(a => a.customer_id === nextCid) || null : null)
    } catch (error) {
      console.error('Accounts load error:', error)
    }
  }, [userId])

  // 활성 광고주 전환 — 카드 클릭 / 셀렉터 변경 시
  const selectAccount = useCallback((cid: string) => {
    setActiveCustomerId(cid)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_CID_KEY, cid)
    }
    const found = adAccounts.find(a => a.customer_id === cid) || null
    setAdAccount(found)
  }, [adAccounts])

  // 계정 연동 해제 — 특정 customer_id 대상
  const disconnectAccount = async (customerId: string) => {
    if (!customerId) return
    if (!confirm(`광고주 ${customerId} 의 연동을 해제하시겠습니까?\n\n해당 계정의 자동 최적화/풀 데이터는 더 이상 갱신되지 않습니다.`)) return

    try {
      await adDelete(
        `/api/naver-ad/account/disconnect?customer_id=${encodeURIComponent(customerId)}`,
        { userId }
      )
      toast.success('계정 연동이 해제되었습니다')
      // 활성 계정이었다면 LS 에서도 제거 (loadAccounts 가 새로 픽)
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem(ACTIVE_CID_KEY)
        if (stored === customerId) {
          window.localStorage.removeItem(ACTIVE_CID_KEY)
        }
      }
      await loadAccounts()
    } catch (error) {
      // adFetch handles error toasts automatically
    }
  }

  // 초기 로드
  useEffect(() => {
    loadAccounts()
    loadDashboard()
    loadSettings()
  }, [loadAccounts, loadDashboard, loadSettings])

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
      await adPost(`/api/naver-ad/optimization/${endpoint}`, undefined, { userId })
      setIsAutoRunning(!isAutoRunning)
      toast.success(isAutoRunning ? '자동 최적화가 중지되었습니다' : '자동 최적화가 시작되었습니다')
      loadDashboard()
    } catch (error) {
      // adFetch handles error toasts automatically
    } finally {
      setIsLoading(false)
    }
  }

  // 1회 최적화 실행
  const runOptimizationOnce = async () => {
    setIsLoading(true)
    try {
      const data = await adPost('/api/naver-ad/optimization/run-once', undefined, { userId })
      toast.success(`${data.changes?.length || 0}개 키워드 최적화 완료`)
      loadDashboard()
    } catch (error) {
      // adFetch handles error toasts automatically
    } finally {
      setIsLoading(false)
    }
  }

  // 키워드 발굴
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

      await adPost('/api/naver-ad/settings', updatedSettings, { userId })
      toast.success('설정이 저장되었습니다')
      loadSettings()
    } catch (error) {
      // adFetch handles error toasts automatically
    } finally {
      setIsLoading(false)
    }
  }

  // 비효율 키워드 평가
  const evaluateKeywords = async () => {
    setIsLoading(true)
    try {
      const data = await adPost('/api/naver-ad/keywords/evaluate', undefined, { userId })
      toast.success(`${data.excluded?.length || 0}개 키워드 제외됨`)
      loadDashboard()
    } catch (error) {
      // adFetch handles error toasts automatically
    } finally {
      setIsLoading(false)
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
    <div className="min-h-screen pt-20">
      {/* BETA 경고 배너 - 법적 면책 조항 포함 */}
      <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/10 border-b border-orange-300/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded animate-pulse">BETA</span>
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <p className="text-orange-700 text-sm font-semibold">
                실험적 기능 - 테스트 목적으로만 사용하세요
              </p>
            </div>
            <div className="max-w-3xl">
              <p className="text-orange-600 text-xs leading-relaxed">
                ⚠️ <strong>면책 조항:</strong> 이 기능은 현재 베타 테스트 중이며, 실제 광고 API 연동은 준비 중입니다.
                표시되는 데이터는 시뮬레이션이며, <strong>실제 광고 성과를 보장하지 않습니다.</strong>
                본 기능 사용으로 인한 광고비 손실, 성과 저하 등 어떠한 결과에 대해서도 서비스 제공자는 책임지지 않습니다.
                실제 광고 운영은 전문가와 상담하시기 바랍니다.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 헤더 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-[72px] z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-px h-6 bg-gray-300" />
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-[linear-gradient(135deg,#4C7DFF_0%,#0064FF_46%,#6D3BFF_100%)] flex items-center justify-center">
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
            { id: 'discover', label: '키워드 발굴·자동등록', icon: Sparkles },
            { id: 'dashboard', label: '대시보드', icon: BarChart3 },
            { id: 'settings', label: '설정', icon: Settings }
          ].map(tab => (
            <button
              key={tab.id}
              id={`ad-${tab.id}-tab`}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-white shadow-md bg-[linear-gradient(135deg,#4C7DFF_0%,#0064FF_46%,#6D3BFF_100%)] shadow-[0_6px_18px_rgba(0,100,255,0.28)]'
                  : 'bg-white/70 backdrop-blur text-gray-600 border border-gray-100 hover:bg-white hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Value Proposition - 계정 연동 탭일 때만 표시 */}
        {activeTab === 'connect' && <ValueProposition type="main" />}

        {/* 계정 연동 탭 */}
        {activeTab === 'connect' && (
          <div className="space-y-6">
            {showAddWizard ? (
              <div className="space-y-3">
                <button
                  onClick={() => setShowAddWizard(false)}
                  className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {adAccounts.length > 0 ? '계정 목록으로 돌아가기' : '취소'}
                </button>
                {addMode === 'quick' ? (
                  <QuickConnectForm
                    userId={userId}
                    onComplete={async () => {
                      await loadAccounts()
                      setShowAddWizard(false)
                      setActiveTab('dashboard')
                      loadDashboard()
                    }}
                    onShowTutorial={() => setAddMode('tutorial')}
                  />
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={() => setAddMode('quick')}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      빠른 연동으로 돌아가기
                    </button>
                    <AccountSetupWizard
                      userId={userId}
                      onComplete={async () => {
                        await loadAccounts()
                        setShowAddWizard(false)
                        setActiveTab('dashboard')
                        loadDashboard()
                      }}
                      onStartAutoOptimization={toggleAutoOptimization}
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* 다중 계정 안내 — 2개 이상일 때만 */}
                {adAccounts.length > 1 && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
                    <span className="font-semibold">다중 광고주 모드</span> — 총 {adAccounts.length}개 광고주가 연동되어 있습니다.
                    카드를 클릭하면 활성 광고주가 전환됩니다. 자동 최적화·대시보드는 활성 광고주 기준으로 표시됩니다.
                  </div>
                )}

                {/* 빈 상태 — 등록된 광고주 0개 */}
                {adAccounts.length === 0 && (
                  <div className="rounded-2xl bg-white border-2 border-dashed border-gray-200 p-10 text-center">
                    <div className="w-16 h-16 mx-auto bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                      <Link2 className="w-8 h-8 text-blue-500" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">등록된 광고주 계정이 없습니다</h3>
                    <p className="text-sm text-gray-500">
                      네이버 광고 API 를 처음 연동하면 여기에 카드로 표시됩니다.
                      <br />아래 <span className="font-medium text-gray-700">"+ 새 광고주 계정 추가"</span> 버튼을 누르세요.
                    </p>
                  </div>
                )}

                {/* 광고주 카드 리스트 */}
                <div className="grid gap-3">
                  {adAccounts.map((acct) => {
                    const isActive = acct.customer_id === activeCustomerId
                    return (
                      <motion.div
                        key={acct.customer_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => !isActive && selectAccount(acct.customer_id)}
                        className={`rounded-2xl p-5 transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[linear-gradient(135deg,#4C7DFF_0%,#0064FF_46%,#6D3BFF_100%)] text-white shadow-[0_8px_24px_rgba(0,100,255,0.22)]'
                            : acct.is_connected
                              ? 'bg-white border border-gray-200 hover:border-[#0064FF]/40 hover:shadow-md'
                              : 'bg-white border border-red-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                              isActive ? 'bg-white/20' : acct.is_connected ? 'bg-[#0064FF]/10' : 'bg-red-100'
                            }`}>
                              {acct.is_connected ? (
                                <CheckCircle className={`w-6 h-6 ${isActive ? 'text-white' : 'text-[#0064FF]'}`} />
                              ) : (
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className={`font-bold ${isActive ? 'text-white' : 'text-gray-900'}`}>
                                  {acct.name || '이름 미설정'}
                                </h3>
                                {isActive && (
                                  <span className="px-2 py-0.5 bg-white/25 text-white text-xs rounded-full font-medium">
                                    활성
                                  </span>
                                )}
                                {!acct.is_connected && (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                                    연결끊김
                                  </span>
                                )}
                              </div>
                              <p className={`text-sm ${isActive ? 'text-white/85' : 'text-gray-600'}`}>
                                고객 ID: {acct.customer_id}
                              </p>
                              {acct.last_sync_at && (
                                <p className={`text-xs mt-1 ${isActive ? 'text-white/70' : 'text-gray-500'}`}>
                                  마지막 동기화: {new Date(acct.last_sync_at).toLocaleString('ko-KR')}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              disconnectAccount(acct.customer_id)
                            }}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors flex-shrink-0 ${
                              isActive
                                ? 'bg-white/20 hover:bg-white/30 text-white'
                                : 'bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700'
                            }`}
                          >
                            연동 해제
                          </button>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>

                {/* 새 계정 추가 버튼 */}
                <button
                  onClick={() => { setAddMode('quick'); setShowAddWizard(true) }}
                  className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-700 font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  새 광고주 계정 추가
                </button>
              </>
            )}

            {/* 연동 이점 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid md:grid-cols-3 gap-4"
            >
              <div className="glass-card rounded-2xl p-6">
                <div className="w-12 h-12 bg-[#0064FF]/10 rounded-xl flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-[#0064FF]" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">실시간 자동 최적화</h3>
                <p className="text-sm text-gray-600">24시간 자동으로 입찰가를 조정하여 광고 효율을 극대화합니다.</p>
              </div>

              <div className="glass-card rounded-2xl p-6">
                <div className="w-12 h-12 bg-[#0064FF]/10 rounded-xl flex items-center justify-center mb-4">
                  <Wallet className="w-6 h-6 text-[#0064FF]" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">비용 절감 추적</h3>
                <p className="text-sm text-gray-600">얼마나 비용을 절감했는지 실시간으로 확인할 수 있습니다.</p>
              </div>

              <div className="glass-card rounded-2xl p-6">
                <div className="w-12 h-12 bg-[#0064FF]/10 rounded-xl flex items-center justify-center mb-4">
                  <Flame className="w-6 h-6 text-[#0064FF]" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">트렌드 키워드 추천</h3>
                <p className="text-sm text-gray-600">검색량이 급상승하는 키워드를 자동으로 추천받습니다.</p>
              </div>
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
                  <div className="w-10 h-10 rounded-xl bg-[#0064FF]/10 flex items-center justify-center">
                    <Search className="w-5 h-5 text-[#0064FF]" />
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
                  <div className="w-10 h-10 rounded-xl bg-[#0064FF]/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-[#0064FF]" />
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
                  <div className="w-10 h-10 rounded-xl bg-[#0064FF]/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-[#0064FF]" />
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
                  <div className="w-10 h-10 rounded-xl bg-[#0064FF]/10 flex items-center justify-center">
                    <Target className="w-5 h-5 text-[#0064FF]" />
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
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0064FF] hover:bg-[#0052D4] text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    입찰 최적화 1회 실행
                  </button>

                  <button
                    onClick={evaluateKeywords}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
                    비효율 키워드 평가
                  </button>

                  <button
                    onClick={() => setActiveTab('discover')}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
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
            {/* ===== 핵심: 한 번 입력 → 10만 완전자동 ===== */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-[#0064FF]/10 text-[#0064FF] text-xs font-bold rounded-full">핵심</span>
                <h2 className="text-base font-bold text-gray-800">한 번만 켜두면 자동으로 굴러가는 기능</h2>
              </div>

              {/* HERO: 24h 자동 키워드 풀 — 사이트 공통 브랜드 그라디언트 */}
              <Link
                href="/ad-optimizer/keyword-pool"
                className="spec-sweep block rounded-3xl p-7 text-white relative overflow-hidden transition-all hover:-translate-y-1 bg-[linear-gradient(135deg,#4C7DFF_0%,#0064FF_46%,#6D3BFF_100%)] shadow-[0_12px_40px_rgba(0,100,255,0.28)]"
              >
                <div className="absolute top-3 right-4 px-2.5 py-0.5 bg-white/20 rounded-full text-[10px] font-bold tracking-wider">RECOMMENDED</div>
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Zap className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-extrabold mb-1.5">24시간 자동 키워드 풀</h3>
                    <p className="text-white/90 text-sm leading-relaxed">
                      시드 키워드 <span className="font-bold">한 번만 입력</span>하면 매일 새 키워드를 자동 발굴·중복 제외·즉시 광고 등록.
                      <span className="font-bold"> 최대 10만 개까지 완전 자동</span>으로 채웁니다.
                    </p>
                  </div>
                  <ArrowUpRight className="w-6 h-6 flex-shrink-0" />
                </div>
              </Link>
            </div>

            {/* ===== 엑셀 대량 등록 ===== */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full">엑셀</span>
                <h2 className="text-base font-bold text-gray-800">엑셀 가지고 있을 때 — 수동 대량 등록</h2>
              </div>

              {[
                {
                  href: '/ad-optimizer/volume-filter',
                  icon: Filter,
                  title: '검색량 필터링 → 자동 등록',
                  badge: '권장',
                  desc: '엑셀 → 월 검색량 ≥10만 필터링 → 캠페인 자동 생성 → 광고 등록 (검색량 없는 키워드 자동 제외)',
                },
                {
                  href: '/ad-optimizer/scale-upload',
                  icon: Flame,
                  title: '대량 등록 (10만 규모, 필터 없음)',
                  badge: null,
                  desc: '검색량 체크 없이 엑셀의 모든 키워드를 곧바로 등록. 검색량이 이미 걸러진 엑셀이 있을 때 사용.',
                },
                {
                  href: '/ad-optimizer/keyword-upload',
                  icon: Download,
                  title: '엑셀/CSV 단건 등록 (최대 500개)',
                  badge: null,
                  desc: '단일 광고그룹에 키워드 대량 등록 (500개 이하). 10만 개 이상은 위 "대량 등록"을 사용하세요.',
                },
              ].map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="glass-card block rounded-2xl p-5 transition-all hover:-translate-y-0.5 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#0064FF]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <card.icon className="w-6 h-6 text-[#0064FF]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-gray-900">{card.title}</h3>
                        {card.badge && (
                          <span className="px-2 py-0.5 bg-[#0064FF]/10 text-[#0064FF] text-[10px] font-bold rounded-full">{card.badge}</span>
                        )}
                      </div>
                      <p className="text-gray-500 text-sm leading-relaxed">{card.desc}</p>
                    </div>
                    <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#0064FF] transition-colors flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
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
                    <div className="md:col-span-2 p-4 bg-[#0064FF]/5 rounded-xl border border-[#0064FF]/20">
                      <h4 className="font-semibold text-[#0064FF] mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        전환 최적화 설정
                      </h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-[#0064FF] mb-2">목표 CPA (전환당 비용)</label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="10000000"
                              value={settings.target_cpa}
                              onChange={(e) => setSettings({ ...settings, target_cpa: Number(e.target.value) })}
                              className="w-full px-4 py-3 border border-[#0064FF]/20 rounded-xl focus:ring-2 focus:ring-[#0064FF] bg-white"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">원</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">전환 1건당 허용 가능한 최대 광고비</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[#0064FF] mb-2">전환 가치 (LTV)</label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              max="100000000"
                              value={settings.conversion_value}
                              onChange={(e) => setSettings({ ...settings, conversion_value: Number(e.target.value) })}
                              className="w-full px-4 py-3 border border-[#0064FF]/20 rounded-xl focus:ring-2 focus:ring-[#0064FF] bg-white"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">원</span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">고객 1명의 평균 생애 가치 (예: 월 19,900원 × 6개월 = 119,400원)</p>
                        </div>
                      </div>
                      <div className="mt-3 p-3 bg-white/60 rounded-lg">
                        <p className="text-sm text-gray-700">
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
                    min="0"
                    max="10000"
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
                    min="1"
                    max="100"
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
                    min="0"
                    max="100"
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
                    min="0"
                    max="100000000"
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
                    min="0"
                    max="100000000"
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
                    min="0"
                    max="1"
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
                    min="0"
                    max="100000000"
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
                    min="60"
                    max="86400"
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
                    min="1"
                    max="365"
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
                className="mt-6 flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#0064FF] hover:bg-[#0052D4] text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                설정 저장
              </button>
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
