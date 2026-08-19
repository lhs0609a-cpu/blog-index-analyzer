/**
 * 프로그래매틱 SEO 페이지 — 서버 전용 데이터 접근.
 *
 * ⚠️ NEXT_PUBLIC_API_URL 을 쓰지 않는다.
 * 예전에 next.config.js 가 이 변수의 기본값을 'https://bqts.fly.dev'(같은 Fly
 * 계정의 다른 프로젝트)로 박아둬서, 환경변수가 비는 순간 전 페이지가 남의 API 를
 * 때리게 돼 있었다. 그 기본값은 고쳤지만, 사이트맵·키워드 페이지는 조용히 404 가
 * 나면 알아채기 어려우므로 여기서는 전용 변수만 본다.
 */
const API_BASE =
  process.env.SEO_API_URL?.replace(/\/$/, '') || 'https://blog-index-analyzer.fly.dev'

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
}

/**
 * 백엔드 호출 상한.
 *
 * ⚠️ 타임아웃이 없으면 사이트맵/페이지 라우트가 백엔드를 무한정 기다린다.
 * Fly 머신은 유휴 시 정지했다가 콜드 스타트하므로 첫 요청이 수 초 걸릴 수 있고,
 * 그동안 Vercel 함수 실행 한도를 넘기면 504 가 나간다. 크롤러에게 504 는
 * "가져올 수 없음"이다 — 사이트맵이 통째로 거부된다.
 * 끊고 빈 값으로 떨어지는 편이 낫다(빈 urlset 은 유효한 XML 이다).
 */
const FETCH_TIMEOUT_MS = 6000

function withTimeout(ms = FETCH_TIMEOUT_MS): RequestInit {
  return typeof AbortSignal?.timeout === 'function'
    ? { signal: AbortSignal.timeout(ms) }
    : {}
}

/** 페이지 데이터. 없으면 null — 호출부가 notFound() 를 내야 한다. */
export async function fetchKeywordPage(slug: string): Promise<KeywordPage | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/seo/keyword/${encodeURIComponent(slug)}`,
      { ...withTimeout(), next: { revalidate: KEYWORD_PAGE_REVALIDATE } }
    )
    if (!res.ok) return null
    return (await res.json()) as KeywordPage
  } catch {
    return null
  }
}

/**
 * 발행된 페이지 수만 센다. **캐시하지 않는다.**
 *
 * 사이트맵 인덱스가 이 값으로 청크 개수를 계산하는데, 캐시된 값이 0 이면
 * 인덱스가 청크를 하나도 안 싣고 그 상태로 다음 갱신까지 굳는다.
 * 크롤러가 그때 읽으면 키워드 페이지 전체가 사이트맵에서 사라진 것으로 보인다.
 * 응답이 작으므로(카운트 1개) 매번 조회해도 부담 없다.
 */
export async function fetchKeywordCount(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/api/seo/keywords?offset=0&limit=1`, {
      ...withTimeout(),
      cache: 'no-store',
    })
    if (!res.ok) return 0
    const data = await res.json()
    return data.total ?? 0
  } catch {
    return 0
  }
}

export async function fetchKeywordList(
  offset = 0,
  limit = 5000,
  /** 'volume' 사이트맵용(검색량순) · 'recent' RSS 용(최신순) */
  order: 'volume' | 'recent' = 'volume'
): Promise<{ total: number; items: KeywordListItem[] }> {
  try {
    const res = await fetch(
      `${API_BASE}/api/seo/keywords?offset=${offset}&limit=${limit}&order=${order}`,
      { ...withTimeout(), next: { revalidate: SITEMAP_REVALIDATE } }
    )
    if (!res.ok) return { total: 0, items: [] }
    const data = await res.json()
    return { total: data.total ?? 0, items: data.items ?? [] }
  } catch {
    return { total: 0, items: [] }
  }
}

/** 난이도 라벨 → 사람이 읽는 한국어. 백엔드 라벨을 그대로 노출하지 않는다. */
export const DIFFICULTY_LABEL: Record<string, string> = {
  very_easy: '매우 쉬움',
  easy: '쉬움',
  moderate: '보통',
  hard: '어려움',
  very_hard: '매우 어려움',
}

export function difficultyKo(label?: string | null): string {
  if (!label) return '측정 중'
  return DIFFICULTY_LABEL[label] ?? label
}
