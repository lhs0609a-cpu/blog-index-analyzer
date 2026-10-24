import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_NAME } from '@/lib/seo'
import {
  CARD_HONESTY_NOTE,
  analyzeUrl,
  cardImagePath,
  cardPageUrl,
  fetchBlogCard,
  formatMeasuredDate,
  gradeColors,
  gradeLabel,
  isValidBlogId,
} from '@/lib/blogCard'

export const revalidate = 600

type Props = { params: { blogId: string } }

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const blogId = decodeId(params.blogId)
  const card = await fetchBlogCard(blogId)
  const name = card.blog_name || blogId
  const title = card.available
    ? `${name} 블로그 등급 ${gradeLabel(card)}${card.estimated ? ' (추정)' : ''}`
    : `${name} 블로그 등급 카드`
  const description = card.available
    ? `${SITE_NAME} 자체 지수 기준 ${gradeLabel(card)} · 운영 건강도 ${card.total_score?.toFixed(1)}점. 네이버 공식 지수가 아닌 ${SITE_NAME} 추정 모델입니다.`
    : `${SITE_NAME}에서 내 네이버 블로그 등급을 무료로 확인하세요.`

  return {
    title,
    description,
    // 블로그마다 하나씩 생기는 얇은 페이지다. 공유용이지 검색용이 아니다.
    robots: { index: false, follow: true },
    alternates: { canonical: isValidBlogId(blogId) ? cardPageUrl(blogId) : undefined },
    openGraph: {
      type: 'website',
      locale: 'ko_KR',
      siteName: SITE_NAME,
      title: `${title} | ${SITE_NAME}`,
      description,
      url: isValidBlogId(blogId) ? cardPageUrl(blogId) : undefined,
    },
    twitter: { card: 'summary_large_image', title: `${title} | ${SITE_NAME}`, description },
  }
}

export default async function BlogCardPage({ params }: Props) {
  const blogId = decodeId(params.blogId)
  const valid = isValidBlogId(blogId)
  const card = await fetchBlogCard(blogId)
  const measured = formatMeasuredDate(card.measured_at)
  const colors = gradeColors(card.level)

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50/40 px-4 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <p className="mb-4 text-center text-sm font-semibold text-[#0064FF]">{SITE_NAME} 블로그 등급 카드</p>

        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xl">
          {card.available ? (
            <div className="p-8 text-center">
              <h1 className="truncate text-xl font-bold text-gray-900">{card.blog_name || blogId}</h1>
              <p className="mt-1 text-sm text-gray-500">@{blogId}</p>

              <div
                className="mx-auto mt-8 flex h-36 w-36 flex-col items-center justify-center rounded-full text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})` }}
              >
                <span className="text-4xl font-extrabold leading-tight">{gradeLabel(card)}</span>
                {card.estimated && (
                  <span className="mt-1 rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold">추정</span>
                )}
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="text-2xl font-bold text-gray-900">Lv.{card.level}</div>
                  <div className="text-xs text-gray-500">레벨</div>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="text-2xl font-bold text-gray-900">{card.total_score?.toFixed(1)}</div>
                  <div className="text-xs text-gray-500">운영 건강도 / 100</div>
                </div>
              </div>

              <p className="mt-6 text-sm text-gray-600">
                측정일 {measured ?? '알 수 없음'}
                {card.estimated && ' · 일부 지표만 읽은 추정 등급'}
              </p>
              <p className="mt-2 text-xs text-gray-400">{CARD_HONESTY_NOTE}</p>
            </div>
          ) : (
            <div className="p-8 text-center">
              <h1 className="text-xl font-bold text-gray-900">{valid ? `@${blogId}` : '블로그 등급 카드'}</h1>
              <p className="mt-6 text-gray-700">아직 분석 기록이 없습니다</p>
              <p className="mt-2 text-sm text-gray-500">
                블로그를 한 번 분석하면 등급 카드가 만들어집니다.
              </p>
              <p className="mt-6 text-xs text-gray-400">{CARD_HONESTY_NOTE}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={analyzeUrl(card.available || !valid ? undefined : blogId)}
            className="block rounded-2xl bg-[#0064FF] px-6 py-4 text-center font-semibold text-white shadow-md hover:bg-[#0052d4]"
          >
            {card.available || !valid ? '내 블로그 등급 확인하기' : '이 블로그 분석하기'}
          </Link>
          {card.available && (
            <a
              href={cardImagePath(blogId)}
              download={`${blogId}-grade-card.png`}
              className="block rounded-2xl border border-gray-200 bg-white px-6 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              카드 이미지(PNG) 저장
            </a>
          )}
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-gray-400">
          등급은 공개 데이터로 계산한 {SITE_NAME}의 자체 추정 모델이며, 네이버가 공개하는 공식 지수가 아닙니다.
          측정 시점 이후 실제 상태는 달라질 수 있습니다.
        </p>
      </div>
    </main>
  )
}
