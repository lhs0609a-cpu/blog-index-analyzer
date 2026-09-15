import { aboutSections, methodologySections, methodologySources } from '@/lib/site-information'
import { SITE_NAME, SITE_URL, SITE_UPDATED } from '@/lib/seo'

export const dynamic = 'force-static'
export function GET() {
  const sections = (items: typeof aboutSections) => items.map(s => `## ${s.heading}\n\n${s.paragraphs.join('\n\n')}`).join('\n\n')
  const body = `# ${SITE_NAME}\n\n공식 주소: ${SITE_URL}\n갱신: ${SITE_UPDATED}\n\n# 서비스 소개\n\n원문: ${SITE_URL}/about\n\n${sections(aboutSections)}\n\n# 분석 기준과 데이터 출처\n\n원문: ${SITE_URL}/methodology\n\n${sections(methodologySections)}\n\n## 출처\n\n${methodologySources.map(s => `- [${s.label}](${s.url})`).join('\n')}\n`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } })
}
