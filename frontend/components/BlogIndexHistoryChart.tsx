'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, Loader2, PenLine } from 'lucide-react'
import {
  getIndexHistory, getPostingHistory,
  type IndexHistoryResponse, type IndexHistoryPoint, type PostingHistoryResponse,
} from '@/lib/api/blog'

/**
 * 지수 변화 추이 + 발행 활동.
 *
 * 두 값(지수 점수 0~100, 발행 건수)은 단위가 달라 한 그림에 두 개의 세로축으로
 * 겹치지 않는다 — 그러면 없는 상관관계가 눈에 보인다. 대신 세로로 나란히 놓고
 * 시간축만 공유한다.
 *
 * 지수는 '측정한 날'에만 존재한다. 그 이전 구간은 점수가 낮았던 게 아니라 잰 적이
 * 없는 것이라, 선을 이어 그리지 않고 발행 활동(실제 과거 기록)으로만 보여준다.
 */

const RANGES = [
  { label: '30일', days: 30 },
  { label: '90일', days: 90 },
  { label: '1년', days: 365 },
  { label: '전체', days: 1095 },
] as const

const LINE = '#0064FF'
const BAR = '#93b8f0'
const BAR_RECENT = '#0064FF'
const SURFACE = '#ffffff'
const GRID = '#eef1f5'
const AXIS_TEXT = '#8b95a1'
const UP = '#059669'
const DOWN = '#dc2626'
const NEUTRAL = '#9ca3af'

const DAY = 86400000

type ChartRow = IndexHistoryPoint & {
  ts: number
  event?: 'level_up' | 'level_down' | 'ruler_change'
  /** 채점 기준이 다른 점수는 선을 잇지 않는다 — 이으면 기준 변경이 폭등으로 보인다 */
  score_current: number | null
  score_legacy: number | null
}
type Bucket = { ts: number; count: number; label: string }

const toTs = (d: string) => new Date(`${d}T00:00:00+09:00`).getTime()

function fmtTick(ts: number, monthly: boolean) {
  const d = new Date(ts)
  return monthly ? `${d.getFullYear()}.${d.getMonth() + 1}` : `${d.getMonth() + 1}/${d.getDate()}`
}

function fmtFullDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

function IndexTooltip({ active, payload }: any) {
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
      {!row.comparable && <div className="mt-1.5 text-xs text-amber-600">이전 채점 기준으로 잰 점수</div>}
      {row.source === 'auto' && <div className="mt-1 text-xs text-gray-400">자동 측정</div>}
    </div>
  )
}

function PostingTooltip({ active, payload, monthly }: any) {
  if (!active || !payload?.length) return null
  const row: Bucket = payload[0].payload
  // 이번 달은 아직 안 끝났다. 그 말을 안 하면 마지막 막대가 '급감'으로 읽힌다.
  const now = new Date()
  const d = new Date(row.ts)
  const partial = monthly && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg text-sm">
      <div className="text-xs text-gray-500 mb-0.5">{row.label}</div>
      <div className="font-bold text-gray-900">
        {row.count}건 <span className="font-normal text-gray-500">{monthly ? '발행 (월)' : '발행'}</span>
      </div>
      {partial && <div className="mt-1 text-xs text-gray-400">이번 달은 아직 진행 중</div>}
    </div>
  )
}

function EventDot(props: any) {
  const { cx, cy, payload, index, dataLength } = props
  // recharts 는 dot 렌더러가 SVG 엘리먼트를 돌려주길 기대한다 (null 이면 경고)
  if (cx == null || cy == null) return <g />
  // 등급이 바뀐 날만 색 마커. ruler_change 는 세로 점선이 이미 말하므로 여기서
  // 회색으로 칠하면 '이전 기준 점'(회색)과 구분이 사라진다.
  const ev = payload.event
  if (ev === 'level_up' || ev === 'level_down') {
    return (
      <circle cx={cx} cy={cy} r={6} fill={ev === 'level_up' ? UP : DOWN}
              stroke={SURFACE} strokeWidth={2} />
    )
  }
  const r = index === dataLength - 1 ? 5 : 3
  return <circle cx={cx} cy={cy} r={r} fill={LINE} stroke={SURFACE} strokeWidth={2} />
}

