/**
 * 프로그래매틱 SEO 페이지 — 서버 전용 데이터 접근.
 *
 * ⚠️ NEXT_PUBLIC_API_URL 을 쓰지 않는다.
 * 예전에 next.config.js 가 이 변수의 기본값을 'https://bqts.fly.dev'(같은 Fly
 * 계정의 다른 프로젝트)로 박아둬서, 환경변수가 비는 순간 전 페이지가 남의 API 를
 * 때리게 돼 있었다. 그 기본값은 고쳤지만, 사이트맵·키워드 페이지는 조용히 404 가
 * 나면 알아채기 어려우므로 여기서는 전용 변수만 본다.
 */
import { cache } from 'react'

const API_BASE =
  process.env.SEO_API_URL?.replace(/\/$/, '') || 'https://blog-index-analyzer.fly.dev'

/**
 * 데이터 세대. **백엔드에서 값의 의미가 바뀌면 올린다.**
 *
 * ⚠️ Vercel 의 Data Cache 는 배포해도 지워지지 않는다. Full Route Cache 만
 * 빌드마다 새로 시작하므로, 배포 후 페이지는 **새 템플릿에 옛 숫자**가 박힌
 * 상태가 된다 — revalidate(24h) 가 돌 때까지.
 * 실제 사고: 난이도 v2 백필 후 API 는 '어려움 69.7' 인데 페이지는 계속
 * '매우 어려움 100' 을 보여줬다.
 * 쿼리스트링을 하나 바꾸면 캐시 키가 달라져 그 자리에서 끊긴다. FastAPI 는
 * 선언되지 않은 쿼리 파라미터를 무시하므로 백엔드는 손댈 필요가 없다.
 *
 *   1 → 2  난이도 눈금 합성으로 교체(2026-08-25)
 */
const DATA_EPOCH = 2

/** 캐시 수명. 백엔드 측정 주기(FRESH_DAYS=30)보다 훨씬 짧게 잡아 갱신을 흘려보낸다. */
export const KEYWORD_PAGE_REVALIDATE = 60 * 60 * 24 // 24h
export const SITEMAP_REVALIDATE = 60 * 60 * 6 // 6h

export type Competitor = {
  blog_id: string
  rank: number
  days_idle?: number | null
  vitality?: number | null
}

export type RelatedKeyword = {
  keyword: string
  monthly_total_search?: number | null
}

export type RelatedPage = {
  slug: string
  keyword: string
  search_volume?: number | null
  difficulty_label?: string | null
}

export type KeywordPage = {
  slug: string
  keyword: string
  category?: string | null
  category_label?: string | null
  search_volume?: number | null
  difficulty_score?: number | null
  difficulty_label?: string | null
  /** 난이도 눈금 버전. 다른 버전끼리는 같은 선에 놓고 비교하지 않는다. */
  difficulty_version?: number | null
  difficulty_breakdown?: Record<string, { value: number; weight: number }> | null
  competitors_scanned?: number | null
  alive_ratio?: number | null
  median_vitality?: number | null
  top10_avg_score?: number | null
  top10_min_score?: number | null
  top10_max_score?: number | null
  top10_avg_c_rank?: number | null
  top10_avg_dia?: number | null
  top10_avg_posts?: number | null
  competitors: Competitor[]
  tab_ratio: Record<string, number>
  related: RelatedKeyword[]
  tips: string[]
  measured_at: string
  related_pages?: RelatedPage[]
}

export type KeywordListItem = {
  slug: string
  keyword: string
  measured_at: string
  search_volume?: number | null
  difficulty_label?: string | null
  /** 아래는 RSS 본문 구성용 — 페이지당 추가 조회 없이 목록 쿼리에서 함께 온다 */
  difficulty_score?: number | null
  competitors_scanned?: number | null
  alive_ratio?: number | null
  top10_avg_score?: number | null
  top10_min_score?: number | null
  category_label?: string | null
  difficulty_version?: number | null
}

