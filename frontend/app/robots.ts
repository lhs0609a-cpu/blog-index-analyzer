import { MetadataRoute } from 'next'
import { CRAWL_BLOCKED_PATHS, SITE_URL } from '@/lib/seo'

/**
 * AI 검색 크롤러(GEO). 명시적으로 허용해야 인용 후보에 들어간다.
 * - OAI-SearchBot / ChatGPT-User : ChatGPT 검색·브라우징 (학습용 GPTBot 과 별개)
 * - ClaudeBot / Claude-User      : Claude 검색·인용
 * - PerplexityBot                : Perplexity 색인
 * - Google-Extended              : Gemini / AI 개요 인용
 * - Applebot-Extended            : Apple 지능형 검색
 */
const AI_CRAWLERS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  'ClaudeBot',
  'Claude-User',
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
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
