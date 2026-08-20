'use client'

/**
 * 광고비 관제탑 — 조용히 멈춘 광고를 그날 잡는다.
 *
 * 이 자리에는 통합 대시보드가 있었고, 거기서 이어지는 7개 도구
 * (시간대별입찰·크리에이티브피로도·네이버품질지수·예산재분배·예산페이싱·
 * 퍼널입찰·이상징후감지)가 전부 빈 테이블을 읽거나 가짜 캠페인을 생성해
 * 보여주고 있었다. 2026-08-20 에 전부 삭제하고 이 화면으로 대체한다.
 *
 * 여기 나오는 숫자는 전부 매일 04:00 KST 크론이 실제 계정에서 수집한 것이다.
 *
 * 표시 원칙:
 *  · 정상이면 조용하다. 매일 "이상 없음" 을 크게 띄우면 곧 안 읽는다.
 *  · 못 본 것을 정상이라 하지 않는다. 기준선이 모자라면 그렇게 말한다.
 *  · 근거를 숫자로 같이 준다.
 */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { adGet } from '@/lib/api'

interface AdAccount {
  customer_id: string
  name?: string | null
  is_connected: boolean
}

interface Incident {
  code: string
  severity: 'critical' | 'warning'
  title: string
  detail: string
  action?: string | null
  impact_krw?: number | null
}

interface Scan {
  customer_id: string
  evaluated_date: string
  incidents: Incident[]
  critical: number
  warning: number
  all_clear: boolean
  note?: string
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const TOOLS = [
  { href: '/ad-optimizer/keyword-pool', label: '키워드 풀 관리', desc: '발굴 · 등록 · 정리' },
  { href: '/ad-optimizer/volume-filter', label: '검색량 필터링', desc: '볼륨 검증 후 등록' },
  { href: '/ad-optimizer/scale-upload', label: '대량 등록', desc: '10만 규모' },
  { href: '/ad-optimizer/keyword-upload', label: '엑셀/CSV 등록', desc: '최대 500개' },
  { href: '/ad-optimizer/ad-templates', label: '소재 관리', desc: '광고그룹 일괄 부착' },
  { href: '/ad-optimizer/setup-guide', label: 'API 연동 가이드', desc: '라이선스 발급' },
]

function won(n?: number | null) {
  if (n === null || n === undefined) return null
  return Math.round(n).toLocaleString() + '원'
}

export default function ControlTowerPage() {
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [scans, setScans] = useState<Record<string, Scan | { error: string }>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setScans({})
    try {
      const data = await adGet<{ success: boolean; accounts: AdAccount[] }>(
        '/api/naver-ad/keyword-pool/accounts',
        { showToast: false }
      )
      const list = (data.accounts || []).filter((a) => a.is_connected)
      setAccounts(list)

      // 계정별로 따로 부른다 — 한 계정이 실패해도 나머지는 보여야 한다.
      await Promise.all(
        list.map(async (a) => {
          try {
            const r = await fetch(
              `${API}/api/ad-snapshot/incidents?customer_id=${encodeURIComponent(a.customer_id)}`
            )
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            const s: Scan = await r.json()
            setScans((prev) => ({ ...prev, [a.customer_id]: s }))
          } catch {
            setScans((prev) => ({
              ...prev,
              [a.customer_id]: { error: '진단을 불러오지 못했습니다' },
            }))
          }
        })
      )
    } catch {
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const sum = (k: 'critical' | 'warning') =>
    Object.values(scans).reduce((n, s) => n + (k in s ? (s as Scan)[k] : 0), 0)
  const totalCritical = sum('critical')
  const totalWarning = sum('warning')

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">광고비 관제탑</h1>
            <p className="text-sm text-gray-500 mt-1">
              조용히 멈춘 광고를 그날 잡습니다. 매일 새벽 4시에 전 계정을 수집합니다.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="shrink-0 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? '확인 중…' : '새로고침'}
          </button>
        </div>

        {!loading && accounts.length === 0 && (
          <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center">
            <p className="text-gray-900 font-medium">연결된 광고 계정이 없습니다</p>
            <p className="text-sm text-gray-500 mt-1">
              네이버 검색광고 API 키를 연동하면 다음 날 새벽부터 감시가 시작됩니다.
            </p>
            <Link
              href="/ad-optimizer/setup-guide"
              className="inline-block mt-4 text-sm font-medium text-[#0064FF] hover:underline"
            >
              연동 방법 보기 ›
            </Link>
          </div>
        )}

        {accounts.length > 0 && (
          <div className="flex gap-3 mb-6">
            <div className="flex-1 rounded-xl bg-white border border-gray-100 px-4 py-3">
              <div className="text-xs text-gray-500">감시 중인 계정</div>
              <div className="text-xl font-bold text-gray-900">{accounts.length}</div>
            </div>
            <div className="flex-1 rounded-xl bg-white border border-gray-100 px-4 py-3">
              <div className="text-xs text-gray-500">긴급</div>
              <div className={`text-xl font-bold ${totalCritical ? 'text-red-600' : 'text-gray-400'}`}>
                {totalCritical}
              </div>
            </div>
            <div className="flex-1 rounded-xl bg-white border border-gray-100 px-4 py-3">
              <div className="text-xs text-gray-500">주의</div>
              <div className={`text-xl font-bold ${totalWarning ? 'text-amber-600' : 'text-gray-400'}`}>
                {totalWarning}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {accounts.map((a) => {
            const s = scans[a.customer_id]
            return (
              <div key={a.customer_id} className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{a.name || a.customer_id}</div>
                    {s && 'evaluated_date' in s && (
                      <div className="text-xs text-gray-400">기준일 {s.evaluated_date}</div>
                    )}
                  </div>
                  {!s ? (
                    <span className="text-xs text-gray-400">확인 중…</span>
                  ) : 'error' in s ? (
                    <span className="text-xs text-gray-500">{s.error}</span>
                  ) : s.incidents.length === 0 && s.all_clear ? (
                    <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      이상 없음
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      긴급 {s.critical} · 주의 {s.warning}
                    </span>
                  )}
                </div>

                {s && 'incidents' in s && (
                  <div className="px-5 py-2">
                    {/* 기준선이 모자라면 '이상 없음' 이 아니라 '아직 못 본다' 다. */}
                    {s.incidents.length === 0 && !s.all_clear && (
                      <p className="text-xs text-gray-500 py-2">
                        {s.note || '아직 판단할 기록이 부족합니다. 며칠 더 쌓이면 비교할 수 있습니다.'}
                      </p>
                    )}
                    {s.incidents.map((inc, i) => (
                      <div key={`${inc.code}-${i}`} className="py-3 border-t border-gray-50 first:border-t-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[11px] px-1.5 py-0.5 rounded border ${
                              inc.severity === 'critical'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {inc.severity === 'critical' ? '긴급' : '주의'}
                          </span>
                          <span className="text-sm font-medium text-gray-900">{inc.title}</span>
                          {inc.impact_krw ? (
                            <span className="text-xs text-gray-500">영향 {won(inc.impact_krw)}</span>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{inc.detail}</p>
                        {inc.action && <p className="text-xs text-[#0064FF] mt-1">→ {inc.action}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-8 rounded-2xl bg-white border border-gray-100 p-5">
          <div className="text-sm font-semibold text-gray-900 mb-3">키워드 도구</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {TOOLS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">{t.label}</div>
                  <div className="text-xs text-gray-500">{t.desc}</div>
                </div>
                <span className="text-gray-300">›</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
