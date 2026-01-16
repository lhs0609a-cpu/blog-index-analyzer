'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Check, X, Sparkles, Zap, Crown, Building2, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth'
import { getAllPlans, getMySubscription, preparePayment, type PlanInfo, type PlanType } from '@/lib/api/subscription'
import toast from 'react-hot-toast'

const planIcons: Record<PlanType, React.ReactNode> = {
  free: <Sparkles className="w-8 h-8" />,
  basic: <Zap className="w-8 h-8" />,
  pro: <Crown className="w-8 h-8" />,
  business: <Building2 className="w-8 h-8" />
}

const planColors: Record<PlanType, string> = {
  free: 'from-gray-500 to-gray-600',
  basic: 'from-blue-500 to-cyan-500',
  pro: 'from-purple-500 to-pink-500',
  business: 'from-orange-500 to-red-500'
}

// 기본 플랜 데이터 (API 실패 시 fallback)
const DEFAULT_PLANS: PlanInfo[] = [
  {
    type: 'free',
    name: '무료',
    price_monthly: 0,
    price_yearly: 0,
    features: {
      keyword_search_daily: 8,
      blog_analysis_daily: 2,
      search_results_count: 5,
      history_days: 0,
      competitor_compare: 0,
      rank_alert: false,
      excel_export: false,
      api_access: false,
      team_members: 1
    }
  },
  {
    type: 'basic',
    name: '베이직',
    price_monthly: 9900,
    price_yearly: 95000,
    features: {
      keyword_search_daily: 50,
      blog_analysis_daily: 20,
      search_results_count: 30,
      history_days: 30,
      competitor_compare: 3,
      rank_alert: false,
      excel_export: true,
      api_access: false,
      team_members: 1
    }
  },
  {
    type: 'pro',
    name: '프로',
    price_monthly: 19900,
    price_yearly: 191000,
    features: {
      keyword_search_daily: 200,
      blog_analysis_daily: 100,
      search_results_count: 50,
      history_days: 90,
      competitor_compare: 10,
      rank_alert: true,
      excel_export: true,
      api_access: false,
      team_members: 3
    }
  },
  {
    type: 'business',
    name: '비즈니스',
    price_monthly: 49900,
    price_yearly: 479000,
    features: {
      keyword_search_daily: -1,
      blog_analysis_daily: -1,
      search_results_count: 100,
      history_days: -1,
      competitor_compare: -1,
      rank_alert: true,
      excel_export: true,
      api_access: true,
      team_members: 10
    }
  }
]

