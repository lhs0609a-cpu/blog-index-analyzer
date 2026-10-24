/**
 * 키워드 분석 2단 응답 클라이언트.
 *
 * 예전 동기 엔드포인트는 블로그 20개 분석이 다 끝나야 응답했다(캐시가 비면 40~60초).
 * /start 로 작업을 걸고 /jobs/{id} 를 폴링하면 순위 목록은 몇 초 만에, 블로그 등급은
 * 끝나는 대로 받는다. 최종 결과(result)는 동기 엔드포인트와 같은 모양이다.
 */
import { getApiUrl } from '@/lib/api/apiConfig'
import { authHeaders, readLimitHit, type LimitHit } from '@/lib/api/limits'

export type KeywordPreviewRow = {
  rank: number
  blog_id: string
  blog_name: string
  blog_url: string
  post_title: string
  post_url: string
  post_date?: string | null
  thumbnail?: string | null
  tab_type: string
}

export type KeywordBlogProgress = {
  level: number | null
  grade: string | null
  total_score: number | null
  partial_dimensions?: string[] | null
  unmeasurable_reason?: string | null
}

export type KeywordJobProgress = {
  preview: KeywordPreviewRow[] | null
  blogs: Record<string, KeywordBlogProgress>
  done: number
  total: number
}

export type KeywordSearchOutcome<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'limit'; hit: LimitHit }

const POLL_MS = 1500
const MAX_WAIT_MS = 5 * 60 * 1000

function query(keyword: string): string {
  return `keyword=${encodeURIComponent(keyword)}&limit=20&analyze_content=true&quick_mode=false`
}

/** 예전 동기 엔드포인트 — 새 백엔드가 아직 배포 전일 때만 쓴다. */
async function runLegacy<T>(keyword: string): Promise<KeywordSearchOutcome<T>> {
  const response = await fetch(`${getApiUrl()}/api/blogs/search-keyword-with-tabs?${query(keyword)}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  })
  const hit = await readLimitHit(response)
  if (hit) return { kind: 'limit', hit }
  if (!response.ok) throw new Error('검색에 실패했습니다')
  return { kind: 'ok', data: (await response.json()) as T }
}

export async function runKeywordSearch<T>(
  keyword: string,
  onProgress?: (p: KeywordJobProgress) => void,
): Promise<KeywordSearchOutcome<T>> {
  const start = await fetch(`${getApiUrl()}/api/blogs/search-keyword-with-tabs/start?${query(keyword)}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
  })
  if (start.status === 404 || start.status === 405) return runLegacy<T>(keyword)
  const hit = await readLimitHit(start)
  if (hit) return { kind: 'limit', hit }
  if (!start.ok) {
    let message = '검색에 실패했습니다'
    try {
      const body = await start.json()
      if (body?.detail?.message) message = body.detail.message
    } catch {}
    throw new Error(message)
  }
  const { job_id: jobId } = (await start.json()) as { job_id: string }

  const startedAt = Date.now()
  let failures = 0
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    let res: Response
    try {
      res = await fetch(`${getApiUrl()}/api/blogs/search-keyword-with-tabs/jobs/${jobId}`)
    } catch {
      // 일시적인 네트워크 오류는 몇 번 넘긴다.
      if (++failures >= 5) throw new Error('서버와 연결이 끊겼습니다. 다시 검색해 주세요.')
      continue
    }
    if (res.status === 404) throw new Error('서버가 재시작되어 분석이 중단됐습니다. 다시 검색해 주세요.')
    if (!res.ok) {
      if (++failures >= 5) throw new Error('검색에 실패했습니다')
      continue
    }
    failures = 0
    const job = await res.json()
    onProgress?.({ preview: job.preview, blogs: job.blogs || {}, done: job.done, total: job.total })
    if (job.status === 'done') return { kind: 'ok', data: job.result as T }
    if (job.status === 'error') throw new Error(job.error || '검색에 실패했습니다')
  }
  throw new Error('분석이 너무 오래 걸립니다. 잠시 후 다시 검색해 주세요.')
}
