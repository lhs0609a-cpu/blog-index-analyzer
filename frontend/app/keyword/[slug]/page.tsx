import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  fetchKeywordPage,
  difficultyKo,
  KEYWORD_PAGE_REVALIDATE,
  type KeywordPage,
} from '@/lib/seoApi'
import { absoluteUrl, breadcrumbJsonLd, jsonLdScript, pageMetadata, SITE_NAME } from '@/lib/seo'

/**
 * 키워드 상세 페이지 (프로그래매틱 SEO).
 *
 * 왜 이 페이지가 필요한가:
 * 검색엔진은 쿼리 하나에 페이지 하나를 매칭한다. 공개 페이지가 21개면 21개
 * 쿼리군밖에 못 먹는다. "블로그 관련 무엇을 쳐도 우리가 나온다"는 페이지 수로만 된다.
 *
 * 왜 이게 스팸이 아닌가:
 * 페이지마다 실제로 측정한 값이 들어간다 — 그 키워드 1페이지의 경쟁 블로그 목록,
 * 각 블로그의 휴면 여부, 상위 10개의 평균 지수. 템플릿은 같아도 데이터가 다르다.
 * 데이터가 얇으면(경쟁자 5개 미만) 백엔드가 published=0 으로 막아 페이지 자체가 안 나온다.
 *
 * 모든 내용은 사용자에게 보이는 본문이다. 숨긴 텍스트를 넣으면 클로킹이 되어
 * 도메인 전체가 색인에서 빠진다 — 절대 추가하지 말 것.
 */

export const revalidate = KEYWORD_PAGE_REVALIDATE

// 빌드 시점에 전부 생성하지 않는다. 수천~수만 페이지를 미리 만들면 Vercel 빌드가
// 터진다. 첫 요청 때 생성하고 이후 ISR 로 재사용한다.
export const dynamicParams = true

export async function generateStaticParams() {
  return []
}

type Props = { params: { slug: string } }

function describe(page: KeywordPage): string {
  const parts = [`'${page.keyword}' 키워드의 네이버 블로그 1페이지 경쟁 분석.`]
  if (page.difficulty_label) parts.push(`진입 난이도 ${difficultyKo(page.difficulty_label)}.`)
  if (page.competitors_scanned) parts.push(`상위 ${page.competitors_scanned}개 블로그 실측.`)
  if (page.top10_avg_score != null)
    parts.push(`상위권 평균 지수 ${page.top10_avg_score.toFixed(1)}점.`)
  return parts.join(' ').slice(0, 155)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await fetchKeywordPage(decodeURIComponent(params.slug))
  if (!page) {
    // 측정 안 된 슬러그는 색인시키지 않는다. 여기서 noindex 를 안 걸면
    // 404 페이지가 수천 개 색인 후보로 잡힌다.
    return { title: '키워드를 찾을 수 없습니다', robots: { index: false, follow: false } }
  }
  return pageMetadata({
    title: `${page.keyword} — 블로그 상위노출 난이도 분석`,
    description: describe(page),
    path: `/keyword/${encodeURIComponent(page.slug)}`,
    keywords: [
      page.keyword,
      `${page.keyword} 상위노출`,
      `${page.keyword} 블로그`,
      `${page.keyword} 경쟁도`,
      '네이버 블로그 키워드 분석',
    ],
  })
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  )
}

