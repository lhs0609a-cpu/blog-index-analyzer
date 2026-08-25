import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  fetchKeywordPage,
  difficultyKo,
  hasDifficulty,
  KEYWORD_PAGE_REVALIDATE,
  type KeywordPage,
} from '@/lib/seoApi'
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd, jsonLdScript, pageMetadata, SITE_NAME } from '@/lib/seo'

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

/**
 * 난이도 성분표 → 화면에 그릴 순서·이름.
 *
 * 백엔드 키를 그대로 보여주면 아무 뜻도 전달되지 않는다. 가중치가 큰 것부터
 * 세우고, 그 값이 무엇을 잰 것인지 한국어로 붙인다.
 */
const BREAKDOWN_LABEL: Record<string, string> = {
  entry_bar: '1페이지 최하위 지수',
  field: '상위권 평균 지수',
  vitality: '경쟁자 활동성',
  demand: '검색 수요',
}

function difficultyParts(
  raw?: Record<string, { value: number; weight: number }> | null
): Array<{ key: string; label: string; value: number; weight: number }> {
  if (!raw) return []
  return Object.entries(raw)
    .filter(([k, v]) => BREAKDOWN_LABEL[k] && v && typeof v.value === 'number')
    .map(([k, v]) => ({ key: k, label: BREAKDOWN_LABEL[k], value: v.value, weight: v.weight ?? 0 }))
    .sort((a, b) => b.weight - a.weight)
}