export default function BlogIndexHistoryChart({ blogId }: { blogId: string }) {
  const [days, setDays] = useState<number>(365)
  const [data, setData] = useState<IndexHistoryResponse | null>(null)
  const [posting, setPosting] = useState<PostingHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [postingLoading, setPostingLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getIndexHistory(blogId, 1095)
      .then((res) => { if (alive) setData(res) })
      .catch((e) => { if (alive) setError(e?.message || '이력을 불러오지 못했습니다') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [blogId])

  // 발행 이력은 네이버 글목록을 여러 페이지 훑기 때문에 지수보다 늦게 온다.
  useEffect(() => {
    let alive = true
    setPostingLoading(true)
    getPostingHistory(blogId)
      .then((res) => { if (alive) setPosting(res) })
      .catch(() => { if (alive) setPosting(null) })
      .finally(() => { if (alive) setPostingLoading(false) })
    return () => { alive = false }
  }, [blogId])

  const now = useMemo(() => Date.now(), [])
  const rangeStart = now - days * DAY
  const monthly = days > 120

  const allRows: ChartRow[] = useMemo(() => {
    if (!data) return []
    const eventByDate = new Map(data.events.map((e) => [e.date, e.type]))
    return data.points.map((p) => ({
      ...p,
      ts: toTs(p.date),
      event: eventByDate.get(p.date),
      score_current: p.comparable ? p.total_score : null,
      score_legacy: p.comparable ? null : p.total_score,
    }))
  }, [data])

  const rows = useMemo(() => allRows.filter((r) => r.ts >= rangeStart), [allRows, rangeStart])

  // 발행 이력: 범위가 길면 월 단위로 묶는다 (4년치를 일 단위로 그리면 막대가 실선이 된다)
  const buckets: Bucket[] = useMemo(() => {
    if (!posting?.daily?.length) return []
    const map = new Map<number, number>()
    for (const d of posting.daily) {
      const ts = toTs(d.date)
      if (ts < rangeStart) continue
      const dt = new Date(ts)
      const key = monthly ? new Date(dt.getFullYear(), dt.getMonth(), 1).getTime() : ts
      map.set(key, (map.get(key) || 0) + d.count)
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ts, count]) => ({
        ts,
        count,
        label: monthly
          ? `${new Date(ts).getFullYear()}년 ${new Date(ts).getMonth() + 1}월`
          : fmtFullDate(ts),
      }))
  }, [posting, rangeStart, monthly])

  // 두 패널이 같은 시간축을 쓴다 (small multiples)
  const xDomain = useMemo<[number, number]>(() => {
    const candidates = [...rows.map((r) => r.ts), ...buckets.map((b) => b.ts)]
    const lo = candidates.length ? Math.min(...candidates) : rangeStart
    return [Math.max(lo, rangeStart), now]
  }, [rows, buckets, rangeStart, now])

  const yDomain = useMemo<[number, number]>(() => {
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

  // 발행 활동 요약 — "언제부터 달라졌나"에 대한 실제 데이터 기반 답
  const postingSummary = useMemo(() => {
    if (!posting?.daily?.length) return null
    const cut90 = now - 90 * DAY
    const cut180 = now - 180 * DAY
    let recent = 0, prior = 0
    for (const d of posting.daily) {
      const ts = toTs(d.date)
      if (ts >= cut90) recent += d.count
      else if (ts >= cut180) prior += d.count
    }
    const pct = prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null
    return { recent, prior, pct }
  }, [posting, now])

  const comparableCount = useMemo(() => rows.filter((r) => r.comparable).length, [rows])
  const hasLegacyInView = useMemo(() => rows.some((r) => !r.comparable), [rows])

  const summary = data?.summary
  const delta = summary?.score_delta ?? 0
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const deltaColor = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'

  // 두 패널이 같은 눈금을 써야 축을 공유한다는 게 눈에 보인다.
  // (recharts 는 시리즈 데이터로 눈금을 만들기 때문에, 명시하지 않으면 패널마다 달라진다)
  const sharedTicks = useMemo(() => {
    const [lo, hi] = xDomain
    if (!(hi > lo)) return undefined
    const out: number[] = []
    if (monthly) {
      const d = new Date(lo)
      let cur = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
      const months: number[] = []
      while (cur <= hi) {
        if (cur >= lo) months.push(cur)
        const n = new Date(cur)
        cur = new Date(n.getFullYear(), n.getMonth() + 1, 1).getTime()
      }
      const step = Math.max(1, Math.ceil(months.length / 7))
      months.forEach((m, i) => { if (i % step === 0) out.push(m) })
    } else {
      const n = 6
      for (let i = 0; i <= n; i++) out.push(Math.round(lo + ((hi - lo) * i) / n))
    }
    return out
  }, [xDomain, monthly])

  const axisProps = {
    dataKey: 'ts',
    type: 'number' as const,
    scale: 'time' as const,
    domain: xDomain,
    ticks: sharedTicks,
    tickFormatter: (v: number) => fmtTick(v, monthly),
    tick: { fill: AXIS_TEXT, fontSize: 12 },
    tickLine: false,
    axisLine: { stroke: GRID },
    minTickGap: 12,
  }

  return (
    <div className="glass-3d p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#0064FF] gi3d" strokeWidth={2} />
            지수 변화 추이
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            지수는 측정한 날만 기록됩니다 · 그 이전 구간은 실제 발행 이력으로 표시
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
        <div className="h-56 flex items-center justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> 이력을 불러오는 중
        </div>
      )}

      {!loading && error && (
        <div className="h-32 flex items-center justify-center text-sm text-gray-500">{error}</div>
      )}

      {/* ===== 패널 1: 지수 ===== */}
      {!loading && !error && rows.length > 1 && (
        <>
          <div className="mt-4 mb-1 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {/* 같은 자로 잰 점이 2개 이상일 때만 변화량을 말한다.
                1개뿐인데 "0.0점"이라고 쓰면 '변화 없음'으로 읽힌다. */}
            {comparableCount >= 2 ? (
              <div className={`flex items-center gap-1.5 font-semibold ${deltaColor}`}>
                <DeltaIcon className="w-4 h-4" strokeWidth={2.25} />
                {delta > 0 ? '+' : ''}{delta.toFixed(1)}점
                <span className="font-normal text-gray-400">
                  ({summary?.baseline_date} → {summary?.last_date})
                </span>
              </div>
            ) : (
              <div className="text-gray-500">
                현재 기준으로 잰 기록이 <b className="text-gray-800">1개</b>뿐이라 아직 변화량을
                {' '}낼 수 없습니다
              </div>
            )}
            {!!summary?.level_delta && comparableCount >= 2 && (
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

          {/* 선이 두 종류라 색만으로 구분하게 두지 않는다 */}
          {hasLegacyInView && (
            <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-4 h-0.5 rounded shrink-0" style={{ background: LINE }} />
                현재 채점 기준
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: NEUTRAL }} />
                이전 기준 (비교 불가)
              </span>
            </div>
          )}

          <div className="h-56 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 16, right: 28, bottom: 4, left: 0 }} className="gi3d">
                <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                <XAxis {...axisProps} />
                <YAxis
                  domain={yDomain}
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip content={<IndexTooltip />} cursor={{ stroke: '#c9d1d9', strokeWidth: 1 }} />
                {rulerChangeDates.map((d) => (
                  <ReferenceLine
                    key={d}
                    x={toTs(d)}
                    stroke={NEUTRAL}
                    strokeDasharray="4 4"
                    label={{ value: '기준 변경', position: 'top', fill: AXIS_TEXT, fontSize: 11 }}
                  />
                ))}
                {/* 이전 채점 기준 점수 — 점으로만 찍는다. 현재 기준 점과 선으로 이으면
                    자가 바뀐 것이 점수가 뛴 것처럼 보인다. */}
                <Line
                  type="monotone"
                  dataKey="score_legacy"
                  stroke={NEUTRAL}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  connectNulls={false}
                  dot={{ r: 4, fill: NEUTRAL, stroke: SURFACE, strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: NEUTRAL, stroke: SURFACE, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="score_current"
                  stroke={LINE}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  connectNulls={false}
                  dot={<EventDot dataLength={rows.length} />}
                  activeDot={{ r: 6, fill: LINE, stroke: SURFACE, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {!loading && !error && rows.length <= 1 && (
        <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-5 text-center">
          <Clock className="w-6 h-6 text-gray-400 mx-auto mb-2 gi3d" strokeWidth={1.75} />
          <div className="font-semibold text-gray-800">
            {rows.length === 1 ? '지수는 오늘이 첫 기록입니다' : '이 기간에 측정한 지수가 없습니다'}
          </div>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
            지수 점수는 <b>측정한 날</b>만 남습니다. 이전에는 기록을 저장하지 않아 과거 점수를
            {' '}되살릴 수 없습니다 — 대신 아래 <b>실제 발행 이력</b>으로 그동안의 활동 변화를
            {' '}볼 수 있습니다.<br />
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

      {/* ===== 패널 2: 발행 활동 (같은 시간축) ===== */}
      <div className="mt-6 border-t border-gray-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <PenLine className="w-4 h-4 text-gray-400 gi3d" strokeWidth={2} />
            발행 활동 {monthly ? '(월별)' : '(일별)'}
          </div>
          {postingSummary && (
            <div className="text-sm text-gray-500">
              최근 90일 <b className="text-gray-800">{postingSummary.recent}건</b>
              {postingSummary.pct !== null && (
                <span className={postingSummary.pct >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {' '}· 직전 90일 대비 {postingSummary.pct > 0 ? '+' : ''}{postingSummary.pct}%
                </span>
              )}
            </div>
          )}
        </div>

        {postingLoading && (
          <div className="h-36 flex items-center justify-center text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> 발행 이력을 모으는 중
          </div>
        )}

        {!postingLoading && !buckets.length && (
          <div className="h-24 flex items-center justify-center text-sm text-gray-400">
            이 기간에 발행한 글이 없습니다
          </div>
        )}

        {!postingLoading && buckets.length > 0 && (
          <div className="h-40 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 8, right: 28, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                <XAxis {...axisProps} />
                <YAxis
                  tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<PostingTooltip monthly={monthly} />}
                  cursor={{ fill: 'rgba(0,100,255,0.05)' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                  {buckets.map((b, i) => (
                    <Cell key={b.ts} fill={i === buckets.length - 1 ? BAR_RECENT : BAR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {posting?.first_post_date && (
          <p className="mt-2 text-xs text-gray-400">
            첫 글 {posting.first_post_date} · 총 {posting.total_posts?.toLocaleString()}건
            {posting.truncated && ' · 오래된 글 일부는 집계에서 제외'}
          </p>
        )}
      </div>

      {/* 언제 등급이 바뀌었나 */}
      {!!data?.events.length && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <div className="text-sm font-semibold text-gray-800 mb-2">등급이 바뀐 날</div>
          <ul className="space-y-2">
            {[...data.events].reverse().slice(0, 6).map((e, i) => {
              const color = e.type === 'level_up' ? UP : e.type === 'level_down' ? DOWN : NEUTRAL
              return (
                <li key={`${e.date}-${i}`} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
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
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 gi3d" strokeWidth={2} />
          <span>
            점선 왼쪽은 이전 채점 기준으로 매긴 점수입니다. 채점 방식이 바뀐 구간을 가로질러
            비교하면 실제 변화가 아닌 <b>기준 변경</b>이 상승·하락처럼 보일 수 있습니다.
          </span>
        </div>
      )}
    </div>
  )
}
