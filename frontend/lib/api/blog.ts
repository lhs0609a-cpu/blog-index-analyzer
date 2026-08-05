import apiClient from './client'
import type {
  BlogAnalysisRequest,
  BlogAnalysisResponse,
  JobStatusResponse,
  BlogIndexResult,
  BlogListItem,
  HealthCheckResponse,
} from '../types/api'

/**
 * Health check
 */
export async function healthCheck(): Promise<HealthCheckResponse> {
  const response = await apiClient.get<HealthCheckResponse>('/health')
  return response.data
}

/**
 * Analyze a blog (synchronous - returns result immediately)
 * Backend has changed from async Celery tasks to synchronous processing
 */
export async function analyzeBlog(
  request: BlogAnalysisRequest
): Promise<BlogAnalysisResponse> {
  const response = await apiClient.post<BlogAnalysisResponse>('/api/blogs/analyze', request)
  return response.data
}

/**
 * 포스트 단위 분석 (B-3 검증 결과 반영)
 *
 * 블로그 단위 점수가 SERP와 ρ≈0.04로 약함을 발견 후 추가된 endpoint.
 * D.I.A.+ 알고리즘이 문서 단위라는 공식 발표와 정합.
 *
 * 검증된 카테고리별 강한 신호:
 * - 여행: image_count ρ=0.369
 * - IT: content_length ρ=0.339
 */
export interface PostLifecycleData {
  samples: number
  tracked_days: number
  first_indexed_at: string | null
  last_indexed_at: string | null
  indexing_delay_days: number | null
  total_exposure_days: number
  exposure_rate: number
  max_consecutive_exposure_days: number
  drop_count: number
  avg_blog_rank: number | null
  avg_view_rank: number | null
}

export interface PostAnalysisResult {
  success: boolean
  post_url: string
  keyword: string
  category: string
  analysis: {
    title_has_keyword: boolean
    title_keyword_position: number
    content_length: number
    image_count: number
    video_count: number
    keyword_count: number
    keyword_density: number
    like_count: number
    comment_count: number
    post_age_days: number | null
    has_map: boolean
    has_link: boolean
    heading_count: number
    paragraph_count: number
    fetch_method: string
  }
  post_score: {
    total: number
    title_match: number
    keyword_density: number
    content_richness: number
    structural: number
    engagement: number
    freshness: number
  }
  validated_signals_for_category: Array<{
    signal: string
    rho: number
    guide: string
  }>
  lifecycle: PostLifecycleData | null
  disclaimer: string
}

export async function analyzePost(
  postUrl: string,
  keyword: string = '',
  userId?: number | string
): Promise<PostAnalysisResult> {
  const response = await apiClient.post<PostAnalysisResult>('/api/blogs/analyze-post', {
    post_url: postUrl,
    keyword,
    user_id: userId !== undefined ? Number(userId) : undefined,
  })
  return response.data
}

/**
 * Get job status - DEPRECATED
 * This endpoint no longer exists as Backend now processes requests synchronously
 * Kept for backward compatibility but will always throw an error
 * @deprecated Use analyzeBlog() directly instead
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  throw new Error('Job status endpoint is deprecated. Backend now processes requests synchronously.')
}

/**
 * Get blog index by blog_id
 */
export async function getBlogIndex(blogId: string): Promise<BlogIndexResult> {
  const response = await apiClient.get<BlogIndexResult>(`/api/blogs/${blogId}/index`)
  return response.data
}

/**
 * Poll job status until completion - DEPRECATED
 * Backend now processes requests synchronously, so polling is no longer needed
 * @deprecated Use analyzeBlog() directly instead
 */
export async function pollJobStatus(
  jobId: string,
  onProgress?: (progress: number) => void,
  maxAttempts: number = 60,
  interval: number = 2000
): Promise<BlogIndexResult> {
  throw new Error('Job polling is deprecated. Backend now processes requests synchronously. Use analyzeBlog() directly.')
}

/**
 * Get list of user's blogs
 * Uses real API if user is authenticated, falls back to localStorage for guests
 */
