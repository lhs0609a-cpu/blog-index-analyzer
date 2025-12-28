'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  CreditCard, Calendar, Zap, Crown, AlertCircle,
  ArrowLeft, Loader2, CheckCircle, XCircle, Receipt,
  TrendingUp, Search, BarChart3, Clock
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth'
import {
  getMySubscription, getUsage, getPaymentHistory, cancelSubscription,
  type Subscription, type UsageInfo, type PaymentHistory
} from '@/lib/api/subscription'
import toast from 'react-hot-toast'

const planColors: Record<string, string> = {
  free: 'from-gray-500 to-gray-600',
  basic: 'from-blue-500 to-cyan-500',
  pro: 'from-purple-500 to-pink-500',
  business: 'from-orange-500 to-red-500'
}

export default function SubscriptionPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [payments, setPayments] = useState<PaymentHistory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user])

  const loadData = async () => {
    if (!user?.id) return

    try {
      const [subData, usageData, paymentData] = await Promise.all([
        getMySubscription(user.id),
        getUsage(user.id),
        getPaymentHistory(user.id)
      ])

      setSubscription(subData)
      setUsage(usageData)
      setPayments(paymentData.payments)
    } catch (error) {
      console.error('Failed to load subscription data:', error)
      toast.error('구독 정보를 불러오는데 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!user?.id) return

    setIsCancelling(true)
    try {
      await cancelSubscription(user.id)
      toast.success('구독이 취소되었습니다')
      setShowCancelModal(false)
      loadData()
    } catch (error) {
      console.error('Failed to cancel subscription:', error)
      toast.error('구독 취소에 실패했습니다')
    } finally {
      setIsCancelling(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0 // 무제한
    return Math.min((used / limit) * 100, 100)
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 70) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600">구독 정보를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 py-8 px-4">
      <div className="container mx-auto max-w-4xl">
        {/* Back Button */}
        <Link href="/dashboard">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-6 flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">대시보드로</span>
          </motion.button>
        </Link>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2">
            <span className="gradient-text">구독 관리</span>
          </h1>
          <p className="text-gray-600">구독 상태와 사용량을 확인하세요</p>
        </motion.div>

        {/* Current Plan Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-3xl p-8 mb-6"
        >
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-2xl bg-gradient-to-br ${planColors[subscription?.plan_type || 'free']} text-white`}>
                {subscription?.plan_type === 'pro' ? (
                  <Crown className="w-8 h-8" />
                ) : (
                  <Zap className="w-8 h-8" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold">{subscription?.plan_name} 플랜</h2>
                <div className="flex items-center gap-2 mt-1">
                  {subscription?.status === 'active' ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-600 text-sm font-medium">활성</span>
                    </>
                  ) : subscription?.status === 'cancelled' ? (
                    <>
                      <Clock className="w-4 h-4 text-yellow-500" />
                      <span className="text-yellow-600 text-sm font-medium">취소됨 (만료 전)</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-red-600 text-sm font-medium">만료됨</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              {subscription?.plan_type !== 'free' && subscription?.status === 'active' && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                >
                  구독 취소
                </button>
              )}
              <Link href="/pricing">
                <button className="px-6 py-2 rounded-xl instagram-gradient text-white font-semibold text-sm">
                  {subscription?.plan_type === 'free' ? '업그레이드' : '플랜 변경'}
                </button>
              </Link>
            </div>
          </div>

          {/* Plan Details */}
          {subscription?.plan_type !== 'free' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-2xl">
              <div>
                <div className="text-sm text-gray-500 mb-1">결제 주기</div>
                <div className="font-semibold">
                  {subscription?.billing_cycle === 'yearly' ? '연간' : '월간'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">시작일</div>
                <div className="font-semibold">{formatDate(subscription?.started_at || null)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">다음 결제일</div>
                <div className="font-semibold">{formatDate(subscription?.expires_at || null)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">상태</div>
                <div className="font-semibold capitalize">{subscription?.status}</div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Usage Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-3xl p-8 mb-6"
        >
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-purple-600" />
            오늘의 사용량
          </h3>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Keyword Search Usage */}
            <div className="p-4 bg-gray-50 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold">키워드 검색</span>
                </div>
                <span className="text-sm text-gray-500">
                  {usage?.keyword_searches.limit === -1
                    ? `${usage?.keyword_searches.used}회 사용`
                    : `${usage?.keyword_searches.used} / ${usage?.keyword_searches.limit}회`
                  }
                </span>
              </div>
              {usage?.keyword_searches.limit !== -1 && (
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getUsageColor(getUsagePercentage(usage?.keyword_searches.used || 0, usage?.keyword_searches.limit || 1))} transition-all`}
                    style={{ width: `${getUsagePercentage(usage?.keyword_searches.used || 0, usage?.keyword_searches.limit || 1)}%` }}
                  />
                </div>
              )}
              {usage?.keyword_searches.limit === -1 && (
                <div className="text-sm text-green-600 font-medium">무제한</div>
              )}
              {usage?.keyword_searches.remaining !== undefined && usage.keyword_searches.remaining !== -1 && usage.keyword_searches.remaining <= 3 && (
                <div className="mt-2 text-sm text-orange-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  남은 횟수가 적습니다
                </div>
              )}
            </div>

            {/* Blog Analysis Usage */}
            <div className="p-4 bg-gray-50 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                  <span className="font-semibold">블로그 분석</span>
                </div>
                <span className="text-sm text-gray-500">
                  {usage?.blog_analyses.limit === -1
                    ? `${usage?.blog_analyses.used}회 사용`
                    : `${usage?.blog_analyses.used} / ${usage?.blog_analyses.limit}회`
                  }
                </span>
              </div>
              {usage?.blog_analyses.limit !== -1 && (
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getUsageColor(getUsagePercentage(usage?.blog_analyses.used || 0, usage?.blog_analyses.limit || 1))} transition-all`}
                    style={{ width: `${getUsagePercentage(usage?.blog_analyses.used || 0, usage?.blog_analyses.limit || 1)}%` }}
                  />
                </div>
              )}
              {usage?.blog_analyses.limit === -1 && (
                <div className="text-sm text-green-600 font-medium">무제한</div>
              )}
              {usage?.blog_analyses.remaining !== undefined && usage.blog_analyses.remaining !== -1 && usage.blog_analyses.remaining <= 1 && (
                <div className="mt-2 text-sm text-orange-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  남은 횟수가 적습니다
                </div>
              )}
            </div>
          </div>

          {/* Upgrade CTA */}
          {subscription?.plan_type === 'free' && (
            <div className="mt-6 p-4 bg-purple-50 rounded-2xl flex items-center justify-between">
              <div>
                <div className="font-semibold text-purple-900">더 많은 검색이 필요하신가요?</div>
                <div className="text-sm text-purple-700">베이직 플랜으로 업그레이드하면 30회까지 검색할 수 있어요</div>
              </div>
              <Link href="/pricing">
                <button className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold text-sm hover:bg-purple-700">
                  업그레이드
                </button>
              </Link>
            </div>
          )}
        </motion.div>

        {/* Payment History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-3xl p-8"
        >
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-purple-600" />
            결제 내역
          </h3>

          {payments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>결제 내역이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${
                      payment.status === 'completed' ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <CreditCard className={`w-5 h-5 ${
                        payment.status === 'completed' ? 'text-green-600' : 'text-gray-400'
                      }`} />
                    </div>
                    <div>
                      <div className="font-medium">{payment.order_id}</div>
                      <div className="text-sm text-gray-500">
                        {formatDate(payment.paid_at || payment.created_at)}
                        {payment.card_company && ` · ${payment.card_company}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{payment.amount.toLocaleString()}원</div>
                    <div className={`text-xs ${
                      payment.status === 'completed' ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {payment.status === 'completed' ? '결제 완료' : payment.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full"
          >
            <div className="text-center mb-6">
              <div className="inline-flex p-4 rounded-full bg-red-100 mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold mb-2">구독을 취소하시겠습니까?</h3>
              <p className="text-gray-600">
                구독을 취소해도 현재 결제 기간이 끝날 때까지는
                프리미엄 기능을 계속 사용할 수 있습니다.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-3 rounded-xl bg-gray-200 font-semibold hover:bg-gray-300 transition-colors"
              >
                유지하기
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={isCancelling}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isCancelling ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    처리 중...
                  </span>
                ) : (
                  '구독 취소'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
