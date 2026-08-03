'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Sparkles, Zap, Crown, Building2, ArrowLeft, Loader2, AlertCircle, Shield, Trophy, TrendingUp, Clock, Target, Star, Users, BarChart3, Search, Swords} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth'
import { getAllPlans, getMySubscription, preparePayment, type PlanInfo, type PlanType } from '@/lib/api/subscription'
import { PLAN_INFO, PLAN_LIMITS, FEATURES } from '@/lib/features/featureAccess'
import toast from 'react-hot-toast'

const planIcons: Record<PlanType, React.ReactNode> = {
  free: <Sparkles className="w-8 h-8" />,
  basic: <Zap className="w-8 h-8" />,
  pro: <Crown className="w-8 h-8" />,
  business: <Building2 className="w-8 h-8" />
}

const planColors: Record<PlanType, string> = {
  free: 'from-gray-400 to-gray-500',
  basic: 'from-[#3182F6] to-[#5CA3FF]',
  pro: 'from-[#0064FF] to-[#3182F6]',
  business: 'from-[#0050CC] to-[#0064FF]'
}

// 기본 플랜 데이터 (featureAccess.ts에서 가져온 Single Source of Truth)
const DEFAULT_PLANS: PlanInfo[] = (['free', 'basic', 'pro', 'business'] as const).map(planType => {
  const info = PLAN_INFO[planType]
  const limits = PLAN_LIMITS[planType]
  return {
    type: planType,
    name: info.name,
    price_monthly: info.price,
    price_yearly: info.priceYearly,
    features: {
      keyword_search_daily: limits.keywordSearchDaily,
      blog_analysis_daily: limits.blogAnalysisDaily,
      search_results_count: limits.searchResultsCount,
      history_days: limits.historyDays,
      competitor_compare: limits.competitorCompare,
      rank_alert: limits.rankAlert,
      excel_export: limits.excelExport,
      api_access: limits.apiAccess,
      team_members: limits.teamMembers
    }
  }
})