export async function getUserBlogs(userId?: number | string): Promise<BlogListItem[]> {
  // 로그인한 사용자는 실제 API 사용
  if (userId) {
    try {
      const { getSavedBlogs } = await import('./userBlogs')
      const response = await getSavedBlogs(userId)
      // 예전에는 여기서 last_analyzed 를 lastUpdated 로 내보내는 바람에
      // 대시보드의 '이번 주 분석' 집계가 항상 0이었고, id/grade 는 아예 빠져 있었다.
      // 정규화 함수 한 곳을 거치게 해서 화면이 기대하는 모양을 보장한다.
      return (response?.blogs ?? []).map(blog => normalizeBlogListItem({
        ...blog,
        name: blog.blog_name || blog.blog_id,
      }))
    } catch (error) {
      console.error('Failed to fetch saved blogs:', error)
      // API 실패 시 localStorage 폴백
    }
  }

  // 비로그인 또는 API 실패 시 localStorage 사용
  const cachedBlogs = typeof window !== 'undefined'
    ? localStorage.getItem('cached_blogs')
    : null

  if (cachedBlogs) {
    // 예전 스키마로 저장된 캐시가 남아 있으면 stats 같은 필드가 없다.
    // 검증 없이 그대로 돌려주면 대시보드가 b.stats.visitors 에서 터져
    // 페이지 전체가 에러 화면으로 바뀐다(실제 발생). 반드시 정규화한다.
    try {
      const parsed = JSON.parse(cachedBlogs)
      if (!Array.isArray(parsed)) {
        localStorage.removeItem('cached_blogs')
        return []
      }
      return parsed.filter(Boolean).map(normalizeBlogListItem)
    } catch {
      localStorage.removeItem('cached_blogs')
      return []
    }
  }

  return []
}

/** 어떤 출처에서 왔든 화면이 기대하는 모양을 보장한다 (없는 값은 0/기본값). */
function normalizeBlogListItem(raw: any): BlogListItem {
  const stats = raw?.stats ?? {}
  return {
    id: raw?.id ?? raw?.blog_id ?? '',
    blog_id: raw?.blog_id ?? '',
    name: raw?.name ?? raw?.blog_name ?? raw?.blog_id ?? '',
    avatar: raw?.avatar ?? undefined,
    level: Number.isFinite(raw?.level) ? raw.level : 0,
    grade: raw?.grade ?? '',
    score: Number.isFinite(raw?.score) ? raw.score : 0,
    change: Number.isFinite(raw?.change) ? raw.change : 0,
    stats: {
      posts: Number.isFinite(stats?.posts) ? stats.posts : 0,
      visitors: Number.isFinite(stats?.visitors) ? stats.visitors : 0,
      engagement: Number.isFinite(stats?.engagement) ? stats.engagement : 0,
    },
    last_analyzed: raw?.last_analyzed ?? raw?.lastUpdated ?? undefined,
  }
}

/**
 * Save blog to user's list
 * Uses real API if user is authenticated, falls back to localStorage for guests
 */
export async function saveBlogToList(blog: BlogListItem, userId?: number | string): Promise<void> {
  // 로그인한 사용자는 실제 API 사용
  if (userId) {
    try {
      const { saveBlog } = await import('./userBlogs')
      await saveBlog(userId, {
        blog_id: blog.blog_id,
        blog_name: blog.name,
        avatar: blog.avatar
      })
      return
    } catch (error) {
      console.error('Failed to save blog to server:', error)
      // API 실패 시 localStorage에도 저장
    }
  }

  // 비로그인 또는 API 실패 시 localStorage 사용
  if (typeof window !== 'undefined') {
    const existingBlogs = await getUserBlogs()
    const updatedBlogs = [...existingBlogs.filter(b => b.blog_id !== blog.blog_id), blog]
    localStorage.setItem('cached_blogs', JSON.stringify(updatedBlogs))
  }
}

/**
 * Delete blog from user's list
 */
