import Link from 'next/link'
import { faqJsonLd, jsonLdScript } from '@/lib/seo'

/**
 * 크롤러가 확실히 보는 본문 영역 (서버 컴포넌트 — 'use client' 금지).
 *
 * 이 사이트의 공개 페이지는 전부 클라이언트 컴포넌트라, 로딩 게이트나
 * useSearchParams bailout 때문에 서버 렌더링 HTML 이 nav+푸터 뼈대(약 570자)뿐이었다.
 * 이 컴포넌트는 Suspense/로딩 상태와 무관하게 항상 HTML 에 포함되므로,
 * JS 렌더링이 약한 네이버 Yeti 크롤러가 볼 수 있는 유일한 본문 역할을 한다.
 */

export type SeoBlock =
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }

export type SeoContentProps = {
  blocks: SeoBlock[]
  faq?: Array<{ question: string; answer: string }>
  links?: Array<{ href: string; label: string }>
  linksTitle?: string
  /**
   * 클라이언트 영역이 서버 HTML 에 h1 을 남기지 않는 페이지에서만 넘긴다.
   * (로딩 게이트나 Suspense 안에 h1 이 있으면 크롤러는 h1 없는 문서로 본다)
   * 이미 h1 이 서버 렌더링되는 페이지에는 넘기지 말 것 — h1 이 둘이 된다.
   */
  h1?: string
}

function Block({ block }: { block: SeoBlock }) {
  switch (block.kind) {
    case 'h2':
      return <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-10 first:mt-0">{block.text}</h2>
    case 'p':
      return <p className="text-gray-700 leading-[1.9] mb-4">{block.text}</p>
    case 'list':
      return (
        <ul className="space-y-2 mb-4">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-gray-700 leading-[1.8]">
              <span className="text-[#0064FF] font-bold shrink-0">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'table':
      return (
        <div className="overflow-x-auto mb-4 -mx-4 px-4">
          <table className="w-full min-w-[460px] text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {block.headers.map((header, i) => (
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
              {block.rows.map((row, i) => (
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
      )
  }
}

export default function SeoContent({
  blocks,
  faq,
  links,
  linksTitle = '더 읽어보기',
  h1,
}: SeoContentProps) {
  return (
    <>
      {faq && faq.length > 0 && <script {...jsonLdScript(faqJsonLd(faq))} />}

      <section className="bg-white border-t border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-14">
          {h1 && <h1 className="text-3xl font-bold text-gray-900 mb-6">{h1}</h1>}

          {blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}

          {faq && faq.length > 0 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-6 mt-10">자주 묻는 질문</h2>
              <div className="space-y-6">
                {faq.map((item) => (
                  <div key={item.question}>
                    <h3 className="font-bold text-gray-900 mb-2">{item.question}</h3>
                    <p className="text-gray-700 leading-[1.9]">{item.answer}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {links && links.length > 0 && (
            <div className="mt-10 p-5 rounded-xl bg-gray-50 border border-gray-200">
              <h2 className="text-base font-bold text-gray-900 mb-2">{linksTitle}</h2>
              <ul className="space-y-2 text-sm">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-[#0064FF] hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
