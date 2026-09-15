'use client'

import { useEffect, useState } from 'react'
import { getApiUrl } from '@/lib/api/apiConfig'

/**
 * 성장 진단 — "왜 가입을 안 하고, 왜 결제가 안 되는가".
 *
 * 화면 설계에서 지킨 것:
 *
 * 1. **빈 칸을 0점으로 칠하지 않는다.** 표본이 부족한 구간은 점수 자리를 비우고
 *    왜 비었는지 쓴다. 회색 '측정불가'가 빨간 '0점'보다 정직하고, 빨간색을 보면
 *    사람은 멀쩡한 화면을 뜯어고친다.
 *
 * 2. **총점보다 병목을 크게 보여준다.** 실무에서 쓸모 있는 건 평균이 아니라
 *    "어디부터 손대야 하는가" 라서.
 *
 * 3. **모든 처방에 파일 경로를 붙인다.** 어디를 고치라는 건지 못 말하는 진단은
 *    읽는 시간만 쓴다.
 */

type Bench = {
  label: string; floor: number; median: number; great: number
  source: string; grade: string; note: string
}
type Stage = {
  key: string; label: string; question: string; group: 'signup' | 'payment'
  denom: number; numer: number
  rate: number | null; ci: [number, number] | null
  score: number | null; grade: string
  confidence: 'confident' | 'provisional' | 'unscored' | 'no_benchmark' | 'inconsistent'
  benchmark: Bench | null
  gap_to_median: number | null
  recoverable: number | null
  weight?: number
  opportunity_krw?: number
  note: string
}
type Finding = {
  id: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'good'
  group: string; title: string; evidence: string; world: string; fix: string
  files: string[]; impact: string; confidence: string
}
type Bucket = { bucket: string; label: string; fix: string; n: number; share: number;
  codes: { code: string; n: number; label: string }[] }
type Diag = {
  period_days: number
  generated_at: string
  overall: {
    score: number | null; grade: string
    signup_score: number | null; payment_score: number | null
    scored_stages: number; total_stages: number
    opportunity_krw_monthly: number
    bottleneck: { key: string; label: string; score: number; rate: number; opportunity_krw: number } | null
    method: string
  }
  counts: Record<string, number>
  stages: Stage[]
  findings: Finding[]
  evidence: {
    signup_fail_reasons: { reason: string; n: number; people: number }[]
    login_fail_reasons: { reason: string; n: number; people: number }[]
    payment_fail_buckets: Bucket[]
    payment_fail_raw: { reason: string; n: number; people: number }[]
    device: Record<string, any>
  }
  daily: Record<string, any>[]
  arpu_monthly: number
  data_health: {
    events_since: string | null
    event_collection_started: boolean
    window_covered_by_events: boolean
    caveats: string[]
  }
}

const pct = (x: number | null | undefined, d = 1) =>
  x === null || x === undefined ? '—' : `${(x * 100).toFixed(d)}%`
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

