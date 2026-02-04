/**
 * Marketplace API - 블로그 상위노출 마켓플레이스
 */

import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ========== Types ==========

export interface GigRequest {
  id: number
  client_id: number
  keyword: string
  category: string | null
  budget_min: number
  budget_max: number
  target_rank_min: number
  target_rank_max: number
  maintain_days: number
  content_requirements: string | null
  photo_count: number
  min_word_count: number
  business_name: string | null
  status: string
  bid_count: number
  expires_at: string | null
  created_at: string

  // 분석 데이터
  keyword_difficulty: number | null
  recommended_level: number | null
  current_rank1_level: number | null
  estimated_success_rate: number | null
  market_price_min: number | null
  market_price_max: number | null

  // 상세 가이드라인
  photo_source: 'business_provided' | 'blogger_takes' | 'mixed'
  visit_required: boolean
  product_provided: boolean
  required_keywords: string[] | null
  prohibited_keywords: string[] | null
  tone_manner: 'friendly' | 'professional' | 'informative' | 'casual'
  writing_style: string | null
  required_shots: string[] | null
  photo_instructions: string | null
  reference_urls: string[] | null
  reference_images: string[] | null
  brand_guidelines: string | null
  structure_type: 'free' | 'visit_review' | 'product_review' | 'information'
  required_sections: string[] | null
  dos_and_donts: { dos: string[], donts: string[] } | null
  additional_instructions: string | null

  // 블로거용 추가 필드
  my_win_probability?: number
}

export interface GigBid {
  id: number
  request_id: number
  blogger_id: number
  blog_id: string
  bid_amount: number
  estimated_days: number
  message: string | null
  blog_level: number
  blog_score: number
  keyword_win_probability: number
  success_rate: number
  status: string
  created_at: string

  // 프로필 정보
  display_name: string | null
  avg_rating: number | null
  total_reviews: number | null
  is_verified: boolean
  is_pro: boolean
}

export interface Contract {
  id: number
  request_id: number
  bid_id: number
  client_id: number
  blogger_id: number
  blog_id: string
  keyword: string
  agreed_amount: number
  platform_fee: number
  blogger_payout: number
  target_rank_min: number
  target_rank_max: number
  maintain_days: number
  status: string
  post_url: string | null
  post_title: string | null
  published_at: string | null
  success_days: number
  created_at: string

  // 관계 데이터
  business_name?: string
  blogger_name?: string
  blog_level?: number
}

export interface Verification {
  id: number
  contract_id: number
  checked_at: string
  blog_tab_rank: number
  view_tab_rank: number
  is_target_met: boolean
  consecutive_days: number
}

export interface Settlement {
  id: number
  contract_id: number
  blogger_id: number
  gross_amount: number
  platform_fee: number
  net_amount: number
  status: string
  keyword?: string
  agreed_amount?: number
  post_url?: string
}

export interface BloggerProfile {
  id: number
  user_id: number
  blog_id: string
  display_name: string | null
  bio: string | null
  blog_level: number
  total_gigs: number
  completed_gigs: number
  success_rate: number
  avg_rating: number
  total_reviews: number
  total_earnings: number
  is_verified: boolean
  is_pro: boolean
  is_available: boolean
  min_price: number
}

export interface Notification {
  id: number
  user_id: number
  type: string
  title: string
  message: string | null
  link: string | null
  request_id: number | null
  bid_id: number | null
  contract_id: number | null
  is_read: boolean
  created_at: string
}

export interface MarketplaceStats {
  total_requests: number
  open_requests: number
  total_contracts: number
  completed_contracts: number
  total_volume: number
  success_rate: number
}

// ========== 의뢰 API ==========

export interface CreateRequestData {
  keyword: string
  budget_min: number
  budget_max: number
  target_rank_min?: number
  target_rank_max?: number
  maintain_days?: number
  content_requirements?: string
  photo_count?: number
  min_word_count?: number
  business_name?: string
  category?: string
  expires_hours?: number
  // 상세 가이드라인
  photo_source?: 'business_provided' | 'blogger_takes' | 'mixed'
  visit_required?: boolean
  product_provided?: boolean
  required_keywords?: string[]
  prohibited_keywords?: string[]
  tone_manner?: 'friendly' | 'professional' | 'informative' | 'casual'
  writing_style?: string
  required_shots?: string[]
  photo_instructions?: string
  reference_urls?: string[]
  reference_images?: string[]
  brand_guidelines?: string
  structure_type?: 'free' | 'visit_review' | 'product_review' | 'information'
  required_sections?: string[]
  dos_and_donts?: { dos: string[], donts: string[] }
  additional_instructions?: string
}

