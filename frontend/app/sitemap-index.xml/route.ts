import { absoluteUrl } from '@/lib/seo'
import { fetchKeywordList, SITEMAP_REVALIDATE } from '@/lib/seoApi'

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

export const revalidate = SITEMAP_REVALIDATE

// 청크당 URL 수. 상한(50,000)보다 넉넉히 낮게 잡아 응답 크기를 작게 유지한다.
export const CHUNK_SIZE = 5000

export async function GET() {
  const { total } = await fetchKeywordList(0, 1)
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
      'Cache-Control': `public, max-age=0, s-maxage=${SITEMAP_REVALIDATE}`,
    },
  })
}
