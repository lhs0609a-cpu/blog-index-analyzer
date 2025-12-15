'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { CreditCard, Lock, ArrowLeft, Loader2, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import { confirmPayment, completeSubscriptionPayment, type PlanType } from '@/lib/api/subscription'
import toast from 'react-hot-toast'

// 토스페이먼츠 클라이언트 키 (환경변수에서)
const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || ''

function PaymentContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuthStore()

  const orderId = searchParams.get('orderId') || ''
  const amount = parseInt(searchParams.get('amount') || '0')
  const orderName = searchParams.get('orderName') || ''
  const planType = (searchParams.get('planType') || 'basic') as PlanType
  const billingCycle = (searchParams.get('billingCycle') || 'monthly') as 'monthly' | 'yearly'

  // 결제 성공 콜백 파라미터
  const paymentKey = searchParams.get('paymentKey')
  const success = searchParams.get('success')

  const [isProcessing, setIsProcessing] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    // 결제 성공 콜백 처리
    if (success === 'true' && paymentKey && orderId && user?.id) {
      handlePaymentSuccess()
    }
  }, [success, paymentKey, orderId, user])

  const handlePaymentSuccess = async () => {
    if (!user?.id || !paymentKey || !orderId) return

    setIsProcessing(true)
    try {
      // 1. 결제 승인
      await confirmPayment(user.id, paymentKey, orderId, amount)

      // 2. 구독 완료 처리
      await completeSubscriptionPayment(user.id, paymentKey, orderId, planType, billingCycle)

      setIsComplete(true)
      toast.success('결제가 완료되었습니다!')

      // 3초 후 대시보드로 이동
      setTimeout(() => {
        router.push('/dashboard/subscription')
      }, 3000)

    } catch (error) {
      console.error('Payment confirmation failed:', error)
      toast.error('결제 처리 중 오류가 발생했습니다')
    } finally {
      setIsProcessing(false)
    }
  }

  const initiateTossPayment = async () => {
    if (!TOSS_CLIENT_KEY) {
      toast.error('결제 시스템이 설정되지 않았습니다')
      return
    }

    try {
      // 토스페이먼츠 SDK 로드 (실제 구현 시)
      // @ts-ignore
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY)

      await tossPayments.requestPayment('카드', {
        amount: amount,
        orderId: orderId,
        orderName: orderName,
        customerName: user?.name || '고객',
        successUrl: `${window.location.origin}/payment?success=true&orderId=${orderId}&planType=${planType}&billingCycle=${billingCycle}`,
        failUrl: `${window.location.origin}/payment?success=false&orderId=${orderId}`,
      })
    } catch (error) {
      console.error('Toss payment error:', error)
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
          <h1 className="text-3xl font-bold mb-4">결제 완료!</h1>
          <p className="text-gray-600 mb-6">
            블랭크 프리미엄 서비스를 이용해주셔서 감사합니다.
            <br />
            잠시 후 구독 관리 페이지로 이동합니다.
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
          <h1 className="text-2xl font-bold mb-2">결제 처리 중...</h1>
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
          <h1 className="text-3xl font-bold mb-4">결제 실패</h1>
          <p className="text-gray-600 mb-6">
            결제가 취소되었거나 오류가 발생했습니다.
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
              onClick={initiateTossPayment}
              className="px-8 py-3 rounded-xl instagram-gradient text-white font-semibold"
            >
              다시 시도
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // 결제 시작 화면
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
            <h1 className="text-3xl font-bold">결제하기</h1>
          </div>

          {/* Order Summary */}
          <div className="bg-gray-50 rounded-2xl p-6 mb-8">
            <h2 className="font-semibold mb-4">주문 내역</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">상품</span>
                <span className="font-medium">{orderName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">결제 주기</span>
                <span className="font-medium">{billingCycle === 'yearly' ? '연간' : '월간'}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold">총 결제 금액</span>
                <span className="font-bold text-xl gradient-text">
                  {amount.toLocaleString()}원
                </span>
              </div>
            </div>
          </div>

          {/* Security Notice */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
            <Lock className="w-4 h-4" />
            <span>결제 정보는 안전하게 암호화되어 전송됩니다</span>
          </div>

          {/* Payment Button */}
          <button
            onClick={initiateTossPayment}
            className="w-full py-4 rounded-xl instagram-gradient text-white font-bold text-lg hover:shadow-lg transition-all"
          >
            {amount.toLocaleString()}원 결제하기
          </button>

          {/* Payment Methods */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p className="mb-2">결제 수단</p>
            <div className="flex justify-center gap-4 flex-wrap">
              <span className="px-3 py-1 bg-gray-100 rounded-full">신용카드</span>
              <span className="px-3 py-1 bg-gray-100 rounded-full">계좌이체</span>
              <span className="px-3 py-1 bg-gray-100 rounded-full">카카오페이</span>
              <span className="px-3 py-1 bg-gray-100 rounded-full">네이버페이</span>
            </div>
          </div>
        </motion.div>

        {/* Terms */}
        <p className="text-center text-xs text-gray-400 mt-6">
          결제를 진행하면 <span className="underline">이용약관</span> 및{' '}
          <span className="underline">환불 정책</span>에 동의하는 것으로 간주됩니다.
        </p>
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

// 토스페이먼츠 SDK 로드 함수 (실제 구현 시 사용)
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
