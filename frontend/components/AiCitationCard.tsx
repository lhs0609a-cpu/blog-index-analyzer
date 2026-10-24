'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Loader2, Quote, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { checkAiCitation, type AiCitationResult } from '@/lib/api/aiCitation'

/**
 * "이 키워드의 AI 답변이 누구를 인용했나 — 거기 내가 있나"
 *
 * 2026년 네이버는 블로그를 'AI가 인용할 답변 단위'로 재정의했다. 검색 맨 위에
 * AI 브리핑이 붙고, 거기 인용되지 않으면 1위여도 사람 눈에 먼저 닿지 않는다.
 * 아직 아무도 이걸 알려주지 않는다.
 *
 * 문구 규칙: **'AI 답변이 없는 키워드'와 '인용되지 않았다'는 다른 말이다.**
 * 서버가 두 값(has_ai_answer, cited)을 따로 주는 이유가 그것이고, 이 화면에서
 * 둘을 뭉치면 없는 것을 있다고 말하게 된다.
 */
export default function AiCitationCard({ blogId }: { blogId: string }) {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AiCitationResult | null>(null)

  const run = async () => {
    const kw = keyword.trim()
    if (!kw) return
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent('/analyze?blogId=' + blogId)}`)
      return
    }
    setLoading(true)
    try {
      setData(await checkAiCitation(kw, blogId))
    } catch (error) {
      // 한도(429)와 과부하(429)는 다른 말을 해야 한다 — 서버가 error_code 로 가른다.
      // axios 에러이므로 fetch 용 readLimitHit 을 쓸 수 없다.
      const e = error as {
        response?: { status?: number; data?: { detail?: { error_code?: string; message?: string } } }
      }
      const detail = e?.response?.data?.detail
      if (e?.response?.status === 429 && detail?.error_code === 'DAILY_LIMIT_EXCEEDED') {
        toast.error(detail.message ?? '오늘 조회 한도를 모두 쓰셨습니다')
        router.push('/pricing')
        return
      }
      toast.error('AI 답변을 읽지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <Quote className="w-5 h-5 text-[#0064FF]" strokeWidth={1.8} />
        <h3 className="font-bold text-gray-900">AI 답변이 인용한 글</h3>
      </div>
      <p className="text-sm text-gray-600 mb-4 leading-relaxed">
        네이버 검색 맨 위의 AI 브리핑이 어떤 글을 출처로 썼는지 확인합니다. 거기
        인용되지 않으면 순위가 좋아도 먼저 읽히지 않습니다.
      </p>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') run()
            }}
            placeholder="확인할 검색어"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#0064FF]"
          />
        </div>
        <button
          onClick={run}
          disabled={loading || !keyword.trim()}
          className="px-4 py-2.5 rounded-xl bg-[#0064FF] text-white font-bold text-sm hover:bg-[#0050CC] disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '확인'}
        </button>
      </div>

      {data && (
        <div>
          {!data.has_ai_answer ? (
            /* 인용 실패가 아니다. 이 키워드에 AI 브리핑 자체가 붙지 않는다. */
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700">
              <strong>‘{data.keyword}’에는 AI 답변이 붙지 않습니다.</strong>
              <span className="block text-gray-500 mt-0.5">
                인용되지 않은 것이 아니라, 이 검색어에 AI 브리핑이 없습니다. 지금은
                정보성 질문에 주로 붙습니다.
              </span>
            </div>
          ) : (
            <>
              <div
                className={`rounded-xl px-4 py-3 mb-3 text-sm border ${
                  data.cited
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {data.cited ? (
                  <>
                    <strong>인용됐습니다.</strong> 출처 {data.source_count}개 중{' '}
                    {data.my_citations.map((c) => `${c.order}번`).join(' · ')}이 이
                    블로그 글입니다.
                  </>
                ) : (
                  <>
                    <strong>이 블로그는 인용되지 않았습니다.</strong> 출처{' '}
                    {data.source_count}개 중 네이버 블로그가 {data.blog_source_count}개
                    입니다.
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                {data.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-sm hover:border-gray-300 ${
                      s.blog_id === blogId
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-white border-gray-100'
                    }`}
                  >
                    <span className="shrink-0 w-5 text-center text-xs font-bold text-gray-400 mt-0.5">
                      {s.order ?? i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-gray-900 line-clamp-1">{s.title}</span>
                      <span className="block text-xs text-gray-400">
                        {s.is_naver_blog ? `blog.naver.com/${s.blog_id}` : s.platform}
                        {s.blog_id === blogId && (
                          <span className="ml-1 text-emerald-600 font-bold">내 글</span>
                        )}
                      </span>
                    </span>
                    <ExternalLink className="w-3 h-3 shrink-0 mt-1 opacity-40" />
                  </a>
                ))}
              </div>
            </>
          )}

          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            {data.note}
            {data.cached && ' (최근 조회 결과를 재사용했습니다)'}
          </p>
        </div>
      )}
    </div>
  )
}
