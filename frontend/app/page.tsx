import type { Metadata } from 'next'
import Link from 'next/link'
import HomeClient from './_home/HomeClient'
import { homeFaq } from '@/lib/home-faq'
import { faqJsonLd, jsonLdScript, SITE_URL } from '@/lib/seo'

/**
 * 홈은 클라이언트 컴포넌트(_home/HomeClient)라 메타데이터를 직접 내보낼 수 없어
 * 이 서버 컴포넌트가 감싼다. canonical 을 페이지마다 명시하기 위한 구조 —
 * 루트 layout 에 canonical 을 두면 전 하위 페이지가 홈으로 정본 지정되어 색인에서 빠진다.
 */
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
}



export default function Page() {
  return (
    <>
      <script {...jsonLdScript(faqJsonLd(homeFaq))} />
      <HomeClient />
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
