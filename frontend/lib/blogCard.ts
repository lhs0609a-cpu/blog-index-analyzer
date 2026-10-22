/**
 * 블로그 등급 증명 카드 — 서버 전용 데이터 접근 (페이지·OG 이미지 공용).
 *
 * 백엔드 /api/blog-card/{blogId} 는 **이미 저장된 분석 결과만** 읽는다.
 * 카드 URL 은 누구나 아무 아이디로 열 수 있어서, 여기서 새 분석을 돌리면
 * 그대로 네이버 수집 남용 경로가 된다.
 *
 * API 주소는 seoApi.ts 와 같은 이유로 NEXT_PUBLIC_API_URL 이 아니라
 * 서버 전용 SEO_API_URL 만 본다.
 */
import { SITE_URL } from './seo'

const API_BASE =
  process.env.SEO_API_URL?.replace(/\/$/, '') || 'https://blog-index-analyzer.fly.dev'

/** 백엔드와 같은 규칙. 어긋나는 값은 API 를 부르지도 않는다. */
export const BLOG_ID_RE = /^[A-Za-z0-9_-]{3,50}$/

export const CARD_REVALIDATE = 600 // 10분

export type BlogCard = {
  blog_id: string
  blog_name: string | null
  level: number | null
  grade: string | null
  level_category: string | null
  total_score: number | null
  measured_at: string | null
  estimated: boolean
  available: boolean
}

export const CARD_HONESTY_NOTE = '블스피 자체 지수 · 네이버 공식 지수 아님'

export function isValidBlogId(blogId: string): boolean {
  return BLOG_ID_RE.test(blogId)
}

export function cardPageUrl(blogId: string): string {
  return `${SITE_URL}/card/${encodeURIComponent(blogId)}`
}

export function cardImagePath(blogId: string): string {
  return `/card/${encodeURIComponent(blogId)}/opengraph-image`
}

export function analyzeUrl(blogId?: string): string {
  return blogId ? `/analyze?blogId=${encodeURIComponent(blogId)}` : '/analyze'
}

function emptyCard(blogId: string): BlogCard {
  return {
    blog_id: blogId,
    blog_name: null,
    level: null,
    grade: null,
    level_category: null,
    total_score: null,
    measured_at: null,
    estimated: false,
    available: false,
  }
}

/** 실패해도 던지지 않는다 — 카드는 '기록 없음' 상태로 렌더된다. */
export async function fetchBlogCard(blogId: string): Promise<BlogCard> {
  if (!isValidBlogId(blogId)) return emptyCard(blogId)
  try {
    const res = await fetch(`${API_BASE}/api/blog-card/${encodeURIComponent(blogId)}`, {
      next: { revalidate: CARD_REVALIDATE },
    })
    if (!res.ok) return emptyCard(blogId)
    const data = (await res.json()) as Partial<BlogCard>
    const card: BlogCard = { ...emptyCard(blogId), ...data, blog_id: blogId }
    card.available = Boolean(card.available && card.level != null && card.total_score != null)
    return card
  } catch {
    return emptyCard(blogId)
  }
}

/** 등급 이름. 백엔드 tier_label / analyze 화면과 같은 규칙. */
export function gradeLabel(card: Pick<BlogCard, 'grade' | 'level'>): string {
  if (card.grade && card.grade !== '측정 불가') return card.grade
  const lv = card.level
  if (lv == null) return '-'
  if (lv <= 1) return '일반'
  if (lv <= 8) return `준최${lv - 1}`
  if (lv <= 11) return `최적${lv - 8}`
  return `최적${lv - 11}+`
}

/** 'YYYY.MM.DD' (KST). 파싱 못 하면 null. */
export function formatMeasuredDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

/** 등급대별 배지 색 (OG 이미지는 Tailwind 를 못 쓰므로 hex). */
export function gradeColors(level: number | null): { from: string; to: string } {
  if (level == null) return { from: '#9CA3AF', to: '#6B7280' }
  if (level >= 12) return { from: '#A855F7', to: '#EC4899' }
  if (level >= 9) return { from: '#0064FF', to: '#7C3AED' }
  if (level >= 5) return { from: '#0064FF', to: '#06B6D4' }
  if (level >= 2) return { from: '#10B981', to: '#0EA5E9' }
  return { from: '#9CA3AF', to: '#6B7280' }
}
