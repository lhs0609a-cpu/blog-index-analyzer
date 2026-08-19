import type { Metadata } from 'next'

/**
 * 사이트 SEO/GEO 단일 소스.
 *
 * ⚠️ 도메인은 반드시 여기서만 정의한다. 과거 sitemap.ts / robots.ts 가
 * vercel.app 을 가리켜 사이트맵 전체가 cross-domain 으로 무효화된 적이 있다.
 */
export const SITE_URL = 'https://www.blrank.co.kr'
export const SITE_NAME = '블랭크'
export const SITE_TAGLINE = 'AI 블로그 분석 플랫폼'
export const ORG_LEGAL_NAME = '플라톤마케팅'

export function absoluteUrl(path = '/'): string {
  if (!path || path === '/') return SITE_URL
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * 사이트 소유확인 코드 (검색엔진 웹마스터 도구).
 *
 * 비밀값이 아니다 — 어차피 모든 페이지의 HTML 에 그대로 노출되는 메타 태그다.
 * 그래서 네이버와 같은 방식으로 여기 상수로 둔다. 값을 바꿔야 하면
 * GOOGLE_SITE_VERIFICATION 환경변수로 덮어쓸 수 있다(재배포 없이 교체할 때).
 *
 * 값이 비어 있으면 태그 자체를 내보내지 않는다 — 빈 verification 태그는
 * 구글이 소유확인 실패로 처리한다.
 *
 * ⚠️ 구글은 확인 방법마다 다른 토큰을 준다. 아래 값은 "HTML 태그" 방식용이어야
 * 한다. DNS TXT 방식 토큰(google-site-verification=... 형태로 안내되는 것)을
 * 여기 넣으면 확인이 실패한다. 도메인 속성을 쓸 거라면 코드가 아니라
 * DNS 에 TXT 레코드를 넣어야 한다.
 *
 * metadata 는 서버에서만 평가되므로 NEXT_PUBLIC_ 접두사를 쓰지 않는다.
 */
export const NAVER_SITE_VERIFICATION = 'a2d07f71e11662403bea4bf15caa6b6582f57693'
export const GOOGLE_SITE_VERIFICATION =
  process.env.GOOGLE_SITE_VERIFICATION || 'Kt7BSBg8FgtNhD6uzjfJ6CHvU08uGstodUDxj_P-92E'

export function verificationMetadata(): Pick<Metadata, 'verification' | 'other'> {
  return {
    ...(GOOGLE_SITE_VERIFICATION
      ? { verification: { google: GOOGLE_SITE_VERIFICATION } }
      : {}),
    other: { 'naver-site-verification': NAVER_SITE_VERIFICATION },
  }
}

type PageMetaInput = {
  title: string
  description: string
  /** canonical 경로. 루트는 '/' */
  path: string
  keywords?: string[]
  /** og:type 이 article 인 경우 발행 정보 */
  publishedTime?: string
  modifiedTime?: string
}

/**
 * 색인 대상 공개 페이지용 메타데이터.
 * canonical 을 페이지마다 명시하는 것이 핵심 — 루트 layout 의 canonical 이
 * 상속되면 전 페이지가 홈으로 정본 지정되어 색인에서 빠진다.
 */
export function pageMetadata({
  title,
  description,
  path,
  keywords,
  publishedTime,
  modifiedTime,
}: PageMetaInput): Metadata {
  const url = absoluteUrl(path)
  const ogCommon = {
    locale: 'ko_KR',
    siteName: SITE_NAME,
    url,
    title: `${title} | ${SITE_NAME}`,
    description,
  }

  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: publishedTime
      ? {
          ...ogCommon,
          type: 'article',
          publishedTime,
          modifiedTime: modifiedTime ?? publishedTime,
        }
      : { ...ogCommon, type: 'website' },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
    },
    robots: { index: true, follow: true },
  }
}

