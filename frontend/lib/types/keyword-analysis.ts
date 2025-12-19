/**
 * 키워드 분석 시스템 - 타입 정의
 */

// 키워드 유형
export type KeywordType =
  | '정보형'
  | '증상형'
  | '병원탐색형'
  | '비용검사형'
  | '지역형'
  | '광역형'
  | '미분류'

// 경쟁도 레벨
export type CompetitionLevel = '낮음' | '중간' | '높음'

// 진입 난이도
export type EntryDifficulty = '쉬움' | '도전가능' | '어려움' | '매우어려움'

// 단일 키워드 데이터
export interface KeywordData {
  keyword: string
  monthly_pc_search: number
  monthly_mobile_search: number
  monthly_total_search: number
  competition: string
  competition_index: number
  keyword_type: KeywordType
  confidence: number
}

// 탭별 비율
export interface TabRatio {
  blog: number
  cafe: number
  kin: number
  web: number
  blog_count: number
  cafe_count: number
  kin_count: number
  web_count: number
}

// 상위 10개 블로그 통계
export interface Top10Stats {
  avg_total_score: number
  avg_c_rank: number
  avg_dia: number
  min_score: number
  max_score: number
  avg_posts: number
  avg_visitors: number
}

// 경쟁도 분석
export interface CompetitionAnalysis {
  keyword: string
  search_volume: number
  competition_level: CompetitionLevel
  top10_stats: Top10Stats
  tab_ratio: TabRatio
  entry_difficulty: EntryDifficulty
  recommended_blog_score: number
  my_blog_score?: number
  my_blog_gap?: number
}

// 세부 키워드
export interface SubKeyword {
  keyword: string
  search_volume: number
  keyword_type: KeywordType
  related: string[]
}

// 키워드 계층 구조
export interface KeywordHierarchy {
  main_keyword: string
  sub_keywords: SubKeyword[]
  total_search_volume: number
}

// 분류된 키워드
export interface ClassifiedKeyword {
  keyword: string
  keyword_type: KeywordType
  confidence: number
}

// ========== API 요청 ==========

export interface KeywordAnalysisRequest {
  keyword: string
  expand_related?: boolean
  min_search_volume?: number
  max_keywords?: number
  my_blog_id?: string
}

export interface KeywordClassifyRequest {
  keywords: string[]
}

export interface KeywordExpandRequest {
  main_keyword: string
  depth?: number
  min_search_volume?: number
}

// ========== API 응답 ==========

export interface KeywordAnalysisResponse {
  success: boolean
  main_keyword: string
  keywords: KeywordData[]
  total_count: number
  filtered_count: number
  competition_summary?: CompetitionAnalysis
  type_distribution: Record<KeywordType, number>
  recommendations: string[]
  cached: boolean
  timestamp: string
  error?: string
}

export interface TabRatioResponse {
  success: boolean
  keyword: string
  total_results: number
  tab_ratio: TabRatio
  timestamp: string
  error?: string
}

export interface KeywordClassifyResponse {
  success: boolean
  classified: ClassifiedKeyword[]
  type_distribution: Record<KeywordType, number>
  timestamp: string
  error?: string
}

export interface KeywordExpandResponse {
  success: boolean
  hierarchy?: KeywordHierarchy
  total_keywords: number
  timestamp: string
  error?: string
}

export interface CompetitionResponse {
  success: boolean
  analysis?: CompetitionAnalysis
  timestamp: string
  error?: string
}

// ========== 유틸리티 타입 ==========

// 키워드 유형별 색상
export const KEYWORD_TYPE_COLORS: Record<KeywordType, { bg: string; text: string; border: string }> = {
  '정보형': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  '증상형': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  '병원탐색형': { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  '비용검사형': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  '지역형': { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  '광역형': { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-300' },
  '미분류': { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' }
}

// 경쟁도 레벨별 색상
export const COMPETITION_LEVEL_COLORS: Record<CompetitionLevel, { bg: string; text: string }> = {
  '낮음': { bg: 'bg-green-500', text: 'text-green-700' },
  '중간': { bg: 'bg-yellow-500', text: 'text-yellow-700' },
  '높음': { bg: 'bg-red-500', text: 'text-red-700' }
}

// 진입 난이도별 색상
export const ENTRY_DIFFICULTY_COLORS: Record<EntryDifficulty, { bg: string; text: string; emoji: string }> = {
  '쉬움': { bg: 'bg-green-100', text: 'text-green-700', emoji: '😊' },
  '도전가능': { bg: 'bg-blue-100', text: 'text-blue-700', emoji: '💪' },
  '어려움': { bg: 'bg-orange-100', text: 'text-orange-700', emoji: '😓' },
  '매우어려움': { bg: 'bg-red-100', text: 'text-red-700', emoji: '🔥' }
}

// 검색량 포맷팅
export function formatSearchVolume(volume: number): string {
  if (volume >= 10000) return `${(volume / 10000).toFixed(1)}만`
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}천`
  return volume.toString()
}

// 비율을 퍼센트로 변환
export function toPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}
