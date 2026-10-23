import apiClient from './client'

/**
 * 새 글 감시.
 *
 * ⚠️ 이 API 는 '누락'을 확정하지 않는다. 서버가 `asserts_missing: false` 로 명시한다.
 * 상태는 indexed(노출 확인) 까지만 긍정 판정이고, 못 찾은 것은 delayed / unmeasurable 로만
 * 남는다 — 실제 검색에서 안 보이는 것과 우리가 못 본 것을 구분할 수 없기 때문이다.
 * 그래서 화면 문구에 '누락'을 쓰지 않는다. 오탐 알림이 이 기능에서 가장 비싼 손실이다.
 */

export type WatchStatus =
  | 'pending'
  | 'indexed'
  | 'delayed'
  | 'unmeasurable'
  | 'removed'
  | 'baseline'

export interface WatchedPost {
  id: number
  log_no: string
  title: string
  url: string
  published_at: string
  status: WatchStatus
  status_label: string
  checks_done: number | null
  indexed_at: string | null
  first_rank: number | null
  last_checked_at: string | null
  next_check_at: string | null
  checks?: Array<{
    checked_at: string
    found: number | null
    rank: number | null
    error: string | null
  }>
}

export interface WatchedBlog {
  blog_id: string
  rss_state: 'ok' | 'failing' | 'disabled'
  last_rss_at: string | null
  created_at: string
  posts: WatchedPost[]
}

export interface WatchList {
  blogs: WatchedBlog[]
  limit: number
  used: number
  checkpoints_hours: number[]
  summary: Partial<Record<WatchStatus, number>>
  asserts_missing: boolean
}

export interface WatchSummary {
  watching: number
  limit: number
  blog_ids: string[]
  summary: Partial<Record<WatchStatus, number>>
}

export async function getMyWatches(): Promise<WatchList> {
  const res = await apiClient.get('/api/post-watch/blogs')
  return res.data
}

export async function getWatchSummary(): Promise<WatchSummary> {
  const res = await apiClient.get('/api/post-watch/summary')
  return res.data
}

export async function addWatch(blogId: string): Promise<{
  blog_id: string
  created: boolean
  used: number
  limit: number
}> {
  const res = await apiClient.post('/api/post-watch/blogs', { blog_id: blogId })
  return res.data
}

export async function removeWatch(blogId: string): Promise<{ removed: boolean }> {
  const res = await apiClient.delete(`/api/post-watch/blogs/${encodeURIComponent(blogId)}`)
  return res.data
}

export async function getBlogPosts(blogId: string): Promise<{
  blog_id: string
  posts: WatchedPost[]
}> {
  const res = await apiClient.get(
    `/api/post-watch/blogs/${encodeURIComponent(blogId)}/posts`
  )
  return res.data
}

/** 402 = 플랜 한도 초과. 한도를 화면에 그대로 보여주려고 형태를 고정한다. */
export function readWatchLimitError(
  error: unknown
): { limit: number; used: number; message: string } | null {
  const e = error as { response?: { status?: number; data?: { detail?: unknown } } }
  if (e?.response?.status !== 402) return null
  const d = e.response?.data?.detail as
    | { error_code?: string; limit?: number; used?: number; message?: string }
    | undefined
  if (!d || d.error_code !== 'WATCH_LIMIT_EXCEEDED') return null
  return {
    limit: d.limit ?? 1,
    used: d.used ?? 0,
    message: d.message ?? '감시할 수 있는 블로그 수를 모두 쓰셨습니다.',
  }
}

/** 상태별 배지 색. '지연'과 '확인 불가'를 빨강으로 쓰지 않는다 — 누락 판정이 아니다. */
export const STATUS_TONE: Record<WatchStatus, string> = {
  indexed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-blue-50 text-blue-700 border-blue-200',
  delayed: 'bg-amber-50 text-amber-800 border-amber-200',
  unmeasurable: 'bg-gray-100 text-gray-600 border-gray-200',
  removed: 'bg-gray-100 text-gray-500 border-gray-200',
  baseline: 'bg-gray-50 text-gray-400 border-gray-200',
}
