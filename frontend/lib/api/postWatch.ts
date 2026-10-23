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
  /** 검색 페이지는 정상으로 봤는데 그 안에 글이 없었다 — 관측된 부재 */
  | 'absent_in_search'
  /** 페이지를 제대로 못 봤다(차단·타임아웃) — 측정 실패 */
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
  // 관측된 부재는 측정 실패보다 진한 색을 쓴다 — 사용자가 손을 쓸 수 있는 신호다.
  // 그래도 빨강은 쓰지 않는다: 누락 판정이 아니다.
  absent_in_search: 'bg-orange-50 text-orange-800 border-orange-200',
  unmeasurable: 'bg-gray-100 text-gray-500 border-gray-200',
  removed: 'bg-gray-100 text-gray-500 border-gray-200',
  baseline: 'bg-gray-50 text-gray-400 border-gray-200',
}

/**
 * 여러 블로그를 한 번에 등록. 한도에 걸린 것은 skipped 로 돌아온다 —
 * 앞의 몇 개만 조용히 등록하고 성공처럼 보이면 안 된다.
 */
export async function addWatchesBulk(blogIds: string[]): Promise<{
  added: string[]
  skipped: Array<{ blog_id: string; reason: 'already_watching' | 'limit_exceeded' }>
  invalid: string[]
  used: number
  limit: number
  note: string
}> {
  const res = await apiClient.post('/api/post-watch/blogs/bulk', { blog_ids: blogIds })
  return res.data
}

/**
 * 감시 현황 CSV. 프로 플랜부터.
 *
 * ⚠️ 브라우저가 파일을 받게 하려면 blob 으로 받아야 한다. 평소처럼 JSON 으로
 * 받으면 본문이 문자열이 되어 저장된 파일이 깨진다.
 */
export async function downloadWatchCsv(): Promise<void> {
  const res = await apiClient.get('/api/post-watch/export.csv', { responseType: 'blob' })
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'blrank-post-watch.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 402 = 플랜에 내보내기가 없음. */
export function isExportNotInPlan(error: unknown): boolean {
  const e = error as { response?: { status?: number; data?: { detail?: { error_code?: string } } } }
  return (
    e?.response?.status === 402 &&
    e?.response?.data?.detail?.error_code === 'EXPORT_NOT_IN_PLAN'
  )
}

/**
 * 전수 노출 감사.
 *
 * "블로그 N개의 최근 글을 전부 실제로 검색했습니다. M개가 안 보입니다."
 *
 * ⚠️ `absent` 는 **누락 판정이 아니다.** 제목을 검색했을 때 그 글이 결과에
 * 없었다는 관측이고, 페이지를 제대로 못 본 경우는 `unmeasurable` 로 따로 센다.
 * 두 숫자를 합쳐 "누락 N건"으로 쓰면 우리가 주장하지 않는 말이 된다.
 */
export interface AuditBlogResult {
  blog_id: string
  checked: number
  indexed: number
  absent: number
  unmeasurable: number
  reused: number
  absent_posts: Array<{
    title: string
    url: string
    published_at: string | null
    source: 'watch' | 'audit'
  }>
}

export interface AuditResult {
  blogs: AuditBlogResult[]
  rss_failed: string[]
  totals: {
    posts: number
    checked: number
    indexed: number
    absent: number
    unmeasurable: number
    reused: number
  }
  caveat: string
  stopped_reason: string | null
  measured_at: string
}

export interface AuditJob {
  job_id?: number
  status: 'none' | 'queued' | 'running' | 'done' | 'failed'
  total?: number
  checked?: number
  blog_ids?: string[]
  result?: AuditResult | null
  error?: string | null
  created_at?: string
  finished_at?: string | null
}

export async function startAudit(blogIds?: string[]): Promise<{
  job_id: number
  blog_ids: string[]
  posts_per_blog: number
}> {
  const res = await apiClient.post('/api/post-watch/audit', {
    blog_ids: blogIds ?? null,
  })
  return res.data
}

export async function getAudit(jobId: number): Promise<AuditJob> {
  const res = await apiClient.get(`/api/post-watch/audit/${jobId}`)
  return res.data
}

export async function getLatestAudit(): Promise<AuditJob> {
  const res = await apiClient.get('/api/post-watch/audit/latest')
  return res.data
}

/** 402/429 를 구분해 사람이 읽을 말로 바꾼다. */
export function readAuditError(error: unknown): string | null {
  const e = error as {
    response?: { status?: number; data?: { detail?: unknown } }
  }
  const status = e?.response?.status
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  const d = detail as { error_code?: string; message?: string } | undefined
  if (d?.message) return d.message
  if (status === 429) return '지금 다른 감사가 돌고 있습니다. 잠시 후 다시 시도해주세요.'
  return null
}
