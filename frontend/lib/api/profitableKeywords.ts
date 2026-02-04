/**
 * Profitable Keywords API - 수익성 키워드
 */

import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ========== Types ==========

export interface ProfitableKeyword {
  id: number
  keyword: string
  category: string

  // 검색 데이터
  monthly_search_volume: number
  search_trend: number

  // 경쟁 데이터
  rank1_blog_level: number
  competition_score: number

  // 내 블로그 기준
  my_level: number
  level_gap: number
  win_probability: number

  // 수익 데이터
  estimated_monthly_revenue: number
  ad_revenue: number
  sponsorship_revenue: number

  // 기회
  opportunity_score: number
  opportunity_tags: string[]
  golden_time: string | null

  last_updated: string | null
}

export interface CategorySummary {
  category: string
  count: number
  total_revenue: number
  avg_competition: number | null
  locked: boolean
}

export interface WinnableKeywordsResponse {
  success: boolean
  blog_id: string
  blog_level: number

  total_winnable: number
  total_potential_revenue: number
  showing: number
  plan_limit: number
  upgrade_to_see: number

  keywords: ProfitableKeyword[]
  categories: CategorySummary[]
  message: string
}

export interface OpportunityKeyword {
  keyword: string
  category: string
  opportunity_type: string
  opportunity_reason: string
  win_probability: number
  estimated_monthly_revenue: number
  urgency: 'high' | 'medium' | 'low'
}

export interface OpportunitiesResponse {
  success: boolean
  blog_level: number
  opportunities: OpportunityKeyword[]
}

// ========== API Functions ==========

/**
 * 내 블로그로 1위 가능한 돈되는 키워드 조회
 */
export async function getWinnableKeywords(
  blogId: string,
  userId?: number,
  options?: {
    category?: string
    sortBy?: 'revenue' | 'probability' | 'search_volume' | 'opportunity'
    minSearchVolume?: number
    minWinProbability?: number
    offset?: number
  }
): Promise<WinnableKeywordsResponse> {
  const params: Record<string, any> = {
    blog_id: blogId
  }

  if (userId) params.user_id = userId
  if (options?.category) params.category = options.category
  if (options?.sortBy) params.sort_by = options.sortBy
  if (options?.minSearchVolume) params.min_search_volume = options.minSearchVolume
  if (options?.minWinProbability) params.min_win_probability = options.minWinProbability
  if (options?.offset) params.offset = options.offset

  const response = await axios.get<WinnableKeywordsResponse>(
    `${API_BASE}/api/profitable-keywords/my-keywords`,
    { params }
  )

  return response.data
}

/**
 * 실시간 기회 키워드 조회
 */
export async function getOpportunityKeywords(
  blogId: string,
  limit: number = 10
): Promise<OpportunitiesResponse> {
  const response = await axios.get<OpportunitiesResponse>(
    `${API_BASE}/api/profitable-keywords/opportunities`,
    {
      params: { blog_id: blogId, limit }
    }
  )

  return response.data
}

/**
 * 카테고리별 요약 조회
 */
export async function getCategorySummary(
  blogId: string
): Promise<CategorySummary[]> {
  const response = await axios.get<CategorySummary[]>(
    `${API_BASE}/api/profitable-keywords/categories`,
    {
      params: { blog_id: blogId }
    }
  )

  return response.data
}

// ========== Helper Functions ==========

/**
 * 수익 포맷팅
 */
export function formatRevenue(amount: number): string {
  if (amount >= 1000000) {
    return `₩${(amount / 1000000).toFixed(1)}M`
  }
  if (amount >= 1000) {
    return `₩${(amount / 1000).toFixed(0)}K`
  }
  return `₩${amount.toLocaleString()}`
}

/**
 * 확률에 따른 색상
 */
export function getProbabilityColor(probability: number): string {
  if (probability >= 90) return 'text-green-600'
  if (probability >= 70) return 'text-blue-600'
  if (probability >= 50) return 'text-yellow-600'
  return 'text-gray-600'
}

/**
 * 확률에 따른 배경색
 */
export function getProbabilityBgColor(probability: number): string {
  if (probability >= 90) return 'bg-green-100'
  if (probability >= 70) return 'bg-blue-100'
  if (probability >= 50) return 'bg-yellow-100'
  return 'bg-gray-100'
}

/**
 * 기회 태그 색상
 */
export function getTagColor(tag: string): string {
  const colors: Record<string, string> = {
    '압도적우위': 'bg-green-500 text-white',
    '매우유리': 'bg-green-400 text-white',
    '유리': 'bg-green-300 text-green-800',
    '경쟁약함': 'bg-blue-100 text-blue-700',
    '경쟁보통': 'bg-gray-100 text-gray-700',
    '1위장기비활성': 'bg-red-500 text-white',
    '1위비활성': 'bg-orange-400 text-white',
    '급상승트렌드': 'bg-purple-500 text-white',
    '상승트렌드': 'bg-purple-300 text-purple-800',
    '체험단활발': 'bg-amber-100 text-amber-700',
  }
  return colors[tag] || 'bg-gray-100 text-gray-700'
}

/**
 * 긴급도 색상
 */
export function getUrgencyColor(urgency: string): string {
  switch (urgency) {
    case 'high': return 'text-red-600 bg-red-50'
    case 'medium': return 'text-orange-600 bg-orange-50'
    default: return 'text-gray-600 bg-gray-50'
  }
}
