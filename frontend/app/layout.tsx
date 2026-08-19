import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import BackendStatus from '../components/BackendStatus'
import Footer from '../components/Footer'
import GlobalNav from '../components/GlobalNav'
import ClientProviders from '../components/ClientProviders'
import {
  SITE_URL,
  jsonLdScript,
  organizationJsonLd,
  softwareAppJsonLd,
  verificationMetadata,
  websiteJsonLd,
} from '@/lib/seo'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const BASE_URL = SITE_URL

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
    // 이미지는 app/opengraph-image.tsx 파일 컨벤션이 자동 생성한다.
    // (예전에 /og-image.png 를 직접 가리켰으나 그 파일은 존재하지 않아 404 였다)
  },

  // Twitter Cards
  twitter: {
    card: 'summary_large_image',
    title: '블랭크 - AI 블로그 분석 플랫폼',
    description: '네이버 블로그 품질 지수 측정, AI 키워드 분석, 블루오션 키워드 발굴',
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

  // ⚠️ canonical 은 여기(루트)에 두지 않는다.
  // 루트에 두면 하위 페이지가 전부 홈으로 정본 지정되어 색인에서 제외된다.
  // 각 페이지가 lib/seo.ts 의 pageMetadata() 로 자기 canonical 을 선언한다.
  category: 'technology',

  // 사이트 소유확인 (네이버 서치어드바이저 + 구글 서치콘솔)
  // 코드는 lib/seo.ts 단일 소스. 구글은 GOOGLE_SITE_VERIFICATION 환경변수.
  ...verificationMetadata(),
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

// JSON-LD 구조화 데이터 (lib/seo.ts 단일 소스)
// Organization / WebSite(SearchAction) / SoftwareApplication 을 @id 로 연결해
// 검색엔진과 AI 검색이 같은 실체로 인식하게 한다.
const jsonLd = [organizationJsonLd, websiteJsonLd, softwareAppJsonLd]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        {/* RSS 자동발견 — 네이버 서치어드바이저는 사이트맵과 RSS 를 다른 채널로
            취급한다. 사이트맵=전수 색인, RSS=새 글 빠른 발견. */}
        <link rel="alternate" type="application/rss+xml" title="블랭크" href="/rss.xml" />
        {/* JSON-LD 구조화 데이터 */}
        <script {...jsonLdScript(jsonLd)} />
      </head>
      <body className={inter.className}>
        <ClientProviders>
          <BackendStatus />
          <GlobalNav />
          <main className="min-h-screen pb-20 md:pb-0">
            {children}
          </main>
          <Footer />
        </ClientProviders>
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