export async function createRequest(
  clientId: number,
  data: CreateRequestData
): Promise<{ success: boolean; request_id: number; message: string }> {
  const response = await axios.post(
    `${API_BASE}/api/marketplace/requests`,
    data,
    { params: { client_id: clientId } }
  )
  return response.data
}

export async function getRequest(requestId: number): Promise<GigRequest> {
  const response = await axios.get(`${API_BASE}/api/marketplace/requests/${requestId}`)
  return response.data.request
}

export async function getOpenRequests(
  options?: {
    bloggerId?: number
    blogId?: string
    category?: string
    minBudget?: number
    limit?: number
    offset?: number
  }
): Promise<{ requests: GigRequest[]; blogger_level: number }> {
  const params: Record<string, any> = {}
  if (options?.bloggerId) params.blogger_id = options.bloggerId
  if (options?.blogId) params.blog_id = options.blogId
  if (options?.category) params.category = options.category
  if (options?.minBudget) params.min_budget = options.minBudget
  if (options?.limit) params.limit = options.limit
  if (options?.offset) params.offset = options.offset

  const response = await axios.get(`${API_BASE}/api/marketplace/requests`, { params })
  return response.data
}

export async function getMyRequests(
  clientId: number,
  status?: string
): Promise<GigRequest[]> {
  const params: Record<string, any> = { client_id: clientId }
  if (status) params.status = status

  const response = await axios.get(`${API_BASE}/api/marketplace/my-requests`, { params })
  return response.data.requests
}

// ========== 입찰 API ==========

export async function createBid(
  bloggerId: number,
  data: {
    request_id: number
    blog_id: string
    bid_amount: number
    estimated_days?: number
    message?: string
  }
): Promise<{ success: boolean; bid_id: number; message: string }> {
  const response = await axios.post(
    `${API_BASE}/api/marketplace/bids`,
    data,
    { params: { blogger_id: bloggerId } }
  )
  return response.data
}

export async function getBidsForRequest(
  requestId: number,
  clientId: number
): Promise<{ request: GigRequest; bids: GigBid[] }> {
  const response = await axios.get(
    `${API_BASE}/api/marketplace/requests/${requestId}/bids`,
    { params: { client_id: clientId } }
  )
  return response.data
}

export async function getMyBids(
  bloggerId: number,
  status?: string
): Promise<GigBid[]> {
  const params: Record<string, any> = { blogger_id: bloggerId }
  if (status) params.status = status

  const response = await axios.get(`${API_BASE}/api/marketplace/my-bids`, { params })
  return response.data.bids
}

export async function selectBid(
  bidId: number,
  clientId: number
): Promise<{ success: boolean; contract_id: number; message: string }> {
  const response = await axios.post(
    `${API_BASE}/api/marketplace/bids/${bidId}/select`,
    {},
    { params: { client_id: clientId } }
  )
  return response.data
}

// ========== 계약 API ==========

export async function getContract(
  contractId: number,
  userId: number
): Promise<{ contract: Contract; verifications: Verification[] }> {
  const response = await axios.get(
    `${API_BASE}/api/marketplace/contracts/${contractId}`,
    { params: { user_id: userId } }
  )
  return response.data
}

export async function getMyContracts(
  userId: number,
  role: 'blogger' | 'client',
  status?: string
): Promise<Contract[]> {
  const params: Record<string, any> = { user_id: userId, role }
  if (status) params.status = status

  const response = await axios.get(`${API_BASE}/api/marketplace/my-contracts`, { params })
  return response.data.contracts
}

export async function processPayment(
  contractId: number,
  paymentId: string,
  clientId: number
): Promise<{ success: boolean; message: string }> {
  const response = await axios.post(
    `${API_BASE}/api/marketplace/contracts/${contractId}/payment`,
    {},
    { params: { payment_id: paymentId, client_id: clientId } }
  )
  return response.data
}

