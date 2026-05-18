import apiClient from './client'

// 플랜 타입
export type PlanType = 'free' | 'basic' | 'pro' | 'business'

// 플랜 정보
export interface PlanInfo {
  type: PlanType
  name: string
  price_monthly: number
  price_yearly: number
  features: {
    keyword_search_daily: number
    blog_analysis_daily: number
    search_results_count: number
    history_days: number
    competitor_compare: number
    rank_alert: boolean
    excel_export: boolean
    api_access: boolean
    team_members: number
  }
}

// 구독 정보
export interface Subscription {
  user_id: number
  plan_type: PlanType
  plan_name: string
  billing_cycle: 'monthly' | 'yearly' | null
  status: 'active' | 'cancelled' | 'expired'
  started_at: string | null
  expires_at: string | null
  cancelled_at: string | null
  plan_limits: PlanInfo['features']
}

// 사용량 정보
export interface UsageInfo {
  date: string
  keyword_searches: {
    used: number
    limit: number
    remaining: number
  }
  blog_analyses: {
    used: number
    limit: number
    remaining: number
  }
  plan_type: PlanType
  plan_name: string
}

// 사용량 제한 체크 결과
export interface UsageLimitCheck {
  allowed: boolean
  used: number
  limit: number
  remaining: number
  plan: PlanType
  message?: string
  upgrade_message?: string
}

// 결제 준비 정보
export interface PaymentPrepareInfo {
  order_id: string
  order_name: string
  amount: number
  plan_type: PlanType
  billing_cycle: 'monthly' | 'yearly'
  customer_key: string
}

// 결제 내역
export interface PaymentHistory {
  id: number
  order_id: string
  amount: number
  status: string
  payment_method: string | null
  card_company: string | null
  card_number: string | null
  receipt_url: string | null
  paid_at: string | null
  created_at: string
}

// ============ 플랜 API ============

export async function getAllPlans(): Promise<PlanInfo[]> {
  const response = await apiClient.get('/api/subscription/plans')
  return response.data
}

export async function getPlanInfo(planType: PlanType): Promise<PlanInfo> {
  const response = await apiClient.get(`/api/subscription/plans/${planType}`)
  return response.data
}

// ============ 구독 API ============

// 사용량/구독 조회는 단순 PK 조회지만 backend 가 cron tick (naver API timeout
// 폭주 시 30s+ blocking) 동안 응답 못 함. scheduler 분리 후에도 worst-case 보호.
const LIGHT_READ_TIMEOUT_MS = 60000

// 일시적 timeout/네트워크 에러는 1회 재시도. 영구 4xx 는 즉시 throw.
async function lightRead<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const attempt = async () => {
    const response = await apiClient.get(path, {
      params,
      timeout: LIGHT_READ_TIMEOUT_MS,
    })
    return response.data as T
  }
  try {
    return await attempt()
  } catch (e: any) {
    const code = e?.code
    const status = e?.response?.status
    // 4xx (auth/validation) 는 retry 무의미
    if (status && status >= 400 && status < 500) throw e
    // timeout / network / 5xx 만 1회 재시도 (250ms 백오프)
    if (code === 'ECONNABORTED' || code === 'ERR_NETWORK' || !status || status >= 500) {
      await new Promise(r => setTimeout(r, 250))
      return await attempt()
    }
    throw e
  }
}

export async function getMySubscription(userId: number | string): Promise<Subscription> {
  return lightRead<Subscription>('/api/subscription/me', { user_id: userId })
}

export async function upgradeSubscription(
  userId: number | string,
  planType: PlanType,
  billingCycle: 'monthly' | 'yearly' = 'monthly'
): Promise<{ success: boolean; message: string; subscription: Subscription }> {
  const response = await apiClient.post('/api/subscription/upgrade', {
    plan_type: planType,
    billing_cycle: billingCycle
  }, {
    params: { user_id: userId }
  })
  return response.data
}

export async function cancelSubscription(userId: number | string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post('/api/subscription/cancel', null, {
    params: { user_id: userId }
  })
  return response.data
}

// ============ 사용량 API ============

export async function getUsage(userId: number | string): Promise<UsageInfo> {
  return lightRead<UsageInfo>('/api/subscription/usage', { user_id: userId })
}

