/**
 * 토스페이먼츠 빌링(정기결제) 시작.
 *
 * 왜 따로 뺐나: 결제창을 여는 코드가 요금제 모달과 /payment 두 곳에 필요한데,
 * 복사해 두면 한쪽만 고치는 사고가 난다. 결제는 그 사고의 대가가 가장 비싼 자리다.
 *
 * ⚠️ 이 함수는 결제창을 '여는' 데까지만 책임진다. 카드 등록 결과는 토스가
 * successUrl / failUrl 로 돌려보내므로 그 처리는 /payment 가 한다.
 */
import { track } from '@/lib/analytics/track'

interface TossPaymentsInstance {
  requestBillingAuth: (
    method: string,
    options: { customerKey: string; successUrl: string; failUrl: string }
  ) => Promise<void>
}

interface TossPaymentsSDK {
  (clientKey: string): TossPaymentsInstance
}

declare global {
  interface Window {
    TossPayments?: TossPaymentsSDK
  }
}

export const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || ''

/** crypto.randomUUID 가 없는 브라우저용 폴백 */
function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function loadTossPayments(clientKey: string): Promise<TossPaymentsInstance> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('브라우저에서만 호출할 수 있습니다'))
      return
    }
    if (window.TossPayments) {
      resolve(window.TossPayments(clientKey))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://js.tosspayments.com/v1/payment'
    script.onload = () => {
      if (window.TossPayments) resolve(window.TossPayments(clientKey))
      else reject(new Error('TossPayments SDK loaded but not initialized'))
    }
    script.onerror = () => reject(new Error('Failed to load TossPayments SDK'))
    document.head.appendChild(script)
  })
}

export type BillingAuthParams = {
  userId: number | string
  orderId: string
  amount: number
  orderName: string
  planType: string
  billingCycle: 'monthly' | 'yearly'
}

/**
 * 결제창 호출 결과.
 *
 * `cancelled` 를 `failed` 와 반드시 구분한다. 사용자가 창을 닫은 것과 창이
 * 안 뜬 것은 처방이 정반대다 — 전자는 가격·설득 문제고 후자는 우리 버그다.
 * 한 칸에 뭉쳐 기록하면 진단이 그 자리에서 거짓말을 시작한다.
 */
export type BillingAuthResult = 'opened' | 'cancelled' | 'failed'

/** 토스가 사용자 이탈로 돌려주는 코드 */
const USER_ABORT_CODES = new Set(['PAY_PROCESS_CANCELED', 'USER_CANCEL', 'PAY_PROCESS_ABORTED'])

export async function startBillingAuth(p: BillingAuthParams): Promise<BillingAuthResult> {
  if (!TOSS_CLIENT_KEY) {
    track('payment_widget_error', { userId: p.userId, reason: 'client_key_missing' })
    return 'failed'
  }

  // 돌아올 주소에 주문 정보를 실어야 실패 화면에서 "다시 시도"가 복원된다.
  const back = (ok: boolean) =>
    `${window.location.origin}/payment?success=${ok}&orderId=${encodeURIComponent(p.orderId)}` +
    `&planType=${encodeURIComponent(p.planType)}&billingCycle=${p.billingCycle}` +
    `&amount=${p.amount}&orderName=${encodeURIComponent(p.orderName)}`

  try {
    const toss = await loadTossPayments(TOSS_CLIENT_KEY)
    track('payment_widget_open', {
      userId: p.userId,
      props: { plan: p.planType, cycle: p.billingCycle, amount: p.amount, method: '카드' },
    })
    await toss.requestBillingAuth('카드', {
      customerKey: `customer_${p.userId}_${uuid()}`,
      successUrl: back(true),
      failUrl: back(false),
    })
    // 보통 여기까지 오지 않는다 — 결제창이 뜨면 브라우저가 토스로 넘어간다.
    return 'opened'
  } catch (e) {
    const code = (e as { code?: string })?.code || ''
    if (USER_ABORT_CODES.has(code)) {
      // 창은 정상적으로 떴고 사용자가 닫았다. 우리 오류가 아니다.
      track('payment_return_fail', {
        userId: p.userId,
        reason: code,
        props: { plan: p.planType, cycle: p.billingCycle, amount: p.amount, at: 'widget' },
      })
      return 'cancelled'
    }
    console.error('Toss billing error:', e)
    track('payment_widget_error', {
      userId: p.userId,
      reason: code || 'sdk_or_open_failed',
      props: { plan: p.planType, cycle: p.billingCycle },
    })
    return 'failed'
  }
}
