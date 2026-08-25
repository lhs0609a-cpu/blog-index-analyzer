import Link from 'next/link'
import type { Metadata } from 'next'
import {
  fetchKeywordList,
  SITEMAP_REVALIDATE,
  difficultyKo,
  difficultyTone,
  hasDifficulty,
  DIFFICULTY_ORDER,
  type KeywordListItem,
} from '@/lib/seoApi'
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/seo'

/**
 * 키워드 분석 허브.
 *
 * 사이트맵만으로 도달하는 페이지는 고아 취급되어 색인 우선순위가 떨어진다.
 * 크롤러가 내부 링크로 걸어 들어갈 입구가 반드시 있어야 한다 — 이 페이지가 그 입구다.
 * 푸터에서도 여기로 링크한다.
 *
 * 왜 난이도로 묶나 (2026-08-25):
 * 처음엔 카테고리로 묶으려 했는데 340개 중 314개가 '일반'이라 축이 되지 않았다.
 * 그리고 방문자가 이 목록에서 찾는 것은 분류가 아니라 **뚫을 수 있는 키워드**다.
 * 난이도 오름차순으로 세우면 목록 자체가 답이 된다.
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

/** 난이도 구간 설명. 목록 위에 붙어 이 구간이 무슨 뜻인지 말해준다. */
const BUCKET_NOTE: Record<string, string> = {
  very_easy: '1페이지가 사실상 비어 있습니다. 글 하나로도 자리가 납니다.',
  easy: '컷라인이 낮습니다. 지수를 크게 올리지 않아도 진입할 수 있습니다.',
  moderate: '최하위 자리를 노리면 가능성이 있습니다. 같은 주제를 몇 편 쌓아야 합니다.',
  hard: '상위권이 두껍습니다. 출처 신뢰(C-Rank)를 먼저 만들어야 합니다.',
  very_hard: '1페이지 전원이 강하고 활발합니다. 정면으로는 권하지 않습니다.',
  unknown: '상위 블로그 지수를 아직 못 잰 키워드입니다. 재측정 대기 중이라 난이도를 말하지 않습니다.',
}

function bucketOf(item: KeywordListItem): string {
  const l = item.difficulty_label
  return l && DIFFICULTY_ORDER.includes(l as never) ? l : 'unknown'
}

function KeywordCard({ k }: { k: KeywordListItem }) {
  return (
    <li>
      <Link
        href={`/keyword/${encodeURIComponent(k.slug)}`}
        className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-white border border-gray-200 hover:border-[#0064FF]"
      >
        <span className="text-sm text-gray-900 truncate">{k.keyword}</span>
        <span className="shrink-0 flex items-center gap-2 text-xs tabular-nums">
          {k.search_volume ? (
            <span className="text-gray-500">월 {k.search_volume.toLocaleString()}</span>
          ) : null}
          {hasDifficulty(k.difficulty_label) && k.difficulty_score != null ? (
            <span className="text-gray-900 font-medium">{k.difficulty_score.toFixed(0)}</span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

export default async function KeywordHubPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const pageNo = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1)
  const { total, items } = await fetchKeywordList((pageNo - 1) * PAGE_SIZE, PAGE_SIZE)
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // 난이도별로 묶고, 구간 안에서는 점수 오름차순(= 쉬운 것부터).
  const buckets = DIFFICULTY_ORDER.map((label) => ({
    label,
    items: items
      .filter((k) => bucketOf(k) === label)
      .sort((a, b) => (a.difficulty_score ?? 999) - (b.difficulty_score ?? 999)),
  })).filter((b) => b.items.length > 0)

  const measured = items.filter((k) => hasDifficulty(k.difficulty_label))
  const winnable = items.filter(
    (k) => k.difficulty_label === 'very_easy' || k.difficulty_label === 'easy' || k.difficulty_label === 'moderate'
  )

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
        <p className="text-gray-700 leading-[1.9] mb-4">
          난이도는 1페이지 최하위의 지수(45%), 상위권 평균 지수(30%), 경쟁자 활동성(15%),
          검색 수요(10%)를 합친 값입니다. 가장 크게 보는 것이 최하위 지수인 이유는, 1페이지에
          들어가려면 1위가 아니라 <strong>10위를 이기면 되기 때문</strong>입니다.
        </p>
        {measured.length > 0 && (
          <p className="text-gray-700 leading-[1.9] mb-4">
            이 페이지에 실린 {items.length.toLocaleString()}개 중 난이도가 계산된 것은{' '}
            {measured.length.toLocaleString()}개이고, 그중 <strong>{winnable.length.toLocaleString()}개</strong>가
            보통 이하 — 즉 신규 블로그도 자리를 노려볼 만한 구간입니다.
          </p>
        )}
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
          buckets.map((b) => (
            <section key={b.label} className="mb-10">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-bold text-gray-900">{difficultyKo(b.label)}</h2>
                <span
                  className={`px-2 py-0.5 rounded-full border text-xs ${difficultyTone(b.label)}`}
                >
                  {b.items.length.toLocaleString()}개
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-4">{BUCKET_NOTE[b.label]}</p>
              <ul className="grid sm:grid-cols-2 gap-2">
                {b.items.map((k) => (
                  <KeywordCard key={k.slug} k={k} />
                ))}
              </ul>
            </section>
          ))
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
