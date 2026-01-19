import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import BackendStatus from '../components/BackendStatus'
import Footer from '../components/Footer'
import XPWidget from '../components/XPWidget'
import GlobalNav from '../components/GlobalNav'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const BASE_URL = 'https://blog-index-analyzer.vercel.app'

export const metadata: Metadata = {
  // 기본 메타데이터
  metadataBase: new URL(BASE_URL),
  title: {
    default: '블랭크 - AI 블로그 분석 플랫폼 | 네이버 블로그 품질 지수 측정',
    template: '%s | 블랭크',
  },
  description: '블랭크에서 네이버 블로그의 품질 지수를 정확하게 측정하고 분석합니다. AI 기반 키워드 분석, 블루오션 키워드 발굴, 글쓰기 가이드까지 블로그 성장에 필요한 모든 도구를 제공합니다.',
  keywords: [
    '블로그 분석',
    '네이버 블로그',
    '블로그 지수',
    '키워드 분석',
    '블루오션 키워드',
    'AI 글쓰기',
    '블로그 마케팅',
    '검색 최적화',
    'SEO',
    '블랭크',
  ],
  authors: [{ name: '블랭크', url: BASE_URL }],
  creator: '블랭크',
  publisher: '블랭크',

  // 검색엔진 설정
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // Open Graph (페이스북, 카카오톡 등)
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: BASE_URL,
    siteName: '블랭크',
    title: '블랭크 - AI 블로그 분석 플랫폼',
    description: '네이버 블로그 품질 지수 측정, AI 키워드 분석, 블루오션 키워드 발굴. 블로그 성장을 위한 올인원 솔루션',
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: '블랭크 - AI 블로그 분석 플랫폼',
      },
    ],
  },

  // Twitter Cards
  twitter: {
    card: 'summary_large_image',
    title: '블랭크 - AI 블로그 분석 플랫폼',
    description: '네이버 블로그 품질 지수 측정, AI 키워드 분석, 블루오션 키워드 발굴',
    images: [`${BASE_URL}/og-image.png`],
    creator: '@blank_blog',
  },

  // 파비콘 및 아이콘
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
  },

  // 매니페스트
  manifest: '/manifest.json',

  // 기타
  alternates: {
    canonical: BASE_URL,
  },
  category: 'technology',

  // 사이트 인증
  verification: {
    google: 'google-site-verification-code', // Google Search Console 인증 코드
  },

  // 네이버 서치어드바이저 인증
  other: {
    'naver-site-verification': '225b96b53906bb64665ae546c9d11adb32dd128f',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

// JSON-LD 구조화 데이터
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: '블랭크',
  alternateName: 'Blank Blog Analyzer',
  description: '네이버 블로그 품질 지수를 정확하게 측정하고 분석하는 AI 기반 플랫폼',
  url: BASE_URL,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'KRW',
    description: '무료 기본 플랜 제공',
  },
  creator: {
    '@type': 'Organization',
    name: '블랭크',
    url: BASE_URL,
  },
  featureList: [
    '네이버 블로그 품질 지수 분석',
    'AI 기반 키워드 분석',
    '블루오션 키워드 발굴',
    '글쓰기 가이드',
    'X/Threads 자동화',
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        {/* JSON-LD 구조화 데이터 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className}>
        <BackendStatus />
        <GlobalNav />
        <main className="min-h-screen">
          {children}
        </main>
        <Footer />
        <XPWidget />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#fff',
              color: '#363636',
              borderRadius: '16px',
              padding: '16px',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
            },
            success: {
              iconTheme: {
                primary: '#a855f7',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  )
}