/**
 * 로그인 뒤 화면·결제·분석 결과 등 색인하면 안 되는 페이지용.
 * 검색결과에 페이월("유료 기능입니다")이 노출되는 사고를 막는다.
 */
export function noindexMetadata(title: string, description?: string): Metadata {
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  }
}

/** 색인 대상 공개 라우트 — sitemap.ts 가 이 목록을 그대로 사용한다. */
export const PUBLIC_ROUTES: Array<{
  path: string
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority: number
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/analyze', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/keyword-search', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/keyword-check', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/blog-check', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/draft-check', changeFrequency: 'weekly', priority: 0.9 },
  // 프로그래매틱 키워드 페이지의 입구. 여기가 없으면 그 페이지들이 고아가 된다.
  { path: '/keyword', changeFrequency: 'daily', priority: 0.9 },
  { path: '/analyze-post', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/blue-ocean', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/profitable-keywords', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/ad-optimizer', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/pricing', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/guides', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/refund-policy', changeFrequency: 'yearly', priority: 0.2 },
]

/**
 * robots.txt 로 크롤링 자체를 막는 경로.
 *
 * ⚠️ 내부 링크가 있는 페이지(로그인·회원가입·대시보드 등)는 여기 넣으면 안 된다.
 * 크롤링을 막으면 크롤러가 그 페이지의 noindex 를 읽지 못해, 오히려 URL 만 색인될 수 있다.
 * 그런 페이지는 크롤링은 허용하고 noindexMetadata() 로 색인만 막는다.
 */
export const CRAWL_BLOCKED_PATHS = ['/api/', '/admin/', '/payment/']

// ─────────────────────────────────────────────────────────────
// JSON-LD (구조화 데이터)
// 검색엔진 리치결과 + AI 검색(GEO)의 사실 추출 경로를 동시에 담당한다.
// ─────────────────────────────────────────────────────────────

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  alternateName: ['BLANK', '블랭크 블로그 분석'],
  legalName: ORG_LEGAL_NAME,
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/icon.svg`,
  },
  description:
    '네이버 블로그의 품질 지수(블로그 레벨)를 42개 지표로 측정하고, 상위 노출 가능성이 높은 키워드를 발굴하는 AI 분석 서비스.',
  areaServed: { '@type': 'Country', name: '대한민국' },
  knowsLanguage: 'ko',
}

export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  url: SITE_URL,
  name: SITE_NAME,
  description: `${SITE_TAGLINE} — 네이버 블로그 지수 측정과 키워드 발굴`,
  inLanguage: 'ko-KR',
  publisher: { '@id': `${SITE_URL}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/keyword-search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
}

export const softwareAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${SITE_URL}/#software`,
  name: SITE_NAME,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'SEO 분석 도구',
  operatingSystem: 'Web',
  url: SITE_URL,
  inLanguage: 'ko-KR',
  publisher: { '@id': `${SITE_URL}/#organization` },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'KRW',
    description: '무료 플랜 제공 (블로그 분석 일 2회, 키워드 분석 일 8회)',
  },
  featureList: [
    '네이버 블로그 품질 지수 11단계 레벨 측정',
    '블로그 42개 지표 분석',
    '키워드 검색량 및 경쟁 강도 분석',
    '블루오션 키워드 발굴',
    '상위 노출 확률 예측',
    '네이버 검색광고 키워드 최적화',
  ],
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export function faqJsonLd(items: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

export function articleJsonLd(input: {
  title: string
  description: string
  path: string
  published: string
  modified?: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    inLanguage: 'ko-KR',
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(input.path) },
    datePublished: input.published,
    dateModified: input.modified ?? input.published,
    author: { '@id': `${SITE_URL}/#organization` },
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
}

/** JSON-LD 를 <script> 로 심을 때 쓰는 props 생성기 */
export function jsonLdScript(data: unknown) {
  return {
    type: 'application/ld+json' as const,
    dangerouslySetInnerHTML: { __html: JSON.stringify(data) },
  }
}
