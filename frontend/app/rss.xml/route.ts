import { absoluteUrl, SITE_NAME } from '@/lib/seo'
import { fetchKeywordList, difficultyKo } from '@/lib/seoApi'
import { GUIDES } from '@/lib/content/guides'

/**
 * RSS 2.0 피드.
 *
 * 왜 사이트맵과 별도로 필요한가:
 * 네이버 서치어드바이저는 사이트맵과 RSS 를 **다른 채널**로 취급한다.
 * 사이트맵은 전체 URL 을 담아 전수 색인에 쓰이고, RSS 는 최신 몇 건만 담아
 * **새로 생긴 글을 빨리 알리는** 용도다. 우리는 키워드 페이지가 크론으로 계속
 * 생성되는데 사이트맵은 6시간 캐시라 반영이 느리다. RSS 로 최신분을 따로 알린다.
 *
 * ⚠️ 항목 수를 제한한다. RSS 는 '전체 목록'이 아니다 — 수천 개를 넣으면
 * 리더/크롤러가 잘라 읽고, 최신순이라는 의미도 사라진다.
 */

export const revalidate = 1800 // 30분 — 사이트맵보다 짧게 (신선도가 목적)

const MAX_ITEMS = 50

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** RSS pubDate 는 RFC 822 형식이어야 한다. toISOString 을 쓰면 안 된다. */
function rfc822(d: Date): string {
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString()
}

export async function GET() {
  const { items } = await fetchKeywordList(0, MAX_ITEMS, 'recent')

  const guideItems = GUIDES.map((g) => ({
    title: g.title,
    link: absoluteUrl(`/guides/${g.slug}`),
    description: g.description,
    date: new Date(g.updated),
  }))

  const keywordItems = items.map((k) => ({
    title: `${k.keyword} — 블로그 상위노출 난이도`,
    link: absoluteUrl(`/keyword/${encodeURIComponent(k.slug)}`),
    description:
      `'${k.keyword}' 키워드의 네이버 블로그 1페이지 경쟁 분석. ` +
      (k.difficulty_label ? `진입 난이도 ${difficultyKo(k.difficulty_label)}. ` : '') +
      (k.search_volume ? `월 검색량 ${k.search_volume.toLocaleString()}회.` : ''),
    date: new Date(k.measured_at),
  }))

  const all = [...guideItems, ...keywordItems]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, MAX_ITEMS)

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `<channel>\n` +
    `  <title>${esc(SITE_NAME)} — 네이버 블로그 분석</title>\n` +
    `  <link>${absoluteUrl('/')}</link>\n` +
    `  <description>네이버 블로그 지수 측정과 키워드별 상위노출 난이도 분석</description>\n` +
    `  <language>ko</language>\n` +
    `  <lastBuildDate>${rfc822(all[0]?.date ?? new Date())}</lastBuildDate>\n` +
    `  <atom:link href="${absoluteUrl('/rss.xml')}" rel="self" type="application/rss+xml" />\n` +
    all
      .map(
        (it) =>
          `  <item>\n` +
          `    <title>${esc(it.title)}</title>\n` +
          `    <link>${esc(it.link)}</link>\n` +
          `    <guid isPermaLink="true">${esc(it.link)}</guid>\n` +
          `    <description>${esc(it.description)}</description>\n` +
          `    <pubDate>${rfc822(it.date)}</pubDate>\n` +
          `  </item>`
      )
      .join('\n') +
    `\n</channel>\n</rss>\n`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=1800',
    },
  })
}
