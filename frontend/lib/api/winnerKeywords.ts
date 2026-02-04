/**
 * Winner Keywords API - 1위 보장 키워드
 */

import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ========== Types ==========

export interface GoldenTime {
  slot: 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night'
  start_hour: number
  end_hour: number
  day_of_week: string | null
  reason: string
  confidence: number
}

export interface WinnerKeyword {
  keyword: string

  // 1위 확률
  win_probability: number  // 0-100
  win_grade: 'guaranteed' | 'very_high' | 'high' | 'moderate' | 'low'

  // 기본 정보
  search_volume: number
  current_rank1_level: number
  my_level: number
  level_gap: number  // 양수면 내가 높음

  // 경쟁 정보
  top10_avg_score: number
  top10_min_score: number
  influencer_count: number
  high_scorer_count: number

  // 골든타임
  golden_time: GoldenTime | null

  // 점수
  bos_score: number
  safety_score: number

  // 팁
  tips: string[]
  why_winnable: string[]
}

export interface QuickWinnersResponse {
  success: boolean
  my_blog_id: string
  my_level: number
  keywords: WinnerKeyword[]
  message: string
}

export interface DailyWinnersResponse {
  success: boolean
  my_blog_id: string
  my_level: number
  my_score: number
  analysis_date: string

  guaranteed_keywords: WinnerKeyword[]
  high_chance_keywords: WinnerKeyword[]
  moderate_keywords: WinnerKeyword[]

  total_analyzed: number
  total_winnable: number
  best_keyword: WinnerKeyword | null
  message: string
}

// ========== API Functions ==========

/**
 * 빠른 1위 가능 키워드 조회 (대시보드 위젯용)
 */
export async function getQuickWinners(
  myBlogId: string,
  limit: number = 5
): Promise<QuickWinnersResponse> {
  const response = await axios.get<QuickWinnersResponse>(
    `${API_BASE}/api/winner-keywords/quick-winners`,
    {
      params: {
        my_blog_id: myBlogId,
        limit
      }
    }
  )
  return response.data
}

/**
 * 일일 1위 가능 키워드 분석 (Pro 전용)
 */
export async function getDailyWinners(
  myBlogId: string,
  userId?: number,
  categories?: string[],
  minSearchVolume: number = 500,
  maxKeywords: number = 10
): Promise<DailyWinnersResponse> {
  const response = await axios.get<DailyWinnersResponse>(
    `${API_BASE}/api/winner-keywords/daily-winners`,
    {
      params: {
        my_blog_id: myBlogId,
        user_id: userId,
        categories: categories?.join(','),
        min_search_volume: minSearchVolume,
        max_keywords: maxKeywords
      }
    }
  )
  return response.data
}

/**
 * 특정 키워드의 1위 확률 분석
 */
export async function analyzeWinChance(
  keyword: string,
  myBlogId: string
): Promise<{
  success: boolean
  keyword: string
  win_probability?: number
  win_grade?: string
  search_volume?: number
  current_rank1_level?: number
  my_level?: number
  level_gap?: number
  golden_time?: GoldenTime
  tips?: string[]
  why_winnable?: string[]
  message: string
}> {
  const response = await axios.get(
    `${API_BASE}/api/winner-keywords/analyze-win-chance`,
    {
      params: {
        keyword,
        my_blog_id: myBlogId
      }
    }
  )
  return response.data
}

// ========== Helper Functions ==========

/**
 * 1위 확률 등급에 따른 색상 반환
 */
export function getWinGradeColor(grade: string): string {
  switch (grade) {
    case 'guaranteed':
      return 'text-green-600 bg-green-100'
    case 'very_high':
      return 'text-emerald-600 bg-emerald-100'
    case 'high':
      return 'text-blue-600 bg-blue-100'
    case 'moderate':
      return 'text-yellow-600 bg-yellow-100'
    case 'low':
      return 'text-gray-600 bg-gray-100'
    default:
      return 'text-gray-600 bg-gray-100'
  }
}

/**
 * 1위 확률 등급 한글 변환
 */
export function getWinGradeLabel(grade: string): string {
  switch (grade) {
    case 'guaranteed':
      return '거의 확실'
    case 'very_high':
      return '매우 높음'
    case 'high':
      return '높음'
    case 'moderate':
      return '보통'
    case 'low':
      return '낮음'
    default:
      return grade
  }
}

/**
 * 골든타임 슬롯 한글 변환
 */
export function getGoldenTimeSlotLabel(slot: string): string {
  switch (slot) {
    case 'morning':
      return '오전'
    case 'lunch':
      return '점심'
    case 'afternoon':
      return '오후'
    case 'evening':
      return '저녁'
    case 'night':
      return '밤'
    default:
      return slot
  }
}

/**
 * 골든타임 포맷팅
 */
export function formatGoldenTime(goldenTime: GoldenTime): string {
  const timeRange = `${goldenTime.start_hour}~${goldenTime.end_hour}시`
  if (goldenTime.day_of_week) {
    return `${goldenTime.day_of_week} ${timeRange}`
  }
  return `오늘 ${timeRange}`
}
