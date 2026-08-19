'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import { getApiUrl } from '@/lib/api/apiConfig'

type Check = { field: string; mine: number | string; target: number | string; unit: string; ok: boolean }
type Gap = { field: string; mine: number; target: number; shortfall: number; unit: string; advice: string }
type Baseline = {
  keyword: string | null
  samples: number
  avg_content_length: number
  avg_image_count: number
  avg_heading_count: number
}
type Result = {
  ok: boolean
  keyword: string
  metrics: Record<string, number | boolean>
  baseline: Baseline | null
  baseline_is_global: boolean
  checks: Check[]
  gaps: Gap[]
  readiness: number
  verdict: 'ready' | 'almost' | 'not_ready'
  verdict_label: string
  note: string
}

const FIELD_LABEL: Record<string, string> = {
  content_length: '본문 글자수',
  image_count: '이미지',
  heading_count: '소제목',
  title_has_keyword: '제목에 키워드',
  keyword_density: '키워드 밀도',
}

const VERDICT_STYLE: Record<string, { ring: string; text: string; bg: string }> = {
  ready: { ring: 'border-emerald-300', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  almost: { ring: 'border-amber-300', text: 'text-amber-700', bg: 'bg-amber-50' },
  not_ready: { ring: 'border-red-300', text: 'text-red-700', bg: 'bg-red-50' },
}

export default function DraftCheckClient() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [keyword, setKeyword] = useState('')
  const [images, setImages] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    if (!content.trim() || !keyword.trim() || busy) return
    setBusy(true)
    setErr(null)
    setRes(null)
    try {
      const r = await fetch(`${getApiUrl()}/api/blogs/draft-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          keyword: keyword.trim(),
          image_count: Number(images) || 0,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`)
      setRes(data)
    } catch (e: any) {
      setErr(e?.message || '진단에 실패했습니다')
    } finally {
      setBusy(false)
    }
  }

  const v = res ? VERDICT_STYLE[res.verdict] : null
  const charCount = content.replace(/\s+/g, '').length

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F5F7FA] to-white">
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">발행 전 원고 진단</h1>
          <p className="text-gray-500 leading-relaxed">
            올리기 전에 확인하세요. 그 키워드 1페이지에 있는 글들과
            <br className="hidden sm:block" />
            내 원고가 무엇이 다른지 <b>숫자로</b> 보여줍니다.
          </p>
        </div>

        <div className="glass-3d p-6 mb-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">목표 키워드</label>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 강남 피부과"
                className="toss-input"
                disabled={busy}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이미지 개수 <span className="text-gray-400 font-normal">(원고에 넣을 사진 수)</span>
              </label>
              <input
                type="number"
                min={0}
                value={images}
                onChange={(e) => setImages(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="예: 8"
                className="toss-input"
                disabled={busy}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="발행할 제목을 그대로 넣으세요"
              className="toss-input"
              disabled={busy}
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">본문</label>
              <span className="text-xs text-gray-400">공백 제외 {charCount.toLocaleString()}자</span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="작성한 원고를 그대로 붙여넣으세요. 서식은 사라져도 괜찮습니다."
              rows={12}
              className="toss-input resize-y font-normal"
              disabled={busy}
            />
          </div>

          <button
            onClick={run}
            disabled={busy || !content.trim() || !keyword.trim()}
            className="toss-btn-primary w-full py-3 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '진단하기'}
          </button>
          <p className="text-xs text-gray-500">
            원고는 진단에만 쓰이고 저장하지 않습니다. 결과는 즉시 나옵니다.
          </p>
        </div>

        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-6">
            {err}
          </div>
        )}

        {res?.ok && (
          <div className="space-y-6">
            <div className={`rounded-2xl border-2 p-6 ${v?.ring} ${v?.bg}`}>
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <div>
                  <div className="text-xs text-gray-500 mb-1">판정</div>
                  <div className={`text-2xl font-bold ${v?.text}`}>{res.verdict_label}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">기준 충족</div>
                  <div className="text-3xl font-bold text-gray-900">{res.readiness}%</div>
                </div>
              </div>
              {res.baseline && (
                <p className="text-sm text-gray-700 mt-4 leading-relaxed">
                  {res.baseline_is_global ? (
                    <>
                      <b>{res.keyword}</b> 는 아직 측정 전이라 <b>전체 1페이지 평균</b>과
                      비교했습니다.
                    </>
                  ) : (
                    <>
                      <b>{res.keyword}</b> 1페이지 글 {res.baseline.samples}개의 실측 평균과
                      비교했습니다.
                    </>
                  )}
                </p>
              )}
            </div>

            {/* 항목별 대조 */}
            <div className="glass-3d p-6">
              <h2 className="font-bold mb-4">항목별 비교</h2>
              <ul className="space-y-3">
                {res.checks.map((c) => (
                  <li key={c.field} className="flex items-center justify-between text-sm gap-3">
                    <span className="flex items-center gap-2 min-w-0">
                      {c.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <span className="text-gray-800">{FIELD_LABEL[c.field] || c.field}</span>
                    </span>
                    <span className={c.ok ? 'text-gray-500' : 'text-amber-700 font-medium'}>
                      내 원고 {String(c.mine)}
                      {c.unit} · 1페이지 {String(c.target)}
                      {c.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 무엇을 고칠지 */}
            {res.gaps.length > 0 && (
              <div className="glass-3d p-6">
                <h2 className="font-bold mb-1">이걸 고치세요</h2>
                <p className="text-xs text-gray-500 mb-4">부족한 것만 골랐습니다</p>
                <ul className="space-y-4">
                  {res.gaps.map((g) => (
                    <li key={g.field}>
                      <div className="text-sm font-medium text-gray-900">
                        {FIELD_LABEL[g.field] || g.field}
                        {g.shortfall > 0 && (
                          <span className="text-amber-700">
                            {' '}
                            — {g.shortfall.toLocaleString()}
                            {g.unit} 더 필요
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1 leading-relaxed">{g.advice}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="glass-3d p-6">
              <p className="text-sm text-gray-600 leading-relaxed">{res.note}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/keyword-check" className="toss-btn-primary px-4 py-2 text-sm">
                  이 키워드로 될지 판정하기
                </Link>
                <Link
                  href="/blog-check"
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white font-medium inline-flex items-center gap-1"
                >
                  내 블로그 노출 상태 확인 <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
