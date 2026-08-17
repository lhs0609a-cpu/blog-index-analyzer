import { absoluteUrl } from '@/lib/seo'
import { fetchKeywordList, SITEMAP_REVALIDATE } from '@/lib/seoApi'

/**
 * 키워드 페이지 사이트맵 청크. /sitemap-keywords/0.xml, /1.xml ...
 * 인덱스(/sitemap-index.xml)가 이걸 묶는다.
 */

export const revalidate = SITEMAP_REVALIDATE

const CHUNK_SIZE = 5000

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(_req: Request, { params }: { params: { chunk: string } }) {
  // '0.xml' → 0. 잘못된 값이면 빈 사이트맵을 준다(404 보다 크롤러에 안전).
  const idx = parseInt(String(params.chunk).replace(/\.xml$/, ''), 10)
  const safeIdx = Number.isFinite(idx) && idx >= 0 ? idx : 0

  const { items } = await fetchKeywordList(safeIdx * CHUNK_SIZE, CHUNK_SIZE)

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    items
      .map((k) => {
        const loc = escapeXml(absoluteUrl(`/keyword/${encodeURIComponent(k.slug)}`))
        const lastmod = new Date(k.measured_at)
        const mod = Number.isNaN(lastmod.getTime()) ? '' : `<lastmod>${lastmod.toISOString()}</lastmod>`
        return `  <url><loc>${loc}</loc>${mod}<changefreq>monthly</changefreq><priority>0.6</priority></url>`
      })
      .join('\n') +
    `\n</urlset>\n`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=0, s-maxage=${SITEMAP_REVALIDATE}`,
    },
  })
}
