'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, Loader2 } from 'lucide-react'
import { getIndexHistory, type IndexHistoryResponse, type IndexHistoryPoint } from '@/lib/api/blog'

/**
 * 지수 변화 추이.
 *
 * 한 개의 값(총점)만 선으로 그린다. 레벨은 두 번째 세로축을 만들지 않고
 * "레벨이 바뀐 날"을 점과 세로선으로 표시한다 — 축이 두 개면 두 값 사이에
 * 없는 상관관계가 눈에 보이기 때문이다.
 *
 * 데이터가 없는 과거는 "점수가 낮았다"가 아니라 "측정한 적이 없다"이다.
 * 그래서 점이 0~1개일 때는 선을 그리지 않고 그 사실을 글로 말한다.
 */

const RANGES = [
  { label: '30일', days: 30 },
  { label: '90일', days: 90 },
  { label: '전체', days: 1095 },
] as const

const LINE = '#0064FF'       // 시리즈 색 (브랜드 블루)
const SURFACE = '#ffffff'    // 점 링 색 = 표면색
const GRID = '#eef1f5'
const AXIS_TEXT = '#8b95a1'
const UP = '#059669'
const DOWN = '#dc2626'
const NEUTRAL = '#9ca3af'

type ChartRow = IndexHistoryPoint & { ts: number; event?: 'level_up' | 'level_down' | 'ruler_change' }

function fmtDate(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function fmtFullDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row: ChartRow = payload[0].payload
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-lg text-sm">
      <div className="text-xs text-gray-500 mb-1">{fmtFullDate(row.ts)}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: LINE }} />
        <span className="font-bold text-gray-900">{row.total_score?.toFixed(1)}점</span>
        <span className="text-gray-400">/ 100</span>
      </div>
      <div className="mt-1 text-gray-700">
        {row.tier} <span className="text-gray-400">· Lv.{row.level}</span>
      </div>
      {!row.comparable && (
        <div className="mt-1.5 text-xs text-amber-600">이전 채점 기준으로 잰 점수</div>
      )}
      {row.source === 'auto' && (
        <div className="mt-1 text-xs text-gray-400">자동 측정</div>
      )}
    </div>
  )
}

/** 점: 레벨이 바뀐 날만 크게, 나머지는 작게. 값 라벨은 끝점 하나만. */
function EventDot(props: any) {
  const { cx, cy, payload, index, dataLength } = props
  // recharts 는 dot 렌더러가 SVG 엘리먼트를 돌려주길 기대한다 (null 이면 경고)
  if (cx == null || cy == null) return <g />

  const isLast = index === dataLength - 1
  const ev = payload.event

  if (ev) {
    const color = ev === 'level_up' ? UP : ev === 'level_down' ? DOWN : NEUTRAL
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill={color} stroke={SURFACE} strokeWidth={2} />
      </g>
    )
  }
  if (isLast) {
    return <circle cx={cx} cy={cy} r={5} fill={LINE} stroke={SURFACE} strokeWidth={2} />
  }
  return <circle cx={cx} cy={cy} r={3} fill={LINE} stroke={SURFACE} strokeWidth={2} />
}