export async function checkUsageLimit(
  userId: number | string,
  usageType: 'keyword_search' | 'blog_analysis'
): Promise<UsageLimitCheck> {
  const response = await apiClient.get('/api/subscription/usage/check', {
    params: { user_id: userId, usage_type: usageType }
  })
  return response.data
}

export async function incrementUsage(
  userId: number | string,
  usageType: 'keyword_search' | 'blog_analysis'
): Promise<{ success: boolean; usage?: any; used_extra_credit?: boolean }> {
  const response = await apiClient.post('/api/subscription/usage/increment', null, {
    params: { user_id: userId, usage_type: usageType }
  })
  return response.data
}

// ============ 결제 API ============

export async function preparePayment(
  userId: number | string,
  planType: PlanType,
  billingCycle: 'monthly' | 'yearly' = 'monthly'
): Promise<PaymentPrepareInfo> {
  const response = await apiClient.post('/api/payment/prepare', {
    plan_type: planType,
    billing_cycle: billingCycle
  }, {
    params: { user_id: userId }
  })
  return response.data
}

export async function confirmPayment(
  userId: number | string,
  paymentKey: string,
  orderId: string,
  amount: number
): Promise<{ success: boolean; message: string; payment: any }> {
  const response = await apiClient.post('/api/payment/confirm', {
    payment_key: paymentKey,
    order_id: orderId,
    amount: amount
  }, {
    params: { user_id: userId }
  })
  return response.data
}

export async function completeSubscriptionPayment(
  userId: number | string,
  paymentKey: string,
  orderId: string,
  planType: PlanType,
  billingCycle: 'monthly' | 'yearly'
): Promise<{ success: boolean; message: string; subscription: Subscription }> {
  const response = await apiClient.post('/api/payment/subscription/complete', null, {
    params: {
      user_id: userId,
      payment_key: paymentKey,
      order_id: orderId,
      plan_type: planType,
      billing_cycle: billingCycle
    }
  })
  return response.data
}

// 정기결제 등록 (빌링키 발급 + 첫 결제 + 구독 활성화)
export async function registerBilling(
  userId: number | string,
  customerKey: string,
  authKey: string,
  orderId: string,
  amount: number,
  planType: PlanType,
  billingCycle: 'monthly' | 'yearly'
): Promise<{ success: boolean; message: string; subscription: Subscription; payment: any }> {
  const response = await apiClient.post('/api/payment/billing/register', {
    customer_key: customerKey,
    auth_key: authKey,
    order_id: orderId,
    amount: amount,
    plan_type: planType,
    billing_cycle: billingCycle
  }, {
    params: { user_id: userId }
  })
  return response.data
}

export async function getPaymentHistory(
  userId: number | string,
  limit: number = 10
): Promise<{ payments: PaymentHistory[]; count: number }> {
  const response = await apiClient.get('/api/subscription/payments', {
    params: { user_id: userId, limit }
  })
  return response.data
}

// ============ 추가 크레딧 API ============

export async function getExtraCredits(userId: number | string): Promise<{ credits: any[] }> {
  const response = await apiClient.get('/api/subscription/credits', {
    params: { user_id: userId }
  })
  return response.data
}

export async function prepareCreditsPayment(
  userId: number | string,
  creditType: 'keyword' | 'analysis',
  amount: 100 | 500 | 1000
): Promise<{
  order_id: string
  order_name: string
  amount: number
  credit_type: string
  credit_amount: number
  customer_key: string
}> {
  const response = await apiClient.post('/api/payment/credits/prepare', null, {
    params: { user_id: userId, credit_type: creditType, amount }
  })
  return response.data
}

export async function completeCreditsPayment(
  userId: number | string,
  paymentKey: string,
  orderId: string,
  creditType: 'keyword' | 'analysis',
  creditAmount: number
): Promise<{ success: boolean; message: string; credit: any }> {
  const response = await apiClient.post('/api/payment/credits/complete', null, {
    params: {
      user_id: userId,
      payment_key: paymentKey,
      order_id: orderId,
      credit_type: creditType,
      credit_amount: creditAmount
    }
  })
  return response.data
}
