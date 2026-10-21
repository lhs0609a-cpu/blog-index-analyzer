/**
 * 가이드 콘텐츠 검사. 가이드가 수백 편이 되면 눈으로는 못 본다.
 *
 *   npx tsx scripts/check-guides.ts
 *
 * 실패(종료코드 1): slug 중복·형식, 없는 related, 필수 필드 누락,
 *   본문 블로그 식별자 노출 의심.
 * 경고: 길이 기준 이탈, 대표 키워드 중복(같은 검색어를 두 글이 노림).
 */
import { GUIDES } from '../lib/content/guides'

const errors: string[] = []
const warnings: string[] = []
const slugs = new Set<string>()

for (const g of GUIDES) {
  const at = `[${g.slug}]`
  if (slugs.has(g.slug)) errors.push(`${at} slug 중복`)
  slugs.add(g.slug)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug)) errors.push(`${at} slug 형식`)
  for (const field of ['title', 'metaTitle', 'description', 'summary'] as const) {
    if (!g[field]?.trim()) errors.push(`${at} ${field} 비어 있음`)
  }
  if (g.sections.length < 3) errors.push(`${at} 섹션 ${g.sections.length}개`)
  if (g.faq.length < 2) errors.push(`${at} FAQ ${g.faq.length}개`)

  const body = g.sections
    .flatMap((s) => [...(s.paragraphs ?? []), ...(s.list ?? []), ...(s.table?.rows.flat() ?? []), s.note ?? ''])
    .join('')
  if (body.length < 1500) warnings.push(`${at} 본문 ${body.length}자`)
  if (g.metaTitle.length > 50) warnings.push(`${at} metaTitle ${g.metaTitle.length}자`)
  if (g.description.length < 70 || g.description.length > 170)
    warnings.push(`${at} description ${g.description.length}자`)
  // 실측 응답의 competitors.blog_id 가 본문에 새어 들어오면 안 된다
  if (/blog\.naver\.com\/[a-z0-9_]+/i.test(body)) errors.push(`${at} 개별 블로그 주소 노출 의심`)
}

for (const g of GUIDES) {
  for (const r of g.related) {
    if (!slugs.has(r)) errors.push(`[${g.slug}] 없는 related: ${r}`)
    if (r === g.slug) errors.push(`[${g.slug}] 자기 자신을 related 로 가리킴`)
  }
}

const owner = new Map<string, string>()
for (const g of GUIDES) {
  const head = g.keywords[0]?.replace(/\s/g, '')
  if (!head) continue
  if (owner.has(head)) warnings.push(`대표 키워드 "${head}" 중복: ${owner.get(head)} / ${g.slug}`)
  else owner.set(head, g.slug)
}

console.log(`가이드 ${GUIDES.length}편`)
warnings.forEach((w) => console.log('WARN ', w))
errors.forEach((e) => console.log('ERROR', e))
process.exit(errors.length ? 1 : 0)
