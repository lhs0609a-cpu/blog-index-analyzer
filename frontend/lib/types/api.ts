// API Types
export interface BlogAnalysisRequest {
  blog_id: string
  post_limit?: number
  quick_mode?: boolean
}

export interface BlogAnalysisResponse {
  job_id: string
  status: 'processing' | 'completed' | 'failed'
  message?: string
  estimated_time_seconds?: number
  result?: BlogIndexResult  // 동기 방식에서는 즉시 결과 반환
}

export interface JobStatusResponse {
  job_id: string
  status: 'PENDING' | 'STARTED' | 'SUCCESS' | 'FAILURE' | 'RETRY'
  progress?: number
  result?: BlogIndexResult
  error?: string
}

export interface BlogIndexResult {
  blog: {
    blog_id: string
    blog_name: string
    blog_url: string
    description?: string
  }
  stats: {
    total_posts: number
    total_visitors: number
    neighbor_count: number
    is_influencer: boolean
    avg_likes?: number
    avg_comments?: number
    posting_frequency?: number
  }
  index: {
    level: number
    grade: string
    level_category: string
    total_score: number
    percentile: number
    score_breakdown: {
      c_rank: number  // C-Rank (출처 신뢰도) 50%
      dia: number     // D.I.A. (문서 품질) 50%
    }
  }
  daily_visitors?: Array<{
    date: string
    visitors: number
  }>
  warnings: Warning[]
  recommendations: Recommendation[]
  recent_posts?: Post[]
  history?: HistoryRecord[]
  last_analyzed_at?: string
}

export interface Warning {
  type: string
  severity: 'low' | 'medium' | 'high'
  message: string
}

export interface Recommendation {
  type?: string
  priority: 'low' | 'medium' | 'high'
  category: string
  message: string
  actions?: string[]
  impact?: string
}

export interface Post {
  id: number | string
  title: string
  thumbnail?: string
  date: string
  views: number
  likes: number
  comments: number
  url?: string
}

export interface HistoryRecord {
  date: string
  score: number
  level: number
}

export interface BlogListItem {
  id: number | string
  blog_id: string
  name: string
  avatar?: string
  level: number
  grade: string
  score: number
  change: number
  stats: {
    posts: number
    visitors: number
    engagement: number
  }
  last_analyzed?: string
}

export interface HealthCheckResponse {
  status: string
  timestamp: string
  version: string
}

export interface UserResponse {
  id: number
  email: string
  name: string | null
  blog_id: string | null
  plan: string
  is_active: boolean
  is_verified: boolean
  is_admin: boolean
  is_premium_granted?: boolean
  created_at: string
}

export interface ApiError {
  detail: string
  status_code: number
}

export interface PaginationMeta {
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface PaginatedResponse<T> {
  items: T[]
  meta: PaginationMeta
}
