import { MetadataRoute } from 'next'

const BASE_URL = 'https://blog-index-analyzer.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/payment/',
          '/_next/',
          '/static/',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/payment/'],
      },
      {
        userAgent: 'Yeti', // 네이버 크롤러
        allow: '/',
        disallow: ['/api/', '/admin/', '/payment/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