/**
 * 백엔드 호출 상한.
 *
 * ⚠️ 타임아웃이 없으면 사이트맵/페이지 라우트가 백엔드를 무한정 기다린다.
 * Fly 머신은 유휴 시 정지했다가 콜드 스타트하므로 첫 요청이 수 초 걸릴 수 있고,
 * 그동안 Vercel 함수 실행 한도를 넘기면 504 가 나간다. 크롤러에게 504 는
 * "가져올 수 없음"이다 — 사이트맵이 통째로 거부된다.
 * Failure must remain retryable; never replace existing content with an empty
 * successful response or a fabricated 404 during an upstream outage.
 */
const FETCH_TIMEOUT_MS = 6000

/**
 * 빌드 시점인가.
 *
 * 같은 실패라도 요청 시점과 빌드 시점의 결과가 전혀 다르다.
 * 요청 시점(ISR)에 던지는 것은 **옳다** — Next 가 직전 캐시본을 계속 내보내고
 * 다음 요청에 다시 시도한다. 그래서 위의 "never replace existing content" 가
 * 성립한다.
 * 빌드 시점에는 지킬 캐시본이 없다. 던지면 프리렌더가 실패하고 **배포 전체가
 * 죽는다**. 실제로 2026-09-17 /rss.xml 의 fetch 타임아웃 하나(TimeoutError)가
 * 프로덕션 빌드를 exit 1 로 끝냈고, www 는 9/15 빌드에 멈춘 채 나흘을 보냈다.
 * 그 배포에 실려 있던 것이 하필 한도·결제 퍼널 수정 전체였다 — 서버는 429 를
 * 쏘는데 그 코드를 아는 클라이언트가 프로덕션에 없는 상태가 7일간 41건.
 *
 * 그래서 빌드 시점에만 ①더 오래 기다리고 ②재시도하고 ③그래도 안 되면
 * 호출부가 '빠진 채로' 배포되게 둔다. 짧은 캐시로 스스로 회복하는 라우트에만
 * 허용한다 — 판단은 호출부 몫이라 여기서는 위상만 알려준다.
 */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build'
}

/** 빌드 시점 상한. 사용자가 기다리는 요청이 아니므로 콜드 스타트를 기다려 준다. */
const BUILD_FETCH_TIMEOUT_MS = 20000
const BUILD_FETCH_ATTEMPTS = 3

function withTimeout(ms?: number): RequestInit {
  const limit = ms ?? (isBuildPhase() ? BUILD_FETCH_TIMEOUT_MS : FETCH_TIMEOUT_MS)
  return typeof AbortSignal?.timeout === 'function'
    ? { signal: AbortSignal.timeout(limit) }
    : {}
}

/**
 * 빌드 시점에만 재시도한다.
 *
 * 9/17 을 죽인 건 백엔드 장애가 아니라 Fly 콜드 스타트 한 번이었다. 한 번 더
 * 두드렸으면 끝날 일이었다. 요청 시점에는 재시도하지 않는다 — 사용자를 기다리게
 * 하느니 직전 캐시본을 내보내는 편이 낫다.
 */
async function fetchResilient(input: string, init: RequestInit): Promise<Response> {
  if (!isBuildPhase()) return fetch(input, init)

  let lastError: unknown
  for (let attempt = 1; attempt <= BUILD_FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(input, { ...init, ...withTimeout() })
      // 5xx 는 콜드 스타트/재시작일 수 있으므로 다시 두드린다. 4xx 는 우리 잘못이라 즉시 반환.
      if (res.status >= 500 && attempt < BUILD_FETCH_ATTEMPTS) {
        lastError = new Error(`upstream ${res.status}`)
      } else {
        return res
      }
    } catch (e) {
      lastError = e
      if (attempt === BUILD_FETCH_ATTEMPTS) break
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt))
  }
  throw lastError
}

/** 페이지 데이터. 없으면 null — 호출부가 notFound() 를 내야 한다. */
export const fetchKeywordPage = cache(async (slug: string): Promise<KeywordPage | null> => {
    const res = await fetchResilient(
      `${API_BASE}/api/seo/keyword/${encodeURIComponent(slug)}?e=${DATA_EPOCH}`,
      { ...withTimeout(), next: { revalidate: KEYWORD_PAGE_REVALIDATE } }
    )
    if (res.status === 404) return null
    // Preserve previously generated pages during upstream outages.
    if (!res.ok) throw new Error(`Keyword data temporarily unavailable (${res.status})`)
    return (await res.json()) as KeywordPage
})

