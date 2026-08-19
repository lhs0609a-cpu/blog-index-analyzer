'use client'

import { useEffect, useState } from 'react'
import { getApiUrl } from '@/lib/api/apiConfig'

/**
 * 관리자용 사이트 방문 통계.
 *
 * 유입 경로(referrer)를 크게 보여주는 게 핵심이다 — SEO 작업이 실제로
 * 구글·네이버 유입을 만들고 있는지 확인할 수 있는 유일한 지표라서.
 */

type Daily = { day: string; pv: number; uv: number }
type Row = { path?: string; host?: string; pv: number; uv: number }
type Summary = {
  today: { pv: number; uv: number }
  last_7d: { pv: number; uv: number }
  last_30d: { pv: number; uv: number }
  daily: Daily[]
  top_paths: Row[]
  top_referrers: Row[]
  bot_pageviews: number
  generated_at: string
}

/** 검색엔진 유입인지 한눈에 보이게 */
function sourceLabel(host: string): { label: string; tone: string } {
  const h = (host || '').toLowerCase()
  if (h.includes('google')) return { label: '구글 검색', tone: 'bg-blue-100 text-blue-700' }
  if (h.includes('naver')) return { label: '네이버 검색', tone: 'bg-green-100 text-green-700' }
  if (h.includes('daum') || h.includes('kakao'))
    return { label: '다음/카카오', tone: 'bg-yellow-100 text-yellow-700' }
  if (h.includes('bing')) return { label: 'Bing', tone: 'bg-cyan-100 text-cyan-700' }
  if (h.startsWith('(')) return { label: '직접 유입', tone: 'bg-gray-100 text-gray-600' }
  return { label: '기타', tone: 'bg-gray-100 text-gray-600' }
}

function Stat({ label, pv, uv }: { label: string; pv: number; uv: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-900">{uv.toLocaleString()}</div>
      <div className="text-xs text-gray-500 mt-1">방문자 · 페이지뷰 {pv.toLocaleString()}</div>
    </div>
  )
}

export default function SiteAnalyticsPanel() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    fetch(`${getApiUrl()}/api/analytics/summary?days=${days}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((e) => {
        if (alive) setError(String(e?.message || e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [days])

  if (loading) return <div className="text-gray-500 py-10 text-center">불러오는 중…</div>
  if (error)
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">
        통계를 불러오지 못했습니다: {error}
      </div>
    )
  if (!data) return null

  const maxPv = Math.max(1, ...data.daily.map((d) => d.pv))
  const hasData = data.last_30d.pv > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">사이트 방문 통계</h2>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        >
          <option value={7}>최근 7일</option>
          <option value={30}>최근 30일</option>
          <option value={90}>최근 90일</option>
        </select>
      </div>

      {!hasData && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          아직 수집된 방문 기록이 없습니다. 방금 기능을 켰다면 사람이 페이지를 열어야 쌓이기
          시작합니다 — 크롤러는 JS 를 실행하지 않아 집계에 잡히지 않습니다.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="오늘" pv={data.today.pv} uv={data.today.uv} />
        <Stat label="최근 7일" pv={data.last_7d.pv} uv={data.last_7d.uv} />
        <Stat label="최근 30일" pv={data.last_30d.pv} uv={data.last_30d.uv} />
      </div>

      {/* 일별 추이 — 외부 차트 라이브러리 없이 막대로 (번들 증가 없음) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">일별 추이</h3>
        <div className="flex items-end gap-[2px] h-40">
          {data.daily.map((d) => (
            <div key={d.day} className="flex-1 group relative flex flex-col justify-end h-full">
              <div
                className="w-full bg-[#0064FF]/70 hover:bg-[#0064FF] rounded-t transition-colors"
                style={{
                  height: `${(d.pv / maxPv) * 100}%`,
                  minHeight: d.pv > 0 ? '2px' : '0',
                }}
              />
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1 z-10">
                {d.day} · 방문 {d.uv} · PV {d.pv}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>{data.daily[0]?.day}</span>
          <span>{data.daily[data.daily.length - 1]?.day}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 유입 경로 — SEO 성과 확인용 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-1">유입 경로</h3>
          <p className="text-xs text-gray-500 mb-4">검색엔진에서 실제로 들어오는지 확인</p>
          {data.top_referrers.length === 0 ? (
            <p className="text-sm text-gray-400">기록 없음</p>
          ) : (
            <ul className="space-y-2">
              {data.top_referrers.slice(0, 10).map((r) => {
                const s = sourceLabel(r.host || '')
                return (
                  <li key={r.host} className="flex items-center justify-between text-sm gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 rounded text-xs shrink-0 ${s.tone}`}>
                        {s.label}
                      </span>
                      <span className="text-gray-700 truncate">{r.host}</span>
                    </span>
                    <span className="text-gray-500 shrink-0">
                      {r.uv.toLocaleString()}명 / {r.pv.toLocaleString()}PV
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* 인기 페이지 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-1">인기 페이지</h3>
          <p className="text-xs text-gray-500 mb-4">어떤 페이지가 실제로 읽히는지</p>
          {data.top_paths.length === 0 ? (
            <p className="text-sm text-gray-400">기록 없음</p>
          ) : (
            <ul className="space-y-2">
              {data.top_paths.slice(0, 10).map((p) => (
                <li key={p.path} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-gray-700 truncate">{p.path}</span>
                  <span className="text-gray-500 shrink-0">
                    {p.uv.toLocaleString()}명 / {p.pv.toLocaleString()}PV
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">
        봇 페이지뷰 {data.bot_pageviews.toLocaleString()}건은 위 수치에서 제외했습니다. 방문자는
        날짜별 해시로 세므로 개인을 추적하지 않으며 원본 IP 는 저장하지 않습니다. · 갱신{' '}
        {new Date(data.generated_at).toLocaleString('ko-KR')}
      </p>
    </div>
  )
}
