'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, RefreshCw, Database, Activity, AlertCircle, CheckCircle2, XCircle, Clock, Zap, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { adGet, adPost, adDelete, adPatch } from '@/lib/api'

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
  relevance_score?: number  // 0-100, 백엔드 _compute_relevance_score
}

interface CollectDeadlock {
  is_deadlock: boolean
  consecutive_zero_runs: number
  total_rejected: number
  last_run_at?: string | null
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
  collect_deadlock?: CollectDeadlock
  now?: string
  message?: string
}

interface AdAccount {
  customer_id: string
  name?: string | null
  is_connected: boolean
  last_sync_at?: string | null
  default_bid?: number
}

// 활성 광고주 LS 키 — 메인 /ad-optimizer 페이지(ACTIVE_CID_KEY)와 동일.
// 두 페이지가 같은 활성 계정을 공유해서 어느 한쪽에서 전환하면 다른 쪽도 따라감.
const SELECTED_CID_KEY = 'blank.ad.activeCustomerId'

export default function KeywordPoolPage() {
  const { isAuthenticated } = useAuthStore()
  const [stats, setStats] = useState<PoolStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [seedInput, setSeedInput] = useState('')
  const [adding, setAdding] = useState(false)

  // hydration safe — Date.now()/new Date() 가 SSR 과 client 에서 다르면 React #422 발생.
  // mounted=true 후에만 time-dependent UI 렌더.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // 다중 광고주 — useEffect 보다 앞에 정의 (TDZ 회피)
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const [selectedCid, setSelectedCid] = useState<string>('')

  // 입찰가 일괄 변경 state
  const [bidInput, setBidInput] = useState<string>('70')
  const [bidApplying, setBidApplying] = useState(false)

  // 클릭 키워드 검수 state — useEffect dependency보다 앞에 정의 (TDZ 회피)
  const [clickedDays, setClickedDays] = useState(7)
  const [clickedItems, setClickedItems] = useState<ClickedKeyword[]>([])
  const [clickedLoading, setClickedLoading] = useState(false)
  const [clickedSelected, setClickedSelected] = useState<Set<string>>(new Set())
  const [clickedShown, setClickedShown] = useState(true)  // 항상 표시 — 사용자가 불필요 키워드 즉시 발견
  const [clickedFilterMismatch, setClickedFilterMismatch] = useState(true)  // 무관만 보기 default ON — 사업과 상관없는 KW 즉시 발견
  const [scoreThreshold, setScoreThreshold] = useState(30)  // N점 이하 일괄 선택용

  // 자동 cleanup 설정 — cron 이 매시 1회 점수 ≤ threshold 인 클릭 KW 자동 삭제
  const [autoCleanup, setAutoCleanup] = useState<{
    enabled: boolean
    threshold: number
    last_run_at: string | null
    last_deleted: number
    relevance_keywords: string[]
  }>({ enabled: false, threshold: 30, last_run_at: null, last_deleted: 0, relevance_keywords: [] })
  const [autoCleanupSaving, setAutoCleanupSaving] = useState(false)
  const [relevanceInput, setRelevanceInput] = useState('')  // textarea raw 입력

  // 등록 KW 전체 점수 audit + 일괄 정리 (click 무관) — cascade drift 옛날 무관 KW 정리용
  const [manualCleanupRunning, setManualCleanupRunning] = useState(false)
  const [manualCleanupThreshold, setManualCleanupThreshold] = useState(30)
  const [manualTargets, setManualTargets] = useState<{ keyword_id: string; keyword: string; score: number }[]>([])
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set())
  const [manualMeta, setManualMeta] = useState<{
    total_registered: number
    targets_below_threshold: number
    displayed: number
    score_distribution: Record<string, number>
  } | null>(null)
  const [manualDeleting, setManualDeleting] = useState(false)

  // customer_id 쿼리 — selected 가 비어있으면 백엔드 default(가장 최근).
  const cidQs = (extra: Record<string, string | number | undefined> = {}) => {
    const params: Record<string, string> = {}
    if (selectedCid) params.customer_id = selectedCid
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null && v !== '') params[k] = String(v)
    }
    const entries = Object.entries(params)
    return entries.length ? '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : ''
  }

  const loadAccounts = async () => {
    try {
      const data = await adGet<{ success: boolean; accounts: AdAccount[] }>('/api/naver-ad/keyword-pool/accounts')
      const list = data.accounts || []
      setAccounts(list)
      // localStorage 에 저장된 선택 복원, 없으면 첫 광고주
      let pickedCid = ''
      if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem(SELECTED_CID_KEY) || ''
        const valid = saved && list.some(a => a.customer_id === saved)
        if (valid) {
          pickedCid = saved
        } else if (list.length > 0) {
          pickedCid = list[0].customer_id
          window.localStorage.setItem(SELECTED_CID_KEY, pickedCid)
        }
        if (pickedCid) setSelectedCid(pickedCid)
        // bidInput 도 선택 광고주의 default_bid 로 동기화
        const acct = list.find(a => a.customer_id === pickedCid)
        if (acct?.default_bid != null) setBidInput(String(acct.default_bid))
      }
    } catch (e: any) {
      // accounts 조회 실패해도 default 동작 유지
      console.warn('[keyword-pool] loadAccounts 실패', e)
    }
  }

  const handleSelectAccount = (cid: string) => {
    setSelectedCid(cid)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SELECTED_CID_KEY, cid)
    }
    // 즉시 새 광고주의 데이터로 갱신 — 모든 광고주별 state reset (다른 광고주의 keyword_id
    // 가 잘못 유지되어 일괄 삭제 시 엉뚱한 광고주 KW 가 사라지는 사고 방지).
    setStats(null)
    setClickedItems([])
    setClickedSelected(new Set())
    setManualTargets([])
    setManualSelected(new Set())
    setManualMeta(null)
    // 새 광고주의 default_bid 입력란에 반영
    const acct = accounts.find(a => a.customer_id === cid)
    if (acct?.default_bid != null) setBidInput(String(acct.default_bid))
  }

  const handleBidBulkUpdate = async (scope: 'pool' | 'all') => {
    const bid = parseInt(bidInput, 10)
    if (!bid || bid < 70) {
      toast.error('네이버 최소 입찰가 70원 이상 입력하세요')
      return
    }
    const scopeLabel = scope === 'pool' ? '풀 자동 등록 캠페인 (auto_*)' : '이 광고주의 모든 캠페인'
    if (!confirm(`${scopeLabel} 의 광고그룹 default + 모든 키워드 bidAmt 를 ${bid.toLocaleString()}원 으로 일괄 변경할까요?\n\n(키워드 수에 비례해 5~15분 소요. 광고주 default_bid 도 저장 — 앞으로 자동 등록되는 키워드도 ${bid}원 사용)`)) return
    setBidApplying(true)
    try {
      const res = await adPost<{
        success: boolean
        new_bid: number
        scope: string
        campaigns_scanned: number
        ad_groups_total: number
        ad_groups_updated: number
        ad_groups_failed: number
        keywords_total: number
        keywords_updated: number
        keywords_failed: number
      }>(
        `/api/naver-ad/keyword-pool/bid/bulk-update${cidQs()}`,
        { bid, scope },
        { timeout: 3_600_000 }  // 키워드 50k+ 까지 — 60분 timeout (sem=20 으로 ~16분 예상)
      )
      toast.success(
        `입찰가 ${res.new_bid.toLocaleString()}원 일괄 변경 — 광고그룹 ${res.ad_groups_updated}/${res.ad_groups_total} · 키워드 ${res.keywords_updated.toLocaleString()}/${res.keywords_total.toLocaleString()} 성공`
      )
      // 광고주 default_bid 도 갱신됐으니 accounts 재조회
      loadAccounts()
    } catch (e: any) {
      toast.error(e?.message || '입찰가 변경 실패')
    } finally {
      setBidApplying(false)
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      // seed_breakdown 가 시드 200+ 일 때 느림 — 60s timeout (default 30s 부족).
      const data = await adGet<PoolStatsResponse>(
        `/api/naver-ad/keyword-pool/stats${cidQs()}`,
        { timeout: 60_000, showToast: false }
      )
      setStats(data)
    } catch (e: any) {
      // 폴링 실패는 토스트 안 띄움 (10초마다 다시 시도). 첫 로드는 알림.
      if (!stats) toast.error(e?.message || '로드 실패')
    } finally {
      setLoading(false)
    }
  }

  const loadAutoCleanup = async () => {
    try {
      const res = await adGet<{ success: boolean; enabled: boolean; threshold: number; last_run_at: string | null; last_deleted: number; relevance_keywords?: string[] }>(
        `/api/naver-ad/keyword-pool/auto-cleanup/settings${cidQs()}`,
        { showToast: false, timeout: 10_000 }
      )
      const kws = Array.isArray(res.relevance_keywords) ? res.relevance_keywords : []
      setAutoCleanup({
        enabled: !!res.enabled,
        threshold: Number(res.threshold ?? 30),
        last_run_at: res.last_run_at || null,
        last_deleted: Number(res.last_deleted || 0),
        relevance_keywords: kws,
      })
      setRelevanceInput(kws.join(', '))
    } catch (e) {
      // settings 로드 실패해도 동작 — default state 유지
    }
  }

  const saveAutoCleanup = async (patch: { enabled?: boolean; threshold?: number; relevance_keywords?: string[] }) => {
    setAutoCleanupSaving(true)
    try {
      const res = await adPatch<{ success: boolean; enabled: boolean; threshold: number; last_run_at: string | null; last_deleted: number; relevance_keywords?: string[] }>(
        `/api/naver-ad/keyword-pool/auto-cleanup/settings${cidQs()}`,
        patch
      )
      const kws = Array.isArray(res.relevance_keywords) ? res.relevance_keywords : []
      setAutoCleanup({
        enabled: !!res.enabled,
        threshold: Number(res.threshold ?? 30),
        last_run_at: res.last_run_at || null,
        last_deleted: Number(res.last_deleted || 0),
        relevance_keywords: kws,
      })
      if (patch.relevance_keywords !== undefined) {
        setRelevanceInput(kws.join(', '))
        toast.success(`연관성 기준 키워드 ${kws.length}개 저장`)
      } else if (patch.enabled !== undefined) {
        toast.success(patch.enabled ? `자동 삭제 ON (점수≤${res.threshold})` : '자동 삭제 OFF')
      } else if (patch.threshold !== undefined) {
        toast.success(`임계값 ${res.threshold}점으로 저장`)
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '자동 cleanup 설정 저장 실패')
    } finally {
      setAutoCleanupSaving(false)
    }
  }

  const handleSaveRelevanceKeywords = async () => {
    const parsed = relevanceInput
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(s => s.length >= 2)
    console.log('[relevance-save] sending', parsed)
    await saveAutoCleanup({ relevance_keywords: parsed })
    // PATCH 응답 신뢰 안 하고 즉시 GET 재검증 — DB 마이그레이션 / 응답 파싱 실패 가드.
    setTimeout(() => loadAutoCleanup(), 300)
  }

  // dry_run audit — 점수 ≤ threshold 등록 KW 전체 리스트를 표로 받아옴 (max 1000개 표시)
  const handleManualAudit = async () => {
    const threshold = manualCleanupThreshold
    setManualCleanupRunning(true)
    const startedAt = Date.now()
    try {
      const res = await adPost<{
        success: boolean
        total_registered: number
        score_distribution: Record<string, number>
        targets_below_threshold: number
        displayed: number
        targets: { keyword_id: string; keyword: string; score: number }[]
      }>(
        `/api/naver-ad/keyword-pool/registered/cleanup-by-score${cidQs()}`,
        { threshold, max_delete: 5000, dry_run: true },
        // retries=0 — 60초 안 응답 즉시 실패 (재시도 무의미, 사용자 다시 클릭 가능).
        // timeout 90초 — backend dry_run + fly.io 콜드 스타트 여유.
        { timeout: 90_000, retries: 0 }
      )
      console.log(`[manual-audit] ${Date.now() - startedAt}ms total_registered=${res.total_registered} below=${res.targets_below_threshold}`)
      setManualTargets(res.targets || [])
      // default 전체 선택 — 사용자가 보고 빼고 싶은 것만 해제
      setManualSelected(new Set((res.targets || []).map(t => t.keyword_id)))
      setManualMeta({
        total_registered: res.total_registered,
        targets_below_threshold: res.targets_below_threshold,
        displayed: res.displayed,
        score_distribution: res.score_distribution || {},
      })
      toast.success(
        `점수 ≤ ${threshold} 등록 KW ${res.targets_below_threshold.toLocaleString()}개 발견 — ${res.displayed.toLocaleString()}개 표시`
      )
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || '점수 audit 실패')
    } finally {
      setManualCleanupRunning(false)
    }
  }

  const handleManualToggle = (kid: string) => {
    setManualSelected(prev => {
      const n = new Set(prev)
      if (n.has(kid)) n.delete(kid); else n.add(kid)
      return n
    })
  }

  const handleManualToggleAll = (checked: boolean) => {
    if (checked) setManualSelected(new Set(manualTargets.map(t => t.keyword_id)))
    else setManualSelected(new Set())
  }

  // 선택된 KW 일괄 삭제 — 기존 /clicked-keywords/bulk-delete 재사용 (click 검증 없음)
  const handleManualBulkDelete = async () => {
    if (manualSelected.size === 0) {
      toast.error('선택된 키워드 없음')
      return
    }
    if (!confirm(`선택된 ${manualSelected.size.toLocaleString()}개 등록 KW를 네이버에서 삭제(또는 PAUSE)할까요?`)) return
    setManualDeleting(true)
    try {
      const res = await adPost<{ success: boolean; deleted: number; paused: number; failed: number }>(
        `/api/naver-ad/keyword-pool/clicked-keywords/bulk-delete${cidQs()}`,
        { keyword_ids: Array.from(manualSelected) },
        // 1000개 × 0.18초 ≈ 3분. 여유 5분, retries=0 (재시도 시 같은 KW 중복 삭제 방지).
        { timeout: 300_000, retries: 0 }
      )
      toast.success(`삭제 ${res.deleted} / PAUSE ${res.paused} / 실패 ${res.failed}`)
      // 표에서 삭제된 것만 제거
      setManualTargets(prev => prev.filter(t => !manualSelected.has(t.keyword_id)))
      setManualSelected(new Set())
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || '일괄 삭제 실패')
    } finally {
      setManualDeleting(false)
    }
  }

  const loadClickedKeywords = async () => {
    setClickedLoading(true)
    try {
      const res = await adGet<{ success: boolean; items: ClickedKeyword[] }>(
        `/api/naver-ad/keyword-pool/clicked-keywords${cidQs({ days: clickedDays })}`,
        { showToast: false, timeout: 30_000 }
      )
      setClickedItems(res.items || [])
      // 사용자가 선택한 키워드는 보존 — 새로 사라진 것만 set 에서 제거
      setClickedSelected(prev => {
        const valid = new Set(res.items?.map(i => i.keyword_id) || [])
        const next = new Set<string>()
        prev.forEach(id => { if (valid.has(id)) next.add(id) })
        return next
      })
    } catch (e: any) {
      // 백그라운드 폴링 실패는 토스트 안 띄움 (60초마다 재시도)
      if (clickedItems.length === 0) toast.error(e?.message || '클릭 키워드 조회 실패')
    } finally {
      setClickedLoading(false)
    }
  }

  // 광고주 목록 1회 로드
  useEffect(() => {
    if (!isAuthenticated) return
    loadAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  // selectedCid 변경 시 stats + clicked 재조회 + 폴링 시작
  useEffect(() => {
    if (!isAuthenticated) return
    load()
    loadClickedKeywords()  // 클릭 키워드 자동 1회 로드
    loadAutoCleanup()      // 자동 cleanup 설정 1회 로드
    const tStats = setInterval(load, 10_000) // stats 10초 폴링
    // 클릭 키워드는 60초마다 자동 갱신 — 사용자가 새로 발생한 클릭 즉시 검수 가능
    const tClicked = setInterval(loadClickedKeywords, 60_000)
    return () => {
      clearInterval(tStats)
      clearInterval(tClicked)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, selectedCid])

  // clickedDays 변경 시 자동 재조회
  useEffect(() => {
    if (!isAuthenticated) return
    loadClickedKeywords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickedDays])

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

  // 점수 N 이하인 KW 모두 선택 — 사용자 임계값 일괄 정리.
  const handleClickedSelectBelowScore = () => {
    const ids = clickedItems
      .filter(i => (i.relevance_score ?? 100) <= scoreThreshold)
      .map(i => i.keyword_id)
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
        `/api/naver-ad/keyword-pool/clicked-keywords/bulk-delete${cidQs()}`,
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
      const res = await adDelete<{ success: boolean; deleted: number }>(`/api/naver-ad/keyword-pool/keywords/${encodeURIComponent(keyword)}${cidQs()}`)
      toast.success(`"${keyword}" 풀에서 삭제 (${res.deleted}건)`)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '삭제 실패')
    }
  }

  const handleDeleteSeed = async (seed: string, total: number) => {
    if (!confirm(`시드 "${seed}"와 이 시드로 발굴된 키워드(총 ${total}개)를 풀에서 삭제할까요?\n(이미 네이버 광고에 등록된 키워드는 영향 없음)`)) return
    try {
      const res = await adDelete<{ success: boolean; deleted: number }>(`/api/naver-ad/keyword-pool/seeds/${encodeURIComponent(seed)}${cidQs()}`)
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
        `/api/naver-ad/keyword-pool/seeds${cidQs()}`,
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

  // hydration safety — Date.now()/new Date() 는 SSR 과 client 가 달라서 React #422 유발.
  // mounted 전엔 false/0 으로 고정해서 서버/클라이언트 1차 렌더 일치시킴.
  const nowMs = mounted ? Date.now() : 0
  const isFresh = (iso?: string) => {
    if (!mounted || !iso) return false
    const t = new Date(iso.replace(' ', 'T') + 'Z').getTime()
    return nowMs - t < 90_000
  }
  const liveCollect = isFresh(lastCollect?.started_at)
  const liveRegister = isFresh(lastRegister?.started_at)

  // 다음 cron 예상 시각 — 매 5분 (:00, :05, :10, ...). mounted 후에만 계산.
  let minsToNext = 0
  let nextTickHHMM = ''
  if (mounted) {
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
    minsToNext = Math.max(0, Math.round((nextTick.getTime() - nowDate.getTime()) / 60000))
    nextTickHHMM = `${String(nextTick.getHours()).padStart(2, '0')}:${String(nextTick.getMinutes()).padStart(2, '0')}`
  }

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
          <div className="flex items-center gap-2">
            {accounts.length > 0 && (
              <select
                value={selectedCid}
                onChange={(e) => handleSelectAccount(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 min-w-[180px]"
                title="광고주 선택"
              >
                {accounts.map(a => (
                  <option key={a.customer_id} value={a.customer_id}>
                    {a.name ? `${a.name} (${a.customer_id})` : a.customer_id}
                    {a.is_connected ? '' : ' · 연결끊김'}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
        </div>

        {accounts.length > 1 && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
            <span className="font-semibold">다중 광고주 모드</span> — 총 {accounts.length}개 광고주 등록됨.
            드롭다운에서 광고주 전환 시 풀 데이터/시드/실행이력이 그 광고주 기준으로 분리됩니다.
            cron(5분 주기) 은 모든 광고주를 각각 독립적으로 처리합니다.
          </div>
        )}

        {/* 입찰가 일괄 변경 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-amber-600" />
            <h2 className="font-bold text-gray-900">입찰가 default 설정</h2>
            <span className="text-xs text-gray-500">
              현재: {(accounts.find(a => a.customer_id === selectedCid)?.default_bid ?? 100).toLocaleString()}원
            </span>
          </div>
          <p className="text-xs text-gray-600 mb-3">
            앞으로 풀 자동 등록 키워드의 default 입찰가 + 광고그룹 default bid 일괄 변경.
            키워드별 개별 입찰가가 설정된 키워드는 영향 없음. 네이버 최소 70원.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min={70}
              step={10}
              value={bidInput}
              onChange={(e) => setBidInput(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg w-32"
              placeholder="70"
            />
            <span className="text-sm text-gray-600">원</span>
            <button
              onClick={() => handleBidBulkUpdate('pool')}
              disabled={bidApplying}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              title="풀 자동 등록 캠페인 (auto_*) 의 모든 광고그룹만 변경"
            >
              {bidApplying && <Loader2 className="w-4 h-4 animate-spin" />}
              풀 캠페인 일괄 변경
            </button>
            <button
              onClick={() => handleBidBulkUpdate('all')}
              disabled={bidApplying}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-amber-500 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-50"
              title="이 광고주의 모든 캠페인 (수동 캠페인 포함) 변경"
            >
              전체 캠페인 일괄 변경
            </button>
          </div>
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
          {usePct >= 98 ? (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              계정 한도 도달 임박 — 곧 자동 수집 정지. 노출제한/저성과 KW 정리하면 슬롯 회수.
            </div>
          ) : usePct >= 90 ? (
            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              계정 한도 90% 도달 — 100k 까지 자동으로 계속 채우는 중. 정상 작동.
            </div>
          ) : null}
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
              다음 실행 예정 ~ {minsToNext}분 후 {nextTickHHMM && `(${nextTickHHMM})`}
            </div>
          </div>

          {!lastRun && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
              아직 실행 이력이 없습니다. 매 15분 cron tick에 자동 실행됩니다 — 시드를 추가하면 첫 실행에서 키워드를 발굴합니다.
            </div>
          )}

          {lastRun && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RunSummary kind="collect" run={lastCollect} live={liveCollect} mounted={mounted} />
              <RunSummary kind="register" run={lastRegister} live={liveRegister} mounted={mounted} />
            </div>
          )}

          {lastError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>최근 에러 ({fmtTime(lastError.started_at, mounted)})</strong>
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

          {/* 연관성 기준 키워드 — 사용자가 직접 도메인 토큰 명시. 자동/수동 cleanup 모두 이 키워드로 점수 매김 */}
          <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Activity className="w-4 h-4 text-blue-700" />
              <span className="text-xs font-medium text-blue-900">연관성 기준 키워드</span>
              <span className="text-xs text-gray-600">— 점수 계산 도메인 (예: 피부 광고주면 "피부질환,피부,피부과,아토피,여드름,트러블")</span>
              <span className="ml-auto text-[11px] text-gray-500">
                현재 저장: {autoCleanup.relevance_keywords.length === 0 ? '비어있음 (user_seed 사용)' : `${autoCleanup.relevance_keywords.length}개`}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <textarea
                value={relevanceInput}
                onChange={(e) => setRelevanceInput(e.target.value)}
                rows={2}
                placeholder="피부질환, 피부, 피부과, 아토피, 여드름, 트러블, 색소침착"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 font-mono resize-none"
                disabled={autoCleanupSaving}
              />
              <button
                onClick={handleSaveRelevanceKeywords}
                disabled={autoCleanupSaving}
                className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 inline-flex items-center gap-1"
              >
                {autoCleanupSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                저장
              </button>
            </div>
            <div className="text-[11px] text-gray-600 mt-1">
              콤마/줄바꿈 구분. 입력 후 "저장" → 자동 cleanup 매시 + 수동 "조회" 모두 이 키워드로 점수 매김.
              비어있으면 user_seed 폴백. <strong>변경 후 표 다시 조회해야 점수 갱신.</strong>
            </div>
          </div>

          {/* 자동 cleanup — cron 이 매시 1회 점수 ≤ threshold 인 클릭 KW 자동 삭제. 항상 표시. */}
          <div className={`flex items-center gap-2 mb-2 p-2 border rounded flex-wrap ${
            autoCleanup.enabled ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
          }`}>
            <button
              onClick={() => saveAutoCleanup({ enabled: !autoCleanup.enabled })}
              disabled={autoCleanupSaving}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-50 ${
                autoCleanup.enabled ? 'bg-red-600' : 'bg-gray-300'
              }`}
              title="자동 삭제 ON/OFF"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  autoCleanup.enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-xs font-medium text-gray-800">
              자동 삭제 {autoCleanup.enabled ? 'ON' : 'OFF'}
            </span>
            <span className="text-xs text-gray-500">— 점수</span>
            <input
              type="number"
              min={0}
              max={95}
              value={autoCleanup.threshold}
              onChange={(e) => setAutoCleanup(prev => ({ ...prev, threshold: Math.max(0, Math.min(95, parseInt(e.target.value) || 0)) }))}
              onBlur={(e) => {
                const t = Math.max(0, Math.min(95, parseInt(e.target.value) || 0))
                if (t !== undefined) saveAutoCleanup({ threshold: t })
              }}
              className="w-16 text-xs border border-gray-300 rounded px-2 py-0.5 text-right"
              disabled={autoCleanupSaving}
            />
            <span className="text-xs text-gray-700">점 이하 클릭 KW 매시 자동 삭제 (cron, click ≥ 1)</span>
            {autoCleanupSaving && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
            <span className="text-xs text-gray-500 ml-auto">
              {autoCleanup.last_run_at
                ? `최근 실행 ${fmtTime(autoCleanup.last_run_at, mounted)} · ${autoCleanup.last_deleted}개 삭제`
                : '아직 실행 안 됨'}
            </span>
          </div>

          {/* 수동 일괄 정리 — click 무관, 등록 KW 전체 audit. cascade drift 옛날 무관 KW 정리. 항상 표시. */}
          <div className="flex items-center gap-2 mb-2 p-2 bg-orange-50 border border-orange-200 rounded flex-wrap">
            <Trash2 className="w-4 h-4 text-orange-700" />
            <span className="text-xs font-medium text-orange-900">기존 등록 KW 일괄 정리 (click 무관)</span>
            <span className="text-xs text-gray-700">— 점수</span>
            <input
              type="number"
              min={0}
              max={95}
              value={manualCleanupThreshold}
              onChange={(e) => setManualCleanupThreshold(Math.max(0, Math.min(95, parseInt(e.target.value) || 0)))}
              className="w-16 text-xs border border-gray-300 rounded px-2 py-0.5 text-right"
              disabled={manualCleanupRunning}
            />
            <span className="text-xs text-gray-700">점 이하 등록 KW 조회 → 표에서 선택 삭제</span>
            <button
              onClick={handleManualAudit}
              disabled={manualCleanupRunning}
              className="ml-auto text-xs px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-300 inline-flex items-center gap-1"
            >
              {manualCleanupRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {manualCleanupRunning ? '조회 중…' : '점수 ≤ N 등록 KW 조회'}
            </button>
            <div className="basis-full text-[11px] text-gray-600 mt-1">
              cascade drift 로 잘못 등록된 옛날 무관 KW (예: 의료 광고주에 "대출이자/렌탈정수기") 정리. click 발생 안 한 KW 도 포함.
              조회 시 점수 ≤ N 인 등록 KW 전체 리스트가 표로 떠서 체크박스로 선택해 일괄 삭제 (max 1000개 표시 / 5000개 처리).
            </div>
          </div>

          {/* 수동 audit 결과 표 — 등록 KW 점수 ≤ threshold 전체 리스트, 체크박스 선택 + 일괄 삭제 */}
          {manualMeta && manualTargets.length === 0 && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded p-3 mb-3">
              점수 ≤ {manualCleanupThreshold} 등록 KW 0개 — 무관한 KW 없음 (전체 등록 {manualMeta.total_registered.toLocaleString()}개)
            </div>
          )}
          {manualTargets.length > 0 && manualMeta && (
            <div className="border border-orange-200 rounded p-3 mb-3 bg-orange-50/30">
              <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
                <span className="font-medium text-gray-800">
                  점수 ≤ {manualCleanupThreshold} 대상 {manualMeta.targets_below_threshold.toLocaleString()}개
                  {manualMeta.targets_below_threshold > manualMeta.displayed && (
                    <span className="text-gray-500 ml-1">(상위 {manualMeta.displayed.toLocaleString()}개 표시 — 점수 낮은 순)</span>
                  )}
                </span>
                <span className="text-gray-600">
                  · 분포: {Object.entries(manualMeta.score_distribution).slice(0, 6).map(([b, n]) => `${b}~${Number(b)+9}: ${n}`).join(' / ')}
                </span>
                <button
                  onClick={() => handleManualToggleAll(manualSelected.size !== manualTargets.length)}
                  className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  {manualSelected.size === manualTargets.length ? '전체 해제' : '전체 선택'}
                </button>
                <button
                  onClick={handleManualBulkDelete}
                  disabled={manualSelected.size === 0 || manualDeleting}
                  className="ml-auto text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 inline-flex items-center gap-1"
                >
                  {manualDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  선택 {manualSelected.size.toLocaleString()}개 일괄 삭제
                </button>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 rounded bg-white">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="text-left py-2 px-2 w-8">
                        <input
                          type="checkbox"
                          checked={manualSelected.size === manualTargets.length && manualTargets.length > 0}
                          onChange={(e) => handleManualToggleAll(e.target.checked)}
                        />
                      </th>
                      <th className="text-left py-2 px-2">키워드</th>
                      <th className="text-center py-2 px-2 w-20">연관성</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualTargets.map((t) => {
                      const scoreColor = t.score >= 20 ? 'text-orange-700 bg-orange-50' : 'text-red-700 bg-red-50'
                      return (
                        <tr key={t.keyword_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-1.5 px-2">
                            <input
                              type="checkbox"
                              checked={manualSelected.has(t.keyword_id)}
                              onChange={() => handleManualToggle(t.keyword_id)}
                            />
                          </td>
                          <td className="py-1.5 px-2 font-medium">{t.keyword}</td>
                          <td className="py-1.5 px-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${scoreColor}`}>
                              {t.score}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {clickedShown && !clickedLoading && clickedItems.length === 0 && (
            <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded">
              최근 {clickedDays}일 내 클릭 발생 키워드 없음. (위 자동/수동 정리 기능은 클릭 발생 무관하게 동작)
            </div>
          )}

          {clickedItems.length > 0 && (() => {
            const mismatchCount = clickedItems.filter(i => !i.matches_seed).length
            const belowThresholdCount = clickedItems.filter(i => (i.relevance_score ?? 100) <= scoreThreshold).length
            const visibleItems = clickedFilterMismatch
              ? clickedItems.filter(i => !i.matches_seed)
              : clickedItems
            const scoreColor = (s: number) =>
              s >= 80 ? 'text-green-700 bg-green-50' :
              s >= 50 ? 'text-yellow-700 bg-yellow-50' :
              s >= 20 ? 'text-orange-700 bg-orange-50' :
              'text-red-700 bg-red-50'
            return (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <button
                  onClick={() => setClickedFilterMismatch(v => !v)}
                  className={`text-xs px-3 py-1 rounded inline-flex items-center gap-1.5 border transition ${
                    clickedFilterMismatch
                      ? 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  title="사업 무관 (시드 매칭 X) 키워드만 보기"
                >
                  {clickedFilterMismatch ? '✓ 무관만 보기' : '무관만 보기'}
                </button>
                <span className="text-xs text-gray-600">
                  {clickedFilterMismatch
                    ? `시드 무관 ${mismatchCount}개 표시 / 전체 ${clickedItems.length}개`
                    : `전체 ${clickedItems.length}개 (무관 ${mismatchCount}개)`}
                </span>
                <button
                  onClick={handleClickedSelectMismatch}
                  className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                >
                  무관 전체 선택
                </button>
                <button
                  onClick={() => handleClickedToggleAll(clickedSelected.size !== visibleItems.length)}
                  className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  {clickedSelected.size === visibleItems.length ? '전체 해제' : '전체 선택'}
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
              {/* 점수 임계값 일괄 선택 — 사용자가 N점 이하 KW 한 번에 정리 */}
              <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 border border-gray-200 rounded flex-wrap">
                <span className="text-xs text-gray-700 font-medium">연관성 점수</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreThreshold}
                  onChange={(e) => setScoreThreshold(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                  className="w-16 text-xs border border-gray-300 rounded px-2 py-0.5 text-right"
                />
                <span className="text-xs text-gray-700">점 이하</span>
                <button
                  onClick={handleClickedSelectBelowScore}
                  className="text-xs px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium"
                >
                  {belowThresholdCount}개 모두 선택
                </button>
                <span className="text-xs text-gray-500 ml-2">
                  0=완전 무관, 100=user_seed 직접 매칭. 30 이하 권장.
                </span>
              </div>

              {visibleItems.length === 0 ? (
                <div className="text-sm text-gray-500 p-3 bg-green-50 border border-green-100 rounded">
                  사업과 무관한 클릭 키워드 없음 — 광고 노출이 제대로 타겟팅 중.
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="text-left py-2 px-2 w-8"></th>
                      <th className="text-left py-2 px-2">키워드</th>
                      <th className="text-center py-2 px-2">연관성</th>
                      <th className="text-right py-2 px-2">노출</th>
                      <th className="text-right py-2 px-2">클릭</th>
                      <th className="text-right py-2 px-2">CTR</th>
                      <th className="text-right py-2 px-2">비용(원)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((it) => {
                      const score = it.relevance_score ?? (it.matches_seed ? 100 : 0)
                      return (
                      <tr
                        key={it.keyword_id}
                        className={`border-b border-gray-100 hover:bg-gray-50 ${score <= scoreThreshold ? 'bg-red-50/40' : !it.matches_seed ? 'bg-orange-50/30' : ''}`}
                      >
                        <td className="py-2 px-2">
                          <input
                            type="checkbox"
                            checked={clickedSelected.has(it.keyword_id)}
                            onChange={() => handleClickedToggle(it.keyword_id)}
                          />
                        </td>
                        <td className="py-2 px-2 font-medium">{it.keyword}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${scoreColor(score)}`}>
                            {score}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{it.impressions.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono font-medium">{it.clicks.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{(it.ctr * 100).toFixed(2)}%</td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{it.cost.toLocaleString()}</td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </>
            )
          })()}
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
                      <td className="py-2 px-2 text-xs text-gray-500 font-mono">{fmtTime(k.discovered_at, mounted)}</td>
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

        {/* 수집 데드락 알람 — 최근 5회 collect 가 모두 0건 + reject 많음 */}
        {stats?.collect_deadlock?.is_deadlock && (
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">⚠️</span>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-red-900 mb-1">
                  수집 데드락 감지 — 최근 {stats.collect_deadlock.consecutive_zero_runs}회 연속 0건
                </h3>
                <p className="text-sm text-red-800 mb-2">
                  네이버에서 후보 {stats.collect_deadlock.total_rejected.toLocaleString()}개를 받았지만 화이트리스트가 모두 거부했습니다.
                  시드 또는 도메인 토큰 점검이 필요합니다.
                </p>
                <p className="text-xs text-red-700">
                  최근 실행 이력의 메모 컬럼에서 <span className="font-mono bg-red-100 px-1 rounded">도메인미스 X / 시드미스 Y</span> 비율을 확인하세요.
                  도메인미스가 많으면 시드 분야가 토큰셋 밖, 시드미스가 많으면 keywordstool 결과가 시드와 너무 멀리 떨어진 키워드.
                </p>
              </div>
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
                      <td className="py-2 px-2 text-xs text-gray-600 font-mono">{fmtTime(r.started_at, mounted)}</td>
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

function fmtTime(iso?: string, mounted: boolean = true): string {
  if (!iso) return '-'
  // hydration safety — Date.now() 가 SSR 과 client 다르면 React #422.
  // mounted 전엔 원본 ISO 만 (서버/클라이언트 동일).
  if (!mounted) return iso.slice(5, 16).replace('T', ' ')  // 'MM-DD HH:MM' 정도
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

function RunSummary({ kind, run, live, mounted = true }: { kind: 'collect' | 'register'; run?: RunRow; live: boolean; mounted?: boolean }) {
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
        {fmtTime(run.started_at, mounted)}
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
