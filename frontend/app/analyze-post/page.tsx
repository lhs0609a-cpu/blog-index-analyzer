'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Search,
  Loader2,
  AlertCircle,
  HelpCircle,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { analyzePost, type PostAnalysisResult } from '@/lib/api/blog'
import { useAuthStore } from '@/lib/stores/auth'
import toast from 'react-hot-toast'

export default function AnalyzePostPage() {
  const { user } = useAuthStore()
  const [postUrl, setPostUrl] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PostAnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    if (!postUrl.trim()) {
      toast.error('포스트 URL을 입력하세요')
      return
    }
    if (!postUrl.includes('blog.naver.com') && !postUrl.includes('PostView.naver')) {
      toast.error('네이버 블로그 포스트 URL이어야 합니다')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await analyzePost(postUrl.trim(), keyword.trim(), user?.id)
      setResult(data)
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || '분석 실패'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4">
        <Link
          href="/analyze"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          블로그 분석으로 돌아가기
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2">포스트 단위 진단</h1>
          <p className="text-gray-600">
            개별 블로그 글 1개를 D.I.A.+ 6신호로 진단합니다. 블로그 평균이 아닌 문서 단위 측정.
          </p>
        </motion.div>

        {/* 입력 폼 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100 mb-6"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                포스트 URL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://blog.naver.com/blogId/123456789"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0064FF] focus:border-transparent outline-none"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                타겟 키워드{' '}
                <span className="text-xs text-gray-400 font-normal">
                  (제목 매칭, 본문 밀도, 카테고리 분류에 사용)
                </span>
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 강남 맛집"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0064FF] focus:border-transparent outline-none"
                disabled={loading}
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full py-3 px-4 bg-[#0064FF] text-white rounded-xl font-bold hover:shadow-lg hover:shadow-[#0064FF]/20 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  포스트 진단
                </>
              )}
            </button>
          </div>
        </motion.div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">{error}</div>
          </div>
        )}

        {result && <PostResultView data={result} />}
      </div>
    </div>
  )
}

function PostResultView({ data }: { data: PostAnalysisResult }) {
  const ps = data.post_score || ({} as any)
  const a = data.analysis || ({} as any)

  const signals = [
    {
      key: 'title_match',
      name: '제목 매칭',
      score: ps.title_match,
      help: '제목에 타겟 키워드가 들어갔는지, 위치는 앞쪽인지',
    },
    {
      key: 'keyword_density',
      name: '키워드 밀도',
      score: ps.keyword_density,
      help: '본문 키워드 밀도 (1.5~3% 적정)',
    },
    {
      key: 'content_richness',
      name: '콘텐츠 풍부도',
      score: ps.content_richness,
      help: '본문 길이 + 이미지 + 동영상 결합',
    },
    {
      key: 'structural',
      name: '구조화',
      score: ps.structural,
      help: '문단 / 소제목 비율',
    },
    {
      key: 'engagement',
      name: '인게이지먼트',
      score: ps.engagement,
      help: '공감 + 댓글 수',
    },
    {
      key: 'freshness',
      name: '신선도',
      score: ps.freshness,
      help: '작성일로부터 경과 시간',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* 종합 점수 */}
      <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">포스트 진단 점수</div>
            <div className="text-5xl font-black text-[#0064FF]">
              {ps.total?.toFixed(0) ?? '-'}
              <span className="text-2xl text-gray-400 font-normal">/100</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">감지된 카테고리</div>
            <div className="text-lg font-bold text-gray-900">{data.category}</div>
          </div>
        </div>
      </div>

      {/* B-2 lifecycle (등록된 포스트일 때만) */}
      {data.lifecycle && data.lifecycle.tracked_days > 0 && (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="text-sm font-bold text-purple-900">📊 시계열 lifecycle (이 포스트)</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {data.lifecycle.tracked_days}일간 측정 / {data.lifecycle.samples}회 측정
              </div>
            </div>
            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded font-medium">
              B-2 검증 기반
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">인덱싱 지연</div>
              <div className="text-xl font-bold text-gray-900">
                {data.lifecycle.indexing_delay_days !== null
                  ? `${data.lifecycle.indexing_delay_days}일`
                  : '—'}
              </div>
              <div className="text-[10px] text-gray-400">발행→첫 노출</div>
            </div>
            <div className="bg-white rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">노출 유지율</div>
              <div className="text-xl font-bold text-gray-900">
                {(data.lifecycle.exposure_rate * 100).toFixed(0)}%
              </div>
              <div className="text-[10px] text-gray-400">측정일 중 노출일</div>
            </div>
            <div className="bg-white rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">최대 연속 노출</div>
              <div className="text-xl font-bold text-gray-900">
                {data.lifecycle.max_consecutive_exposure_days}일
              </div>
              <div className="text-[10px] text-gray-400">연속 노출 최장</div>
            </div>
            <div className="bg-white rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">누락 전환</div>
              <div className="text-xl font-bold text-gray-900">
                {data.lifecycle.drop_count}회
              </div>
              <div className="text-[10px] text-gray-400">노출→누락</div>
            </div>
          </div>
          {data.lifecycle.first_indexed_at === null && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              ⚠️ 한 번도 SERP에 노출된 적 없음. 저품질 또는 색인 누락 의심.
            </div>
          )}
        </div>
      )}

      {/* 카테고리별 검증된 신호 가이드 */}
      {data.validated_signals_for_category && data.validated_signals_for_category.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="text-sm font-bold text-blue-900 mb-2">
            🎯 「{data.category}」 카테고리에서 SERP와 통계적으로 검증된 신호
          </div>
          <div className="space-y-2">
            {data.validated_signals_for_category.map((s) => (
              <div key={s.signal} className="bg-white rounded-lg p-3 border border-blue-100">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <code className="text-sm font-mono text-blue-700">{s.signal}</code>
                  <span className="text-xs text-gray-500">
                    Spearman ρ = <strong className="text-green-600">{s.rho}</strong>
                  </span>
                </div>
                <div className="text-sm text-gray-700 mt-1">{s.guide}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6신호 점수 */}
      <div className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
        <h3 className="text-lg font-bold text-gray-900 mb-4">6신호 분리 측정</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {signals.map((sig) => {
            const v = sig.score ?? 0
            const color =
              v >= 80
                ? 'text-green-600'
                : v >= 60
                ? 'text-blue-600'
                : v >= 40
                ? 'text-yellow-600'
                : 'text-red-600'
            const barColor =
              v >= 80
                ? 'bg-green-500'
                : v >= 60
                ? 'bg-blue-500'
                : v >= 40
                ? 'bg-yellow-500'
                : 'bg-red-500'
            return (
              <div key={sig.key} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-gray-900">{sig.name}</span>
                    <div className="group relative">
                      <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                      <div className="absolute left-0 bottom-full mb-2 w-60 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-xl">
                        {sig.help}
                      </div>
                    </div>
                  </div>
                  <span className={`text-2xl font-bold ${color}`}>
                    {v.toFixed(0)}
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${barColor} rounded-full transition-all duration-500`}
                    style={{ width: `${v}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Raw 측정값 */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono uppercase tracking-wider text-gray-500">
            raw measurements
          </span>
          <span className="text-xs text-gray-400">
            실측값 ({a.fetch_method || '?'})
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {[
            { label: '본문 길이', value: a.content_length, unit: '자' },
            { label: '이미지 수', value: a.image_count, unit: '개' },
            { label: '동영상 수', value: a.video_count, unit: '개' },
            { label: '소제목 수', value: a.heading_count, unit: '개' },
            { label: '문단 수', value: a.paragraph_count, unit: '개' },
            { label: '공감 수', value: a.like_count, unit: '개' },
            { label: '댓글 수', value: a.comment_count, unit: '개' },
            { label: '키워드 등장', value: a.keyword_count, unit: '회' },
            { label: '키워드 밀도', value: a.keyword_density, unit: '/1000자' },
            { label: '작성 경과일', value: a.post_age_days, unit: '일' },
            { label: '제목 키워드 매칭', value: a.title_has_keyword ? 'O' : 'X', unit: '' },
            { label: '지도 포함', value: a.has_map ? 'O' : 'X', unit: '' },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-lg p-2.5 border border-gray-100">
              <div className="text-gray-500 mb-0.5">{m.label}</div>
              <div className="font-mono font-semibold text-gray-900">
                {m.value === null || m.value === undefined ? '—' : `${m.value}${m.unit}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700">
            <strong className="text-amber-900">주의:</strong> {data.disclaimer}
          </div>
        </div>
      </div>

      {/* 원문 링크 */}
      <a
        href={data.post_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-[#0064FF] hover:underline"
      >
        <ExternalLink className="w-4 h-4" />
        원본 포스트 보기
      </a>
    </motion.div>
  )
}
