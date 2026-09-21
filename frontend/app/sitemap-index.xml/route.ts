import { absoluteUrl } from '@/lib/seo'
import { fetchKeywordCount, isBuildPhase } from '@/lib/seoApi'

/**
 * 사이트맵 인덱스.
 *
 * 사이트맵 한 장은 URL 50,000개 / 50MB 가 상한이다. 키워드 페이지는 그 상한을
 * 넘어갈 수 있으므로 청크로 쪼개고 이 인덱스가 묶는다.
 * robots.txt 는 이 인덱스를 가리킨다.
 *
 * ⚠️ 사이트맵 인덱스는 다른 인덱스를 참조할 수 없다. 여기서 참조하는 것은
 * 전부 실제 URL 이 담긴 사이트맵이어야 한다.
 */

/**
 * 5분 ISR.
 *
 * 처음엔 force-dynamic 이었다. 페이지가 0개일 때 굳은 인덱스가 청크를 하나도
 * 안 싣는 사고를 막으려던 것인데, 그러면 크롤러 요청마다 백엔드를 기다리게 되고
 * Fly 콜드 스타트가 겹치면 504 → "가져올 수 없음"이 된다.
 * 지금은 ①짧은 ISR 로 원본 부하를 없애고 ②청크를 최소 1개는 무조건 실어서
 * 두 문제를 동시에 막는다. 캐시가 낡아도 청크는 빠지지 않는다.
 */
export const revalidate = 300

// 청크당 URL 수. 상한(50,000)보다 넉넉히 낮게 잡아 응답 크기를 작게 유지한다.
export const CHUNK_SIZE = 5000

export async function GET() {
  // 빌드 시점에 던지면 배포가 통째로 죽는다(/rss.xml 이 2026-09-17 에 그렇게 죽였다).
  // 요청 시점에는 그대로 던져 직전 인덱스를 지키고, 빌드 시점에는 0 으로 두되
  // 아래에서 청크를 최소 1개 싣는다 — 300초 뒤 갱신이 채운다.
  let total = 0
  try {
    total = await fetchKeywordCount()
  } catch (e) {
    if (!isBuildPhase()) throw e
    console.warn('[sitemap-index] 빌드 시점 카운트 조회 실패 — 청크 1개로 발행한다:', e)
  }
  // 최소 1개는 항상 싣는다. 카운트 조회가 실패하거나(타임아웃) 아직 0 이어도
  // 인덱스가 청크를 통째로 빠뜨리지 않게 한다. 비어 있는 urlset 은 유효한 XML 이라
  // 크롤러가 무시할 뿐 오류가 아니다.
  const chunks = Math.max(1, Math.ceil(total / CHUNK_SIZE))

  const entries = [
    absoluteUrl('/sitemap.xml'),
    ...Array.from({ length: chunks }, (_, i) => absoluteUrl(`/sitemap-keywords/${i}.xml`)),
  ]

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map((loc) => `  <sitemap><loc>${loc}</loc></sitemap>`)
      .join('\n') +
    `\n</sitemapindex>\n`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // force-dynamic 을 걸어도 CDN 이 6시간 잡고 있으면 같은 문제가 난다.
      // 인덱스는 짧게만 캐시한다(청크는 SITEMAP_REVALIDATE 그대로).
      'Cache-Control': 'public, max-age=0, s-maxage=300',
    },
  })
}