/**
 * 발행된 페이지 수만 센다. **캐시하지 않는다.**
 *
 * 사이트맵 인덱스가 이 값으로 청크 개수를 계산하는데, 캐시된 값이 0 이면
 * 인덱스가 청크를 하나도 안 싣고 그 상태로 다음 갱신까지 굳는다.
 * 크롤러가 그때 읽으면 키워드 페이지 전체가 사이트맵에서 사라진 것으로 보인다.
 * 응답이 작으므로(카운트 1개) 매번 조회해도 부담 없다.
 */
export async function fetchKeywordCount(): Promise<number> {
    const res = await fetchResilient(`${API_BASE}/api/seo/keywords?offset=0&limit=1&e=${DATA_EPOCH}`, {
      ...withTimeout(),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Keyword count unavailable (${res.status})`)
    const data = await res.json()
    if (!Number.isSafeInteger(data.total) || data.total < 0) throw new Error('Invalid keyword count')
    return data.total
}

export async function fetchKeywordList(
  offset = 0,
  limit = 5000,
  /** 'volume' 사이트맵용(검색량순) · 'recent' RSS 용(최신순) */
  order: 'volume' | 'recent' = 'volume'
): Promise<{ total: number; items: KeywordListItem[] }> {
    const res = await fetchResilient(
      `${API_BASE}/api/seo/keywords?offset=${offset}&limit=${limit}&order=${order}&e=${DATA_EPOCH}`,
      { ...withTimeout(), next: { revalidate: order === 'recent' ? 300 : SITEMAP_REVALIDATE } }
    )
    if (!res.ok) throw new Error(`Keyword list unavailable (${res.status})`)
    const data = await res.json()
    if (!Number.isSafeInteger(data.total) || !Array.isArray(data.items)) throw new Error('Invalid keyword list')
    return { total: data.total, items: data.items }
}

/** 난이도 라벨 → 사람이 읽는 한국어. 백엔드 라벨을 그대로 노출하지 않는다. */
export const DIFFICULTY_LABEL: Record<string, string> = {
  very_easy: '매우 쉬움',
  easy: '쉬움',
  moderate: '보통',
  hard: '어려움',
  very_hard: '매우 어려움',
  /**
   * 상위 10개 블로그의 지수를 못 잰 키워드.
   *
   * 예전 눈금은 이런 경우에도 경쟁자 활동성만으로 100점 '매우 어려움'을 찍었다.
   * 안 잰 것은 unknown 이지 어려움이 아니다 — 여기서 그렇게 말한다.
   */
  unknown: '측정 대기',
}

/** 난이도가 실제로 계산된 키워드인가. unknown/누락은 false. */
export function hasDifficulty(label?: string | null): boolean {
  return !!label && label !== 'unknown'
}

export function difficultyKo(label?: string | null): string {
  if (!label) return '측정 대기'
  return DIFFICULTY_LABEL[label] ?? label
}

/** 난이도 라벨 → 뱃지 색. 쉬움이 초록, 어려움이 빨강. */
export const DIFFICULTY_TONE: Record<string, string> = {
  very_easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  moderate: 'bg-amber-50 text-amber-700 border-amber-200',
  hard: 'bg-orange-50 text-orange-700 border-orange-200',
  very_hard: 'bg-rose-50 text-rose-700 border-rose-200',
  unknown: 'bg-gray-50 text-gray-500 border-gray-200',
}

export function difficultyTone(label?: string | null): string {
  return DIFFICULTY_TONE[label || 'unknown'] ?? DIFFICULTY_TONE.unknown
}

/** 허브에서 쓰는 표시 순서 — 쉬운 것부터. */
export const DIFFICULTY_ORDER = ['very_easy', 'easy', 'moderate', 'hard', 'very_hard', 'unknown'] as const
