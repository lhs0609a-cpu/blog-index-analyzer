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
    // ⚠️ 측정 실패 시 null. 예전에는 추정값을 생성해 항상 값이 있었으나,
    //    실측값처럼 표시되어 사용자를 오도하므로 null 을 그대로 내보낸다.
    total_posts: number | null
    total_visitors: number | null
    neighbor_count: number | null
    /** RSS 50개 캡에 걸려 총 발행수를 알 수 없을 때의 하한값 */
    total_posts_min?: number | null
    /** 최근 실측 일평균 방문자 (NVisitorgp) — 현재 상태를 반영하는 유일한 지표 */
    recent_avg_visitors?: number | null
    daily_visitors?: number | null
    visitor_measured?: boolean
    is_influencer: boolean
    avg_likes?: number
    avg_comments?: number
    posting_frequency?: number
  }
  /** 측정 실패로 값이 없는 필드명 목록 */
  unmeasured?: string[]
  /** 200 + 빈 RSS 피드 (미발행/비공개 가능성) */
  rss_empty?: boolean
  index: {
    level: number
    grade: string
    level_category: string
    total_score: number
    percentile: number
    /** 활동성 계수 (0.10~1.0). 최종 점수에 곱해진다 */
    vitality?: number
    vitality_state?:
      | 'active' | 'slowing' | 'dormant_entering'
      | 'dormant' | 'stopped' | 'abandoned' | 'unknown'
    days_since_last_post?: number | null
    posts_last_90d?: number | null
    rss_truncated?: boolean
    /** 레벨 산출 근거: 실측 색인 검증 vs 휴리스틱 */
    level_source?: 'measured' | 'heuristic'
    confidence?: 'high' | 'medium' | 'low'
    score_breakdown: {
      c_rank: number  // C-Rank (출처 신뢰도) 50%
      dia: number     // D.I.A. (문서 품질) 50%
      c_rank_detail?: {
        context: number   // 주제 일관성
        content: number   // 콘텐츠 품질
        chain: number     // 소비/생산 연쇄(공감·댓글·체류)
      }
      dia_detail?: {
        depth: number       // 경험·후기 깊이
        information: number // 정보 풍부도
        accuracy: number    // 검색 의도 정확도
      }
      weights_used?: {
        c_rank: number
        dia: number
        content: number
        is_learned?: boolean
        learned_meta?: {
          n?: number
          rhos?: Record<string, number>
          trained_at?: string
        } | null
      }
      keyword_category?: string
      // A-2 진짜 신호 — 외부에서 실제 수집한 raw 값
      raw_signals?: {
        category_count?: number | null
        category_entropy?: number | null
        avg_post_length?: number | null
        avg_image_count?: number | null
        avg_word_count?: number | null
        posting_interval_days?: number | null
        recent_activity_days?: number | null
        neighbor_count?: number | null
        total_posts?: number | null
        total_visitors?: number | null
        // 풀파싱 (analyze_post로 최근 N개 본문까지 추출)
        fullparse_n?: number | null
        fullparse_avg_likes?: number | null
        fullparse_avg_comments?: number | null
        fullparse_avg_images?: number | null
        fullparse_avg_videos?: number | null
        fullparse_avg_content_length?: number | null
        fullparse_avg_paragraphs?: number | null
        fullparse_avg_headings?: number | null
        fullparse_has_map_ratio?: number | null
        data_sources?: string[]
      }
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
