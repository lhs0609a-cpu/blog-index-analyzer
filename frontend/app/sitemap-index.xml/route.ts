import { absoluteUrl } from '@/lib/seo'
import { fetchKeywordCount } from '@/lib/seoApi'

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
 * 인덱스는 캐시하지 않는다.
 * 페이지가 0개일 때 굳은 인덱스는 키워드 청크를 하나도 싣지 않고, 그 상태로
 * 다음 갱신까지 남는다. 크롤러가 그 사이에 읽으면 키워드 페이지 전체가
 * 사이트맵에서 빠진 것으로 본다. 실제로 첫 배포에서 그렇게 됐다.
 * 응답은 몇 줄짜리 XML 이라 매번 만들어도 싸다. 청크(/sitemap-keywords/N.xml)는
 * 무겁고 자주 안 바뀌므로 그쪽만 캐시한다.
 */
export const dynamic = 'force-dynamic'

// 청크당 URL 수. 상한(50,000)보다 넉넉히 낮게 잡아 응답 크기를 작게 유지한다.
export const CHUNK_SIZE = 5000

export async function GET() {
  const total = await fetchKeywordCount()
  const chunks = Math.max(0, Math.ceil(total / CHUNK_SIZE))
  const now = new Date().toISOString()

  const entries = [
    absoluteUrl('/sitemap.xml'),
    ...Array.from({ length: chunks }, (_, i) => absoluteUrl(`/sitemap-keywords/${i}.xml`)),
  ]

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map((loc) => `  <sitemap><loc>${loc}</loc><lastmod>${now}</lastmod></sitemap>`)
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
