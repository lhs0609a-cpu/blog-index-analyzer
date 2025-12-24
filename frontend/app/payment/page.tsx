'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { CreditCard, Lock, ArrowLeft, Loader2, CheckCircle, Calendar, Shield, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import { confirmPayment, completeSubscriptionPayment, type PlanType } from '@/lib/api/subscription'
import toast from 'react-hot-toast'

// 토스페이먼츠 클라이언트 키 (라이브) - 자동결제(빌링)용 / MID: bill_nsmard045
const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || 'live_ck_6BYq7GWPVv4LKjjM6ojG8NE5vbo1'

function PaymentContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuthStore()

  const orderId = searchParams.get('orderId') || ''
  const amount = parseInt(searchParams.get('amount') || '0')
  const orderName = searchParams.get('orderName') || ''
  const planType = (searchParams.get('planType') || 'basic') as PlanType
  const billingCycle = (searchParams.get('billingCycle') || 'monthly') as 'monthly' | 'yearly'

  // 빌링키 발급 성공 콜백 파라미터
  const customerKey = searchParams.get('customerKey')
  const authKey = searchParams.get('authKey')
  const success = searchParams.get('success')

  const [isProcessing, setIsProcessing] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  useEffect(() => {
    // 빌링키 발급 성공 콜백 처리
    if (success === 'true' && authKey && customerKey && user?.id) {
      handleBillingSuccess()
    }
  }, [success, authKey, customerKey, user])

  const handleBillingSuccess = async () => {
    if (!user?.id || !authKey || !customerKey) return

    setIsProcessing(true)
    try {
      // 1. 빌링키 발급 확인 및 첫 결제 진행 (백엔드에서 처리)
      await confirmPayment(user.id, authKey, orderId, amount)

      // 2. 구독 완료 처리
      await completeSubscriptionPayment(user.id, authKey, orderId, planType, billingCycle)

      setIsComplete(true)
      toast.success('정기결제 등록이 완료되었습니다!')

      // 3초 후 대시보드로 이동
      setTimeout(() => {
        router.push('/dashboard/subscription')
      }, 3000)

    } catch (error) {
      console.error('Billing registration failed:', error)
      toast.error('정기결제 등록 중 오류가 발생했습니다')
    } finally {
      setIsProcessing(false)
    }
  }

  const initiateBillingPayment = async () => {
    if (!agreedToTerms) {
      toast.error('이용약관 및 환불정책에 동의해주세요')
      return
    }

    if (!TOSS_CLIENT_KEY) {
      toast.error('결제 시스템이 설정되지 않았습니다')
      return
    }

    if (!user?.id) {
      toast.error('로그인이 필요합니다')
      router.push('/login')
      return
    }

    try {
      // 토스페이먼츠 SDK 로드
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY)

      // 고객 고유 키 생성 (사용자 ID 기반)
      const customerKey = `customer_${user.id}_${Date.now()}`

      // 빌링키 발급 요청 (정기결제용)
      await tossPayments.requestBillingAuth('카드', {
        customerKey: customerKey,
        successUrl: `${window.location.origin}/payment?success=true&orderId=${orderId}&planType=${planType}&billingCycle=${billingCycle}&amount=${amount}&orderName=${encodeURIComponent(orderName)}`,
        failUrl: `${window.location.origin}/payment?success=false&orderId=${orderId}`,
      })
    } catch (error) {
      console.error('Toss billing error:', error)
      toast.error('결제창을 열 수 없습니다')
    }
  }

  // 결제 완료 화면
  if (isComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass rounded-3xl p-12 text-center max-w-md"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="inline-flex p-6 rounded-full bg-green-100 mb-6"
          >
            <CheckCircle className="w-16 h-16 text-green-500" />
          </motion.div>
          <h1 className="text-3xl font-bold mb-4">정기결제 등록 완료!</h1>
          <p className="text-gray-600 mb-6">
            블랭크 프리미엄 서비스가 활성화되었습니다.
            <br />
            {billingCycle === 'yearly' ? '1년 후' : '다음 달'} 같은 날짜에 자동 결제됩니다.
          </p>
          <Link href="/dashboard/subscription">
            <button className="px-8 py-3 rounded-xl instagram-gradient text-white font-semibold">
              구독 관리로 이동
            </button>
          </Link>
        </motion.div>
      </div>
    )
  }

  // 처리 중 화면
  if (isProcessing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 animate-spin text-purple-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">정기결제 등록 중...</h1>
          <p className="text-gray-600">잠시만 기다려주세요</p>
        </div>
      </div>
    )
  }

  // 결제 실패
  if (success === 'false') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass rounded-3xl p-12 text-center max-w-md"
        >
          <div className="inline-flex p-6 rounded-full bg-red-100 mb-6">
            <CreditCard className="w-16 h-16 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold mb-4">등록 실패</h1>
          <p className="text-gray-600 mb-6">
            카드 등록이 취소되었거나 오류가 발생했습니다.
            <br />
            다시 시도해주세요.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/pricing">
              <button className="px-8 py-3 rounded-xl bg-gray-200 text-gray-700 font-semibold">
                요금제 보기
              </button>
            </Link>
            <button
              onClick={initiateBillingPayment}
              className="px-8 py-3 rounded-xl instagram-gradient text-white font-semibold"
            >
              다시 시도
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // 결제 시작 화면 (빌링 전용)
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 py-12 px-4">
      <div className="container mx-auto max-w-lg">
        {/* Back Button */}
        <Link href="/pricing">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-8 flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">요금제로 돌아가기</span>
          </motion.button>
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-8"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex p-4 rounded-full instagram-gradient mb-4">
              <CreditCard className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold">정기결제 등록</h1>
            <p className="text-gray-500 mt-2 text-sm">카드를 등록하면 자동으로 결제됩니다</p>
          </div>

          {/* 정기결제 안내 */}
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <RefreshCw className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-purple-800 mb-1">정기결제 서비스</p>
                <p className="text-purple-700">
                  {billingCycle === 'yearly'
                    ? '결제일로부터 12개월(1년) 후 자동 갱신됩니다.'
                    : '결제일로부터 1개월(30일) 후 자동 갱신됩니다.'}
                </p>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-gray-50 rounded-2xl p-6 mb-6">
            <h2 className="font-semibold mb-4">구독 내역</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">상품</span>
                <span className="font-medium">{orderName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">결제 주기</span>
                <span className="font-medium">{billingCycle === 'yearly' ? '연간 (12개월)' : '월간 (1개월)'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">서비스 기간</span>
                <span className="font-medium">{billingCycle === 'yearly' ? '365일' : '30일'}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold">결제 금액</span>
                <span className="font-bold text-xl gradient-text">
                  {amount.toLocaleString()}원{billingCycle === 'yearly' ? '/년' : '/월'}
                </span>
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <Calendar className="w-5 h-5 text-purple-600 mx-auto mb-1" />
              <p className="text-xs text-gray-600">자동 갱신</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <Shield className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <p className="text-xs text-gray-600">7일 환불</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <Lock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xs text-gray-600">안전 결제</p>
            </div>
          </div>

          {/* Terms Agreement */}
          <div className="mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-600">
                <Link href="/terms" className="text-purple-600 hover:underline" target="_blank">
                  이용약관
                </Link>
                {' '}및{' '}
                <Link href="/refund-policy" className="text-purple-600 hover:underline" target="_blank">
                  환불정책
                </Link>
                에 동의합니다. 정기결제는 해지 전까지 자동으로 갱신됩니다.
              </span>
            </label>
          </div>

          {/* Security Notice */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
            <Lock className="w-4 h-4" />
            <span>결제 정보는 토스페이먼츠를 통해 안전하게 처리됩니다</span>
          </div>

          {/* Payment Button */}
          <button
            onClick={initiateBillingPayment}
            disabled={!agreedToTerms}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
              agreedToTerms
                ? 'instagram-gradient text-white hover:shadow-lg'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            카드 등록하고 {amount.toLocaleString()}원 결제하기
          </button>

          {/* Payment Methods */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p className="mb-2">지원 결제 수단</p>
            <div className="flex justify-center gap-3 flex-wrap">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">신용카드</span>
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">체크카드</span>
            </div>
          </div>
        </motion.div>

        {/* Additional Info */}
        <div className="mt-6 text-center text-xs text-gray-400 space-y-1">
          <p>정기결제 해지는 마이페이지에서 언제든 가능합니다.</p>
          <p>
            문의:{' '}
            <a href="mailto:lhs0609c@naver.com" className="hover:text-purple-600">
              lhs0609c@naver.com
            </a>
            {' '}|{' '}
            <a href="tel:010-8465-0609" className="hover:text-purple-600">
              010-8465-0609
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
      </div>
    }>
      <PaymentContent />
    </Suspense>
  )
}

// 토스페이먼츠 SDK 로드 함수
function loadTossPayments(clientKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window is not defined'))
      return
    }

    // @ts-ignore
    if (window.TossPayments) {
      // @ts-ignore
      resolve(window.TossPayments(clientKey))
      return
    }

    const script = document.createElement('script')
    script.src = 'https://js.tosspayments.com/v1/payment'
    script.onload = () => {
      // @ts-ignore
      resolve(window.TossPayments(clientKey))
    }
    script.onerror = () => {
      reject(new Error('Failed to load TossPayments SDK'))
    }
    document.head.appendChild(script)
  })
}
