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

// RSS 의 존재 이유가 신선도라 사이트맵(6h)보다 훨씬 짧게 잡는다.
export const revalidate = 300

const MAX_ITEMS = 50

/** 본문 안에 넣는 사용자 문자열용 (태그는 우리가 만든 것만 허용) */
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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
  // 목록 fetch 는 SITEMAP_REVALIDATE(6h) 를 쓰지 않는다 — RSS 는 신선도가 목적이다.
  const { items } = await fetchKeywordList(0, MAX_ITEMS, 'recent')

  const guideItems = GUIDES.map((g) => ({
    title: g.title,
    link: absoluteUrl(`/guides/${g.slug}`),
    // 한 줄 요약 대신 실제 본문(네이버 권장). summary 는 '이 문단만 떼어 읽어도
    // 말이 되는' 자립형 요약이고, keyFacts 는 발췌 인용 대상이라 목록으로 붙인다.
    description:
      `<p>${escHtml(g.summary || g.description)}</p>` +
      (g.keyFacts?.length
        ? `<ul>${g.keyFacts.slice(0, 6).map((f) => `<li>${escHtml(f)}</li>`).join('')}</ul>`
        : '') +
      (g.faq?.length
        ? `<p><strong>${escHtml(g.faq[0].question)}</strong> ${escHtml(g.faq[0].answer)}</p>`
        : ''),
    date: new Date(g.updated),
  }))

  // 네이버 웹마스터 가이드: "RSS 피드 내의 콘텐츠는 본문 전체를 제공하는 것을 권장".
  // 다만 같은 문서가 "본문 크기에 따라 제출이 제한될 수 있다"고도 하므로,
  // 한 줄 요약이 아니라 **읽을 만한 분석 본문**을 넣되 항목당 2KB 안쪽으로 유지한다.
  const keywordItems = items.map((k) => {
    const dormant =
      k.alive_ratio != null && k.competitors_scanned
        ? Math.round((1 - k.alive_ratio) * k.competitors_scanned)
        : null

    const lines: string[] = [
      `<p>네이버에서 <strong>${escHtml(k.keyword)}</strong>를 검색했을 때 블로그탭 1페이지에 ` +
        `실제로 올라와 있는 블로그들을 조회해 경쟁 강도를 계산한 결과입니다.</p>`,
    ]
    const facts: string[] = []
    if (k.difficulty_label) {
      facts.push(
        `진입 난이도 <strong>${difficultyKo(k.difficulty_label)}</strong>` +
          (k.difficulty_score != null ? ` (${Math.round(k.difficulty_score)}점/100)` : '')
      )
    }
    if (k.search_volume) facts.push(`월 검색량 ${k.search_volume.toLocaleString()}회`)
    if (k.competitors_scanned) facts.push(`1페이지 경쟁 블로그 ${k.competitors_scanned}개 실측`)
    if (k.top10_avg_score != null) facts.push(`상위권 평균 지수 ${k.top10_avg_score.toFixed(1)}점`)
    if (k.top10_min_score != null)
      facts.push(`1페이지 진입 컷라인 ${k.top10_min_score.toFixed(1)}점`)
    if (dormant != null) facts.push(`30일 이상 미발행 경쟁자 ${dormant}개`)
    if (facts.length) lines.push(`<ul>${facts.map((f) => `<li>${f}</li>`).join('')}</ul>`)

    if (k.top10_min_score != null) {
      lines.push(
        `<p>1페이지 최하위 블로그의 지수가 ${k.top10_min_score.toFixed(1)}점이므로, ` +
          `이 점수를 넘기는 것이 진입의 최소 조건입니다.</p>`
      )
    }
    if (dormant != null && dormant >= 3) {
      lines.push(
        `<p>1페이지 경쟁자 중 ${dormant}개가 30일 넘게 새 글을 올리지 않았습니다. ` +
          `활동이 멈춘 자리는 새 글이 밀어낼 여지가 있습니다.</p>`
      )
    }
    lines.push(
      `<p>여기 쓰인 지수는 네이버가 공개하는 공식 값이 아니라 외부에서 관측 가능한 ` +
        `지표로 계산한 추정치입니다.</p>`
    )

    return {
      title: `${k.keyword} — 블로그 상위노출 난이도`,
      link: absoluteUrl(`/keyword/${encodeURIComponent(k.slug)}`),
      description: lines.join(''),
      date: new Date(k.measured_at),
    }
  })

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
          `    <description><![CDATA[${it.description}]]></description>\n` +
          `    <pubDate>${rfc822(it.date)}</pubDate>\n` +
          `  </item>`
      )
      .join('\n') +
    `\n</channel>\n</rss>\n`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // ⚠️ 항목이 비었을 때 오래 캐시하면 그동안 크롤러에게 '가이드 8개짜리
      // 사이트'로 보인다. 실제로 백엔드 재배포와 겹쳐 그렇게 굳은 적이 있다
      // (사이트맵 인덱스와 같은 유형의 사고). 비면 60초로 낮춰 자가 회복.
      'Cache-Control': `public, max-age=0, s-maxage=${items.length > 0 ? 1800 : 60}`,
    },
  })
}
