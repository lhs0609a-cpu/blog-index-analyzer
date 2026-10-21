import type { Metadata } from 'next'
import Link from 'next/link'
import HomeClient from './_home/HomeClient'
import { homeFaq } from '@/lib/home-faq'
import { GUIDES, GUIDE_CATEGORIES } from '@/lib/content/guides'
import { faqJsonLd, jsonLdScript, SITE_URL } from '@/lib/seo'

/**
 * 홈은 클라이언트 컴포넌트(_home/HomeClient)라 메타데이터를 직접 내보낼 수 없어
 * 이 서버 컴포넌트가 감싼다. canonical 을 페이지마다 명시하기 위한 구조 —
 * 루트 layout 에 canonical 을 두면 전 하위 페이지가 홈으로 정본 지정되어 색인에서 빠진다.
 */
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
}

/**
 * 홈에서 가이드로 가는 링크. 가이드가 늘면 여기도 자동으로 바뀐다.
 *
 * 왜 홈에 두나: 홈은 사이트에서 가장 자주, 가장 먼저 크롤링되는 페이지다.
 * 여기서 링크가 걸린 글은 발견이 빠르고, 푸터·사이트맵으로만 닿는 글보다
 * 중요한 페이지로 취급된다. 카테고리마다 최신 글 2편씩만 건다 — 전부 걸면
 * 홈이 링크 목록이 되어 링크 하나하나의 무게가 흐려진다.
 */
const HOME_GUIDES_PER_CATEGORY = 2

function homeGuideGroups() {
  return GUIDE_CATEGORIES.map((category, index) => ({
    category,
    index,
    items: GUIDES.filter((guide) => guide.category === category)
      .slice()
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, HOME_GUIDES_PER_CATEGORY),
  })).filter((group) => group.items.length > 0)
}


export default function Page() {
  return (
    <>
      <script {...jsonLdScript(faqJsonLd(homeFaq))} />
      <HomeClient />
      <section aria-labelledby="home-guides-title" className="mx-auto max-w-5xl px-5 pt-12 md:pt-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 id="home-guides-title" className="text-2xl font-bold text-gray-900">블로그 성장 가이드</h2>
          <Link href="/guides" className="shrink-0 text-sm font-semibold text-blue-700 hover:underline">
            전체 {GUIDES.length}편 보기
          </Link>
        </div>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {homeGuideGroups().map(group => <div key={group.category}>
            <h3 className="mb-2 text-sm font-semibold text-[#0064FF]">
              <Link href={`/guides#category-${group.index}`} className="hover:underline">{group.category}</Link>
            </h3>
            <ul className="space-y-2">
              {group.items.map(guide => <li key={guide.slug}>
                <Link href={`/guides/${guide.slug}`} className="text-[15px] leading-6 text-gray-800 hover:text-[#0064FF] hover:underline">
                  {guide.title}
                </Link>
              </li>)}
            </ul>
          </div>)}
        </div>
      </section>
      <section aria-labelledby="home-faq-title" className="mx-auto max-w-4xl px-5 py-12 md:py-16">
        <h2 id="home-faq-title" className="mb-6 text-2xl font-bold text-gray-900">블스피 이용 전 자주 묻는 질문</h2>
        <div className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white px-5">
          {homeFaq.map(item => <details key={item.question} className="py-5">
            <summary className="cursor-pointer font-semibold text-gray-900">{item.question}</summary>
            <p className="mt-3 leading-8 text-gray-600">{item.answer}</p>
          </details>)}
        </div>
        <p className="mt-6 text-sm leading-7 text-gray-600">서비스 범위는 <Link className="text-blue-700 underline" href="/about">블스피 소개</Link>에서,
          결과를 읽는 방법은 <Link className="text-blue-700 underline" href="/methodology">분석 기준과 데이터 출처</Link>에서 확인하세요.</p>
      </section>
    </>
  )
}