/** 점수 색. 회색은 '아직 모름' 전용이며, 그 구분이 이 화면의 핵심이다. */
function scoreTone(score: number | null) {
  if (score === null) return { text: 'text-gray-400', bg: 'bg-gray-100', bar: 'bg-gray-300' }
  if (score >= 70) return { text: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500' }
  if (score >= 50) return { text: 'text-blue-600', bg: 'bg-blue-50', bar: 'bg-blue-500' }
  if (score >= 30) return { text: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500' }
  return { text: 'text-red-600', bg: 'bg-red-50', bar: 'bg-red-500' }
}

const SEVERITY: Record<string, { label: string; cls: string }> = {
  critical: { label: '치명', cls: 'bg-red-100 text-red-700 border-red-200' },
  high: { label: '높음', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { label: '보통', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  low: { label: '낮음', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  good: { label: '양호', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

const CONFIDENCE: Record<string, string> = {
  confident: '표본 충분',
  provisional: '잠정 (표본 적음)',
  unscored: '표본 부족 — 채점 안 함',
  no_benchmark: '세계 벤치마크 없음',
  inconsistent: '측정 축 불일치',
}

function ScoreDial({ label, score, sub }: { label: string; score: number | null; sub?: string }) {
  const tone = scoreTone(score)
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-4xl font-bold ${tone.text}`}>
        {score === null ? '—' : score.toFixed(0)}
        {score !== null && <span className="text-lg text-gray-400 font-normal"> / 100</span>}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-2 break-keep">{sub}</div>}
    </div>
  )
}

/**
 * 구간 막대. 벤치마크 중앙값 자리에 눈금을 그어 "세계 중앙값이 어디인지"를
 * 숫자가 아니라 위치로 보게 한다 — 숫자 두 개를 비교하는 것보다 빠르다.
 */
function StageBar({ s }: { s: Stage }) {
  const tone = scoreTone(s.score)
  // 축은 중앙값의 2배까지. 벤치마크가 없으면 관측값 기준으로 넉넉히.
  const axis = s.benchmark ? Math.max(s.benchmark.great * 1.2, s.benchmark.median * 2) : 1
  const w = (v: number) => `${Math.min(100, (v / axis) * 100)}%`

  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 text-sm">{s.label}</div>
          <div className="text-xs text-gray-500 mt-0.5 break-keep">{s.question}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-xl font-bold ${tone.text}`}>
            {s.score === null ? '—' : s.score.toFixed(0)}
          </div>
          <div className="text-[11px] text-gray-400">{CONFIDENCE[s.confidence] || s.confidence}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 h-6 bg-gray-100 rounded overflow-hidden">
          {s.rate !== null && (
            <div className={`absolute inset-y-0 left-0 ${tone.bar} opacity-80`} style={{ width: w(s.rate) }} />
          )}
          {/* 신뢰구간 — 표본이 적을수록 길어져, 막대 끝을 믿으면 안 된다는 걸 눈으로 보여준다 */}
          {s.ci && (
            <div
              className="absolute inset-y-0 border-x-2 border-gray-500/40"
              style={{ left: w(s.ci[0]), width: `calc(${w(s.ci[1])} - ${w(s.ci[0])})` }}
            />
          )}
          {s.benchmark && (
            <div
              className="absolute inset-y-0 w-0.5 bg-gray-900"
              style={{ left: w(s.benchmark.median) }}
              title={`세계 중앙값 ${pct(s.benchmark.median)}`}
            />
          )}
        </div>
        <div className="w-40 text-right shrink-0">
          <span className="text-sm font-semibold text-gray-900">{pct(s.rate)}</span>
          <span className="text-xs text-gray-500">
            {' '}
            ({s.numer.toLocaleString()}/{s.denom.toLocaleString()})
          </span>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
        {s.benchmark && (
          <span>
            세계 중앙값 <b className="text-gray-700">{pct(s.benchmark.median)}</b> · 상위권{' '}
            {pct(s.benchmark.great)}
          </span>
        )}
        {s.recoverable !== null && s.recoverable > 0 && (
          <span className="text-amber-700">중앙값까지 회복 시 +{s.recoverable.toLocaleString()}명</span>
        )}
        {s.note && <span className="text-gray-500 break-keep">{s.note}</span>}
      </div>
      {s.benchmark && (
        <details className="mt-1">
          <summary className="text-[11px] text-gray-400 cursor-pointer hover:text-gray-600">
            이 기준은 어디서 왔나 (근거 {s.benchmark.grade}급)
          </summary>
          <div className="text-[11px] text-gray-500 mt-1 pl-3 border-l-2 border-gray-200 break-keep">
            {s.benchmark.source}
            {s.benchmark.note && <div className="mt-1 text-gray-400">{s.benchmark.note}</div>}
          </div>
        </details>
      )}
    </div>
  )
}

function FindingCard({ f }: { f: Finding }) {
  const sev = SEVERITY[f.severity] || SEVERITY.low
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-start gap-3 mb-3">
        <span className={`px-2 py-0.5 rounded text-xs font-bold border shrink-0 ${sev.cls}`}>
          {sev.label}
        </span>
        <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 shrink-0">
          {f.confidence}
        </span>
        <h4 className="font-bold text-gray-900 text-sm break-keep">{f.title}</h4>
      </div>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs font-semibold text-gray-500">우리 데이터</dt>
          <dd className="text-gray-800 break-keep">{f.evidence}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">세계 근거</dt>
          <dd className="text-gray-600 break-keep">{f.world}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">할 일</dt>
          <dd className="text-gray-900 break-keep">{f.fix}</dd>
        </div>
        {f.impact && (
          <div>
            <dt className="text-xs font-semibold text-gray-500">기대 효과</dt>
            <dd className="text-amber-700 font-medium break-keep">{f.impact}</dd>
          </div>
        )}
      </dl>
      {f.files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {f.files.map((p) => (
            <code key={p} className="text-[11px] bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">
              {p}
            </code>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GrowthDiagnosticsPanel() {
  const [data, setData] = useState<Diag | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    fetch(`${getApiUrl()}/api/growth/diagnostics?days=${days}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e?.message || e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [days])

  if (loading) return <div className="text-gray-500 py-10 text-center">진단 중…</div>
  if (error)
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">
        진단을 불러오지 못했습니다: {error}
      </div>
    )
  if (!data) return null

  const o = data.overall
  const signup = data.stages.filter((s) => s.group === 'signup')
  const payment = data.stages.filter((s) => s.group === 'payment')
  const buckets = data.evidence.payment_fail_buckets

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">성장 진단</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            세계 SaaS 벤치마크 대비 실시간 점수 · {new Date(data.generated_at).toLocaleString('ko-KR')} 기준
          </p>
        </div>
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

      {/* 수집 상태 — 숫자가 비어 있을 때 '문제 없음'으로 오해하지 않게 맨 위에 */}
      {!data.data_health.event_collection_started && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 break-keep">
          <b>퍼널 이벤트가 아직 수집되지 않았습니다.</b> 프런트를 배포하고 실제 사용자가 가입·결제
          화면을 지나가야 쌓이기 시작합니다. 그전까지 아래 빈 칸은 <b>&lsquo;문제 없음&rsquo;이 아니라
          &lsquo;아직 모름&rsquo;</b> 입니다.
        </div>
      )}
      {data.data_health.event_collection_started && !data.data_health.window_covered_by_events && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 break-keep">
          이벤트 수집은 <b>{data.data_health.events_since}</b> 부터 시작됐습니다. 선택한 기간의
          앞부분은 구조적으로 0 이므로, 그 구간 비율은 실제보다 낮게 나옵니다.
        </div>
      )}

      {/* 점수 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ScoreDial
          label="종합 점수"
          score={o.score}
          sub={`${o.scored_stages}/${o.total_stages} 구간 채점 · ${o.grade}`}
        />
        <ScoreDial label="가입 퍼널" score={o.signup_score} sub="방문 → 가입 → 활성화" />
        <ScoreDial label="결제 퍼널" score={o.payment_score} sub="요금제 → 결제창 → 성공" />
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">중앙값 회복 시 월 매출</div>
          <div className="text-3xl font-bold text-amber-600">
            {o.opportunity_krw_monthly > 0 ? won(o.opportunity_krw_monthly) : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-2 break-keep">
            {o.opportunity_krw_monthly > 0
              ? `단가 ${won(data.arpu_monthly)} 기준 산술 추정`
              : '중앙값 아래인 구간이 없거나 표본이 부족합니다'}
          </div>
        </div>
      </div>

      {/* 병목 — 총점보다 크게 */}
      {o.bottleneck && (
        <div className="bg-gray-900 text-white rounded-xl p-6">
          <div className="text-xs text-gray-400 mb-1">지금 가장 먼저 손댈 곳</div>
          <div className="text-2xl font-bold">{o.bottleneck.label}</div>
          <div className="text-sm text-gray-300 mt-1">
            {o.bottleneck.score.toFixed(0)}점 · 현재 {pct(o.bottleneck.rate)}
            {o.bottleneck.opportunity_krw > 0 && ` · 여기서만 월 ${won(o.bottleneck.opportunity_krw)}`}
          </div>
          <p className="text-xs text-gray-400 mt-3 break-keep">
            평균이 아니라 병목을 따로 뽑는 이유: 한 구간이 벤치마크보다 크게 낮으면 다른 곳을
            아무리 고쳐도 전체가 그 구간에 막혀 움직이지 않습니다.
          </p>
        </div>
      )}

      {/* 처방 */}
      <div>
        <h3 className="font-bold text-gray-900 mb-3">
          처방 ({data.findings.filter((f) => f.severity !== 'good').length}건)
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.findings.map((f) => (
            <FindingCard key={f.id} f={f} />
          ))}
        </div>
      </div>

      {/* 퍼널 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-1">가입 퍼널</h3>
          <p className="text-xs text-gray-500 mb-2">검은 세로선이 세계 중앙값, 회색 괄호가 95% 신뢰구간</p>
          {signup.map((s) => (
            <StageBar key={s.key} s={s} />
          ))}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-1">결제 퍼널</h3>
          <p className="text-xs text-gray-500 mb-2">검은 세로선이 세계 중앙값, 회색 괄호가 95% 신뢰구간</p>
          {payment.map((s) => (
            <StageBar key={s.key} s={s} />
          ))}
        </div>
      </div>

      {/* 실패 사유 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-1">결제가 안 되는 이유</h3>
          <p className="text-xs text-gray-500 mb-4 break-keep">
            토스 오류코드를 처방이 갈리는 묶음으로 접었습니다. <b>&lsquo;그냥 닫았다&rsquo;</b>와{' '}
            <b>&lsquo;카드가 거절됐다&rsquo;</b>는 고칠 곳이 정반대입니다.
          </p>
          {buckets.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">기록된 결제 실패가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {buckets.map((b) => (
                <div key={b.bucket}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-gray-900">{b.label}</span>
                    <span className="text-gray-500">
                      {b.n}건 · {pct(b.share, 0)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded mt-1 overflow-hidden">
                    <div
                      className={`h-full ${
                        b.bucket === 'our_bug' ? 'bg-red-500'
                        : b.bucket === 'user_abort' || b.bucket === 'process_abort' ? 'bg-amber-500'
                        : 'bg-blue-500'
                      }`}
                      style={{ width: `${b.share * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    → {b.fix}
                    <span className="text-gray-400">
                      {' '}
                      ({b.codes.map((c) => c.code).filter(Boolean).join(', ')})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-1">가입이 안 되는 이유</h3>
          <p className="text-xs text-gray-500 mb-4 break-keep">
            화면에서 막힌 것과 서버가 거절한 것을 모두 포함합니다.
          </p>
          {data.evidence.signup_fail_reasons.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">기록된 가입 실패가 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="text-left py-2">사유</th>
                  <th className="text-right py-2">건수</th>
                  <th className="text-right py-2">사람</th>
                </tr>
              </thead>
              <tbody>
                {data.evidence.signup_fail_reasons.map((r) => (
                  <tr key={r.reason} className="border-b border-gray-50">
                    <td className="py-2 font-mono text-xs text-gray-700">{r.reason}</td>
                    <td className="py-2 text-right">{r.n}</td>
                    <td className="py-2 text-right text-gray-500">{r.people}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.evidence.login_fail_reasons.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-500 mb-2">
                로그인 실패 (가입 문제와 섞어 읽으면 안 되는 지표)
              </div>
              <div className="flex flex-wrap gap-2">
                {data.evidence.login_fail_reasons.map((r) => (
                  <span key={r.reason} className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1">
                    {r.reason} {r.n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 이 숫자를 어떻게 읽어야 하는가 */}
      <details className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <summary className="font-semibold text-gray-800 text-sm cursor-pointer">
          이 점수를 어떻게 읽어야 하나
        </summary>
        <div className="mt-3 space-y-2 text-xs text-gray-600">
          <p className="break-keep">{o.method}</p>
          <p className="break-keep">
            구간 점수는 로그오즈 보간입니다 — 세계 중앙값이 50점, 상위권이 90점. 2%→4% 와
            40%→57% 을 같은 크기의 성취로 보기 위해서입니다.
          </p>
          {data.data_health.caveats.map((c, i) => (
            <p key={i} className="break-keep">
              · {c}
            </p>
          ))}
          <p className="break-keep text-gray-500">
            벤치마크가 없다고 표시된 구간(요금제→결제 시작 등)은 실제로 공개된 신뢰할 만한
            기준이 존재하지 않습니다. 업계에 떠도는 숫자는 출처를 따라가면 콘텐츠 마케팅으로
            돌아가므로 채점에 쓰지 않았습니다.
          </p>
        </div>
      </details>
    </div>
  )
}
