import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { GUIDES, getGuide, type Guide, type GuideSection } from '@/lib/content/guides'
import {
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScript,
  pageMetadata,
} from '@/lib/seo'

type Params = { params: { slug: string } }

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }))
}

export function generateMetadata({ params }: Params): Metadata {
  const guide = getGuide(params.slug)
  if (!guide) return {}

  return pageMetadata({
    title: guide.metaTitle,
    description: guide.description,
    path: `/guides/${guide.slug}`,
    keywords: guide.keywords,
    publishedTime: guide.published,
    modifiedTime: guide.updated,
  })
}

function Section({ section }: { section: GuideSection }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">{section.heading}</h2>

      {section.paragraphs?.map((paragraph, i) => (
        <p key={i} className="text-gray-700 leading-[1.9] mb-4">
          {paragraph}
        </p>
      ))}

      {section.list && (
        <ul className="space-y-2 mb-4">
          {section.list.map((item, i) => (
            <li key={i} className="flex gap-3 text-gray-700 leading-[1.8]">
              <span className="text-[#0064FF] font-bold shrink-0">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {section.table && (
        <div className="overflow-x-auto mb-4 -mx-4 px-4">
          <table className="w-full min-w-[480px] text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {section.table.headers.map((header, i) => (
                  <th
                    key={i}
                    className="text-left font-semibold text-gray-900 px-4 py-3 border border-gray-200"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="px-4 py-3 border border-gray-200 text-gray-700 align-top leading-relaxed"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.note && (
        <p className="text-sm text-gray-600 bg-blue-50 border-l-4 border-[#0064FF] px-4 py-3 rounded-r leading-relaxed">
          {section.note}
        </p>
      )}
    </section>
  )
}

export default function GuidePage({ params }: Params) {
  const guide = getGuide(params.slug)
  if (!guide) notFound()

  const related = guide.related
    .map((slug) => getGuide(slug))
    .filter((item): item is Guide => Boolean(item))

  return (
    <>
      <script
        {...jsonLdScript([
          articleJsonLd({
            title: guide.title,
            description: guide.description,
            path: `/guides/${guide.slug}`,
            published: guide.published,
            modified: guide.updated,
          }),
          faqJsonLd(guide.faq),
          breadcrumbJsonLd([
            { name: '홈', path: '/' },
            { name: '가이드', path: '/guides' },
            { name: guide.title, path: `/guides/${guide.slug}` },
          ]),
        ])}
      />

      <article className="bg-white">
        <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
          <nav aria-label="breadcrumb" className="text-sm text-gray-500 mb-6">
            <Link href="/" className="hover:text-[#0064FF]">
              홈
            </Link>
            <span className="mx-2">/</span>
            <Link href="/guides" className="hover:text-[#0064FF]">
              가이드
            </Link>
          </nav>

          <header className="mb-8">
            <p className="text-sm font-semibold text-[#0064FF] mb-3">{guide.category}</p>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-4">
              {guide.title}
            </h1>
            <p className="text-sm text-gray-500">
              <time dateTime={guide.updated}>{guide.updated}</time> 업데이트
            </p>
          </header>

          {/* AI 검색·발췌 인용 대상: 문서 맨 앞의 자립형 요약 */}
          <div className="mb-10 p-6 rounded-xl bg-gray-50 border border-gray-200">
            <h2 className="text-sm font-bold text-gray-900 mb-3">요약</h2>
            <p className="text-gray-700 leading-[1.9]">{guide.summary}</p>
          </div>

          {guide.keyFacts.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">핵심 사실</h2>
              <ul className="space-y-3">
                {guide.keyFacts.map((fact, i) => (
                  <li key={i} className="flex gap-3 text-gray-700 leading-[1.8]">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-[#0064FF] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {guide.sections.map((section, i) => (
            <Section key={i} section={section} />
          ))}

          {guide.faq.length > 0 && (
            <section className="mb-10 pt-8 border-t border-gray-200">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6">자주 묻는 질문</h2>
              <div className="space-y-6">
                {guide.faq.map((item, i) => (
                  <div key={i}>
                    <h3 className="font-bold text-gray-900 mb-2">{item.question}</h3>
                    <p className="text-gray-700 leading-[1.9]">{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {guide.sources && guide.sources.length > 0 && (
            <section className="mb-10 pt-6 border-t border-gray-200">
              <h2 className="text-sm font-bold text-gray-900 mb-3">출처</h2>
              <ul className="space-y-1 text-sm text-gray-600">
                {guide.sources.map((source, i) => (
                  <li key={i}>
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-[#0064FF] hover:underline break-all"
                      >
                        {source.label}
                      </a>
                    ) : (
                      source.label
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <aside className="p-6 rounded-xl bg-[#0064FF] text-white mb-10">
            <h2 className="text-lg font-bold mb-2">내 블로그에 적용하면 어떻게 나올까</h2>
            <p className="text-sm text-blue-100 mb-4 leading-relaxed">
              블로그 주소만 입력하면 42개 지표로 현재 위치를 추정하고, 지금 뚫을 수 있는 키워드를
              찾아줍니다.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/analyze"
                className="px-5 py-2.5 bg-white text-[#0064FF] text-sm font-bold rounded-lg hover:bg-blue-50 transition-colors"
              >
                블로그 무료 분석
              </Link>
              <Link
                href="/keyword-search"
                className="px-5 py-2.5 bg-white/15 text-white text-sm font-bold rounded-lg hover:bg-white/25 transition-colors"
              >
                키워드 검색
              </Link>
            </div>
          </aside>

          {related.length > 0 && (
            <section className="pt-8 border-t border-gray-200">
              <h2 className="text-lg font-bold text-gray-900 mb-4">함께 읽으면 좋은 글</h2>
              <ul className="space-y-3">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={`/guides/${item.slug}`}
                      className="block p-4 rounded-lg border border-gray-200 hover:border-[#0064FF] transition-colors"
                    >
                      <span className="font-semibold text-gray-900">{item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </article>
    </>
  )
}