function describe(page: KeywordPage): string {
  const parts = [`'${page.keyword}' 키워드의 네이버 블로그 1페이지 경쟁 분석.`]
  if (hasDifficulty(page.difficulty_label))
    parts.push(`진입 난이도 ${difficultyKo(page.difficulty_label)}.`)
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

/**
 * 상위권이 무엇으로 버티고 있는지 — C-Rank(출처 신뢰) 우위인지 D.I.A.(문서 품질)
 * 우위인지. 둘은 대응이 정반대라(전자는 누적, 후자는 글 한 편의 완성도) 이걸
 * 가르지 않으면 "좋은 글을 쓰세요" 같은 쓸모없는 조언밖에 못 준다.
 */
function axisVerdict(cRank?: number | null, dia?: number | null) {
  if (cRank == null || dia == null) return null
  if (cRank >= dia * 1.4) return 'crank' as const
  if (dia >= cRank * 1.4) return 'dia' as const
  return 'mixed' as const
}

function pct(v?: number | null): string | null {
  return v == null ? null : `${(v * 100).toFixed(0)}%`
}

/** 키워드별 FAQ. 값이 없는 항목은 아예 만들지 않는다 — 빈 답변은 얇은 페이지다. */
function buildFaq(page: KeywordPage, dormantCount: number) {
  const out: Array<{ question: string; answer: string }> = []
  const kw = page.keyword

  if (page.top10_min_score != null) {
    out.push({
      question: `${kw} 키워드로 상위노출이 가능한가요?`,
      answer:
        `${kw} 검색 결과 1페이지의 최하위 블로그 지수가 ${page.top10_min_score.toFixed(1)}점입니다. ` +
        `내 블로그 지수가 이 값을 넘으면 진입 가능성이 있고, 밑돌면 먼저 지수를 올려야 합니다. ` +
        (dormantCount >= 3
          ? `현재 1페이지 경쟁자 중 ${dormantCount}개가 30일 넘게 새 글이 없어 자리가 비어 있는 편입니다.`
          : `현재 1페이지 경쟁자 대부분이 활발히 발행 중이라 단발성 글로는 어렵습니다.`),
    })
  }
  if (page.search_volume) {
    out.push({
      question: `${kw}의 월 검색량은 얼마나 되나요?`,
      answer:
        `네이버 기준 월 ${page.search_volume.toLocaleString()}회 검색됩니다. ` +
        (typeof page.tab_ratio?.blog === 'number'
          ? `이 중 블로그 영역이 검색 결과의 ${(page.tab_ratio.blog * 100).toFixed(0)}%를 차지합니다.`
          : ''),
    })
  }
  const axis = axisVerdict(page.top10_avg_c_rank, page.top10_avg_dia)
  const breakdown = difficultyParts(page.difficulty_breakdown)
  if (axis) {
    out.push({
      question: `${kw} 1페이지에 오른 블로그들은 어떤 블로그인가요?`,
      answer:
        (page.top10_avg_posts
          ? `상위권 블로그의 평균 발행 글 수는 ${page.top10_avg_posts.toLocaleString()}개입니다. `
          : '') +
        (axis === 'crank'
          ? '한 주제를 오래 쌓아 출처 신뢰(C-Rank)로 버티는 블로그들이 상위를 차지하고 있습니다. 글 한 편의 완성도보다 같은 주제의 누적이 중요한 키워드입니다.'
          : axis === 'dia'
            ? '누적보다 글 자체의 완성도(D.I.A.)로 올라온 블로그가 많습니다. 신생 블로그라도 잘 쓴 글 한 편으로 진입할 여지가 있습니다.'
            : '출처 신뢰와 문서 품질이 섞여 있습니다. 주제를 좁혀 쌓으면서 글의 완성도도 같이 올리는 접근이 맞습니다.'),
    })
  }
  out.push({
    question: '여기 나온 지수는 네이버 공식 값인가요?',
    answer:
      '아닙니다. 네이버는 블로그별 점수를 공개하지 않으며, 2016년 공식 블로그에서 "블로그지수"가 자사 개념이 아니라고 밝혔습니다. 이 페이지의 점수는 검색 결과에 실제로 올라와 있는 블로그를 조회해 외부 관측값으로 계산한 추정치입니다.',
  })
  return out
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
  const axis = axisVerdict(page.top10_avg_c_rank, page.top10_avg_dia)
  const faq = buildFaq(page, dormant.length)
  const tabRows = ([
    ['블로그', page.tab_ratio?.blog, page.tab_ratio?.blog_count],
    ['카페', page.tab_ratio?.cafe, page.tab_ratio?.cafe_count],
    ['지식iN', page.tab_ratio?.kin, page.tab_ratio?.kin_count],
    ['웹문서', page.tab_ratio?.web, page.tab_ratio?.web_count],
  ] as Array<[string, number | undefined, number | undefined]>).filter(
    (r) => typeof r[1] === 'number'
  )
  const volumeRelated = (page.related ?? []).filter((r) => r.monthly_total_search).slice(0, 10)

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
      {faq.length > 0 && <script {...jsonLdScript(faqJsonLd(faq))} />}
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
            hint={
              hasDifficulty(page.difficulty_label) && page.difficulty_score != null
                ? `${page.difficulty_score.toFixed(0)}점 / 100`
                : '상위권 지수 재측정 대기'
            } />
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

        {page.top10_min_score != null && page.top10_avg_score != null && (
          <p className="text-gray-700 leading-[1.9] mb-4">
            상위권의 지수 폭은 최저 {page.top10_min_score.toFixed(1)}점에서 평균{' '}
            {page.top10_avg_score.toFixed(1)}점
            {page.top10_max_score != null && `, 최고 ${page.top10_max_score.toFixed(1)}점`}
            까지입니다.{' '}
            {page.top10_max_score != null && page.top10_max_score - page.top10_min_score >= 25
              ? '편차가 큰 편이라 최상위와 겨루기보다 하위 자리를 노리는 편이 현실적입니다. 컷라인만 넘기면 1페이지 안에는 들어갈 수 있다는 뜻이기도 합니다.'
              : '상위권이 비슷한 수준으로 몰려 있어, 어느 자리를 노리든 요구되는 지수가 크게 다르지 않습니다.'}
          </p>
        )}

        {page.alive_ratio != null && (
          <p className="text-gray-700 leading-[1.9] mb-4">
            1페이지 경쟁 블로그 중 {pct(page.alive_ratio)}가 최근에도 글을 올리고 있습니다.
            {page.alive_ratio >= 0.9
              ? ' 빈자리를 기다리는 전략은 통하지 않는 키워드입니다.'
              : page.alive_ratio <= 0.6
                ? ' 절반 가까이가 사실상 방치 상태라, 꾸준히 발행하는 것만으로도 순위가 바뀔 수 있습니다.'
                : ' 일부 자리는 관리가 느슨해 진입 여지가 있습니다.'}
          </p>
        )}

        {hasDifficulty(page.difficulty_label) &&
          page.difficulty_score != null &&
          breakdown.length > 0 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-10">
                난이도 {page.difficulty_score.toFixed(0)}점은 무엇으로 나왔나
              </h2>
              <p className="text-gray-700 leading-[1.9] mb-4">
                난이도는 하나의 숫자로 보이지만 네 가지를 합친 값입니다. 가장 크게 보는 것은
                1페이지 최하위의 지수입니다 — 상위권이 아무리 세도 마지막 자리가 약하면 그 자리는
                열려 있기 때문입니다.
              </p>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mb-4">
                {breakdown.map((b) => (
                  <div key={b.key} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                    <span className="w-32 shrink-0 text-sm text-gray-600">{b.label}</span>
                    <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <span
                        className="block h-full bg-[#0064FF]"
                        style={{ width: `${Math.max(0, Math.min(100, b.value))}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right text-sm text-gray-900 tabular-nums">
                      {b.value.toFixed(1)}
                      <span className="text-gray-400 ml-1">({Math.round(b.weight * 100)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

        {axis && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-10">
              상위권은 무엇으로 버티고 있나
            </h2>
            <p className="text-gray-700 leading-[1.9] mb-4">
              네이버 검색은 크게 두 축으로 문서를 봅니다. 하나는 이 블로그가 그 주제의 믿을 만한
              출처인지 보는 C-Rank이고, 다른 하나는 글 한 편이 검색 의도에 얼마나 충실한지 보는
              D.I.A.입니다. 두 축은 대응이 정반대라 — 앞은 누적, 뒤는 완성도 — 어느 쪽이 통하는
              키워드인지 먼저 갈라야 합니다.
            </p>
            <p className="text-gray-700 leading-[1.9] mb-4">
              이 키워드의 상위권은 C-Rank 평균 {page.top10_avg_c_rank!.toFixed(1)}점, D.I.A. 평균{' '}
              {page.top10_avg_dia!.toFixed(1)}점입니다.
              {page.top10_avg_posts
                ? ` 평균 발행 글 수는 ${page.top10_avg_posts.toLocaleString()}개입니다.`
                : ''}
              {axis === 'crank'
                ? ' 출처 신뢰 쪽이 확연히 높습니다. 오래 한 주제를 쌓아온 블로그들의 자리라, 잘 쓴 글 한 편으로 뚫기는 어렵습니다. 같은 주제를 반복해 쌓아 C-Rank를 먼저 만드는 것이 순서입니다.'
                : axis === 'dia'
                  ? ' 문서 품질 쪽이 높습니다. 누적이 적은 블로그도 글의 완성도로 올라와 있다는 뜻이라, 신생 블로그에게 상대적으로 열려 있는 키워드입니다.'
                  : ' 두 축이 비슷합니다. 주제를 좁혀 쌓으면서 글의 완성도도 같이 올리는 접근이 맞습니다.'}
            </p>
          </>
        )}

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
            <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-10">
              이 키워드는 어디에서 소비되나
            </h2>
            <p className="text-gray-700 leading-[1.9] mb-4">
              같은 검색어라도 사람들이 답을 찾는 자리는 다릅니다. 블로그 자리가 좁은 키워드는
              1위를 해도 유입이 크지 않고, 반대로 블로그 비중이 높은 키워드는 순위 하나가 그대로
              방문자로 옵니다. 이 키워드의 검색 결과는 블로그가{' '}
              {(blogTab * 100).toFixed(0)}%를 차지합니다.
              {blogTab < 0.15
                ? ' 블로그 노출 자리가 좁습니다. 상위노출 자체보다, 같은 주제의 다른 키워드로 우회하는 편이 나을 수 있습니다.'
                : blogTab >= 0.4
                  ? ' 블로그가 검색 결과의 중심인 키워드입니다. 순위를 올린 만큼 유입이 따라옵니다.'
                  : ' 블로그 글이 노출될 자리가 확보돼 있는 키워드입니다.'}
            </p>
            {tabRows.length > 1 && (
              <div className="overflow-x-auto -mx-4 px-4 mb-4">
                <table className="w-full min-w-[380px] text-sm border-collapse bg-white">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left font-semibold px-4 py-3 border border-gray-200">영역</th>
                      <th className="text-left font-semibold px-4 py-3 border border-gray-200">비중</th>
                      <th className="text-left font-semibold px-4 py-3 border border-gray-200">문서 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabRows.map(([name, ratio, count]) => (
                      <tr key={name}>
                        <td className="px-4 py-3 border border-gray-200">{name}</td>
                        <td className="px-4 py-3 border border-gray-200">{(ratio! * 100).toFixed(1)}%</td>
                        <td className="px-4 py-3 border border-gray-200">
                          {count != null ? count.toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {volumeRelated.length > 0 && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-10">함께 검색되는 키워드</h2>
            <p className="text-gray-700 leading-[1.9] mb-4">
              이 키워드를 찾는 사람들이 같이 검색하는 말들입니다. 본 키워드가 막혀 있다면, 검색량은
              작아도 경쟁이 얕은 쪽부터 자리를 잡고 넓혀가는 편이 빠릅니다.
            </p>
            <div className="overflow-x-auto -mx-4 px-4 mb-4">
              <table className="w-full min-w-[320px] text-sm border-collapse bg-white">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left font-semibold px-4 py-3 border border-gray-200">키워드</th>
                    <th className="text-left font-semibold px-4 py-3 border border-gray-200">월 검색량</th>
                  </tr>
                </thead>
                <tbody>
                  {volumeRelated.map((r) => (
                    <tr key={r.keyword}>
                      <td className="px-4 py-3 border border-gray-200">{r.keyword}</td>
                      <td className="px-4 py-3 border border-gray-200">
                        {r.monthly_total_search!.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

        {faq.length > 0 && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 mt-10">자주 묻는 질문</h2>
            <div className="space-y-6 mb-4">
              {faq.map((item) => (
                <div key={item.question}>
                  <h3 className="font-bold text-gray-900 mb-2">{item.question}</h3>
                  <p className="text-gray-700 leading-[1.9]">{item.answer}</p>
                </div>
              ))}
            </div>
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