export async function deleteBlogFromList(blogId: string, userId?: number | string): Promise<void> {
  // 로그인한 사용자는 실제 API 사용
  if (userId) {
    try {
      const { deleteSavedBlog } = await import('./userBlogs')
      await deleteSavedBlog(userId, blogId)
      return
    } catch (error) {
      console.error('Failed to delete blog from server:', error)
    }
  }

  // 비로그인 또는 API 실패 시 localStorage에서 삭제
  if (typeof window !== 'undefined') {
    const existingBlogs = await getUserBlogs()
    const updatedBlogs = existingBlogs.filter(b => b.blog_id !== blogId)
    localStorage.setItem('cached_blogs', JSON.stringify(updatedBlogs))
  }
}

/**
 * Get full blog details including history
 */
export async function getBlogDetails(blogId: string): Promise<BlogIndexResult> {
  // For now, get from index endpoint
  // Later this can include more detailed history and analytics
  const result = await getBlogIndex(blogId)

  // Try to get from cache if available
  if (typeof window !== 'undefined') {
    const cachedBlogs = await getUserBlogs()
    const cachedBlog = cachedBlogs.find(b => b.blog_id === blogId)

    if (cachedBlog) {
      // Merge cached data with fresh data
      return {
        ...result,
        blog: {
          ...result.blog,
          description: result.blog.description || `${cachedBlog.name}의 블로그`,
        }
      }
    }
  }

  return result
}

/**
 * Get score breakdown for a blog
 */
export async function getScoreBreakdown(blogId: string): Promise<any> {
  const response = await apiClient.get(`/api/blogs/${blogId}/score-breakdown`)
  return response.data
}

/**
 * Check if blog exists in database
 */
export async function checkBlogExists(blogId: string): Promise<boolean> {
  try {
    const response = await apiClient.get<{ exists: boolean }>(`/api/blogs/${blogId}/exists`)
    return response.data.exists
  } catch (error) {
    return false
  }
}

/**
 * 실제 네이버 인덱스 검증 (일반/준최/최적/최적+)
 */
export interface VerifyIndexPostResult {
  title: string
  url: string
  search_keyword: string
  indexed_blog_tab: boolean
  indexed_view_tab: boolean
  blog_tab_rank: number | null
  view_tab_rank: number | null
}

export interface VerifyIndexSignal {
  score: number       // 0~100
  weight: number      // 0~1
  details: Record<string, any>
}

export type VerifyIndexSignalKey =
  | 'exact_index'
  | 'integrated_search'
  | 'indexing_latency'
  | 'topic_consistency'
  | 'content_quality'
  | 'engagement'

export interface VerifyIndexResponse {
  ok: boolean
  blog_id: string
  level_category: '일반' | '준최' | '최적' | '최적+' | null
  detailed_level: number | null
  detailed_label: string | null
  weighted_score: number | null
  signal_scores: Partial<Record<VerifyIndexSignalKey, VerifyIndexSignal>>
  post_results: VerifyIndexPostResult[]
  checked_posts: number
  confidence: 'high' | 'medium' | 'low'
  method: string
  disclaimer: string | null
  cached: boolean
  error: string | null
}

export async function verifyBlogIndex(
  blogId: string,
  options?: { sampleSize?: number; refresh?: boolean }
): Promise<VerifyIndexResponse> {
  const response = await apiClient.post<VerifyIndexResponse>(
    `/api/blogs/verify-index${options?.refresh ? '?refresh=true' : ''}`,
    { blog_id: blogId, sample_size: options?.sampleSize ?? 8 },
    { timeout: 60000 }
  )
  return response.data
}

/**
 * 노출 천장 — 이 블로그가 실제로 상위노출한 키워드들의 검색량 상한
 */
export interface ExposureCeilingResponse {
  ok: boolean
  blog_id: string
  ceiling_volume: number | null   // 1페이지 진입 키워드 중 최대 검색량
  ceiling_p50: number | null      // 안정적으로 뚫는 수준(중앙값)
  top30_ceiling: number | null
  win_rate: number
  ranked_keywords: { keyword: string; volume: number; rank: number }[]
  tested: number
  ranked_count: number
  confidence: 'high' | 'medium' | 'low'
  disclaimer: string | null
  error: string | null
  cached?: boolean
}

