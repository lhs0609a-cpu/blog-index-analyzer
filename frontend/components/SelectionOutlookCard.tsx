'use client'

import { ArrowUpRight, BadgeCheck, Coins } from 'lucide-react'
import type { SelectionOutlook } from '@/lib/api/blog'

/**
 * "그래서 체험단에 뽑히냐" — 측정 등급을 시장가로 번역한 카드.
 *
 * 블로거가 지수를 알고 싶은 이유는 지수가 아니다. 체험단 시장에서 광고주는
 * '최적' 구간 블로거 한 명을 고르는 데 2만원을 더 내고(블덱스 체험단 요금표),
 * 블로거가 받는 원고료는 건당 1~10만원이다. 그 숫자를 보여주지 않으면 사용자는
 * 점수만 보고 창을 닫는다.
 *
 * 과장 금지 규칙 세 개:
 *  1. 광고주가 내는 금액과 블로거가 받는 금액을 섞지 않는다.
 *  2. 우리 구간 이름과 남의 플랫폼 지수를 같다고 말하지 않는다.
 *  3. 표본이 적으면(confidence) 등급을 단정하지 않는다.
 */

const TIER_TONE: Record<string, string> = {
  '최적+': 'bg-emerald-50 border-emerald-200 text-emerald-800',
  최적: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  준최: 'bg-amber-50 border-amber-200 text-amber-800',
  일반: 'bg-gray-50 border-gray-200 text-gray-700',
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '표본 충분',
  medium: '표본 보통',
  low: '표본 적음 — 참고만',
}

export default function SelectionOutlookCard({ data }: { data: SelectionOutlook }) {
  const won = data.advertiser_premium_krw.toLocaleString('ko-KR')

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <BadgeCheck className="w-5 h-5 text-[#0064FF]" strokeWidth={1.8} />
        <h3 className="font-bold text-gray-900">체험단에서 이 블로그는</h3>
        <span className="ml-auto text-xs text-gray-400">
          {CONFIDENCE_LABEL[data.confidence] ?? data.confidence}
        </span>
      </div>

      {/* 지금 구간 */}
      <div
        className={`rounded-xl border px-4 py-3 mb-4 ${
          TIER_TONE[data.tier] ?? TIER_TONE['일반']
        }`}
      >
        <div className="text-2xl font-bold mb-1">{data.tier}</div>
        <p className="text-sm leading-relaxed">
          {data.is_optimized ? (
            <>
              광고주가 이 구간 블로거 한 명을 선정할 때 <strong>{won}원</strong>을 더
              냅니다. 선정 대상 중 가장 비싼 구간입니다.
            </>
          ) : data.is_selection_candidate ? (
            <>
              선정 대상 구간에는 들어갑니다. 다만 광고주가 추가 비용을 내고 고르는
              구간은 ‘최적’부터입니다.
            </>
          ) : (
            <>
              체험단 플랫폼이 선정 대상으로 세는 구간(준최 이상)에 아직 못 들어갔습니다.
            </>
          )}
        </p>
      </div>

      {/* 다음 칸까지 */}
      {data.next_tier && data.points_to_next !== null && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2 text-sm font-bold text-gray-900">
            <ArrowUpRight className="w-4 h-4 text-[#0064FF]" />
            {data.next_tier}까지 {data.points_to_next}점
          </div>

          {data.best_moves.length > 0 ? (
            <div className="space-y-2">
              {/* 낮은 점수부터가 아니라 '가중치 × 부족분' 순서다 —
                  총점을 가장 많이 올려주는 것부터 보여준다 */}
              {data.best_moves.map((m) => (
                <div key={m.signal} className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-900">{m.label}</span>
                    <span className="text-xs text-gray-500 shrink-0">
                      지금 {m.score}점 · 최대 +{m.max_total_gain}점
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{m.move}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">올릴 여지가 있는 신호가 없습니다.</p>
          )}
        </div>
      )}

      {/* 돈의 맥락 — 광고주가 내는 돈과 블로거가 받는 돈을 분리해서 쓴다 */}
      <div className="flex items-start gap-2 text-xs text-gray-500 border-t border-gray-100 pt-3">
        <Coins className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
        <p className="leading-relaxed">
          기준:{' '}
          <a
            href={data.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700"
          >
            {data.source.name}
          </a>{' '}
          ({data.source.checked_at} 확인) — 준최적화 선정 무료, 최적화 선정 1인당
          20,000원. 이 금액은 광고주가 내는 돈이고 블로거의 원고료와 다릅니다.
          <br />
          {data.caveat}
        </p>
      </div>
    </div>
  )
}
