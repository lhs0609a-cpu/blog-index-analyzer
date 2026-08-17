import Link from 'next/link'
import type { Metadata } from 'next'
import { fetchKeywordList, SITEMAP_REVALIDATE } from '@/lib/seoApi'
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/seo'

/**
 * 키워드 분석 허브.
 *
 * 사이트맵만으로 도달하는 페이지는 고아 취급되어 색인 우선순위가 떨어진다.
 * 크롤러가 내부 링크로 걸어 들어갈 입구가 반드시 있어야 한다 — 이 페이지가 그 입구다.
 * 푸터에서도 여기로 링크한다.
 */

export const revalidate = SITEMAP_REVALIDATE

export const metadata: Metadata = pageMetadata({
  title: '키워드별 블로그 상위노출 난이도',
  description:
    '네이버 블로그 키워드별로 1페이지 경쟁 블로그를 직접 조회해 진입 난이도를 계산했습니다. 경쟁자의 휴면 여부까지 실측한 결과를 키워드마다 공개합니다.',
  path: '/keyword',
  keywords: ['블로그 키워드 분석', '상위노출 난이도', '네이버 블로그 경쟁도', '키워드 경쟁 분석'],
})

const PAGE_SIZE = 300

export default async function KeywordHubPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const pageNo = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1)
  const { total, items } = await fetchKeywordList((pageNo - 1) * PAGE_SIZE, PAGE_SIZE)
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <script
        {...jsonLdScript(
          breadcrumbJsonLd([
            { name: '홈', path: '/' },
            { name: '키워드 분석', path: '/keyword' },
          ])
        )}
      />

      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          키워드별 블로그 상위노출 난이도
        </h1>
        <p className="text-gray-700 leading-[1.9] mb-4">
          키워드마다 네이버 검색 1페이지에 실제로 올라와 있는 블로그를 조회해, 상위권의 지수와
          경쟁자의 활동 상태를 재고 진입 난이도를 계산했습니다. 지금까지{' '}
          <strong>{total.toLocaleString()}개</strong> 키워드를 측정했습니다.
        </p>
        <p className="text-gray-700 leading-[1.9] mb-8">
          여기 있는 난이도는 경쟁자 쪽 사정만 본 값입니다. 내 블로그로 그 자리를 뚫을 수 있는지는{' '}
          <Link href="/keyword-check" className="text-[#0064FF] hover:underline">키워드 판정</Link>
          에서, 내 블로그의 현재 지수는{' '}
          <Link href="/analyze" className="text-[#0064FF] hover:underline">블로그 분석</Link>
          에서 확인할 수 있습니다.
        </p>

        {items.length === 0 ? (
          <p className="text-gray-600">
            아직 공개된 키워드 페이지가 없습니다. 측정이 끝나는 대로 순차적으로 올라갑니다.
          </p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2">
            {items.map((k) => (
              <li key={k.slug}>
                <Link
                  href={`/keyword/${encodeURIComponent(k.slug)}`}
                  className="block px-4 py-3 rounded-lg bg-white border border-gray-200 text-sm text-gray-900 hover:border-[#0064FF]"
                >
                  {k.keyword}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {lastPage > 1 && (
          <nav className="flex items-center justify-between mt-10 text-sm">
            {pageNo > 1 ? (
              <Link href={`/keyword?page=${pageNo - 1}`} className="text-[#0064FF] hover:underline">
                ← 이전
              </Link>
            ) : <span />}
            <span className="text-gray-500">{pageNo} / {lastPage}</span>
            {pageNo < lastPage ? (
              <Link href={`/keyword?page=${pageNo + 1}`} className="text-[#0064FF] hover:underline">
                다음 →
              </Link>
            ) : <span />}
          </nav>
        )}
      </div>
    </div>
  )
}