export async function getExposureCeiling(
  blogId: string,
  refresh = false
): Promise<ExposureCeilingResponse> {
  const response = await apiClient.get<ExposureCeilingResponse>(
    `/api/blogs/${blogId}/exposure-ceiling${refresh ? '?refresh=true' : ''}`,
    { timeout: 90000 }
  )
  return response.data
}

/**
 * 키워드 상위노출 가능여부 판정 (내 천장 + 경쟁자 체력 결합)
 */
export interface JudgeKeywordResponse {
  blog_id: string
  keyword: string
  prediction_id: number | null
  target_volume: number
  ceiling: {
    ceiling_volume: number | null
    ceiling_p50: number | null
    confidence: 'high' | 'medium' | 'low'
    ranked_count: number
    tested: number
  }
  serp_difficulty: {
    score: number | null
    label: string | null
    dormant_ratio: number | null
    alive_ratio: number | null
  } | null
  verdict: 'likely' | 'contested' | 'unlikely' | 'unknown'
  reason: string
  confidence: 'high' | 'medium' | 'low'
  serp_adjustment: 'up' | 'down' | 'none'
  disclaimer: string | null
}

export async function judgeKeyword(
  blogId: string,
  keyword: string
): Promise<JudgeKeywordResponse> {
  const response = await apiClient.post<JudgeKeywordResponse>(
    '/api/blogs/judge-keyword',
    { blog_id: blogId, keyword, include_serp: true },
    { timeout: 90000 }
  )
  return response.data
}

/**
 * 지수 변화 추이 (시계열)
 *
 * 분석할 때마다 하루 1점씩 쌓인다. points 가 비었거나 1개면 "아직 안 올랐다"가
 * 아니라 "그때는 측정한 적이 없다" 이므로, 화면에서 반드시 구분해서 말해야 한다.
 */
export interface IndexHistoryPoint {
  date: string
  captured_at: string
  total_score: number
  level: number
  grade: string
  tier: string
  percentile: number | null
  c_rank: number | null
  dia: number | null
  content_factors: number | null
  total_posts: number | null
  total_visitors: number | null
  neighbor_count: number | null
  recent_avg_visitors: number | null
  scoring_version: number
  source: string
  /** 현재 채점 버전과 같은 자로 잰 점수인가 */
  comparable: boolean
}

export interface IndexHistoryEvent {
  date: string
  type: 'level_up' | 'level_down' | 'ruler_change'
  from_level?: number | null
  to_level?: number | null
  from_tier?: string | null
  to_tier?: string | null
  score_delta?: number
  message: string
}

export interface IndexHistoryResponse {
  blog_id: string
  days: number
  scoring_version: number
  has_legacy: boolean
  points: IndexHistoryPoint[]
  events: IndexHistoryEvent[]
  summary: {
    count: number
    first_date: string | null
    last_date: string | null
    current_score: number | null
    current_level: number | null
    current_tier: string | null
    score_delta?: number
    level_delta?: number
    baseline_date?: string
    best_score?: number
    best_date?: string
  }
}

export async function getIndexHistory(
  blogId: string,
  days: number = 180
): Promise<IndexHistoryResponse> {
  const response = await apiClient.get<IndexHistoryResponse>(
    `/api/blogs/${encodeURIComponent(blogId)}/index-history`,
    { params: { days } }
  )
  return response.data
}

/**
 * Search blogs by keyword (returns all results at once)
 */
export async function searchKeyword(keyword: string, limit: number = 100): Promise<any> {
  const response = await apiClient.post('/api/blogs/search-keyword', {
    keyword,
    limit
  })
  return response.data
}

/**
 * Search blogs by keyword with tab classification (VIEW/SMART_BLOCK/BLOG)
 */
export async function searchKeywordWithTabs(keyword: string, limit: number = 100): Promise<any> {
  const response = await apiClient.post('/api/blogs/search-keyword-with-tabs', {
    keyword,
    limit
  })
  return response.data
}