export default function BlogIndexHistoryChart({ blogId }: { blogId: string }) {
  const [days, setDays] = useState<number>(90)
  const [data, setData] = useState<IndexHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getIndexHistory(blogId, days)
      .then((res) => { if (alive) setData(res) })
      .catch((e) => { if (alive) setError(e?.message || '이력을 불러오지 못했습니다') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [blogId, days])

  const rows: ChartRow[] = useMemo(() => {
    if (!data) return []
    const eventByDate = new Map(data.events.map((e) => [e.date, e.type]))
    return data.points.map((p) => ({
      ...p,
      ts: new Date(`${p.date}T00:00:00+09:00`).getTime(),
      event: eventByDate.get(p.date),
    }))
  }, [data])

  // 세로축: 0~100 전체를 늘 보여주면 몇 점짜리 변화가 안 보인다.
  // 대신 표시 구간을 축 눈금으로 분명히 드러내고, 위아래로 여유를 둔다.
  const domain = useMemo<[number, number]>(() => {
    if (!rows.length) return [0, 100]
    const vals = rows.map((r) => r.total_score || 0)
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 8) / 5) * 5)
    const hi = Math.min(100, Math.ceil((Math.max(...vals) + 8) / 5) * 5)
    return [lo, hi === lo ? lo + 10 : hi]
  }, [rows])

  const rulerChangeDates = useMemo(
    () => (data?.events || []).filter((e) => e.type === 'ruler_change').map((e) => e.date),
    [data]
  )

  const summary = data?.summary
  const delta = summary?.score_delta ?? 0
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const deltaColor = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'

  return (
    <div className="glass-3d p-6 md:p-8">
      {/* 헤더 + 기간 필터 (한 줄) */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#0064FF]" strokeWidth={2} />
            지수 변화 추이
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            분석할 때마다 하루 한 점씩 기록됩니다 · 세로축은 100점 만점 중 표시 구간
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                days === r.days
                  ? 'bg-white text-gray-900 font-semibold shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-64 flex items-center justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> 이력을 불러오는 중
        </div>
      )}

      {!loading && error && (
        <div className="h-40 flex items-center justify-center text-sm text-gray-500">{error}</div>
      )}

      {!loading && !error && rows.length <= 1 && (
        <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-6 text-center">
          <Clock className="w-6 h-6 text-gray-400 mx-auto mb-2" strokeWidth={1.75} />
          <div className="font-semibold text-gray-800">
            {rows.length === 1 ? '오늘이 첫 기록입니다' : '아직 기록이 없습니다'}
          </div>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
            이 그래프는 <b>측정한 날</b>만 그립니다. 그 전 점수는 낮았던 게 아니라
            {' '}측정한 적이 없어 그릴 수 없습니다.<br />
            지금부터는 분석할 때마다, 그리고 하루 한 번 자동으로 점이 쌓입니다.
          </p>
          {rows.length === 1 && (
            <div className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-full px-3 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: LINE }} />
              {rows[0].date} · {rows[0].total_score?.toFixed(1)}점 · {rows[0].tier}
            </div>
          )}
        </div>
      )}

      {!loading && !error && rows.length > 1 && (
        <>
          {/* 요약 한 줄 */}
          <div className="mt-4 mb-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className={`flex items-center gap-1.5 font-semibold ${deltaColor}`}>
              <DeltaIcon className="w-4 h-4" strokeWidth={2.25} />
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}점
              <span className="font-normal text-gray-400">
                ({summary?.baseline_date} → {summary?.last_date})
              </span>
            </div>
            {!!summary?.level_delta && (
              <div className="text-gray-600">
                레벨 {summary.level_delta > 0 ? '+' : ''}{summary.level_delta}
                <span className="text-gray-400"> · 현재 {summary.current_tier}</span>
              </div>
            )}
            <div className="text-gray-500">
              최고 {summary?.best_score?.toFixed(1)}점
              <span className="text-gray-400"> ({summary?.best_date})</span>
            </div>
          </div>

          <div className="h-72 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 16, right: 28, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={fmtDate}
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  minTickGap={28}
                />
                <YAxis
                  domain={domain}
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) => `${v}`}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#c9d1d9', strokeWidth: 1 }} />

                {/* 채점 기준이 바뀐 날 — 그 앞뒤는 다른 자로 잰 값이다 */}
                {rulerChangeDates.map((d) => (
                  <ReferenceLine
                    key={d}
                    x={new Date(`${d}T00:00:00+09:00`).getTime()}
                    stroke={NEUTRAL}
                    strokeDasharray="4 4"
                    label={{ value: '기준 변경', position: 'top', fill: AXIS_TEXT, fontSize: 11 }}
                  />
                ))}

                <Line
                  type="monotone"
                  dataKey="total_score"
                  stroke={LINE}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={<EventDot dataLength={rows.length} />}
                  activeDot={{ r: 6, fill: LINE, stroke: SURFACE, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 언제 올랐는가 — 그래프가 답해야 하는 바로 그 질문 */}
          {!!data?.events.length && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="text-sm font-semibold text-gray-800 mb-2">등급이 바뀐 날</div>
              <ul className="space-y-2">
                {[...data.events].reverse().slice(0, 6).map((e, i) => {
                  const color =
                    e.type === 'level_up' ? UP : e.type === 'level_down' ? DOWN : NEUTRAL
                  return (
                    <li key={`${e.date}-${i}`} className="flex items-start gap-2.5 text-sm">
                      <span
                        className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span className="text-gray-500 tabular-nums shrink-0">{e.date}</span>
                      <span className="text-gray-800">{e.message}</span>
                      {typeof e.score_delta === 'number' && e.type !== 'ruler_change' && (
                        <span className="text-gray-400">
                          ({e.score_delta > 0 ? '+' : ''}{e.score_delta}점)
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {data?.has_legacy && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
              <span>
                점선 왼쪽은 이전 채점 기준으로 매긴 점수입니다. 채점 방식이 바뀐 구간을
                가로질러 비교하면 실제 변화가 아닌 <b>기준 변경</b>이 상승·하락처럼 보일 수 있습니다.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
