'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, RefreshCw, Database, Activity, AlertCircle, CheckCircle2, XCircle, Clock, Zap, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { adGet, adPost, adDelete } from '@/lib/api'

interface PoolStats {
  total?: number
  by_status?: Record<string, number>
  first_discovered?: string
  last_discovered?: string
}

interface RegStats {
  total?: number
  active?: number
  ad_groups?: number
  campaigns?: number
  first_at?: string
  last_at?: string
}

interface RunRow {
  id: number
  kind: 'collect' | 'register' | string
  status: 'success' | 'partial' | 'failed' | 'no_seed' | 'no_pending' | 'cap_reached' | 'no_account' | 'no_new' | string
  added: number
  registered: number
  failed: number
  skipped: number
  seeds_count: number
  pending_after?: number | null
  error_message?: string | null
  duration_ms?: number | null
  started_at: string
}

interface SeedBreakdown {
  seed: string
  total: number
  pending: number
  registered: number
  skipped_existing: number
  failed: number
  source?: string
}

interface RecentKeyword {
  keyword: string
  seed: string | null
  monthly_total: number
  status: string
  discovered_at: string
}

interface ClickedKeyword {
  keyword_id: string
  keyword: string
  impressions: number
  clicks: number
  cost: number
  ctr: number
  cpc: number
  matches_seed: boolean
}

interface PoolStatsResponse {
  success: boolean
  customer_id?: number
  pool: PoolStats
  registered: RegStats
  account_cap: number
  recent_runs?: RunRow[]
  seed_breakdown?: SeedBreakdown[]
  recent_keywords?: RecentKeyword[]
  now?: string
  message?: string
}

