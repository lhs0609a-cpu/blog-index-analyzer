/**
 * 프로그래매틱 SEO 페이지 — 서버 전용 데이터 접근.
 *
 * ⚠️ NEXT_PUBLIC_API_URL 을 쓰지 않는다.
 * next.config.js 의 env 블록이 이 변수의 기본값을 'https://bqts.fly.dev' 로
 * 박아두고 있는데 그건 이 서비스의 백엔드가 아니다. 실제 프로덕션 백엔드는
 * blog-index-analyzer.fly.dev 다(lib/api/apiConfig.ts 의 fallback 과 동일).
 * 잘못된 호스트로 빌드되면 전 페이지가 조용히 404 가 되므로 여기서 끊는다.
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
}

/** 페이지 데이터. 없으면 null — 호출부가 notFound() 를 내야 한다. */
export async function fetchKeywordPage(slug: string): Promise<KeywordPage | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/seo/keyword/${encodeURIComponent(slug)}`,
      { next: { revalidate: KEYWORD_PAGE_REVALIDATE } }
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
  limit = 5000
): Promise<{ total: number; items: KeywordListItem[] }> {
  try {
    const res = await fetch(
      `${API_BASE}/api/seo/keywords?offset=${offset}&limit=${limit}`,
      { next: { revalidate: SITEMAP_REVALIDATE } }
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