export default function PricingPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const [plans, setPlans] = useState<PlanInfo[]>([])
  const [currentPlan, setCurrentPlan] = useState<PlanType>('free')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [isLoading, setIsLoading] = useState(true)
  const [processingPlan, setProcessingPlan] = useState<PlanType | null>(null)
  const [showTrialModal, setShowTrialModal] = useState(false)
  const [selectedTrialPlan, setSelectedTrialPlan] = useState<PlanType | null>(null)
  const [trialConsent, setTrialConsent] = useState(false)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      const plansData = await getAllPlans()
      setPlans(plansData && plansData.length > 0 ? plansData : DEFAULT_PLANS)

      if (isAuthenticated && user?.id) {
        try {
          const subscription = await getMySubscription(user.id)
          setCurrentPlan(subscription.plan_type)
        } catch (subError) {
          console.error('Failed to load subscription:', subError)
        }
      }
    } catch (error) {
      console.error('Failed to load plans:', error)
      // API 실패 시 기본 플랜 데이터 사용
      setPlans(DEFAULT_PLANS)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectPlan = async (planType: PlanType) => {
    if (!isAuthenticated) {
      toast.error('로그인이 필요합니다')
      router.push('/login')
      return
    }

    if (planType === 'free') {
      toast('이미 무료 플랜을 사용 중입니다')
      return
    }

    if (planType === currentPlan) {
      toast('현재 사용 중인 플랜입니다')
      return
    }

    // 7일 무료 체험 동의 모달 표시
    setSelectedTrialPlan(planType)
    setTrialConsent(false)
    setShowTrialModal(true)
  }

  const proceedWithPayment = async () => {
    if (!selectedTrialPlan || !trialConsent) return

    setShowTrialModal(false)
    setProcessingPlan(selectedTrialPlan)

    try {
      // 결제 준비
      const paymentInfo = await preparePayment(user!.id, selectedTrialPlan, billingCycle)

      // 토스페이먼츠 결제창 열기
      router.push(`/payment?orderId=${paymentInfo.order_id}&amount=${paymentInfo.amount}&orderName=${encodeURIComponent(paymentInfo.order_name)}&planType=${selectedTrialPlan}&billingCycle=${billingCycle}`)

    } catch (error) {
      console.error('Failed to prepare payment:', error)
      toast.error('결제 준비 중 오류가 발생했습니다')
    } finally {
      setProcessingPlan(null)
      setSelectedTrialPlan(null)
    }
  }

  const formatPrice = (price: number) => {
    return price.toLocaleString('ko-KR')
  }

  const getFeatureValue = (value: number | boolean): string | React.ReactNode => {
    if (typeof value === 'boolean') {
      return value ? <Check className="w-5 h-5 text-green-500" /> : <X className="w-5 h-5 text-gray-300" />
    }
    if (value === -1) return '무제한'
    if (value === 0) return <X className="w-5 h-5 text-gray-300" />
    return `${value}회`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafafa] pt-24 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#0064FF] mx-auto mb-4" />
          <p className="text-gray-600">플랜 정보를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafafa] pt-24 pb-12 px-4">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold mb-4">
            <span className="gradient-text">정기결제 요금제</span>
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            블랭크와 함께 블로그를 성장시키세요
          </p>
          {/* 정기결제 안내 - 토스페이먼츠 심사용 */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-[#0064FF] rounded-full text-sm mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>월간(1개월) 또는 연간(12개월) 정기결제 서비스입니다</span>
          </div>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 p-2 rounded-full bg-white shadow-lg shadow-gray-100/50">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-full font-semibold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-[#0064FF] text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              월간 결제
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-full font-semibold transition-all ${
                billingCycle === 'yearly'
                  ? 'bg-[#0064FF] text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              연간 결제
              <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                20% 할인
              </span>
            </button>
          </div>
        </motion.div>

        {/* Killer Feature: 1위 가능 키워드 미리보기 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12 rounded-3xl overflow-hidden bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 border-2 border-yellow-300 shadow-xl shadow-yellow-200/50"
        >
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center shadow-lg shadow-yellow-500/30">
                  <Trophy className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    1위 가능 키워드 추천
                    <span className="px-2 py-1 text-xs bg-red-500 text-white rounded-full animate-pulse">
                      Pro 전용
                    </span>
                  </h2>
                  <p className="text-gray-600">내 블로그 레벨로 지금 당장 1위 가능한 키워드를 찾아드립니다</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                <TrendingUp className="w-4 h-4" />
                데이터 기반 키워드 추천
              </div>
            </div>

            {/* 데모 키워드 카드 */}
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              {[
                { keyword: '홈트레이닝 루틴', volume: 8400, probability: 94, level: 'Lv.3', myLevel: 'Lv.5', goldenTime: '오후 8-10시' },
                { keyword: '자취 요리 레시피', volume: 12300, probability: 87, level: 'Lv.4', myLevel: 'Lv.5', goldenTime: '저녁 6-8시' },
                { keyword: '노트북 추천 2026', volume: 18500, probability: 78, level: 'Lv.5', myLevel: 'Lv.5', goldenTime: '오전 10-12시' }
              ].map((item, index) => (
                <div
                  key={index}
                  className="p-4 bg-white rounded-2xl border border-yellow-200 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                      index === 0
                        ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white'
                        : index === 1
                        ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-white'
                        : 'bg-gradient-to-r from-orange-300 to-orange-400 text-white'
                    }`}>
                      {index + 1}
                    </div>
                    <div className={`text-xl font-bold ${
                      item.probability >= 90 ? 'text-green-600' : item.probability >= 80 ? 'text-blue-600' : 'text-yellow-600'
                    }`}>
                      {item.probability}%
                    </div>
                  </div>
                  <div className="font-semibold text-gray-900 mb-1">{item.keyword}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <span>월 {item.volume.toLocaleString()}회</span>
                    <span className="flex items-center gap-1 text-amber-600">
                      <Clock className="w-3 h-3" />
                      {item.goldenTime}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">현재 1위: {item.level}</span>
                    <span className="text-blue-600 font-medium">내 레벨: {item.myLevel}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="text-center sm:text-left">
                <p className="text-sm text-gray-600">
                  <strong className="text-gray-900">Pro 플랜</strong>으로 매일 5개의 1위 가능 키워드를 받아보세요
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  블로그 분석 후 맞춤형 키워드 추천 - 골든타임까지 알려드립니다
                </p>
              </div>
              <button
                onClick={() => {
                  const proCard = document.querySelector('[data-plan="pro"]')
                  proCard?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-semibold rounded-xl hover:shadow-lg transition-all whitespace-nowrap"
              >
                <Target className="w-4 h-4" />
                Pro 플랜 시작하기
              </button>
            </div>
          </div>
        </motion.div>

        {/* P1: 사회적 증거 섹션 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-3d p-8 mb-12"
        >
          <h2 className="text-2xl font-bold text-center mb-8">Pro 플랜 주요 기능</h2>

          {/* 기능 수치 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="text-center p-4 rounded-2xl bg-white border border-blue-100">
              <div className="text-3xl md:text-4xl font-black text-[#0064FF] mb-1">42개</div>
              <p className="text-xs md:text-sm text-gray-600">블로그<br/>분석 지표</p>
            </div>
            <div className="text-center p-4 rounded-2xl bg-white border border-green-100">
              <div className="text-3xl md:text-4xl font-black text-green-600 mb-1">5개</div>
              <p className="text-xs md:text-sm text-gray-600">매일 새로운<br/>1위 가능 키워드</p>
            </div>
            <div className="text-center p-4 rounded-2xl bg-white border border-purple-100">
              <div className="text-3xl md:text-4xl font-black text-purple-600 mb-1">200회</div>
              <p className="text-xs md:text-sm text-gray-600">일일<br/>키워드 검색</p>
            </div>
            <div className="text-center p-4 rounded-2xl bg-white border border-amber-100">
              <div className="text-3xl md:text-4xl font-black text-amber-600 mb-1">90일</div>
              <p className="text-xs md:text-sm text-gray-600">히스토리 저장<br/>트렌드 분석</p>
            </div>
          </div>

          {/* 활용 시나리오 */}
          <p className="text-xs text-gray-500 text-center mb-4">* 서비스 활용 시나리오 예시이며, 실제 사용자 후기가 아닙니다</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                name: '맛집 블로거',
                level: '활용 예시',
                content: '1위 가능 키워드 추천 기능으로 경쟁이 적은 키워드를 찾아 집중할 수 있어요.',
                highlight: '키워드 전략 최적화'
              },
              {
                name: '육아 블로거',
                level: '활용 예시',
                content: '블로그 레벨에 맞는 키워드를 추천받아 효율적으로 콘텐츠를 기획할 수 있어요.',
                highlight: '맞춤 키워드 추천'
              },
              {
                name: 'IT 블로거',
                level: '활용 예시',
                content: '경쟁도 분석으로 승산 있는 키워드를 선별하여 시간을 절약할 수 있어요.',
                highlight: '경쟁도 데이터 분석'
              }
            ].map((review, index) => (
              <div key={index} className="p-4 bg-white rounded-2xl border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] flex items-center justify-center text-white font-bold text-sm">
                    {review.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{review.name}</p>
                    <p className="text-xs text-gray-500">{review.level}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-3 leading-relaxed">"{review.content}"</p>
                <div className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium text-center">
                  {review.highlight}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {plans.map((plan, index) => {
            const isCurrentPlan = plan.type === currentPlan
            const isPro = plan.type === 'pro'
            const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
            const monthlyPrice = billingCycle === 'yearly'
              ? Math.round(plan.price_yearly / 12)
              : plan.price_monthly

            return (
              <motion.div
                key={plan.type}
                data-plan={plan.type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative glass-3d p-6  transition-transform ${
                  isPro ? 'ring-2 ring-[#0064FF] shadow-2xl md:scale-105' : ''
                } ${isCurrentPlan ? 'ring-2 ring-green-500' : ''}`}
              >
                {/* P1: Pro 플랜 강조 배지 개선 */}
                {isPro && (
                  <div className="absolute -top-5 left-1/2 transform -translate-x-1/2">
                    <span className="px-6 py-2 bg-gradient-to-r from-[#0064FF] to-blue-500 text-white text-sm font-bold rounded-full shadow-lg flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-300 text-yellow-300" />
                      가장 인기 · 추천
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute -top-4 right-4">
                    <span className="px-4 py-1 bg-green-500 text-white text-sm font-bold rounded-full">
                      현재 플랜
                    </span>
                  </div>
                )}

                {/* Plan Header */}
                <div className="text-center mb-6">
                  <div className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${planColors[plan.type]} text-white mb-4`}>
                    {planIcons[plan.type]}
                  </div>
                  <h3 className="text-2xl font-bold">{plan.name}</h3>
                </div>

                {/* Price */}
                <div className="text-center mb-6">
                  {plan.price_monthly === 0 ? (
                    <div className="text-4xl font-bold">무료</div>
                  ) : (
                    <>
                      <div className="text-4xl font-bold">
                        {formatPrice(monthlyPrice)}
                        <span className="text-lg text-gray-500 font-normal">/월</span>
                      </div>
                      {billingCycle === 'yearly' && (
                        <div className="text-sm text-gray-500 mt-1">
                          연 {formatPrice(price)}원 (월 환산)
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-sm">
                      키워드 검색 {plan.features.keyword_search_daily === -1 ? '무제한' : `${plan.features.keyword_search_daily}회/일`}
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-sm">
                      블로그 분석 {plan.features.blog_analysis_daily === -1 ? '무제한' : `${plan.features.blog_analysis_daily}회/일`}
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-sm">
                      검색 결과 {plan.features.search_results_count}개
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    {plan.features.history_days > 0 || plan.features.history_days === -1 ? (
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <X className="w-5 h-5 text-gray-300 flex-shrink-0" />
                    )}
                    <span className={`text-sm ${plan.features.history_days === 0 ? 'text-gray-400' : ''}`}>
                      히스토리 {plan.features.history_days === -1 ? '무제한' : plan.features.history_days === 0 ? '미제공' : `${plan.features.history_days}일`}
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    {plan.features.rank_alert ? (
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <X className="w-5 h-5 text-gray-300 flex-shrink-0" />
                    )}
                    <span className={`text-sm ${!plan.features.rank_alert ? 'text-gray-400' : ''}`}>
                      순위 알림
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    {plan.features.excel_export ? (
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <X className="w-5 h-5 text-gray-300 flex-shrink-0" />
                    )}
                    <span className={`text-sm ${!plan.features.excel_export ? 'text-gray-400' : ''}`}>
                      엑셀 내보내기
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    {plan.features.api_access ? (
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <X className="w-5 h-5 text-gray-300 flex-shrink-0" />
                    )}
                    <span className={`text-sm ${!plan.features.api_access ? 'text-gray-400' : ''}`}>
                      API 접근
                    </span>
                  </li>
                </ul>

                {/* CTA Button */}
                <button
                  onClick={() => handleSelectPlan(plan.type)}
                  disabled={isCurrentPlan || processingPlan !== null}
                  className={`w-full py-3 rounded-xl font-semibold transition-all ${
                    isCurrentPlan
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : isPro
                      ? 'bg-[#0064FF] text-white hover:shadow-lg shadow-lg shadow-[#0064FF]/15'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  } disabled:opacity-50`}
                >
                  {processingPlan === plan.type ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      처리 중...
                    </span>
                  ) : isCurrentPlan ? (
                    '현재 플랜'
                  ) : plan.type === 'free' ? (
                    '무료 시작'
                  ) : (
                    <span className="flex flex-col">
                      <span>월 {formatPrice(monthlyPrice)}원으로 시작</span>
                      <span className="text-xs opacity-80">7일 내 전액 환불 보장</span>
                    </span>
                  )}
                </button>
              </motion.div>
            )
          })}
        </div>

        {/* Pro 플랜 핵심 기능 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="rounded-3xl p-8 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/50 shadow-xl mb-12"
        >
          <h2 className="text-2xl font-bold text-center mb-2">Pro 플랜으로 할 수 있는 것</h2>
          <p className="text-center text-gray-600 mb-8">데이터 기반 블로그 성장 전략을 세워보세요</p>

          {/* 핵심 기능 카드 */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {/* 기능 1: 키워드 경쟁도 분석 */}
            <div className="bg-white rounded-2xl p-6 border border-emerald-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Search className="w-6 h-6 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center" strokeWidth={1.75} />
                <div>
                  <div className="font-bold text-gray-900">경쟁도 분석</div>
                  <div className="text-xs text-gray-500">일 200회 검색</div>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">분석 지표</span>
                  <span className="text-[#0064FF] font-bold">42개</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">검색 결과</span>
                  <span className="text-[#0064FF] font-bold">50개</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">히스토리 저장</span>
                  <span className="text-[#0064FF] font-bold">90일</span>
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-sm text-[#0064FF]">
                내 레벨로 경쟁 가능한 키워드를<br/>데이터로 확인하세요
              </div>
            </div>

            {/* 기능 2: 순위 추적 */}
            <div className="bg-white rounded-2xl p-6 border border-emerald-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <BarChart3 className="w-6 h-6 w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center" strokeWidth={1.75} />
                <div>
                  <div className="font-bold text-gray-900">순위 추적</div>
                  <div className="text-xs text-gray-500">실시간 모니터링</div>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">블로그탭 순위</span>
                  <span className="text-orange-600 font-bold">실시간</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">VIEW탭 순위</span>
                  <span className="text-orange-600 font-bold">실시간</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">순위 알림</span>
                  <Check className="w-5 h-5 text-green-500" />
                </div>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 text-sm text-orange-700">
                내 포스트의 검색 순위 변화를<br/>실시간으로 추적하세요
              </div>
            </div>

            {/* 기능 3: 경쟁사 비교 */}
            <div className="bg-white rounded-2xl p-6 border border-emerald-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center"><Swords className="w-6 h-6 text-purple-600" strokeWidth={1.75} /></div>
                <div>
                  <div className="font-bold text-gray-900">경쟁사 비교</div>
                  <div className="text-xs text-gray-500">최대 10개 블로그</div>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">비교 가능</span>
                  <span className="text-purple-600 font-bold">10개</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">엑셀 내보내기</span>
                  <Check className="w-5 h-5 text-green-500" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">팀 멤버</span>
                  <span className="text-purple-600 font-bold">3명</span>
                </div>
              </div>
              <div className="bg-purple-50 rounded-xl p-3 text-sm text-purple-700">
                상위 블로거들과 내 블로그를<br/>직접 비교 분석하세요
              </div>
            </div>
          </div>

          {/* 기능 요약 */}
          <div className="bg-white rounded-2xl p-6 border border-emerald-200">
            <h3 className="font-bold text-center mb-4">Pro 플랜 핵심 가치</h3>
            <div className="grid md:grid-cols-4 gap-4 text-center">
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-2xl font-bold text-gray-900">42개</div>
                <div className="text-xs text-gray-500">분석 지표</div>
              </div>
              <div className="p-4 bg-blue-50 rounded-xl">
                <div className="text-2xl font-bold text-blue-600">200회/일</div>
                <div className="text-xs text-gray-500">키워드 검색</div>
              </div>
              <div className="p-4 bg-green-50 rounded-xl">
                <div className="text-2xl font-bold text-green-600">실시간</div>
                <div className="text-xs text-gray-500">순위 알림</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-xl">
                <div className="text-2xl font-bold text-purple-600">90일</div>
                <div className="text-xs text-gray-500">히스토리 저장</div>
              </div>
            </div>
            <p className="text-xs text-gray-500 text-center mt-4">
              * 블로그 성장은 콘텐츠 품질, 포스팅 빈도, 키워드 전략 등 다양한 요소에 따라 달라집니다.<br/>
              블랭크는 데이터 기반 인사이트를 제공하며, 특정 수익이나 방문자 수를 보장하지 않습니다.
            </p>
          </div>
        </motion.div>

        {/* Features Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-3d p-8 "
        >
          <h2 className="text-2xl font-bold text-center mb-8">기능 비교</h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-4 px-4">기능</th>
                  {plans.map(plan => (
                    <th key={plan.type} className="text-center py-4 px-4">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-4 px-4 font-medium">일일 사용량</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {plan.features.keyword_search_daily === -1 ? '무제한' : `${plan.features.keyword_search_daily}회`}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-4 px-4 font-medium">순위 알림</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {getFeatureValue(plan.features.rank_alert)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-4 px-4 font-medium">엑셀 내보내기</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {getFeatureValue(plan.features.excel_export)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium">API 접근</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {getFeatureValue(plan.features.api_access)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* 핵심 도구 상세 비교 - featureAccess.ts에서 동적 생성 */}
          <h3 className="text-xl font-bold text-center mt-12 mb-6">핵심 도구</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4">도구</th>
                  <th className="text-center py-3 px-4">무료</th>
                  <th className="text-center py-3 px-4">베이직</th>
                  <th className="text-center py-3 px-4">프로</th>
                  <th className="text-center py-3 px-4">비즈니스</th>
                </tr>
              </thead>
              <tbody>
                {/* 콘텐츠 제작 */}
                <tr className="bg-green-50"><td colSpan={5} className="py-2 px-4 font-bold text-green-700">콘텐츠 제작</td></tr>
                {Object.entries(FEATURES)
                  .filter(([, f]) => f.category === 'content')
                  .map(([key, feature]) => {
                    const getAccessLabel = (level: string) => {
                      if (level === 'none') return <span className="text-gray-300">✕</span>
                      if (level === 'limited') return '제한'
                      return '무제한'
                    }
                    return (
                      <tr key={key} className="border-b border-gray-100">
                        <td className="py-3 px-4">{feature.displayName}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.free)}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.basic)}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.pro)}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.business)}</td>
                      </tr>
                    )
                  })}

                {/* 분석 & 추적 */}
                <tr className="bg-blue-50"><td colSpan={5} className="py-2 px-4 font-bold text-blue-700">분석 & 추적</td></tr>
                {Object.entries(FEATURES)
                  .filter(([, f]) => f.category === 'analysis')
                  .map(([key, feature]) => {
                    const getAccessLabel = (level: string) => {
                      if (level === 'none') return <span className="text-gray-300">✕</span>
                      if (level === 'limited') return '제한'
                      return '무제한'
                    }
                    return (
                      <tr key={key} className="border-b border-gray-100">
                        <td className="py-3 px-4">{feature.displayName}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.free)}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.basic)}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.pro)}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.business)}</td>
                      </tr>
                    )
                  })}

                {/* 프리미엄 전용 */}
                <tr className="bg-purple-50"><td colSpan={5} className="py-2 px-4 font-bold text-[#0064FF]">프리미엄 전용</td></tr>
                {Object.entries(FEATURES)
                  .filter(([, f]) => f.category === 'premium')
                  .map(([key, feature]) => {
                    const getAccessLabel = (level: string) => {
                      if (level === 'none') return <span className="text-gray-300">✕</span>
                      if (level === 'limited') return '제한'
                      return '무제한'
                    }
                    return (
                      <tr key={key} className="border-b border-gray-100">
                        <td className="py-3 px-4">{feature.displayName}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.free)}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.basic)}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.pro)}</td>
                        <td className="text-center py-3 px-4">{getAccessLabel(feature.access.business)}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* 정기결제 상세 안내 - 토스페이먼츠 심사용 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mt-12 glass rounded-3xl p-8"
        >
          <h2 className="text-2xl font-bold text-center mb-6">정기결제 서비스 안내</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[#0064FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-bold mb-2">서비스 제공 기간</h3>
              <p className="text-sm text-gray-600">
                <strong>월간 결제:</strong> 결제일로부터 1개월(30일)<br/>
                <strong>연간 결제:</strong> 결제일로부터 12개월(365일)
              </p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="font-bold mb-2">한 클릭 해지</h3>
              <p className="text-sm text-gray-600">
                마이페이지에서 클릭 한 번으로 해지<br/>
                <span className="text-green-600 font-medium">전화 상담 없이 즉시 처리</span>
              </p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-bold mb-2">환불 정책</h3>
              <p className="text-sm text-gray-600">
                7일 이내 전액 환불<br/>
                이후 남은 기간 일할 계산 환불<br/>
                <span className="text-xs text-gray-500">(예: 15일 사용 시 50% 환불)</span><br/>
                <Link href="/refund-policy" className="text-[#0064FF] hover:underline transition-colors">
                  자세한 환불정책 보기 →
                </Link>
              </p>
            </div>
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-16 text-center"
        >
          <h2 className="text-2xl font-bold mb-4">자주 묻는 질문</h2>
          <p className="text-gray-600 mb-8">
            궁금한 점이 있으시면 언제든 문의해주세요
          </p>

          <div className="grid md:grid-cols-2 gap-6 text-left max-w-4xl mx-auto">
            <div className="glass-3d p-6">
              <h3 className="font-bold mb-2">정기결제는 어떻게 작동하나요?</h3>
              <p className="text-gray-600 text-sm">
                월간 결제 시 매월 같은 날짜에, 연간 결제 시 1년 후 같은 날짜에
                등록된 결제수단으로 자동 결제됩니다.<br/>
                <strong className="text-green-600">마이페이지에서 클릭 한 번으로 즉시 해지</strong> 가능합니다.
              </p>
            </div>
            <div className="glass-3d p-6">
              <h3 className="font-bold mb-2">환불 정책은 어떻게 되나요?</h3>
              <p className="text-gray-600 text-sm">
                <strong>7일 이내:</strong> 서비스 미사용 시 전액 환불<br/>
                <strong>7일 이후:</strong> 남은 기간 일할 계산 환불<br/>
                <span className="text-xs text-gray-500">
                  (예: Pro 월간 19,900원, 15일 사용 후 해지 → 9,950원 환불)
                </span><br/>
                <Link href="/refund-policy" className="text-[#0064FF] hover:underline transition-colors">
                  자세히 보기
                </Link>
              </p>
            </div>
            <div className="glass-3d p-6">
              <h3 className="font-bold mb-2">언제든 플랜을 변경할 수 있나요?</h3>
              <p className="text-gray-600 text-sm">
                네, 언제든 업그레이드하거나 다운그레이드할 수 있습니다.
                업그레이드 시 즉시 적용되며, 다운그레이드는 현재 결제 기간 종료 후 적용됩니다.
              </p>
            </div>
            <div className="glass-3d p-6">
              <h3 className="font-bold mb-2">결제 수단은 무엇이 있나요?</h3>
              <p className="text-gray-600 text-sm">
                신용카드와 체크카드를 지원합니다.
              </p>
            </div>
          </div>
        </motion.div>

        {/* 하단 링크 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-12 text-center text-sm text-gray-500"
        >
          <div className="flex justify-center gap-4 flex-wrap">
            <Link href="/terms" className="hover:text-[#0064FF]">이용약관</Link>
            <span>|</span>
            <Link href="/refund-policy" className="hover:text-[#0064FF]">환불정책</Link>
            <span>|</span>
            <a href="mailto:lhs0609c@naver.com" className="hover:text-[#0064FF]">문의하기</a>
          </div>
        </motion.div>
      </div>

      {/* 7일 무료 체험 동의 모달 */}
      <AnimatePresence>
        {showTrialModal && selectedTrialPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowTrialModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-[#0064FF]/10 flex items-center justify-center mx-auto mb-4">
                  <Crown className="w-8 h-8 text-[#0064FF]" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {PLAN_INFO[selectedTrialPlan].name} 플랜 시작하기
                </h3>
                <p className="text-gray-600">
                  7일 이내 미사용 시 100% 환불해드립니다
                </p>
              </div>

              {/* 체험 안내 - 신뢰도 강화 */}
              <div className="bg-green-50 rounded-2xl p-4 mb-6 border border-green-200">
                <div className="flex items-start gap-3 mb-3">
                  <Shield className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-green-800 mb-1">한 클릭으로 언제든 해지</p>
                    <p className="text-green-700">
                      마이페이지에서 <strong>클릭 한 번</strong>으로 바로 해지됩니다.<br/>
                      전화나 상담 없이 즉시 처리!
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-green-800 mb-1">7일 이내 전액 환불</p>
                    <p className="text-green-700">
                      결제 후 7일 이내 서비스 미사용 시 <strong>100% 환불</strong> · 이후엔 남은 기간 일할 계산 환불
                    </p>
                  </div>
                </div>
              </div>

              {/* 체험 일정 */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">오늘 결제 금액</span>
                  <span className="font-medium">{PLAN_INFO[selectedTrialPlan].price.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between items-center text-sm mt-2">
                  <span className="text-gray-600">전액 환불 가능 기한</span>
                  <span className="font-medium">결제일로부터 7일</span>
                </div>
                <div className="flex justify-between items-center text-sm mt-2">
                  <span className="text-gray-600">다음 결제일</span>
                  <span className="font-medium text-[#0064FF]">{billingCycle === 'yearly' ? '1년 후' : '한 달 후'} 같은 날짜</span>
                </div>
              </div>

              {/* P1: 동의 체크박스 - UX 개선 */}
              <label className={`flex items-start gap-3 mb-6 cursor-pointer p-4 rounded-xl border-2 transition-all ${
                trialConsent ? 'bg-blue-50 border-[#0064FF]' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="checkbox"
                  checked={trialConsent}
                  onChange={(e) => setTrialConsent(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-[#0064FF] focus:ring-[#0064FF] mt-0.5 flex-shrink-0"
                />
                <span className="text-sm text-gray-700">
                  <strong>이용약관 및 환불정책에 동의합니다</strong>
                  <br/>
                  <span className="text-xs text-gray-500 mt-1 block">
                    지금 {PLAN_INFO[selectedTrialPlan].price.toLocaleString()}원이 결제되며 이후 자동 갱신됩니다. 7일 이내 미사용 시 전액 환불되고, 언제든 마이페이지에서 클릭 한 번으로 해지할 수 있습니다.
                    <Link href="/terms" className="text-[#0064FF] hover:underline ml-1">
                      전문 보기
                    </Link>
                  </span>
                </span>
              </label>

              {/* P1: 버튼 - UX 개선 */}
              <div className="space-y-3">
                <button
                  onClick={proceedWithPayment}
                  disabled={!trialConsent || processingPlan !== null}
                  className="w-full py-4 bg-[#0064FF] text-white font-bold rounded-xl hover:shadow-lg shadow-lg shadow-[#0064FF]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                >
                  {processingPlan ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      처리 중...
                    </span>
                  ) : (
                    `${PLAN_INFO[selectedTrialPlan].price.toLocaleString()}원 결제하고 시작하기`
                  )}
                </button>

                {/* 신뢰 배지 */}
                {!processingPlan && (
                  <div className="text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                    <Shield className="w-3 h-3" />
                    <span>7일 내 전액 환불 · 위약금 0원 · 클릭 한 번으로 해지</span>
                  </div>
                )}

                <button
                  onClick={() => setShowTrialModal(false)}
                  className="w-full py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors bg-gray-50 rounded-xl hover:bg-gray-100"
                >
                  나중에 할게요
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