export default function PricingPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const [plans, setPlans] = useState<PlanInfo[]>([])
  const [currentPlan, setCurrentPlan] = useState<PlanType>('free')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [isLoading, setIsLoading] = useState(true)
  const [processingPlan, setProcessingPlan] = useState<PlanType | null>(null)

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

    setProcessingPlan(planType)

    try {
      // 결제 준비
      const paymentInfo = await preparePayment(user!.id, planType, billingCycle)

      // 토스페이먼츠 결제창 열기
      // 실제 구현 시에는 토스페이먼츠 SDK를 사용
      // 여기서는 결제 페이지로 이동
      router.push(`/payment?orderId=${paymentInfo.order_id}&amount=${paymentInfo.amount}&orderName=${encodeURIComponent(paymentInfo.order_name)}&planType=${planType}&billingCycle=${billingCycle}`)

    } catch (error) {
      console.error('Failed to prepare payment:', error)
      toast.error('결제 준비 중 오류가 발생했습니다')
    } finally {
      setProcessingPlan(null)
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
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">플랜 정보를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 py-12 px-4">
      <div className="container mx-auto max-w-7xl">
        {/* Back Button */}
        <Link href="/">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-8 flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">홈으로</span>
          </motion.button>
        </Link>

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
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>월간(1개월) 또는 연간(12개월) 정기결제 서비스입니다</span>
          </div>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 p-2 rounded-full glass">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-full font-semibold transition-all ${
                billingCycle === 'monthly'
                  ? 'instagram-gradient text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              월간 결제
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-full font-semibold transition-all ${
                billingCycle === 'yearly'
                  ? 'instagram-gradient text-white'
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative glass rounded-3xl p-6 ${
                  isPro ? 'ring-2 ring-purple-500 shadow-xl' : ''
                } ${isCurrentPlan ? 'ring-2 ring-green-500' : ''}`}
              >
                {isPro && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="px-4 py-1 bg-purple-500 text-white text-sm font-bold rounded-full">
                      가장 인기
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
                      ? 'instagram-gradient text-white hover:shadow-lg'
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
                    '시작하기'
                  )}
                </button>
              </motion.div>
            )
          })}
        </div>

        {/* Features Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-3xl p-8"
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
                  <td className="py-4 px-4 font-medium">키워드 검색 (일)</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {plan.features.keyword_search_daily === -1 ? '무제한' : `${plan.features.keyword_search_daily}회`}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-4 px-4 font-medium">블로그 분석 (일)</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {plan.features.blog_analysis_daily === -1 ? '무제한' : `${plan.features.blog_analysis_daily}회`}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-4 px-4 font-medium">검색 결과 수</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {plan.features.search_results_count}개
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-4 px-4 font-medium">히스토리 저장</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {plan.features.history_days === -1 ? '무제한' : plan.features.history_days === 0 ? '-' : `${plan.features.history_days}일`}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-4 px-4 font-medium">경쟁사 비교</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {plan.features.competitor_compare === -1 ? '무제한' : plan.features.competitor_compare === 0 ? '-' : `${plan.features.competitor_compare}개`}
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
                <tr className="border-b border-gray-100">
                  <td className="py-4 px-4 font-medium">API 접근</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {getFeatureValue(plan.features.api_access)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium">팀 멤버</td>
                  {plans.map(plan => (
                    <td key={plan.type} className="text-center py-4 px-4">
                      {plan.features.team_members}명
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* 35개 도구 상세 비교 */}
          <h3 className="text-xl font-bold text-center mt-12 mb-6">35개 프리미엄 도구</h3>
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
                {/* 기본 도구 - 무료 사용 가능 */}
                <tr className="bg-green-50"><td colSpan={5} className="py-2 px-4 font-bold text-green-700">기본 도구</td></tr>
                {[
                  { name: '키워드 검색', free: '8회/일', basic: '50회/일', pro: '200회/일', biz: '무제한' },
                  { name: '블로그 분석', free: '2회/일', basic: '20회/일', pro: '100회/일', biz: '무제한' },
                  { name: 'AI 제목 생성', free: '3회/일', basic: '30회/일', pro: '무제한', biz: '무제한' },
                  { name: '해시태그 추천', free: '3회/일', basic: '30회/일', pro: '무제한', biz: '무제한' },
                  { name: '키워드 발굴', free: '2회/일', basic: '20회/일', pro: '100회/일', biz: '무제한' },
                ].map((tool, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-3 px-4">{tool.name}</td>
                    <td className="text-center py-3 px-4 text-green-600">{tool.free}</td>
                    <td className="text-center py-3 px-4">{tool.basic}</td>
                    <td className="text-center py-3 px-4">{tool.pro}</td>
                    <td className="text-center py-3 px-4">{tool.biz}</td>
                  </tr>
                ))}

                {/* 베이직 전용 도구 */}
                <tr className="bg-blue-50"><td colSpan={5} className="py-2 px-4 font-bold text-blue-700">베이직+ 도구</td></tr>
                {[
                  { name: 'AI 글쓰기', free: false, basic: '10회/일', pro: '50회/일', biz: '무제한' },
                  { name: '블로그 인사이트', free: false, basic: true, pro: true, biz: true },
                  { name: '노출 순위 예측', free: false, basic: '10회/일', pro: '50회/일', biz: '무제한' },
                  { name: '최적 발행 시간', free: false, basic: true, pro: true, biz: true },
                  { name: '유튜브 스크립트', free: false, basic: '5회/일', pro: '30회/일', biz: '무제한' },
                  { name: '저품질 위험 감지', free: false, basic: true, pro: true, biz: true },
                  { name: '블로그 백업', free: false, basic: '1회/월', pro: '무제한', biz: '무제한' },
                  { name: '엑셀 내보내기', free: false, basic: true, pro: true, biz: true },
                  { name: '히스토리 저장', free: false, basic: '30일', pro: '90일', biz: '무제한' },
                ].map((tool, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-3 px-4">{tool.name}</td>
                    <td className="text-center py-3 px-4">{tool.free === false ? <span className="text-gray-300">✕</span> : tool.free}</td>
                    <td className="text-center py-3 px-4">{tool.basic === true ? <span className="text-green-500">✓</span> : tool.basic}</td>
                    <td className="text-center py-3 px-4">{tool.pro === true ? <span className="text-green-500">✓</span> : tool.pro}</td>
                    <td className="text-center py-3 px-4">{tool.biz === true ? <span className="text-green-500">✓</span> : tool.biz}</td>
                  </tr>
                ))}

                {/* 프로 전용 도구 */}
                <tr className="bg-purple-50"><td colSpan={5} className="py-2 px-4 font-bold text-purple-700">프로+ 도구</td></tr>
                {[
                  { name: '체험단 매칭', free: false, basic: false, pro: true, biz: true },
                  { name: '키워드 순위 추적', free: false, basic: false, pro: '10개', biz: '100개' },
                  { name: '경쟁 블로그 클론 분석', free: false, basic: false, pro: '5회/일', biz: '무제한' },
                  { name: '키워드 유형 분석', free: false, basic: false, pro: true, biz: true },
                  { name: 'AI 댓글 답변', free: false, basic: false, pro: '20회/일', biz: '무제한' },
                  { name: '알고리즘 변화 감지', free: false, basic: false, pro: true, biz: true },
                  { name: '콘텐츠 수명 분석', free: false, basic: false, pro: true, biz: true },
                  { name: '오래된 글 리프레시', free: false, basic: false, pro: true, biz: true },
                  { name: '연관 글 추천', free: false, basic: false, pro: true, biz: true },
                  { name: '멘토-멘티 매칭', free: false, basic: false, pro: true, biz: true },
                  { name: '트렌드 키워드', free: false, basic: false, pro: true, biz: true },
                  { name: '수익화 분석', free: false, basic: false, pro: true, biz: true },
                  { name: '성장 로드맵', free: false, basic: false, pro: true, biz: true },
                  { name: '비밀 키워드 발굴', free: false, basic: false, pro: '5회/일', biz: '무제한' },
                  { name: '순위 알림', free: false, basic: false, pro: true, biz: true },
                ].map((tool, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-3 px-4">{tool.name}</td>
                    <td className="text-center py-3 px-4">{tool.free === false ? <span className="text-gray-300">✕</span> : tool.free}</td>
                    <td className="text-center py-3 px-4">{tool.basic === false ? <span className="text-gray-300">✕</span> : tool.basic === true ? <span className="text-green-500">✓</span> : tool.basic}</td>
                    <td className="text-center py-3 px-4">{tool.pro === true ? <span className="text-green-500">✓</span> : tool.pro}</td>
                    <td className="text-center py-3 px-4">{tool.biz === true ? <span className="text-green-500">✓</span> : tool.biz}</td>
                  </tr>
                ))}

                {/* 비즈니스 전용 도구 */}
                <tr className="bg-amber-50"><td colSpan={5} className="py-2 px-4 font-bold text-amber-700">비즈니스 전용</td></tr>
                {[
                  { name: '네이버 데이터랩 연동', free: false, basic: false, pro: false, biz: true },
                  { name: '쇼핑 키워드 분석', free: false, basic: false, pro: false, biz: true },
                  { name: '플레이스 분석', free: false, basic: false, pro: false, biz: true },
                  { name: '뉴스/실시간 검색어', free: false, basic: false, pro: false, biz: true },
                  { name: '카페 분석', free: false, basic: false, pro: false, biz: true },
                  { name: 'VIEW 탭 분석', free: false, basic: false, pro: false, biz: true },
                  { name: '인플루언서 분석', free: false, basic: false, pro: false, biz: true },
                  { name: '통합검색 분석', free: false, basic: false, pro: false, biz: true },
                  { name: '지식인 분석', free: false, basic: false, pro: false, biz: true },
                  { name: '스마트스토어 연동', free: false, basic: false, pro: false, biz: true },
                  { name: 'API 접근', free: false, basic: false, pro: false, biz: true },
                  { name: '팀 협업 (10명)', free: false, basic: false, pro: false, biz: true },
                ].map((tool, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-3 px-4">{tool.name}</td>
                    <td className="text-center py-3 px-4"><span className="text-gray-300">✕</span></td>
                    <td className="text-center py-3 px-4"><span className="text-gray-300">✕</span></td>
                    <td className="text-center py-3 px-4"><span className="text-gray-300">✕</span></td>
                    <td className="text-center py-3 px-4"><span className="text-green-500">✓</span></td>
                  </tr>
                ))}
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
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <h3 className="font-bold mb-2">자동 갱신</h3>
              <p className="text-sm text-gray-600">
                정기결제는 만료일에 자동 갱신됩니다.<br/>
                갱신 1일 전까지 해지 가능합니다.
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
                7일 이내 전액 환불 가능<br/>
                <Link href="/refund-policy" className="text-purple-600 hover:underline">
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
            <div className="glass rounded-2xl p-6">
              <h3 className="font-bold mb-2">정기결제는 어떻게 작동하나요?</h3>
              <p className="text-gray-600 text-sm">
                월간 결제 시 매월 같은 날짜에, 연간 결제 시 1년 후 같은 날짜에
                등록된 결제수단으로 자동 결제됩니다. 해지는 언제든 가능합니다.
              </p>
            </div>
            <div className="glass rounded-2xl p-6">
              <h3 className="font-bold mb-2">환불 정책은 어떻게 되나요?</h3>
              <p className="text-gray-600 text-sm">
                결제 후 7일 이내 전액 환불이 가능합니다.
                7일 이후에는 남은 기간에 대해 일할 계산하여 환불해드립니다.{' '}
                <Link href="/refund-policy" className="text-purple-600 hover:underline">
                  자세히 보기
                </Link>
              </p>
            </div>
            <div className="glass rounded-2xl p-6">
              <h3 className="font-bold mb-2">언제든 플랜을 변경할 수 있나요?</h3>
              <p className="text-gray-600 text-sm">
                네, 언제든 업그레이드하거나 다운그레이드할 수 있습니다.
                업그레이드 시 즉시 적용되며, 다운그레이드는 현재 결제 기간 종료 후 적용됩니다.
              </p>
            </div>
            <div className="glass rounded-2xl p-6">
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
            <Link href="/terms" className="hover:text-purple-600">이용약관</Link>
            <span>|</span>
            <Link href="/refund-policy" className="hover:text-purple-600">환불정책</Link>
            <span>|</span>
            <a href="mailto:lhs0609c@naver.com" className="hover:text-purple-600">문의하기</a>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
