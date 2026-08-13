'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Search, Loader2, Target, Lock, CheckCircle, CheckCircle2, XCircle,
  MinusCircle, AlertCircle,
} from 'lucide-react'
import {
  fetchKeywordFacts, startKeywordDeep, getKeywordDeep, getVerdictAccuracy,
  type KeywordFactsResponse, type KeywordDeepResult, type VerdictAccuracy,
} from '@/lib/api/blog'
import { useBlogContextStore } from '@/lib/stores/blogContext'

/**
 * 키워드 상위노출 판정 v2 — "이 키워드 1페이지의 컷라인 대비 내 위치"
 *
 * 2단 응답인 이유: 1단(사실)은 SERP 한 번이면 나오지만 2단(컷라인 판정)은 1페이지
 * 블로그 10개를 실제로 채점해야 해서 오래 걸린다. 사용자를 빈 화면에 세워두지 않으려고
 * 사실 → 판정 순서로 채운다. 두 단계 모두 worker 프로세스에서 돌아 API 를 막지 않는다.
 *
 * 두 곳에서 쓴다:
 *   · /keyword-check — 블로그 ID 를 직접 입력하는 단독 탭 (showBlogInput)
 *   · /analyze       — 분석 결과 아래, 이미 아는 blogId 를 받아서
 */

