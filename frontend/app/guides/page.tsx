import Link from 'next/link'
import type { Metadata } from 'next'
import { GUIDES, GUIDE_CATEGORIES } from '@/lib/content/guides'
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: '블로그 성장 가이드',
  description:
    '네이버 블로그 지수, C-Rank와 D.I.A., 키워드 발굴, 상위 노출까지 — 1차 출처로 검증한 내용만 정리한 가이드 모음입니다. 근거 없는 통념은 근거 없다고 표시합니다.',
  path: '/guides',
  keywords: [
    '블로그 가이드',
    '네이버 블로그 SEO',
    '블로그 지수',
    '상위노출 방법',
    '키워드 발굴',
    'C-Rank',
  ],
})

const itemListJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: '블랭크 블로그 성장 가이드',
  itemListElement: GUIDES.map((guide, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: absoluteUrl(`/guides/${guide.slug}`),
    name: guide.title,
  })),
}

export default function GuidesIndexPage() {
  return (
    <>
      <script
        {...jsonLdScript([
          itemListJsonLd,
          breadcrumbJsonLd([
            { name: '홈', path: '/' },
            { name: '가이드', path: '/guides' },
          ]),
        ])}
      />

      <div className="bg-white">
        {/* 상단 여백은 고정 헤더(82px)보다 커야 한다. py-12(48px) 였을 때
            빵부스러기(홈/가이드)가 헤더 뒤로 17px 가려졌다. */}
        <div className="max-w-4xl mx-auto px-4 pt-24 pb-12 md:pt-28 md:pb-16">
          <nav aria-label="breadcrumb" className="text-sm text-gray-500 mb-6">
            <Link href="/" className="hover:text-[#0064FF]">
              홈
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-900">가이드</span>
          </nav>

          <header className="mb-10">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              블로그 성장 가이드
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed">
              네이버 블로그 지수, 검색 알고리즘, 키워드 발굴에 대해 1차 출처로 확인한 내용만
              정리했습니다. 널리 퍼져 있지만 근거를 찾지 못한 통념은 그렇다고 명시합니다.
            </p>
          </header>

          {GUIDE_CATEGORIES.map((category) => {
            const items = GUIDES.filter((guide) => guide.category === category)
            if (items.length === 0) return null

            return (
              <section key={category} className="mb-12">
                <h2 className="text-sm font-semibold text-[#0064FF] tracking-wide uppercase mb-4">
                  {category}
                </h2>
                <ul className="space-y-4">
                  {items.map((guide) => (
                    <li key={guide.slug}>
                      <Link
                        href={`/guides/${guide.slug}`}
                        className="block p-5 rounded-xl border border-gray-200 hover:border-[#0064FF] hover:shadow-sm transition-all"
                      >
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{guide.title}</h3>
                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                          {guide.description}
                        </p>
                        <p className="text-xs text-gray-400 mt-3">
                          업데이트 {guide.updated}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

          <aside className="mt-12 p-6 rounded-xl bg-gray-50 border border-gray-200">
            <h2 className="text-base font-bold text-gray-900 mb-2">
              내 블로그는 지금 어느 단계일까
            </h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              블로그 주소만 입력하면 42개 지표로 현재 위치를 추정합니다. 가입 없이 확인할 수
              있습니다.
            </p>
            <Link
              href="/analyze"
              className="inline-block px-5 py-2.5 bg-[#0064FF] text-white text-sm font-bold rounded-lg hover:bg-[#0052cc] transition-colors"
            >
              블로그 무료 분석
            </Link>
          </aside>
        </div>
      </div>
    </>
  )
}