export async function submitPost(
  contractId: number,
  bloggerId: number,
  postUrl: string,
  postTitle?: string
): Promise<{ success: boolean; message: string }> {
  const response = await axios.post(
    `${API_BASE}/api/marketplace/contracts/${contractId}/submit-post`,
    { post_url: postUrl, post_title: postTitle },
    { params: { blogger_id: bloggerId } }
  )
  return response.data
}

export async function startVerification(
  contractId: number,
  clientId: number
): Promise<{ success: boolean; message: string }> {
  const response = await axios.post(
    `${API_BASE}/api/marketplace/contracts/${contractId}/start-verification`,
    {},
    { params: { client_id: clientId } }
  )
  return response.data
}

// ========== 정산 API ==========

export async function getSettlements(bloggerId: number): Promise<Settlement[]> {
  const response = await axios.get(
    `${API_BASE}/api/marketplace/settlements`,
    { params: { blogger_id: bloggerId } }
  )
  return response.data.settlements
}

// ========== 리뷰 API ==========

export async function createReview(
  contractId: number,
  userId: number,
  role: 'client' | 'blogger',
  rating: number,
  review: string
): Promise<{ success: boolean; message: string }> {
  const response = await axios.post(
    `${API_BASE}/api/marketplace/contracts/${contractId}/review`,
    { rating, review },
    { params: { user_id: userId, role } }
  )
  return response.data
}

// ========== 프로필 API ==========

export async function getBloggerProfile(userId: number): Promise<BloggerProfile | null> {
  const response = await axios.get(`${API_BASE}/api/marketplace/profile/blogger/${userId}`)
  return response.data.profile
}

export async function updateBloggerProfile(
  userId: number,
  blogId: string,
  data: {
    display_name?: string
    bio?: string
    categories?: string
    is_available?: boolean
    min_price?: number
    bank_name?: string
    account_number?: string
    account_holder?: string
  }
): Promise<{ success: boolean; profile_id: number }> {
  const response = await axios.put(
    `${API_BASE}/api/marketplace/profile/blogger`,
    data,
    { params: { user_id: userId, blog_id: blogId } }
  )
  return response.data
}

// ========== 알림 API ==========

export async function getNotifications(
  userId: number,
  unreadOnly: boolean = false,
  limit: number = 20
): Promise<Notification[]> {
  const response = await axios.get(`${API_BASE}/api/marketplace/notifications`, {
    params: { user_id: userId, unread_only: unreadOnly, limit }
  })
  return response.data.notifications
}

export async function markNotificationsRead(
  userId: number,
  notificationIds?: number[]
): Promise<{ success: boolean }> {
  const response = await axios.post(
    `${API_BASE}/api/marketplace/notifications/read`,
    notificationIds || null,
    { params: { user_id: userId } }
  )
  return response.data
}

// ========== 통계 API ==========

export async function getMarketplaceStats(): Promise<MarketplaceStats> {
  const response = await axios.get(`${API_BASE}/api/marketplace/stats`)
  return response.data.stats
}

// ========== Helper Functions ==========

export function formatBudget(min: number, max: number): string {
  const formatK = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(0)}만` : `${(n / 1000).toFixed(0)}천`
  return `₩${formatK(min)} ~ ₩${formatK(max)}`
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: '입찰 진행 중',
    bidding: '입찰자 있음',
    matched: '블로거 선택됨',
    in_progress: '진행 중',
    verifying: '순위 검증 중',
    completed: '완료',
    failed: '실패',
    cancelled: '취소됨',
    expired: '입찰 마감',

    pending: '대기 중',
    selected: '선택됨',
    rejected: '미선택',
    withdrawn: '철회',

    pending_payment: '결제 대기',
    paid: '결제 완료',
    writing: '글 작성 중',
    published: '발행 완료',
    success: '성공',
    disputed: '분쟁 중',
    settled: '정산 완료'
  }
  return labels[status] || status
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    bidding: 'bg-yellow-100 text-yellow-700',
    matched: 'bg-purple-100 text-purple-700',
    in_progress: 'bg-indigo-100 text-indigo-700',
    verifying: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-700',

    pending: 'bg-gray-100 text-gray-700',
    selected: 'bg-green-100 text-green-700',
    pending_payment: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    settled: 'bg-emerald-100 text-emerald-700'
  }
  return colors[status] || 'bg-gray-100 text-gray-700'
}