export default function KeywordPoolPage() {
  const { isAuthenticated } = useAuthStore()
  const [stats, setStats] = useState<PoolStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [seedInput, setSeedInput] = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await adGet<PoolStatsResponse>('/api/naver-ad/keyword-pool/stats')
      setStats(data)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '로드 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return
    load()
    loadClickedKeywords()  // 클릭 키워드도 자동 1회 로드
    const t = setInterval(load, 10_000) // 10초마다 자동 갱신 (실시간 모니터링)
    return () => clearInterval(t)
  }, [isAuthenticated])

  // clickedDays 변경 시 자동 재조회
  useEffect(() => {
    if (!isAuthenticated || !clickedShown) return
    loadClickedKeywords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickedDays])

  // 클릭 키워드 검수 state
  const [clickedDays, setClickedDays] = useState(7)
  const [clickedItems, setClickedItems] = useState<ClickedKeyword[]>([])
  const [clickedLoading, setClickedLoading] = useState(false)
  const [clickedSelected, setClickedSelected] = useState<Set<string>>(new Set())
  const [clickedShown, setClickedShown] = useState(false)

  const loadClickedKeywords = async () => {
    setClickedLoading(true)
    setClickedShown(true)
    try {
      const res = await adGet<{ success: boolean; items: ClickedKeyword[] }>(`/api/naver-ad/keyword-pool/clicked-keywords?days=${clickedDays}`)
      setClickedItems(res.items || [])
      setClickedSelected(new Set())
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '조회 실패')
    } finally {
      setClickedLoading(false)
    }
  }

  const handleClickedToggle = (kid: string) => {
    setClickedSelected(prev => {
      const n = new Set(prev)
      if (n.has(kid)) n.delete(kid); else n.add(kid)
      return n
    })
  }

  const handleClickedToggleAll = (checked: boolean) => {
    if (checked) setClickedSelected(new Set(clickedItems.map(i => i.keyword_id)))
    else setClickedSelected(new Set())
  }

  const handleClickedSelectMismatch = () => {
    const ids = clickedItems.filter(i => !i.matches_seed).map(i => i.keyword_id)
    setClickedSelected(new Set(ids))
  }

  const handleClickedBulkDelete = async () => {
    if (clickedSelected.size === 0) {
      toast.error('선택된 키워드 없음')
      return
    }
    if (!confirm(`선택된 ${clickedSelected.size}개 키워드를 네이버에서 삭제(또는 PAUSE)할까요?`)) return
    try {
      const res = await adPost<{ success: boolean; deleted: number; paused: number; failed: number }>(
        '/api/naver-ad/keyword-pool/clicked-keywords/bulk-delete',
        { keyword_ids: Array.from(clickedSelected) }
      )
      toast.success(`삭제 ${res.deleted} / PAUSE ${res.paused} / 실패 ${res.failed}`)
      await loadClickedKeywords()
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '일괄 삭제 실패')
    }
  }

  const handleDeleteKeyword = async (keyword: string) => {
    if (!confirm(`키워드 "${keyword}"를 풀에서 삭제할까요?\n(이미 네이버 광고에 등록된 상태면 영향 없음. pending/이미있음 상태일 때만 풀에서 빠짐)`)) return
    try {
      const res = await adDelete<{ success: boolean; deleted: number }>(`/api/naver-ad/keyword-pool/keywords/${encodeURIComponent(keyword)}`)
      toast.success(`"${keyword}" 풀에서 삭제 (${res.deleted}건)`)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '삭제 실패')
    }
  }

  const handleDeleteSeed = async (seed: string, total: number) => {
    if (!confirm(`시드 "${seed}"와 이 시드로 발굴된 키워드(총 ${total}개)를 풀에서 삭제할까요?\n(이미 네이버 광고에 등록된 키워드는 영향 없음)`)) return
    try {
      const res = await adDelete<{ success: boolean; deleted: number }>(`/api/naver-ad/keyword-pool/seeds/${encodeURIComponent(seed)}`)
      toast.success(`"${seed}" + 자식 ${res.deleted}개 삭제`)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '삭제 실패')
    }
  }

  const handleAddSeeds = async () => {
    const seeds = seedInput
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!seeds.length) {
      toast.error('시드를 입력하세요')
      return
    }
    setAdding(true)
    try {
      const res = await adPost<{ success: boolean; added: number; total_input: number }>(
        '/api/naver-ad/keyword-pool/seeds',
        { seeds }
      )
      toast.success(`${res.added}개 시드 추가 (입력 ${res.total_input}개)`)
      setSeedInput('')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '추가 실패')
    } finally {
      setAdding(false)
    }
  }

  const cap = stats?.account_cap ?? 100_000
  const used = stats?.registered?.active ?? 0
  const pending = stats?.pool?.by_status?.pending ?? 0
  const registered = stats?.pool?.by_status?.registered ?? 0
  const skippedExisting = stats?.pool?.by_status?.skipped_existing ?? 0
  const rejectedByNaver = stats?.pool?.by_status?.rejected_by_naver ?? 0
  const failed = stats?.pool?.by_status?.failed ?? 0
  const usePct = Math.min(100, Math.round((used / cap) * 100))
  const seedBreakdown = stats?.seed_breakdown ?? []
  const recentKeywords = stats?.recent_keywords ?? []
  const runs = stats?.recent_runs ?? []
  const lastRun = runs[0]
  const lastCollect = runs.find((r) => r.kind === 'collect')
  const lastRegister = runs.find((r) => r.kind === 'register')
  const lastError = runs.find((r) => r.status === 'failed' || (r.error_message && !['no_seed','no_pending','cap_reached','no_new','success','partial'].includes(r.status)))

  // "지금 막 돌았는가" — 최근 90초 이내
  const nowMs = Date.now()
  const isFresh = (iso?: string) => {
    if (!iso) return false
    const t = new Date(iso.replace(' ', 'T') + 'Z').getTime()
    return nowMs - t < 90_000
  }
  const liveCollect = isFresh(lastCollect?.started_at)
  const liveRegister = isFresh(lastRegister?.started_at)

  // 다음 cron 예상 시각 — 매 5분 (:00, :05, :10, ...)
  const nowDate = new Date()
  const nextTickMin = Math.ceil((nowDate.getMinutes() + 1) / 5) * 5
  const nextTick = new Date(nowDate)
  if (nextTickMin >= 60) {
    nextTick.setHours(nextTick.getHours() + 1)
    nextTick.setMinutes(0)
  } else {
    nextTick.setMinutes(nextTickMin)
  }
  nextTick.setSeconds(0)
  const minsToNext = Math.max(0, Math.round((nextTick.getTime() - nowDate.getTime()) / 60000))

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white pt-24 pb-12">
      <div className="max-w-5xl mx-auto px-4">
        <Link
          href="/ad-optimizer"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          광고 최적화
        </Link>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">키워드 풀 (24h 자동)</h1>
            <p className="text-gray-600 mt-1">
              씨드 → 자동 수집 → 자동 등록. 계정당 10만개 한도 자동 가드.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {/* 한도 사용량 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-5 h-5 text-[#0064FF]" />
            <h2 className="font-bold text-gray-900">계정 한도 사용량</h2>
          </div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-3xl font-bold text-gray-900">{used.toLocaleString()}</span>
            <span className="text-sm text-gray-500">/ {cap.toLocaleString()} ({usePct}%)</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                usePct >= 90 ? 'bg-red-500' : usePct >= 70 ? 'bg-yellow-500' : 'bg-[#0064FF]'
              }`}
              style={{ width: `${usePct}%` }}
            />
          </div>
          {usePct >= 90 && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              계정 한도 90% 초과 — 자동 수집 중단됨. 기존 키워드 정리 또는 다른 계정 사용 필요.
            </div>
          )}
        </div>

        {/* 풀 status */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard label="대기 (pending)" value={pending} color="text-yellow-600" />
          <StatCard label="신규 등록" value={registered} color="text-green-600" hint="이번 풀이 새로 등록한 것" />
          <StatCard label="이미 있음" value={skippedExisting} color="text-gray-500" hint="네이버에 이미 등록돼서 skip" />
          <StatCard label="노출제한 삭제" value={rejectedByNaver} color="text-orange-600" hint="네이버 검토 거부 → 자동 삭제" />
          <StatCard label="실패" value={failed} color="text-red-600" />
        </div>

        {/* 라이브 상태 — 지금 도는지/멈췄는지 한눈에 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Zap className="w-5 h-5 text-[#0064FF]" />
                {(liveCollect || liveRegister) && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
              <h2 className="font-bold text-gray-900">자동화 라이브 상태</h2>
            </div>
            <div className="text-xs text-gray-500 inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              다음 실행 예정 ~ {minsToNext}분 후 ({nextTick.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})
            </div>
          </div>

          {!lastRun && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
              아직 실행 이력이 없습니다. 매 15분 cron tick에 자동 실행됩니다 — 시드를 추가하면 첫 실행에서 키워드를 발굴합니다.
            </div>
          )}

          {lastRun && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RunSummary kind="collect" run={lastCollect} live={liveCollect} />
              <RunSummary kind="register" run={lastRegister} live={liveRegister} />
            </div>
          )}

          {lastError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>최근 에러 ({fmtTime(lastError.started_at)})</strong>
                <div className="mt-1 font-mono text-[11px] break-all">{lastError.error_message || lastError.status}</div>
              </div>
            </div>
          )}
        </div>

        {/* 시드별 풀 분포 — 어떤 시드에서 몇 개 발굴됐는지 */}
        {seedBreakdown.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Database className="w-5 h-5 text-[#0064FF]" />
              <h2 className="font-bold text-gray-900">시드별 발굴 키워드</h2>
              <span className="text-xs text-gray-500">매 5분 cron이 검색량 상위·등록완료 키워드 30개를 자동 시드로 승격합니다 (cap 200, 도메인 검증). 부적절하면 휴지통.</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500">
                    <th className="text-left py-2 px-2">시드</th>
                    <th className="text-right py-2 px-2">합계</th>
                    <th className="text-right py-2 px-2">대기</th>
                    <th className="text-right py-2 px-2">신규등록</th>
                    <th className="text-right py-2 px-2">이미있음</th>
                    <th className="text-right py-2 px-2">실패</th>
                    <th className="text-right py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {seedBreakdown.map((s) => {
                    const childless = s.total <= 1
                    const isAuto = s.source === 'auto_promoted_seed'
                    const isUser = s.source === 'user_seed'
                    return (
                      <tr key={s.seed} className={`border-b border-gray-100 hover:bg-gray-50 ${childless ? 'opacity-60' : ''}`}>
                        <td className="py-2 px-2 font-medium text-gray-900">
                          {s.seed}
                          {isUser && <span className="ml-2 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">내 시드</span>}
                          {isAuto && <span className="ml-2 text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">자동 승격</span>}
                          {childless && <span className="ml-2 text-[10px] text-gray-400 font-normal">(자식 0)</span>}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{s.total.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-yellow-600 font-mono">{s.pending.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-green-600 font-mono">{s.registered.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-gray-500 font-mono">{s.skipped_existing.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-red-600 font-mono">{s.failed.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right">
                          <button
                            onClick={() => handleDeleteSeed(s.seed, s.total)}
                            className="text-gray-400 hover:text-red-600 p-1"
                            title="시드 + 자식 키워드 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 클릭 키워드 검수 — 일괄 삭제 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Activity className="w-5 h-5 text-[#0064FF]" />
            <h2 className="font-bold text-gray-900">클릭 발생 키워드 검수</h2>
            <span className="text-xs text-gray-500">사업 무관 키워드(시드 매칭 X) 발견 시 일괄 삭제</span>
            <div className="ml-auto flex items-center gap-2">
              <select
                value={clickedDays}
                onChange={(e) => setClickedDays(parseInt(e.target.value))}
                className="text-xs border border-gray-300 rounded px-2 py-1"
              >
                <option value="1">최근 1일</option>
                <option value="7">최근 7일</option>
                <option value="14">최근 14일</option>
                <option value="30">최근 30일</option>
              </select>
              <button
                onClick={loadClickedKeywords}
                disabled={clickedLoading}
                className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 inline-flex items-center gap-1"
              >
                {clickedLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                조회
              </button>
            </div>
          </div>

          {clickedShown && !clickedLoading && clickedItems.length === 0 && (
            <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded">
              최근 {clickedDays}일 내 클릭 발생 키워드 없음.
            </div>
          )}

          {clickedItems.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs text-gray-600">
                  총 {clickedItems.length}개 / 시드 무관 {clickedItems.filter(i => !i.matches_seed).length}개
                </span>
                <button
                  onClick={handleClickedSelectMismatch}
                  className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                >
                  시드 무관만 선택
                </button>
                <button
                  onClick={() => handleClickedToggleAll(clickedSelected.size !== clickedItems.length)}
                  className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  {clickedSelected.size === clickedItems.length ? '전체 해제' : '전체 선택'}
                </button>
                <button
                  onClick={handleClickedBulkDelete}
                  disabled={clickedSelected.size === 0}
                  className="ml-auto text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  선택 {clickedSelected.size}개 일괄 삭제
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="text-left py-2 px-2 w-8"></th>
                      <th className="text-left py-2 px-2">키워드</th>
                      <th className="text-left py-2 px-2">시드 매칭</th>
                      <th className="text-right py-2 px-2">노출</th>
                      <th className="text-right py-2 px-2">클릭</th>
                      <th className="text-right py-2 px-2">CTR</th>
                      <th className="text-right py-2 px-2">비용(원)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clickedItems.map((it) => (
                      <tr
                        key={it.keyword_id}
                        className={`border-b border-gray-100 hover:bg-gray-50 ${!it.matches_seed ? 'bg-orange-50/30' : ''}`}
                      >
                        <td className="py-2 px-2">
                          <input
                            type="checkbox"
                            checked={clickedSelected.has(it.keyword_id)}
                            onChange={() => handleClickedToggle(it.keyword_id)}
                          />
                        </td>
                        <td className="py-2 px-2 font-medium">{it.keyword}</td>
                        <td className="py-2 px-2">
                          {it.matches_seed ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700">매칭</span>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">무관</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{it.impressions.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono font-medium">{it.clicks.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{(it.ctr * 100).toFixed(2)}%</td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{it.cost.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* 최근 풀 키워드 샘플 — 어떤 키워드가 들어갔는지 직접 검수 */}
        {recentKeywords.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-[#0064FF]" />
              <h2 className="font-bold text-gray-900">최근 풀에 추가된 키워드 (최신 30개)</h2>
              <span className="text-xs text-gray-500">상태: 대기=곧 등록, 신규=등록완료, 이미있음=skip(영향없음), 실패=등록거부 · 부적절하면 X로 빼세요</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500">
                    <th className="text-left py-2 px-2">키워드</th>
                    <th className="text-left py-2 px-2">시드 (origin)</th>
                    <th className="text-right py-2 px-2">월 검색량</th>
                    <th className="text-left py-2 px-2">상태</th>
                    <th className="text-left py-2 px-2">시각</th>
                    <th className="text-right py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {recentKeywords.map((k, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-2 font-medium text-gray-900">{k.keyword}</td>
                      <td className="py-2 px-2 text-xs text-gray-500">{k.seed || '-'}</td>
                      <td className="py-2 px-2 text-right font-mono text-xs">{k.monthly_total.toLocaleString()}</td>
                      <td className="py-2 px-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded ${
                          k.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                          k.status === 'registered' ? 'bg-green-50 text-green-700' :
                          k.status === 'skipped_existing' ? 'bg-gray-50 text-gray-600' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {k.status === 'pending' ? '대기' :
                           k.status === 'registered' ? '신규' :
                           k.status === 'skipped_existing' ? '이미있음' : '실패'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-500 font-mono">{fmtTime(k.discovered_at)}</td>
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => handleDeleteKeyword(k.keyword)}
                          className="text-gray-400 hover:text-red-600 p-1"
                          title="이 키워드만 풀에서 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 실행 이력 — 최근 20건 */}
        {runs.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-[#0064FF]" />
              <h2 className="font-bold text-gray-900">최근 실행 이력</h2>
              <span className="text-xs text-gray-500">10초마다 자동 갱신</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs text-gray-500">
                    <th className="text-left py-2 px-2">시각</th>
                    <th className="text-left py-2 px-2">종류</th>
                    <th className="text-left py-2 px-2">결과</th>
                    <th className="text-right py-2 px-2">수집/등록/실패</th>
                    <th className="text-right py-2 px-2">소요</th>
                    <th className="text-left py-2 px-2">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-2 text-xs text-gray-600 font-mono">{fmtTime(r.started_at)}</td>
                      <td className="py-2 px-2">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          r.kind === 'collect' ? 'bg-blue-50 text-blue-700' :
                          r.kind === 'register' ? 'bg-purple-50 text-purple-700' :
                          r.kind === 'inspect' ? 'bg-orange-50 text-orange-700' :
                          'bg-gray-50 text-gray-700'
                        }`}>
                          {r.kind === 'collect' ? '수집' :
                           r.kind === 'register' ? '등록' :
                           r.kind === 'inspect' ? '검사' : r.kind}
                        </span>
                      </td>
                      <td className="py-2 px-2"><StatusBadge status={r.status} /></td>
                      <td className="py-2 px-2 text-right text-xs font-mono">
                        {r.kind === 'collect'
                          ? `+${r.added}${r.skipped > 0 ? ` (reject ${r.skipped})` : ''}`
                          : r.kind === 'inspect'
                          ? `노출제한 삭제 ${r.skipped}`
                          : `신규 ${r.registered} · 이미있음 ${r.skipped} · 실패 ${r.failed}`}
                      </td>
                      <td className="py-2 px-2 text-right text-xs text-gray-500">
                        {r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)}s` : '-'}
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-600 max-w-xs truncate" title={r.error_message || ''}>
                        {r.error_message || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 시드 추가 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-5 h-5 text-[#0064FF]" />
            <h2 className="font-bold text-gray-900">초기 시드 추가</h2>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            자동 수집의 출발 키워드. 한 줄에 하나 또는 콤마 구분. cron이 매 15분마다
            이 시드의 연관 키워드를 발굴해 풀에 채웁니다.
          </p>
          <textarea
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            rows={5}
            placeholder={'대출\n신용대출\n사업자대출'}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm font-mono focus:ring-2 focus:ring-[#0064FF] focus:border-transparent outline-none"
            disabled={adding}
          />
          <button
            onClick={handleAddSeeds}
            disabled={adding || !seedInput.trim()}
            className="mt-3 px-4 py-2 bg-[#0064FF] text-white rounded-lg font-medium hover:shadow-lg disabled:bg-gray-300 inline-flex items-center gap-2"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            시드 추가
          </button>
        </div>

        {/* 안내 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
          <div className="flex items-start gap-2">
            <Activity className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>자동 운영 흐름</strong>
              <ul className="mt-1 text-xs space-y-0.5 list-disc pl-5">
                <li>매 5분 — 시드 자동 승격 30개 + 풀에 새 키워드 자동 추가 (도메인 토큰 검증)</li>
                <li>매 5분 — pending 3,000개를 네이버에 자동 등록 (광고그룹 자동 생성)</li>
                <li>중복 키워드는 절대 재등록 안 됨 (DB UNIQUE 보장)</li>
                <li>도메인 무관 키워드는 자동 cleanup — 시드 substring 통과해도 도메인 토큰 없으면 reject</li>
                <li>10만개 한도 도달 시 수집/등록 자동 정지</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, hint }: { label: string; value: number; color: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-1">{hint}</div>}
    </div>
  )
}

function fmtTime(iso?: string): string {
  if (!iso) return '-'
  // SQLite는 'YYYY-MM-DD HH:MM:SS' (UTC)로 저장
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return iso
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000)
  if (diffSec < 60) return `${diffSec}초 전`
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}분 전`
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}시간 전`
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    success: { label: '성공', cls: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
    partial: { label: '부분성공', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: AlertCircle },
    failed: { label: '실패', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
    no_seed: { label: '시드 없음', cls: 'bg-gray-50 text-gray-600 border-gray-200', icon: AlertCircle },
    no_pending: { label: '대상 없음', cls: 'bg-gray-50 text-gray-600 border-gray-200', icon: AlertCircle },
    no_new: { label: '신규 0', cls: 'bg-gray-50 text-gray-600 border-gray-200', icon: AlertCircle },
    cap_reached: { label: '한도 도달', cls: 'bg-orange-50 text-orange-700 border-orange-200', icon: AlertCircle },
    no_account: { label: '계정 미연결', cls: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  }
  const m = map[status] || { label: status, cls: 'bg-gray-50 text-gray-600 border-gray-200', icon: AlertCircle }
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${m.cls}`}>
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  )
}

function RunSummary({ kind, run, live }: { kind: 'collect' | 'register'; run?: RunRow; live: boolean }) {
  const label = kind === 'collect' ? '수집 (keywordstool)' : '등록 (네이버 광고)'
  if (!run) {
    return (
      <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
        <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
        <div className="text-sm text-gray-500">아직 실행 안 됨</div>
      </div>
    )
  }
  const isOk = run.status === 'success' || run.status === 'partial'
  const main = kind === 'collect'
    ? `새 키워드 +${run.added}개`
    : `신규 ${run.registered} / 이미있음 ${run.skipped} / 실패 ${run.failed}`
  return (
    <div className={`p-3 border rounded-lg ${isOk ? 'border-green-200 bg-green-50/50' : 'border-orange-200 bg-orange-50/40'}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium text-gray-700 inline-flex items-center gap-1.5">
          {label}
          {live && (
            <span className="inline-flex items-center gap-1 text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <StatusBadge status={run.status} />
      </div>
      <div className="text-base font-bold text-gray-900">{main}</div>
      <div className="text-[11px] text-gray-500 mt-1">
        {fmtTime(run.started_at)}
        {run.duration_ms != null && <> · {(run.duration_ms / 1000).toFixed(1)}초</>}
        {kind === 'collect' && run.seeds_count > 0 && <> · 시드 {run.seeds_count}개 처리</>}
        {kind === 'collect' && run.skipped > 0 && <> · 시드와 무관해서 reject {run.skipped}개</>}
      </div>
      {run.error_message && (
        <div className="text-[11px] text-orange-700 mt-1 font-mono break-all">{run.error_message}</div>
      )}
    </div>
  )
}