export default async function KeywordDetailPage({ params }: Props) {
  const slug = decodeURIComponent(params.slug)
  const page = await fetchKeywordPage(slug)
  if (!page) notFound()

  const url = absoluteUrl(`/keyword/${encodeURIComponent(page.slug)}`)
  const measured = new Date(page.measured_at)
  const measuredKo = Number.isNaN(measured.getTime())
    ? null
    : measured.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  const dormant = page.competitors.filter((c) => (c.days_idle ?? 0) >= 30)
  const blogTab = page.tab_ratio?.blog

  // 검색엔진이 이 페이지를 "데이터셋을 담은 문서"로 이해하게 한다.
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${page.keyword} — 블로그 상위노출 난이도 분석`,
    description: describe(page),
    url,
    datePublished: page.measured_at,
    dateModified: page.measured_at,
    author: { '@type': 'Organization', name: SITE_NAME },
    publisher: { '@id': `${absoluteUrl('/')}/#organization` },
    isAccessibleForFree: true,
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <script {...jsonLdScript(articleJsonLd)} />
      <script
        {...jsonLdScript(
          breadcrumbJsonLd([
            { name: '홈', path: '/' },
            { name: '키워드 분석', path: '/keyword' },
            { name: page.keyword, path: `/keyword/${encodeURIComponent(page.slug)}` },
          ])
        )}
      />

      <div className="max-w-3xl mx-auto px-4">
        <nav className="text-sm text-gray-500 mb-4">
          <Link href="/" className="hover:underline">홈</Link>
          <span className="mx-2">/</span>
          <Link href="/keyword" className="hover:underline">키워드 분석</Link>
        </nav>

        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          {page.keyword} — 블로그 상위노출 난이도
        </h1>
        <p className="text-gray-700 leading-[1.9] mb-2">
          네이버에서 <strong>{page.keyword}</strong> 를 검색했을 때 1페이지에 올라와 있는 블로그들을
          직접 조회해 경쟁 강도를 계산한 결과입니다.
          {measuredKo && ` ${measuredKo} 측정 기준이며, 검색 결과는 매일 바뀌므로 시점에 따라 달라질 수 있습니다.`}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-8">
          <Stat label="진입 난이도" value={difficultyKo(page.difficulty_label)}
            hint={page.difficulty_score != null ? `${page.difficulty_score.toFixed(0)}점 / 100` : undefined} />
          <Stat label="월 검색량" value={page.search_volume ? page.search_volume.toLocaleString() : '집계 없음'} />
          <Stat label="상위권 평균 지수"
            value={page.top10_avg_score != null ? page.top10_avg_score.toFixed(1) : '—'}
            hint={page.top10_min_score != null ? `최저 ${page.top10_min_score.toFixed(1)}점` : undefined} />
          <Stat label="휴면 경쟁자"
            value={`${dormant.length} / ${page.competitors.length}`}
            hint="30일 이상 미발행" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-10">이 키워드는 뚫을 수 있나</h2>
        <p className="text-gray-700 leading-[1.9] mb-4">
          {dormant.length >= 3
            ? `1페이지 ${page.competitors.length}개 중 ${dormant.length}개가 30일 넘게 새 글을 올리지 않았습니다. 활동이 멈춘 자리는 새 글이 밀어낼 여지가 있습니다.`
            : `1페이지 경쟁자 대부분이 현재도 활발히 발행 중입니다. 단발성 글로는 밀어내기 어렵고, 같은 주제를 반복해 쌓아 출처 신뢰(C-Rank)를 먼저 만드는 편이 빠릅니다.`}
          {page.top10_min_score != null &&
            ` 1페이지 최하위의 지수가 ${page.top10_min_score.toFixed(1)}점이므로, 이 점수를 넘기는 것이 최소 조건입니다.`}
        </p>

        {page.competitors.length > 0 && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-10">1페이지 경쟁 블로그</h2>
            <div className="overflow-x-auto -mx-4 px-4 mb-4">
              <table className="w-full min-w-[420px] text-sm border-collapse bg-white">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left font-semibold px-4 py-3 border border-gray-200">순위</th>
                    <th className="text-left font-semibold px-4 py-3 border border-gray-200">블로그</th>
                    <th className="text-left font-semibold px-4 py-3 border border-gray-200">마지막 발행</th>
                    <th className="text-left font-semibold px-4 py-3 border border-gray-200">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {page.competitors.map((c) => (
                    <tr key={`${c.rank}-${c.blog_id}`}>
                      <td className="px-4 py-3 border border-gray-200">{c.rank}</td>
                      <td className="px-4 py-3 border border-gray-200 font-mono text-xs">{c.blog_id}</td>
                      <td className="px-4 py-3 border border-gray-200">
                        {c.days_idle == null ? '—' : c.days_idle === 0 ? '오늘' : `${c.days_idle}일 전`}
                      </td>
                      <td className="px-4 py-3 border border-gray-200">
                        {(c.days_idle ?? 0) >= 30 ? '휴면' : '활동 중'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {typeof blogTab === 'number' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-10">검색 결과에서 블로그가 차지하는 비중</h2>
            <p className="text-gray-700 leading-[1.9] mb-4">
              이 키워드의 검색 결과 중 블로그 영역이 {(blogTab * 100).toFixed(0)}% 를 차지합니다.
              {blogTab < 0.15
                ? ' 블로그 노출 자리가 좁아, 1위를 해도 유입이 기대만큼 크지 않을 수 있습니다.'
                : ' 블로그 글이 노출될 자리가 충분히 확보돼 있는 키워드입니다.'}
            </p>
          </>
        )}

        {(page.tips?.length ?? 0) > 0 && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-10">
              {page.category_label ?? '이 주제'} 글을 쓸 때
            </h2>
            <ul className="space-y-2 mb-4">
              {(page.tips ?? []).map((t, i) => (
                <li key={i} className="flex gap-3 text-gray-700 leading-[1.8]">
                  <span className="text-[#0064FF] font-bold shrink-0">·</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="my-10 p-5 rounded-xl bg-[#0064FF]/5 border border-[#0064FF]/20">
          <h2 className="text-base font-bold text-gray-900 mb-2">내 블로그로 이 키워드가 가능한지 확인</h2>
          <p className="text-sm text-gray-700 mb-3">
            위 숫자는 경쟁자 쪽 사정입니다. 내 블로그 지수로 저 자리를 실제로 뚫을 수 있는지는
            블로그를 넣어봐야 나옵니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/keyword-check" className="px-4 py-2 rounded-lg bg-[#0064FF] text-white text-sm font-semibold">
              이 키워드 판정하기
            </Link>
            <Link href="/analyze" className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold">
              내 블로그 지수 무료 조회
            </Link>
          </div>
        </div>

        {(page.related_pages?.length ?? 0) > 0 && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-10">비슷한 키워드</h2>
            <ul className="grid sm:grid-cols-2 gap-2 mb-4">
              {page.related_pages!.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/keyword/${encodeURIComponent(r.slug)}`}
                    className="block px-4 py-3 rounded-lg bg-white border border-gray-200 text-sm hover:border-[#0064FF]"
                  >
                    <span className="text-gray-900 font-medium">{r.keyword}</span>
                    {r.difficulty_label && (
                      <span className="text-gray-500 ml-2">{difficultyKo(r.difficulty_label)}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="text-xs text-gray-500 mt-10 leading-relaxed">
          여기 쓰인 지수는 네이버가 공개하는 공식 값이 아니라 외부에서 관측 가능한 지표로 계산한
          추정치입니다. 네이버 검색 공식 블로그는 2016년에 &quot;최적화 블로그, 저품질 블로그,
          블로그지수 등은 네이버에서 만든 개념이 아닙니다&quot;라고 밝혔습니다.{' '}
          <Link href="/guides/naver-blog-index-truth" className="text-[#0064FF] hover:underline">
            자세히 보기
          </Link>
        </p>
      </div>
    </div>
  )
}
