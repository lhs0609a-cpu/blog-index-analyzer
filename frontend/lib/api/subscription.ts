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

export async function getMySubscription(userId: number | string): Promise<Subscription> {
  const response = await apiClient.get('/api/subscription/me', {
    params: { user_id: userId }
  })
  return response.data
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
  const response = await apiClient.get('/api/subscription/usage', {
    params: { user_id: userId }
  })
  return response.data
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