const VERDICT_UI: Record<string, { label: string; cls: string; Icon: typeof CheckCircle }> = {
  already_ranked: { label: '이미 노출 중', cls: 'text-blue-700 bg-blue-50 border-blue-200', Icon: CheckCircle2 },
  likely:    { label: '상위노출 가능', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', Icon: CheckCircle },
  contested: { label: '경합 — 노려볼 만함', cls: 'text-amber-700 bg-amber-50 border-amber-200', Icon: MinusCircle },
  unlikely:  { label: '현재는 어려움', cls: 'text-red-700 bg-red-50 border-red-200', Icon: XCircle },
  unknown:   { label: '판정 불가 (측정 실패)', cls: 'text-gray-600 bg-gray-50 border-gray-200', Icon: AlertCircle },
}

const CONFIDENCE_KO: Record<string, string> = { high: '높음', medium: '보통', low: '낮음' }

// SERP 를 못 가져오면 서버는 두 가지 모습으로 끝난다 — 단계 타임아웃(status=error)이거나
// 조회 실패(status=done + verdict=unknown). 원인이 같은데 화면 문구가 갈리면 사용자는
// 다른 고장으로 읽는다(2026-08-13 실측). 같은 문장으로 합친다.
// 서버가 알려주는 단계(queued→serp→scoring)에 예상치를 붙여 진행률과 남은 시간을 낸다.
// est 는 **프로덕션 실측** 기반이다. 판정 전용 프로세스 + 브라우저 prewarm + 점수 캐시를
// 넣은 뒤(2026-08-13) 콜드 32.8초 / 캐시 적중 1.9초로 줄었다. 예전 수치(큐 115·SERP 76)로
// 두면 30초에 끝날 판정에 "남은 4분" 을 띄우게 된다 — 과대 예측도 거짓말이다.
const PHASE_PLAN = [
  { key: 'queued', label: '순서를 기다리는 중', est: 8 },
  { key: 'serp', label: '네이버 블로그탭에서 이 키워드의 실제 1페이지를 가져오는 중', est: 18 },
  { key: 'scoring', label: '1페이지 블로그 10개를 내 블로그와 같은 기준으로 채점하는 중', est: 25 },
] as const
const TOTAL_EST = PHASE_PLAN.reduce((s, p) => s + p.est, 0)

function fmtSec(sec: number): string {
  const r = Math.max(0, Math.round(sec))
  return r >= 60 ? `${Math.floor(r / 60)}분 ${String(r % 60).padStart(2, '0')}초` : `${r}초`
}

function progressOf(
  jobPhase: string | null,
  phaseAt: number,
  now: number,
  scored?: { done: number; total: number } | null,
) {
  const i = Math.max(0, PHASE_PLAN.findIndex((p) => p.key === (jobPhase ?? 'queued')))
  const cur = PHASE_PLAN[i]
  const tIn = Math.max(0, (now - phaseAt) / 1000)
  const before = PHASE_PLAN.slice(0, i).reduce((s, p) => s + p.est, 0)
  const later = PHASE_PLAN.slice(i + 1).reduce((s, p) => s + p.est, 0)

  // 채점 단계는 서버가 실제 진척(done/total)을 준다 — 추정치보다 이게 먼저다.
  // 남은 시간도 지금까지의 실제 속도로 낸다.
  if (cur.key === 'scoring' && scored && scored.total > 0 && scored.done > 0) {
    const frac = Math.min(1, scored.done / scored.total)
    const remainReal = (tIn / scored.done) * Math.max(0, scored.total - scored.done)
    return {
      percent: Math.min(99, Math.max(2, ((before + cur.est * frac * 0.98) / TOTAL_EST) * 100)),
      remain: remainReal,
      overrun: false,
      atLeast: false,
      label: `1페이지 블로그를 내 블로그와 같은 기준으로 채점하는 중 (${scored.done}/${scored.total})`,
      step: i + 1,
    }
  }

  // 예상을 넘겨도 바를 100% 로 채우지 않는다 — 끝나지도 않았는데 다 됐다고 말하는 게
  // 더 나쁜 거짓말이다. 마지막 5% 는 점근적으로만 줄어든다.
  const inFrac = tIn <= cur.est
    ? (tIn / cur.est) * 0.95
    : 0.95 + 0.05 * (1 - Math.exp(-(tIn - cur.est) / cur.est))
  const remain = Math.max(0, cur.est - tIn) + later
  return {
    percent: Math.min(99, Math.max(2, ((before + cur.est * inFrac) / TOTAL_EST) * 100)),
    remain,
    overrun: remain <= 0,
    // 이 단계가 예상을 넘겼는데 남은 시간을 그대로 두면 카운트다운이 멈춘 것처럼 보인다.
    // 멈춘 게 아니라 하한이라는 뜻이므로 '이상' 을 붙여 말한다.
    atLeast: tIn > cur.est,
    label: cur.label,
    step: i + 1,
  }
}

const SERP_FAIL_MSG =
  '이 키워드의 네이버 블로그탭 1페이지를 가져오지 못했습니다. 판정은 실제 1페이지를 ' +
  '읽어야만 나오므로 결과를 내지 않았습니다. 잠시 후 다시 시도해 주세요.'

export interface KeywordVerdictWidgetProps {
  /** 이미 아는 블로그 ID (분석 페이지에서 내려줌) */
  blogId?: string
  isFreeUser: boolean
  /** 블로그 ID 입력란을 위젯 안에 함께 그린다 (단독 탭용) */
  showBlogInput?: boolean
  className?: string
}

export default function KeywordVerdictWidget({
  blogId: fixedBlogId,
  isFreeUser,
  showBlogInput = false,
  className = 'glass-3d p-8 mb-8',
}: KeywordVerdictWidgetProps) {
  const lastAnalyzedBlogId = useBlogContextStore((s) => s.lastAnalyzedBlogId)

  const [blogInput, setBlogInput] = useState(fixedBlogId ?? '')
  const [keyword, setKeyword] = useState('')
  const [facts, setFacts] = useState<KeywordFactsResponse | null>(null)
  const [deep, setDeep] = useState<KeywordDeepResult | null>(null)
  const [phase, setPhase] = useState<'idle' | 'facts' | 'deep' | 'done' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [usedFree, setUsedFree] = useState(false)
  const [accuracy, setAccuracy] = useState<VerdictAccuracy | null>(null)
  // 진행률용 — 서버가 준 단계와 그 단계가 시작된 시각, 그리고 1초마다 도는 시계.
  const [jobPhase, setJobPhase] = useState<string | null>(null)
  const [phaseAt, setPhaseAt] = useState(0)
  const [startedAt, setStartedAt] = useState(0)
  const [nowMs, setNowMs] = useState(0)
  const [scored, setScored] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    getVerdictAccuracy().then(setAccuracy).catch(() => {})
  }, [])

  // 단독 탭에서는 최근 분석한 블로그를 기본값으로 채워 준다 — 매번 다시 치게 하지 않는다.
  useEffect(() => {
    if (showBlogInput && !blogInput && lastAnalyzedBlogId) setBlogInput(lastAnalyzedBlogId)
  }, [showBlogInput, lastAnalyzedBlogId]) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveBlogId = (showBlogInput ? blogInput : fixedBlogId ?? '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^(m\.)?blog\.naver\.com\//, '')
    .replace(/\/.*$/, '')

  const locked = isFreeUser && usedFree
  const busy = phase === 'facts' || phase === 'deep'

  // 폴링은 2.5초 간격이라 그것만으로는 카운트다운이 뚝뚝 끊긴다. 진행 중에만 1초 시계를 돈다.
  useEffect(() => {
    if (!busy) return
    setNowMs(Date.now())
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [busy])

  const run = async () => {
    const kw = keyword.trim()
    if (!effectiveBlogId) { toast.error('블로그 ID를 입력하세요'); return }
    if (!kw) { toast.error('키워드를 입력하세요'); return }
    if (locked || busy) return

    const t0 = Date.now()
    setStartedAt(t0); setPhaseAt(t0); setNowMs(t0); setJobPhase('queued'); setScored(null)
    setFacts(null); setDeep(null); setErrMsg(null); setPhase('facts')
    try {
      if (isFreeUser) setUsedFree(true)

      // 1단: 이미 측정된 캐시가 있으면 즉답으로 화면을 먼저 채운다.
      // (캐시가 없으면 서버가 not_measured_yet 을 주고, 아래 job 이 실제로 조회한다)
      try {
        const cached = await fetchKeywordFacts(effectiveBlogId, kw)
        if (cached?.ok) {
          setFacts(cached)
          if (cached.already_page1) { setPhase('done'); return }
        }
      } catch { /* 캐시 조회 실패는 무시 — 아래 job 이 어차피 다시 잰다 */ }

      // 2단: 워커가 SERP 조회 + 경쟁자 채점. 사실이 먼저 실려 온다.
      setPhase('deep')
      const job = await startKeywordDeep(effectiveBlogId, kw)
      let seenPhase = 'queued'
      for (let i = 0; i < 140; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 3000 : 2500))
        const s = await getKeywordDeep(job.job_id)
        // 단계가 바뀐 순간을 기억해야 "이 단계에서 얼마나 지났나"를 셀 수 있다.
        const ph = s.status === 'running' ? (s.phase || 'serp') : s.status === 'queued' ? 'queued' : null
        if (ph && ph !== seenPhase) { seenPhase = ph; setJobPhase(ph); setPhaseAt(Date.now()) }
        if (s.progress?.total) setScored({ done: s.progress.done, total: s.progress.total })
        if (s.facts?.ok) setFacts(s.facts)
        if (s.status === 'done' && s.result) {
          // SERP 를 못 읽어 판정이 비었으면 '판정 불가' 카드만 띄우지 않고 이유를 말한다.
          if (s.result.verdict === 'unknown' && s.result.error === 'serp_fetch_failed') {
            setErrMsg(SERP_FAIL_MSG)
            setPhase('error')
            return
          }
          setDeep(s.result)
          if (s.result.facts?.ok) setFacts(s.result.facts)
          setPhase('done')
          return
        }
        if (s.status === 'error') {
          setErrMsg(
            s.error?.startsWith('timeout')
              ? SERP_FAIL_MSG
              : s.error || '판정 중 오류가 발생했습니다'
          )
          setPhase('error')
          return
        }
      }
      setErrMsg('판정이 예상보다 오래 걸립니다. 잠시 후 다시 시도해 주세요.')
      setPhase('error')
    } catch {
      setErrMsg('판정 중 오류가 발생했습니다')
      setPhase('error')
    }
  }

  const verdictKey = deep?.verdict ?? (facts?.already_page1 ? 'already_ranked' : null)
  const v = verdictKey ? VERDICT_UI[verdictKey] : null
  const prob = deep?.probability ?? (facts?.already_page1 ? 1 : null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <Target className="w-6 h-6 text-[#0064FF] gi3d" />
        <h3 className="text-xl font-bold">이 키워드, 내 블로그로 상위노출 될까?</h3>
        {accuracy && (
          <span
            className="ml-auto text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap"
            title="이 판정기가 예측한 키워드를 나중에 실제 순위로 채점한 결과입니다"
          >
            {accuracy.is_validated
              ? `실측 정확도 ${Math.round((accuracy.overall_accuracy ?? 0) * 100)}% (${accuracy.graded_total}건)`
              : `실측 검증 ${accuracy.graded_total}건 — 누적 중`}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">
        그 키워드의 <b>실제 블로그탭 1페이지</b>를 가져와, 거기 앉아 있는 블로그들을 내 블로그와
        같은 기준으로 채점해 <b>진입 컷라인</b>과 비교합니다.
      </p>

      <div className={showBlogInput ? 'grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]' : 'flex gap-2'}>
        {showBlogInput && (
          <input
            value={blogInput}
            onChange={(e) => setBlogInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="내 블로그 ID (예: example_blog)"
            className="toss-input"
            disabled={busy || locked}
          />
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 gi3d" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="확인할 키워드 (예: 아토피 치료)"
            className="toss-input pl-9 w-full"
            disabled={busy || locked}
          />
        </div>
        <button onClick={run} disabled={busy || locked}
          className="toss-btn-primary px-6 disabled:opacity-50 whitespace-nowrap">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '판정'}
        </button>
      </div>

      {locked && (
        <div className="mt-4 flex items-center justify-between gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <Lock className="w-4 h-4 gi3d" />무료 1회를 사용했습니다. Pro에서 무제한 판정하세요.
          </span>
          <Link href="/pricing" className="toss-btn-primary px-4 py-2 text-sm whitespace-nowrap">Pro 보기</Link>
        </div>
      )}

      {/* ── 1단 결과: 사실 ── */}
      {facts && facts.ok && !locked && (
        <div className="mt-5 rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="font-semibold text-gray-800">
              {facts.my_rank
                ? `내 블로그 현재 ${facts.my_rank}위`
                : `내 블로그 미노출 (상위 ${facts.serp_size}위 밖)`}
            </span>
            <span className="text-gray-600">월 검색량 {facts.volume.toLocaleString()}회</span>
            <span className="text-gray-400 text-xs ml-auto">
              실제 블로그탭 조회
              {facts.serp_cached ? ' · 캐시' : ''}
              {facts.serp_parse_mode === 'regex' ? ' · ⚠️ 폴백 파싱' : ''}
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {facts.page1.map((r) => {
              const c = deep?.competitors?.find((x) => x.rank === r.rank)
              const mine = r.blog_id === effectiveBlogId
              return (
                <div key={r.rank}
                  className={`px-5 py-2.5 flex items-center gap-3 text-sm ${mine ? 'bg-blue-50' : ''}`}>
                  <span className="w-6 text-gray-400 tabular-nums">{r.rank}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-gray-800">{r.post_title}</span>
                    <span className="block truncate text-xs text-gray-400">{r.blog_id}</span>
                  </span>
                  {c?.score != null ? (
                    <span className="text-right whitespace-nowrap">
                      <span className="font-semibold text-gray-900 tabular-nums">{c.score}</span>
                      <span className="text-xs text-gray-500 ml-1">{c.grade}</span>
                      {c.recent_activity_days != null && c.recent_activity_days > 90 && (
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          {c.recent_activity_days}일 방치
                        </span>
                      )}
                    </span>
                  ) : phase === 'deep' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 진행 중 (단계·진행률·남은 시간) ── */}
      {busy && (() => {
        const p = progressOf(jobPhase, phaseAt || nowMs, nowMs, scored)
        const elapsed = startedAt ? (nowMs - startedAt) / 1000 : 0
        return (
          <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2 text-sm text-gray-700 flex-wrap">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
              <span className="text-xs font-semibold text-blue-600 shrink-0">
                {p.step}/{PHASE_PLAN.length}단계
              </span>
              <span className="min-w-0">{p.label}…</span>
              <span className="ml-auto text-base font-bold text-gray-800 tabular-nums shrink-0">
                {Math.round(p.percent)}%
              </span>
            </div>

            <div className="mt-2.5 h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-[width] duration-1000 ease-linear"
                style={{ width: `${p.percent}%` }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500 flex-wrap">
              <span className="tabular-nums">
                {p.overrun
                  ? '예상보다 오래 걸리는 중입니다 — 결과가 나올 때까지 기다립니다'
                  // 채점을 다 끝내도 못 잰 블로그 재시도·주제적합도가 남는다. 그 구간에서
                  // "남은 0초" 를 띄우면 멈춘 것처럼 보이므로 마무리 중이라고 말한다.
                  : p.remain < 5
                    ? '마무리하는 중입니다'
                    : `남은 시간 약 ${fmtSec(p.remain)}${p.atLeast ? ' 이상' : ''}`}
              </span>
              <span className="tabular-nums text-gray-400">{fmtSec(elapsed)} 경과</span>
            </div>

            <p className="mt-2 text-[11px] text-gray-400">
              남은 시간은 예상치입니다. 처음 보는 키워드는 1페이지를 직접 열어 10개 블로그를
              전부 채점하므로 몇 분 걸릴 수 있고, 같은 키워드를 다시 보면 훨씬 빠릅니다.
            </p>
          </div>
        )
      })()}

      {/* ── 판정 ── */}
      {v && !locked && phase === 'done' && (
        <div className={`mt-5 p-5 rounded-2xl border ${v.cls}`}>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <v.Icon className="w-6 h-6" />
            <span className="text-lg font-bold">{v.label}</span>
            {prob != null && verdictKey !== 'already_ranked' && (
              <span className="text-sm font-semibold">1페이지 진입 확률 {Math.round(prob * 100)}%</span>
            )}
            {deep && (
              <span className="ml-auto text-xs opacity-70">
                판정 신뢰도 {CONFIDENCE_KO[deep.confidence] ?? deep.confidence}
              </span>
            )}
          </div>

          {facts?.already_page1 && (
            <p className="text-sm leading-relaxed opacity-90">
              이미 이 키워드로 블로그탭 {facts.my_rank}위에 노출 중입니다. 예측이 아니라 실측입니다.
            </p>
          )}

          {deep && (
            <>
              <ul className="text-sm leading-relaxed opacity-90 space-y-1">
                {deep.reasons.map((r, i) => <li key={i}>· {r}</li>)}
              </ul>
              {deep.cut_line != null && deep.my?.score != null && (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs opacity-80">
                  <span>내 점수 {deep.my.score} ({deep.my.grade})</span>
                  <span>1페이지 컷라인 {deep.cut_line}</span>
                  <span>1페이지 중앙값 {deep.median_score}</span>
                  {deep.topical_posts != null && <span>내 주제 글 {deep.topical_posts}개</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {phase === 'error' && errMsg && (
        <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />{errMsg}
        </div>
      )}

      {deep?.disclaimer && phase === 'done' && (
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">{deep.disclaimer}</p>
      )}
    </motion.div>
  )
}
