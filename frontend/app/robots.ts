import { MetadataRoute } from 'next'
import { CRAWL_BLOCKED_PATHS, SITE_URL } from '@/lib/seo'

/**
 * Public search access. Wildcard access also allows unnamed crawlers.
 * - OAI-SearchBot / ChatGPT-User : ChatGPT 검색·브라우징 (학습용 GPTBot 과 별개)
 * - ClaudeBot / Claude-User      : Claude 검색·인용
 * - PerplexityBot                : Perplexity 색인
 * Google AI Search uses Googlebot; training controls are separate from search.
 */
const AI_CRAWLERS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Bingbot',
  'CCBot',
]

export default function robots(): MetadataRoute.Robots {
  const privateAreas = CRAWL_BLOCKED_PATHS

  return {
    rules: [
      // ⚠️ /_next/ 는 막지 않는다. 렌더링에 필요한 JS·CSS 를 크롤러가 못 읽으면
      // 페이지를 빈 화면으로 판단할 수 있다(예전 설정은 여기를 막고 있었다).
      {
        userAgent: '*',
        allow: '/',
        disallow: privateAreas,
      },
      // 국내 주요 검색엔진
      { userAgent: 'Googlebot', allow: '/', disallow: privateAreas },
      { userAgent: 'Yeti', allow: '/', disallow: privateAreas }, // 네이버
      { userAgent: 'Daumoa', allow: '/', disallow: privateAreas }, // 다음
      // AI 검색 엔진 — 공개 콘텐츠 인용 허용
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: ['/', '/guides/', '/llms.txt'],
        disallow: privateAreas,
      })),
    ],
    // 인덱스가 정적 페이지 사이트맵 + 키워드 페이지 청크를 전부 묶는다.
    // /sitemap.xml 도 같이 알려준다 — 인덱스를 못 읽는 크롤러 대비.
    // RSS 는 robots 의 Sitemap 지시자로도 인식되는 크롤러가 있어 함께 알린다
    // (네이버 서치어드바이저에는 별도로 'RSS 제출' 해야 한다).
    sitemap: [
      `${SITE_URL}/sitemap-index.xml`,
      `${SITE_URL}/sitemap.xml`,
    ],
    host: SITE_URL,
  }
}
