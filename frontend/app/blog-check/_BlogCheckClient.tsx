'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Loader2, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from 'lucide-react'
import { getApiUrl } from '@/lib/api/apiConfig'

type Post = {
  title: string
  url: string
  indexed: boolean
  blog_tab_rank: number | null
  view_tab_rank: number | null
}

type Result = {
  ok: boolean
  blog_id?: string
  grade?: 'healthy' | 'watch' | 'degraded' | 'critical'
  grade_label?: string
  message?: string
  index_rate?: number
  checked_posts?: number
  indexed_posts?: number
  missing_posts?: number
  buried_posts?: number
  newest_post_age_hours?: number | null
  newest_post_indexed?: boolean | null
  reasons?: string[]
  actions?: string[]
  posts?: Post[]
  level_label?: string
  disclaimer?: string
  error?: string
}

const GRADE_STYLE: Record<string, { ring: string; text: string; bg: string }> = {
  healthy: { ring: 'border-emerald-300', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  watch: { ring: 'border-amber-300', text: 'text-amber-700', bg: 'bg-amber-50' },
  degraded: { ring: 'border-orange-300', text: 'text-orange-700', bg: 'bg-orange-50' },
  critical: { ring: 'border-red-300', text: 'text-red-700', bg: 'bg-red-50' },
}

export default function BlogCheckClient() {
  const [blogId, setBlogId] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    const id = blogId.trim()
    if (!id || busy) return
    setBusy(true)
    setErr(null)
    setRes(null)
    try {
      const r = await fetch(`${getApiUrl()}/api/blogs/search-health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_id: id, sample_size: 10 }),
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

  const g = res?.grade ? GRADE_STYLE[res.grade] : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F5F7FA] to-white">
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">블로그 저품질 확인</h1>
          <p className="text-gray-500 leading-relaxed">
            내 글이 네이버 검색에 실제로 나오는지 확인합니다.
            <br className="hidden sm:block" />
            흔히 &apos;저품질&apos;이라 부르는 상태를 추측이 아니라 <b>실제 색인 결과</b>로 봅니다.
          </p>
        </div>

        <div className="glass-3d p-6 mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={blogId}
                onChange={(e) => setBlogId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && run()}
                placeholder="블로그 아이디 (예: example_blog)"
                className="toss-input !pl-9 w-full"
                disabled={busy}
              />
            </div>
            <button
              onClick={run}
              disabled={busy || !blogId.trim()}
              className="toss-btn-primary px-6 disabled:opacity-50 whitespace-nowrap"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '진단'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            최근 글 10개의 제목을 그대로 검색해 노출 여부를 확인합니다. 약 6초 걸립니다.
          </p>
        </div>

        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-6">
            {err}
          </div>
        )}

        {res && !res.ok && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-6">
            {res.message || '진단할 수 없습니다.'}
          </div>
        )}

        {res?.ok && (
          <div className="space-y-6">
            {/* 판정 */}
            <div className={`rounded-2xl border-2 p-6 ${g?.ring} ${g?.bg}`}>
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <div>
                  <div className="text-xs text-gray-500 mb-1">검색 노출 상태</div>
                  <div className={`text-3xl font-bold ${g?.text}`}>{res.grade_label}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">색인률</div>
                  <div className="text-3xl font-bold text-gray-900">{res.index_rate}%</div>
                  <div className="text-xs text-gray-500">
                    {res.indexed_posts}/{res.checked_posts}개 노출
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-700 mt-4 leading-relaxed">{res.message}</p>
            </div>

            {/* 근거 */}
            <div className="glass-3d p-6">
              <h2 className="font-bold mb-3">이렇게 판단했습니다</h2>
              <ul className="space-y-2 text-sm text-gray-700">
                {res.reasons?.map((r, i) => (
                  <li key={i} className="flex gap-2 leading-relaxed">
                    <span className="text-[#0064FF] shrink-0">·</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 글별 결과 */}
            <div className="glass-3d p-6">
              <h2 className="font-bold mb-1">글별 노출 결과</h2>
              <p className="text-xs text-gray-500 mb-4">
                제목을 그대로 검색했을 때 내 글이 나오는지
              </p>
              <ul className="space-y-2">
                {res.posts?.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {p.indexed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <span className="flex-1 min-w-0">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-gray-800 hover:underline break-words"
                      >
                        {p.title}
                      </a>
                    </span>
                    <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
                      {p.indexed
                        ? p.blog_tab_rank
                          ? `블로그탭 ${p.blog_tab_rank}위`
                          : '노출'
                        : '검색 안 됨'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 조치 */}
            <div className="glass-3d p-6">
              <h2 className="font-bold mb-3">무엇을 하면 되나</h2>
              <ul className="space-y-2 text-sm text-gray-700">
                {res.actions?.map((a, i) => (
                  <li key={i} className="flex gap-2 leading-relaxed">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/analyze" className="toss-btn-primary px-4 py-2 text-sm">
                  내 블로그 전체 지표 보기
                </Link>
                <Link
                  href="/keyword-check"
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white font-medium inline-flex items-center gap-1"
                >
                  이 블로그로 될 키워드 찾기 <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {res.disclaimer && (
              <p className="text-xs text-gray-400 leading-relaxed">{res.disclaimer}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
