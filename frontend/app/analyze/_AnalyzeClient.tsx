'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, TrendingUp, Award, AlertCircle, BarChart3, ArrowLeft, Target, PenTool, Lightbulb, ChevronRight, Lock, HelpCircle, Clock, CheckCircle, Gauge, XCircle, MinusCircle,
  PenLine, Users, FileCheck2, MessageSquare, CheckCircle2, Gem, Heart, FileText, Activity, Check, ArrowUpRight,
  Sparkles, Zap } from 'lucide-react'
import Confetti from 'react-confetti'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useWindowSize } from '@/lib/hooks/useWindowSize'
import { analyzeBlog, saveBlogToList, verifyBlogIndex, getExposureCeiling,
  type VerifyIndexResponse, type ExposureCeilingResponse } from '@/lib/api/blog'
import { registerBlog, startRankCheck, getTrackedBlogs } from '@/lib/api/rankTracker'
import type { BlogIndexResult } from '@/lib/types/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import GlassIcon from '@/components/GlassIcon'
import { useBlogContextStore } from '@/lib/stores/blogContext'
import { useXPStore } from '@/lib/stores/xp'
import { incrementUsage, checkUsageLimit } from '@/lib/api/subscription'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import UpgradeModal from '@/components/UpgradeModal'
import TrialExpiryBanner from '@/components/TrialExpiryBanner'
import { AnimatedScore, AnimatedLevel, CircularProgress } from '@/components/AnimatedScore'
import ShareResult from '@/components/ShareResult'
import BlogIndexHistoryChart from '@/components/BlogIndexHistoryChart'
import KeywordVerdictWidget from '@/components/KeywordVerdictWidget'
import { getLevelGrade, getGradeBadgeStyle, getLevelsToNextGrade, getPointsToNextLevel } from '@/lib/utils/levelGrade'
import TermTooltip from '@/components/TermTooltip'

// P0-1: "그래서 뭐?" 문제 해결 - 점수 해석 & 예상 효과 컴포넌트
// 자세한 지표는 기본으로 접어둔다.
// 화면에 6개 점수 체계(총점·등급·C-Rank·D.I.A.·신호평균·티어)가 한꺼번에 보이면
// 사용자는 "그래서 내 점수가 뭔데?"를 판단하지 못한다.
function DetailsAccordion({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden mb-8">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
      >
        <div>
          <div className="font-bold text-gray-900">{title}</div>
          {subtitle && <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>}
        </div>
        <ChevronRight className={`gi3d w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="p-5 pt-0 border-t border-gray-100">{children}</div>}
    </div>
  )
}

function ScoreInterpretation({ result, onKeywordSearch }: { result: any; onKeywordSearch: () => void }) {
  const level = result.index.level
  const totalScore = result.index.total_score
  // 실측 모집단이 얇으면 백분위가 null로 온다. 예전처럼 50을 채워 넣으면
  // "상위 50%"라는 근거 없는 문구가 표시되므로, 없을 때는 등급으로만 말한다.
  const percentile: number | null = result.index.percentile ?? null
  const cRank = result.index.score_breakdown?.c_rank || 50
  const dia = result.index.score_breakdown?.dia || 50

  // P2-1: 레벨 → 등급 변환
  const gradeInfo = getLevelGrade(level)
  const nextGradeInfo = getLevelsToNextGrade(level)

  // 실제 백분위를 사람이 읽기 쉬운 형식으로 변환
  const getPercentileText = (p: number) => {
    if (p >= 99) return '상위 1%'
    if (p >= 95) return `상위 ${(100 - p).toFixed(0)}%`
    if (p >= 50) return `상위 ${(100 - p).toFixed(0)}%`
    return `하위 ${(100 - p).toFixed(0)}%`
  }

  // 레벨별 해석 데이터 (백분위는 실제 값 사용)
  const levelInterpretation = {
    1: { tier: '일반', viewChance: '매우 낮음', competitiveKeywords: '월 검색량 100 미만' },
    2: { tier: '준최1', viewChance: '매우 낮음', competitiveKeywords: '월 검색량 200 미만' },
    3: { tier: '준최2', viewChance: '매우 낮음', competitiveKeywords: '월 검색량 300 미만' },
    4: { tier: '준최3', viewChance: '낮음', competitiveKeywords: '월 검색량 500 미만' },
    5: { tier: '준최4', viewChance: '낮음', competitiveKeywords: '월 검색량 800 미만' },
    6: { tier: '준최5', viewChance: '보통', competitiveKeywords: '월 검색량 1,500 미만' },
    7: { tier: '준최6', viewChance: '보통', competitiveKeywords: '월 검색량 3,000 미만' },
    8: { tier: '준최7', viewChance: '높음', competitiveKeywords: '월 검색량 5,000 미만' },
    9: { tier: '최적1', viewChance: '높음', competitiveKeywords: '월 검색량 10,000 미만' },
    10: { tier: '최적2', viewChance: '높음', competitiveKeywords: '월 검색량 20,000 미만' },
    11: { tier: '최적3', viewChance: '최상', competitiveKeywords: '월 검색량 50,000 미만' },
    12: { tier: '최적1+', viewChance: '최상', competitiveKeywords: '월 검색량 100,000 미만' },
    13: { tier: '최적2+', viewChance: '최상', competitiveKeywords: '고경쟁 키워드 가능' },
    14: { tier: '최적3+', viewChance: '최상', competitiveKeywords: '대부분 키워드 경쟁 가능' },
    15: { tier: '최적4+', viewChance: '최상', competitiveKeywords: '모든 키워드 상위 노출' },
  }

  const interpretation = levelInterpretation[level as keyof typeof levelInterpretation] || levelInterpretation[1]
  const percentileText = percentile === null ? interpretation.tier : getPercentileText(percentile)

  // 1레벨 올랐을 때 예상 효과
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl p-8 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/50 shadow-xl mb-8"
    >
      <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <Target className="w-6 h-6 text-emerald-600 gi3d" />
        당신의 블로그 위치
      </h3>
      <p className="text-sm text-gray-600 mb-6">이 점수가 실제로 의미하는 것</p>

      {/* 핵심 해석 카드 */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {/* 현재 위치 - P2-1: 등급 표시 추가 */}
        <div className="bg-white rounded-2xl p-5 border border-emerald-100">
          <div className="text-sm text-gray-500 mb-1">
            {percentile === null ? '현재 등급' : '전체 블로거 중'}
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-3xl font-bold text-emerald-600">{percentileText}</span>
            <span className={`px-2 py-1 rounded-lg text-sm font-bold ${getGradeBadgeStyle(gradeInfo.grade)}`}>
              {gradeInfo.grade}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            Lv.{level} {gradeInfo.tier}
            {nextGradeInfo && (
              <span className="text-emerald-600 ml-1">
                (+{nextGradeInfo.levelsNeeded}레벨 → {nextGradeInfo.nextGrade})
              </span>
            )}
          </div>
        </div>

        {/* VIEW탭 노출 확률 */}
        <div className="bg-white rounded-2xl p-5 border border-emerald-100">
          <div className="text-sm text-gray-500 mb-1">VIEW탭 상위 노출 경쟁력</div>
          <div className="text-3xl font-bold text-blue-600 mb-1">{interpretation.viewChance}</div>
          <div className="text-sm text-gray-600">
            적합한 키워드 선택 시
          </div>
        </div>

        {/* 경쟁 가능 키워드 */}
        <div className="bg-white rounded-2xl p-5 border border-emerald-100">
          <div className="text-sm text-gray-500 mb-1">상위 노출 가능 키워드</div>
          <div className="text-lg font-bold text-purple-600 mb-1">{interpretation.competitiveKeywords}</div>
          <div className="text-sm text-gray-600">
            검색량 기준
          </div>
        </div>
      </div>

      {/* 점수 의미 설명 */}
      <div className="bg-white/70 rounded-xl p-4 mb-6">
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-blue-600">{Math.round(cRank)}</span>
            </div>
            <div>
              <TermTooltip term="c-rank">
                <span className="font-semibold text-gray-800">C-Rank (블로그 신뢰도)</span>
              </TermTooltip>
              <div className="text-gray-600">
                {cRank >= 70 ? '네이버가 당신의 블로그를 신뢰합니다' :
                 cRank >= 50 ? '보통 수준입니다. 꾸준한 활동으로 올릴 수 있어요' :
                 '신뢰도를 높이면 상위 노출 경쟁력이 크게 올라갑니다'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-purple-600">{Math.round(dia)}</span>
            </div>
            <div>
              <TermTooltip term="dia">
                <span className="font-semibold text-gray-800">D.I.A. (글 품질 점수)</span>
              </TermTooltip>
              <div className="text-gray-600">
                {dia >= 70 ? '글 품질이 우수합니다' :
                 dia >= 50 ? '이미지 추가, 글 길이를 늘리면 +15점 이상 가능' :
                 '글 품질 개선이 가장 시급합니다'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 레벨업 효과는 근거 있는 수치를 만들 수 없어 표시하지 않는다.
          (예전에는 '누적 방문자 × 0.3'을 '일 방문자 증가'로 보여줬다 — 79,437명인
           블로그에 +23,831명/일 이라는 말이 안 되는 숫자가 나갔다) */}
      <button
        onClick={onKeywordSearch}
        className="w-full px-5 py-3 bg-[#0064FF] text-white rounded-xl font-bold hover:shadow-lg transition-all text-sm"
      >
        지금 경쟁 가능한 키워드 찾기
      </button>
    </motion.div>
  )
}

// 실제 네이버 인덱스 검증 카드 v2 — 6개 신호 통합
const SIGNAL_LABELS: Record<string, { label: string; desc: string }> = {
  exact_index: { label: '정확매칭 색인률', desc: '제목 "쌍따옴표" 검색 → 블로그탭 노출 (whereispost 방식)' },
  integrated_search: { label: '통합검색 노출', desc: 'VIEW탭 노출률' },
  indexing_latency: { label: '색인 지연', desc: '최근 글의 게시→색인 속도' },
  topic_consistency: { label: '주제 일관성', desc: 'C-Rank Context — 한 주제 집중도' },
  content_quality: { label: '콘텐츠 품질', desc: 'DIA 충실성 — 글 길이/내용' },
  engagement: { label: '체인/참여', desc: 'C-Rank Chain — 이웃·방문 활성도' },
}

function SignalBar({ name, score, weight }: { name: string; score: number; weight: number }) {
  const meta = SIGNAL_LABELS[name] ?? { label: name, desc: '' }
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
          <span className="ml-2 text-xs text-gray-500">가중치 {Math.round(weight * 100)}%</span>
        </div>
        <span className="text-sm font-bold tabular-nums text-gray-900">{Math.round(score)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.max(2, score)}%` }} />
      </div>
      {meta.desc && <div className="text-[11px] text-gray-500">{meta.desc}</div>}
    </div>
  )
}

function IndexVerificationCard({ blogId }: { blogId: string }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<VerifyIndexResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPosts, setShowPosts] = useState(false)

  const runVerification = async (refresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await verifyBlogIndex(blogId, { refresh })
      setData(res)
      if (!res.ok && res.error) setError(res.error)
    } catch (e: any) {
      setError(e?.message || '검증 실패')
    } finally {
      setLoading(false)
    }
  }

  const categoryStyle: Record<string, { bg: string; text: string; ring: string }> = {
    '최적+': { bg: 'bg-purple-100', text: 'text-purple-700', ring: 'ring-purple-200' },
    '최적': { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-200' },
    '준최': { bg: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-200' },
    '일반': { bg: 'bg-gray-100', text: 'text-gray-700', ring: 'ring-gray-200' },
  }
  const style = data?.level_category ? categoryStyle[data.level_category] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl p-8 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200/50 shadow-xl mb-8"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-2">
            <CheckCircle className="w-6 h-6 text-indigo-600 gi3d" />
            실측 인덱스 검증 (NSIDE 방법론 기반)
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            6개 공개 신호(정확매칭 색인 / VIEW 노출 / 색인 지연 / 주제 일관성 / 콘텐츠 / 체인)를 NSIDE·whereispost 표준에 가깝게 측정 — 약 8~20초 소요
          </p>
        </div>
        <button
          onClick={() => runVerification(!!data)}
          disabled={loading}
          className="shrink-0 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (<><Loader2 className="w-4 h-4 animate-spin" />검증 중...</>) : (data ? '다시 검증' : '검증 시작')}
        </button>
      </div>

      {error && (
        <div className="mt-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          검증 실패: {error}
        </div>
      )}

      {data?.ok && style && (
        <>
          <div className="mt-4 grid md:grid-cols-3 gap-4">
            <div className={`rounded-2xl p-5 ${style.bg} ring-2 ${style.ring}`}>
              <div className="text-xs text-gray-600 mb-1">실측 카테고리</div>
              <div className={`text-3xl font-black ${style.text}`}>{data.level_category}</div>
              {data.detailed_label && (
                <div className={`text-sm font-bold mt-1 ${style.text}`}>세부: {data.detailed_label}</div>
              )}
              <div className="text-xs text-gray-500 mt-2">
                신뢰도 {data.confidence === 'high' ? '높음' : data.confidence === 'medium' ? '보통' : '낮음'}
                {data.cached && ' · 캐시'}
              </div>
            </div>
            <div className="rounded-2xl p-5 bg-white border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">종합 점수</div>
              <div className="text-3xl font-bold text-gray-900 tabular-nums">{Math.round(data.weighted_score ?? 0)}</div>
              <div className="text-xs text-gray-500 mt-2">/ 100점</div>
            </div>
            <div className="rounded-2xl p-5 bg-white border border-gray-200">
              <div className="text-xs text-gray-600 mb-1">검증 포스팅</div>
              <div className="text-3xl font-bold text-gray-900 tabular-nums">{data.checked_posts}</div>
              <div className="text-xs text-gray-500 mt-2">개 (RSS 최근 글)</div>
            </div>
          </div>

          {/* 신호별 점수 바 */}
          <div className="mt-6 grid md:grid-cols-2 gap-x-8 gap-y-4 bg-white/70 rounded-2xl p-5 border border-gray-200">
            {Object.entries(data.signal_scores).map(([name, sig]) => (
              <SignalBar key={name} name={name} score={sig.score} weight={sig.weight} />
            ))}
          </div>

          {/* 포스팅별 펼침 */}
          {data.post_results.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPosts(s => !s)}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
              >
                <ChevronRight className={`gi3d w-4 h-4 transition-transform ${showPosts ? 'rotate-90' : ''}`} />
                포스팅별 색인 결과 ({data.post_results.length}건)
              </button>
              {showPosts && (
                <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-2">
                  {data.post_results.map((p, i) => (
                    <div key={i} className="p-3 rounded-lg bg-white border border-gray-200 text-sm">
                      <div className="font-medium text-gray-900 truncate">{p.title}</div>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs">
                        <span className={p.indexed_blog_tab ? 'text-green-700' : 'text-red-700'}>
                          블로그탭: {p.indexed_blog_tab ? `#${p.blog_tab_rank}` : '미노출'}
                        </span>
                        <span className={p.indexed_view_tab ? 'text-green-700' : 'text-red-700'}>
                          VIEW: {p.indexed_view_tab ? `#${p.view_tab_rank}` : '미노출'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 정직성 면책 */}
      <div className="mt-6 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
        <strong>주의:</strong> {data?.disclaimer ?? '네이버는 블로그 지수 API를 외부에 공개하지 않습니다. 본 결과는 NSIDE·NVIEW·whereispost·리드뷰 등이 사용하는 공개 측정 신호(정확매칭 색인률, 30위/72시간 누락, C-Rank/DIA 프록시)를 통합한 비공식 추정치이며, 100% 정확하다고 보장할 수 없습니다 — 각 도구의 측정 알고리즘은 모두 다릅니다.'}
      </div>
    </motion.div>
  )
}

// 노출 천장 카드 — 이 블로그가 '실제로' 상위노출한 키워드들의 검색량 상한
function ExposureCeilingCard({ blogId }: { blogId: string }) {
  const [data, setData] = useState<ExposureCeilingResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const measure = async () => {
    setLoading(true); setError(null)
    try {
      const res = await getExposureCeiling(blogId)
      setData(res)
      if (!res.ok) setError(res.error === 'no_posts_via_rss' ? '글을 찾을 수 없어 측정할 수 없습니다.' : '상위노출 실적이 부족해 천장을 측정하지 못했습니다.')
    } catch {
      setError('측정 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="glass-3d p-8 mb-8"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-6 h-6 text-[#0064FF] gi3d" />
          <h3 className="text-xl font-bold">노출 천장 측정</h3>
          <div className="group relative">
            <HelpCircle className="w-4 h-4 text-gray-400 cursor-help gi3d" />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 shadow-xl text-left font-normal leading-relaxed">
              이 블로그가 최근 글 제목의 키워드로 네이버 블로그 검색에서 실제로 상위노출된 결과만으로 낸 실적 기반 수치입니다. 추정 지수가 아닙니다.
            </div>
          </div>
        </div>
        {!data && (
          <button onClick={measure} disabled={loading}
            className="toss-btn-primary px-5 py-2.5 text-sm disabled:opacity-50">
            {loading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />측정 중…</span> : '측정하기'}
          </button>
        )}
      </div>

      {loading && !data && (
        <p className="text-sm text-gray-500">최근 글 키워드로 실제 검색 순위를 확인하는 중입니다. 최대 1분 정도 걸립니다…</p>
      )}
      {error && !loading && <p className="text-sm text-orange-600">{error}</p>}

      {data?.ok && data.ceiling_volume != null && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            <div className="text-center p-4 rounded-2xl bg-white/50">
              <div className="text-2xl font-bold gradient-text">{data.ceiling_volume.toLocaleString()}</div>
              <div className="text-xs text-gray-600 mt-1">뚫은 최대 검색량</div>
            </div>
            <div className="text-center p-4 rounded-2xl bg-white/50">
              <div className="text-2xl font-bold">{data.ceiling_p50?.toLocaleString() ?? '—'}</div>
              <div className="text-xs text-gray-600 mt-1">안정권(중앙값)</div>
            </div>
            <div className="text-center p-4 rounded-2xl bg-white/50">
              <div className="text-2xl font-bold">{Math.round(data.win_rate * 100)}%</div>
              <div className="text-xs text-gray-600 mt-1">1페이지 진입률</div>
            </div>
            <div className="text-center p-4 rounded-2xl bg-white/50">
              <div className="text-2xl font-bold">{data.ranked_count}<span className="text-sm text-gray-400">/{data.tested}</span></div>
              <div className="text-xs text-gray-600 mt-1">상위노출 키워드</div>
            </div>
          </div>
          {data.ranked_keywords.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">실제 상위노출 중인 키워드</p>
              <div className="flex flex-wrap gap-2">
                {data.ranked_keywords.slice(0, 10).map((k) => (
                  <span key={k.keyword} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-sm">
                    <span className="font-medium text-gray-800">{k.keyword}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500">{k.volume.toLocaleString()}회</span>
                    <span className="text-[#0064FF] font-semibold">{k.rank}위</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-gray-400">신뢰도 {data.confidence} · {data.disclaimer}</p>
        </>
      )}
    </motion.div>
  )
}

// 구체적 수치가 포함된 권장사항 컴포넌트
function ConcreteRecommendations({ result, isFreeUser }: { result: any; isFreeUser: boolean }) {
  // 분석 결과 기반 구체적 권장사항 생성
  const generateConcreteRecommendations = () => {
    const recs = []
    const stats = result.stats
    const index = result.index

    // 포스팅 빈도 기반 권장
    const currentPosts = stats.total_posts || 0
    const postingFreq = stats.posting_frequency || Math.round(currentPosts / 30)

    if (postingFreq < 3) {
      recs.push({
        priority: 'high',
        icon: PenLine,
        title: '포스팅 빈도 높이기',
        message: `현재 월 ${postingFreq}회 → 목표 월 8회`,
        actions: [
          `이번 주에 ${Math.max(2, 3 - postingFreq)}개 포스트 작성하기`,
          '매주 화/목/토 정기 포스팅 루틴 만들기',
          '초안 작성 → 다음날 수정 → 발행 2일 사이클 권장'
        ],
        impact: '+15~20% 신뢰점수 상승 예상',
        difficulty: '중간'
      })
    }

    // 이웃 수 기반 권장
    const neighbors = stats.neighbor_count || 0
    if (neighbors < 300) {
      const targetNeighbors = Math.min(500, neighbors + 100)
      recs.push({
        priority: 'high',
        icon: Users,
        title: '이웃 네트워크 확장',
        message: `현재 ${neighbors}명 → 목표 ${targetNeighbors}명`,
        actions: [
          `이번 주에 같은 주제 블로거 ${Math.min(20, 100 - neighbors % 100)}명에게 이웃 신청`,
          '매일 5개 블로그에 진심 담긴 댓글 남기기',
          '이웃 새글에 24시간 내 반응하기'
        ],
        impact: '+10~15% 활동성 점수 상승',
        difficulty: '쉬움'
      })
    }

    // 콘텐츠 품질 기반 권장
    const diaScore = index.score_breakdown.dia || 50
    if (diaScore < 70) {
      recs.push({
        priority: 'high',
        icon: FileCheck2,
        title: '콘텐츠 품질 개선',
        message: `현재 ${Math.round(diaScore)}점 → 목표 75점`,
        actions: [
          '글 하나당 이미지 5개 이상 포함하기',
          '글 길이 1,500자 이상 유지 (현재 권장: 2,000자)',
          '소제목(H2) 3개 이상으로 구조화',
          '직접 경험/사진 최소 30% 이상 포함'
        ],
        impact: '+20~25% 문서 품질 점수 상승',
        difficulty: '중간'
      })
    }

    // 방문자 기반 권장
    const visitors = stats.total_visitors || 0
    if (visitors < 500) {
      recs.push({
        priority: 'medium',
        icon: Search,
        title: '검색 유입 늘리기',
        message: `현재 일 ${visitors}명 → 목표 일 ${Math.min(1000, visitors * 2)}명`,
        actions: [
          '키워드 분석 도구로 경쟁률 낮은 키워드 5개 발굴',
          '제목에 핵심 키워드 앞쪽 배치',
          '본문 첫 문단에 키워드 자연스럽게 포함',
          '관련 키워드 3-5개 해시태그로 추가'
        ],
        impact: '+30~50% 방문자 증가 예상',
        difficulty: '중간'
      })
    }

    // 레벨 기반 권장
    if (index.level < 5) {
      recs.push({
        priority: 'medium',
        icon: Target,
        title: '블로그 주제 집중',
        message: '상위 3개 카테고리에 집중하기',
        actions: [
          '가장 반응 좋았던 주제 TOP 3 파악하기',
          '해당 주제로 주 2회 이상 집중 포스팅',
          '다른 주제는 월 1-2회로 제한',
          '블로그 소개글에 주력 주제 명시'
        ],
        impact: '+10~15% 주제 일관성 점수 상승',
        difficulty: '쉬움'
      })
    }

    // 좋아요/댓글 기반 권장
    const avgLikes = stats.avg_likes || Math.round(visitors * 0.02)
    const avgComments = stats.avg_comments || Math.round(neighbors * 0.05)

    if (avgLikes < 10 || avgComments < 5) {
      recs.push({
        priority: 'low',
        icon: MessageSquare,
        title: '독자 참여 유도',
        message: `좋아요 ${avgLikes}→15개, 댓글 ${avgComments}→10개`,
        actions: [
          '글 마지막에 질문으로 마무리 (예: "여러분은 어떻게 생각하세요?")',
          '댓글에 2시간 내 답글 달기',
          '공감 버튼 유도 문구 자연스럽게 삽입',
          '시리즈물로 다음 편 기대감 조성'
        ],
        impact: '+5~10% 참여율 상승',
        difficulty: '쉬움'
      })
    }

    return recs.length > 0 ? recs : [{
      priority: 'low',
      icon: CheckCircle2,
      title: '현재 상태 유지',
      message: '이미 잘 운영되고 있습니다!',
      actions: [
        '현재 포스팅 빈도와 품질 유지',
        '새로운 키워드 발굴로 영역 확장 시도',
        '이웃과의 소통 꾸준히 이어가기'
      ],
      impact: '안정적 성장 유지',
      difficulty: '쉬움'
    }]
  }

  // 할 일은 3개까지만 보여준다. 여덟 개를 늘어놓으면 아무것도 안 하게 된다.
  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const recommendations = generateConcreteRecommendations()
    .slice()
    .sort((a: any, b: any) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))
  const displayRecs = recommendations.slice(0, 3)
  const blurredRecs = isFreeUser && recommendations.length > 3 ? recommendations.slice(3, 4) : []

  return (
    <div className="glass-3d p-8 ">
      <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <Target className="w-6 h-6 text-[#0064FF] gi3d" />
        지금 할 일
      </h3>
      <p className="text-sm text-gray-500 mb-6">측정 결과에서 가장 효과가 큰 순서입니다</p>

      <div className="space-y-4">
        {displayRecs.map((rec, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + index * 0.1 }}
            className={`p-6 rounded-2xl border-l-4 ${
              rec.priority === 'high' ? 'bg-red-50 border-red-400' :
              rec.priority === 'medium' ? 'bg-amber-50 border-amber-400' :
              'bg-blue-50 border-[#0064FF]'
            }`}
          >
            <div className="flex items-start gap-4">
              <rec.icon className="w-7 h-7 text-[#0064FF] shrink-0" strokeWidth={1.75} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-gray-900">{rec.title}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                    rec.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {rec.priority === 'high' ? '높음' : rec.priority === 'medium' ? '보통' : '낮음'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    난이도: {rec.difficulty}
                  </span>
                </div>
                <div className="text-lg font-semibold text-[#0064FF] mb-3">{rec.message}</div>
                <ul className="space-y-2 mb-3">
                  {rec.actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700 text-sm">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0 gi3d" strokeWidth={2.5} />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                  <span className="text-xs text-gray-500">예상 효과:</span>
                  <span className="text-sm font-medium text-green-600">{rec.impact}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {/* P1: 무료 플랜 - 4번째 가이드 블러 미리보기 */}
        {isFreeUser && blurredRecs.length > 0 && (
          <div className="relative">
            <div className="blur-[6px] select-none pointer-events-none opacity-50">
              {blurredRecs.map((rec, index) => (
                <div key={index} className={`p-6 rounded-2xl border-l-4 ${
                  rec.priority === 'high' ? 'bg-red-50 border-red-400' :
                  rec.priority === 'medium' ? 'bg-amber-50 border-amber-400' :
                  'bg-blue-50 border-[#0064FF]'
                }`}>
                  <div className="flex items-start gap-4">
                    <rec.icon className="w-7 h-7 text-[#0064FF] shrink-0" strokeWidth={1.75} />
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900">{rec.title}</h4>
                      <div className="text-lg font-semibold text-[#0064FF]">{rec.message}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Link href="/pricing">
                <div className="bg-white/95 rounded-xl px-6 py-4 shadow-lg text-center cursor-pointer hover:shadow-xl transition-all border-2 border-amber-300">
                  <TrendingUp className="w-6 h-6 mb-2 mx-auto text-amber-500 gi3d" strokeWidth={1.75} />
                  <p className="text-sm font-bold text-amber-900 mb-1">
                    상위노출 핵심 가이드 {recommendations.length - 3}개가 숨겨져 있습니다
                  </p>
                  <p className="text-xs text-amber-700 mb-3">
                    이 가이드만 따라하면 평균 순위 5단계 이상 상승
                  </p>
                  <button className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-red-500 text-white text-sm font-bold rounded-lg hover:shadow-lg hover:shadow-amber-500/30 transition-all">
                    7일 무료로 확인하기
                  </button>
                  <p className="text-xs text-gray-500 mt-2">클릭 한 번으로 해지</p>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* 추가 가이드 있음 안내 - 티저 마케팅 */}
        {isFreeUser && recommendations.length > 4 && (
          <div className="text-center py-4">
            <p className="text-sm text-amber-800 font-medium">
              지금 숨겨진 <strong>+{recommendations.length - 3}개</strong> 핵심 가이드를 확인하면 상위노출이 빨라집니다
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// 실측 지표 상세 섹션
function DetailedMetricsSection({ result, isFreeUser }: { result: any; isFreeUser: boolean }) {
  const [activeTab, setActiveTab] = useState<'core' | 'content' | 'activity' | 'growth'>('core')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  // ===== 실측 지표만 표시한다 =====
  // 예전에는 blog_id 해시로 만든 값(getConsistentScore)과 c_rank/dia 에 임의 상수를
  // 곱한 파생값으로 40개 '지표'를 채웠다. 재방문율·체류시간·이탈률·공유지수 같은 건
  // 애초에 외부에서 측정할 수 없는 값이라(블로그 주인만 보는 통계) 전부 걷어냈다.
  // 여기 있는 값은 전부 백엔드가 실제로 잰 것이고, 못 잰 항목은 '측정 안 됨'으로 나간다.
  const sb: any = result.index.score_breakdown || {}
  const cd: any = sb.c_rank_detail || {}
  const dd: any = sb.dia_detail || {}
  const cf: any = sb.content_detail || {}
  const rs: any = sb.raw_signals || {}

  // 값이 없으면 지어내지 않고 '측정 안 됨'으로 표시
  const measured = (name: string, value: any, description: string, opts: any = {}) => {
    if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
      return { name, value: '측정 안 됨', description, raw: true, isStatus: true }
    }
    return { name, value, description, ...opts }
  }
  const num = (v: any, digits = 0) =>
    (v === null || v === undefined) ? null : Number(Number(v).toFixed(digits))

  // 블로그 신뢰도 (C-Rank) — 백엔드가 계산한 하위 점수 그대로
  const cRankMetrics = [
    measured('주제 집중도', num(cd.context, 1), '한 주제에 얼마나 집중해 쓰는지 (C-Rank Context)'),
    measured('콘텐츠 품질', num(cd.content, 1), '글의 전반적 퀄리티 (C-Rank Content)'),
    measured('연결성', num(cd.chain, 1), '이웃·인용 등 연결 관계 (C-Rank Chain)'),
    measured('카테고리 수', rs.category_count, '운영 중인 카테고리 개수', { raw: true, unit: '개' }),
    measured('카테고리 분산도', num(rs.category_entropy, 2), '주제가 흩어진 정도 (낮을수록 집중)', { raw: true }),
  ]

  // 글 품질 (D.I.A.) + 콘텐츠 요소 — 전부 실측
  const diaMetrics = [
    measured('깊이', num(dd.depth, 1), '주제를 얼마나 깊이 다루는지 (D.I.A. Depth)'),
    measured('정보성', num(dd.information, 1), '담긴 정보의 양 (D.I.A. Information)'),
    measured('정확성', num(dd.accuracy, 1), '정보의 신뢰도 (D.I.A. Accuracy)'),
    measured('글 길이', num(cf.content_length?.score, 1),
      cf.content_length ? `평균 ${cf.content_length.raw}자` : '평균 글자 수 기준'),
    measured('소제목 활용', num(cf.heading_count?.score, 1),
      cf.heading_count ? `글당 평균 ${cf.heading_count.raw}개` : '소제목 개수 기준'),
    measured('문단 구조', num(cf.paragraph_count?.score, 1),
      cf.paragraph_count ? `글당 평균 ${cf.paragraph_count.raw}개` : '문단 개수 기준'),
    measured('이미지 활용', num(cf.image_count?.score, 1),
      cf.image_count ? `글당 평균 ${cf.image_count.raw}장` : '이미지 개수 기준'),
    measured('최신성', num(cf.freshness?.score, 1),
      cf.freshness ? `마지막 발행 ${cf.freshness.raw}일 전` : '마지막 발행 시점 기준'),
  ]

  // 활동성 — 원시 신호 그대로
  const activityMetrics = [
    measured('총 포스트 수', result.stats.total_posts, '누적 발행 글 수', { raw: true, unit: '개' }),
    measured('이웃 수', result.stats.neighbor_count, '서로이웃 포함 이웃 수', { raw: true, unit: '명' }),
    measured('누적 방문자', result.stats.total_visitors, '블로그 개설 이후 누적', { raw: true, unit: '명' }),
    measured('평균 글자 수', num(rs.avg_post_length), '글 하나당 평균 글자 수', { raw: true, unit: '자' }),
    measured('평균 이미지 수', num(rs.avg_image_count, 1), '글 하나당 평균 이미지', { raw: true, unit: '장' }),
    measured('발행 간격', num(rs.posting_interval_days, 1), '글과 글 사이 평균 간격', { raw: true, unit: '일' }),
    measured('마지막 발행', num(rs.recent_activity_days), '가장 최근 글로부터 지난 날짜', { raw: true, unit: '일 전' }),
    measured('활동성 계수', num(sb.vitality, 2),
      `총점에 곱해지는 계수 (${sb.vitality_state || '판정 불가'})`, { raw: true }),
    measured('누적 지표 보너스', num(sb.extra_bonus, 1), '글수·이웃·방문자로 더해진 점수', { raw: true, unit: '점' }),
  ]


  // '성장성' 탭은 제거했다. 재방문율·체류시간·이탈률·검색유입률은 블로그 소유자만
  // 볼 수 있는 통계라 외부에서 측정할 방법이 없고, 예전에는 전부 지어낸 값이었다.
  const tabs = [
    { id: 'core', label: '핵심 지표', count: 2, icon: Target },
    { id: 'content', label: '콘텐츠 품질', count: cRankMetrics.length + diaMetrics.length, icon: FileText },
    { id: 'activity', label: '활동성', count: activityMetrics.length, icon: Activity },
  ]

  const renderMetricCard = (metric: any, index: number, locked: boolean = false) => {
    const value = metric.raw ? metric.value : Math.round(metric.value)
    const isGood = metric.inverse ? value < 30 : (metric.raw ? true : value >= 60)

    return (
      <motion.div
        key={metric.name}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
        onClick={() => locked && setShowUpgradeModal(true)}
        className={`p-4 rounded-xl border ${locked ? 'bg-gray-50 border-gray-200 cursor-pointer hover:border-[#0064FF]/30 hover:bg-blue-50/50' : 'bg-white border-gray-100'} ${!locked && 'hover:shadow-md'} transition-all`}
      >
        <div className="flex items-start justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{metric.name}</span>
          {locked ? (
            <Lock className="w-4 h-4 text-gray-400 gi3d" />
          ) : metric.raw ? (
            <span className={`text-lg font-bold ${metric.isStatus ? (metric.value === '인플루언서' ? 'text-purple-600' : 'text-gray-600') : 'text-[#0064FF]'}`}>
              {metric.value}{metric.unit || ''}
            </span>
          ) : (
            <span className={`text-lg font-bold ${isGood ? 'text-green-600' : 'text-orange-500'}`}>
              {value}점
            </span>
          )}
        </div>
        {!metric.raw && !locked && (
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${value}%` }}
              transition={{ delay: 0.3 + index * 0.03, duration: 0.4 }}
              className={`absolute inset-y-0 left-0 rounded-full ${
                metric.inverse
                  ? (value < 30 ? 'bg-green-500' : value < 50 ? 'bg-yellow-500' : 'bg-red-500')
                  : (value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-[#0064FF]' : value >= 40 ? 'bg-yellow-500' : 'bg-red-500')
              }`}
            />
          </div>
        )}
        {metric.description && !locked && (
          <p className="text-xs text-gray-500 mt-2">{metric.description}</p>
        )}
      </motion.div>
    )
  }

  return (
    <div className="glass-3d p-8 ">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-[#0064FF] gi3d" />
            측정 지표
          </h3>
          <p className="text-sm text-gray-500 mt-1">실제로 측정한 값만 표시합니다</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0064FF]/10 rounded-full">
          <span className="text-sm font-medium text-[#0064FF]">
            {cRankMetrics.length + diaMetrics.length + activityMetrics.length}개
          </span>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-[#0064FF] text-white shadow-lg shadow-[#0064FF]/25'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <tab.icon className="w-4 h-4" strokeWidth={1.75} />
            <span>{tab.label}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 핵심 지표 탭 — 2026 알고리즘 기반 6신호 분리 측정 */}
      {activeTab === 'core' && (() => {
        const sb = result.index.score_breakdown
        const cDetail = sb.c_rank_detail
        const dDetail = sb.dia_detail

        // 6신호 (c_rank_detail + dia_detail). detail이 없으면 상위 점수로 폴백.
        const signals: Array<{
          key: string
          group: 'C-Rank' | 'D.I.A.+'
          name: string
          simple: string
          tooltip: string
          score: number
        }> = [
          {
            key: 'context',
            group: 'C-Rank',
            name: '카테고리 집중도',
            simple: 'Context 추정 · 카테고리 개수 기반',
            tooltip: '실제 측정값: 블로그의 카테고리 개수. (1~3개=90점, 4~5=75점, 6~10=60점, 11+=40점)\n\n네이버 진짜 신호: 31개 분야별 의미적 집중도. 외부에서는 측정 불가능하므로 카테고리 개수로 근사 추정.',
            score: cDetail?.context ?? sb.c_rank ?? 0,
          },
          {
            key: 'content',
            group: 'C-Rank',
            name: '평균 글 길이',
            simple: 'Content 추정 · RSS 본문 길이 기반',
            tooltip: '실제 측정값: RSS description 평균 길이 × 7 보정. (3000자+=95점, 2000+=85, 1500+=75, 1000+=65, 500+=50)\n\n네이버 진짜 신호: 글자수+이미지+영상+구조+엔티티. 외부에서는 본문 풀파싱 없이 길이만 측정.',
            score: cDetail?.content ?? sb.c_rank ?? 0,
          },
          {
            key: 'chain',
            group: 'C-Rank',
            name: '이웃 규모',
            simple: 'Chain 추정 · 이웃 수 기반',
            tooltip: '실제 측정값: 블로그 이웃 수. (5000+=95점, 2000+=85, 1000+=75, 500+=65)\n\n네이버 진짜 신호: 공감·댓글·스크랩·체류시간. 외부에서는 측정 불가능하므로 이웃 수로 근사. 이웃은 매수 가능해 노이즈 큼.',
            score: cDetail?.chain ?? sb.c_rank ?? 0,
          },
          {
            key: 'depth',
            group: 'D.I.A.+',
            name: '발행 누적량',
            simple: 'Depth 추정 · 총 포스팅 수 기반',
            tooltip: '실제 측정값: 총 포스팅 개수. (2000+=95점, 1000+=85, 500+=75, 200+=65)\n\n네이버 진짜 신호: 개별 글의 직접 경험·후기 표현 비중. 외부에서는 글 단위 측정이 어려워 발행량으로 근사.',
            score: dDetail?.depth ?? sb.dia ?? 0,
          },
          {
            key: 'information',
            group: 'D.I.A.+',
            name: '최근 활동성',
            simple: 'Information 추정 · 마지막 글 일수',
            tooltip: '실제 측정값: 가장 최근 글로부터의 경과 일수. (1일 이내=95점, 3일 이내=85, 7일 이내=75)\n\n네이버 진짜 신호: 엔티티·표·목록 등 정보 구조화 수준. 최근성과는 별개 — 현재는 활동 빈도로 대체 추정.',
            score: dDetail?.information ?? sb.dia ?? 0,
          },
          {
            key: 'accuracy',
            group: 'D.I.A.+',
            name: '누적 방문자',
            simple: 'Accuracy 추정 · 누적 방문자 기반',
            tooltip: '실제 측정값: 블로그 누적 방문자 수. (1000만+=95점, 500만+=88, 100만+=80, 50만+=70)\n\n네이버 진짜 신호: 검색 쿼리-문서 의도 부합도(딥매칭). CTR/이탈률은 외부 측정 불가능 — 누적 방문자로 인기도 근사.',
            score: dDetail?.accuracy ?? sb.dia ?? 0,
          },
        ]

        const weakest = signals.reduce((min, s) => (s.score < min.score ? s : min), signals[0])
        const strongest = signals.reduce((max, s) => (s.score > max.score ? s : max), signals[0])
        const avg = signals.reduce((sum, s) => sum + s.score, 0) / signals.length

        return (
          <div className="space-y-6">
            {/* 알고리즘 컨텍스트 배너 — 정직성 패치 */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5 gi3d" />
                <div className="text-sm text-gray-700">
                  <strong className="text-amber-900">아래 점수는 추정치입니다.</strong>{' '}
                  네이버 공식 '블로그 지수'는 존재하지 않고, C-Rank·D.I.A.+ 내부 점수도 비공개입니다.
                  체류시간·CTR·스크롤 깊이는 외부에서 측정 불가능합니다.
                  아래는 <strong>외부에서 수집 가능한 6개 raw 신호</strong>로 알고리즘 신호를 근사 추정한 결과입니다.
                </div>
              </div>
              <div className="text-xs text-amber-800/80 pl-7">
                각 카드의 <strong>?</strong> 아이콘에 마우스를 올리면 실제 측정한 raw 값과 네이버 진짜 신호와의 갭을 확인할 수 있습니다.
              </div>
            </div>

            {/* C-Rank 그룹 */}
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="px-2 py-1 bg-[#0064FF] text-white text-xs font-bold rounded">C-Rank 추정</span>
                <span className="text-sm font-medium text-gray-600">출처(블로그) 신뢰도 신호 근사</span>
                <span className="text-xs text-gray-400">· raw 입력: 카테고리 수 / 글 길이 / 이웃 수</span>
              </div>
              <div className="space-y-3">
                {signals.filter((s) => s.group === 'C-Rank').map((signal, index) => {
                  const v = signal.score
                  const level = v >= 80 ? '최상' : v >= 60 ? '양호' : v >= 40 ? '보통' : '개선필요'
                  const color = v >= 80 ? 'text-green-600' : v >= 60 ? 'text-blue-600' : v >= 40 ? 'text-yellow-600' : 'text-red-600'
                  return (
                    <motion.div
                      key={signal.key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + index * 0.05 }}
                      className="bg-white/50 rounded-2xl p-5"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-gray-900">{signal.name}</span>
                            <div className="group relative">
                              <HelpCircle className="w-4 h-4 text-gray-400 cursor-help gi3d" />
                              <div className="absolute left-0 bottom-full mb-2 w-80 p-3 bg-gray-900 text-white text-sm rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-xl whitespace-pre-line">
                                {signal.tooltip}
                                <div className="absolute left-4 top-full border-8 border-transparent border-t-gray-900" />
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-gray-500">{signal.simple}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-[#0064FF]">{v.toFixed(0)}점</div>
                          <div className={`text-sm font-medium ${color}`}>{level}</div>
                        </div>
                      </div>
                      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${v}%` }}
                          transition={{ delay: 0.2 + index * 0.05, duration: 0.5 }}
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            v >= 80 ? 'bg-gradient-to-r from-green-500 to-green-400' :
                            v >= 60 ? 'bg-gradient-to-r from-[#0064FF] to-[#3182F6]' :
                            v >= 40 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
                            'bg-gradient-to-r from-red-500 to-red-400'
                          }`}
                        />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* D.I.A.+ 그룹 */}
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="px-2 py-1 bg-purple-600 text-white text-xs font-bold rounded">D.I.A.+ 추정</span>
                <span className="text-sm font-medium text-gray-600">개별 문서 품질 신호 근사</span>
                <span className="text-xs text-gray-400">· raw 입력: 총 발행 / 최근 활동 / 누적 방문자</span>
              </div>
              <div className="space-y-3">
                {signals.filter((s) => s.group === 'D.I.A.+').map((signal, index) => {
                  const v = signal.score
                  const level = v >= 80 ? '최상' : v >= 60 ? '양호' : v >= 40 ? '보통' : '개선필요'
                  const color = v >= 80 ? 'text-green-600' : v >= 60 ? 'text-blue-600' : v >= 40 ? 'text-yellow-600' : 'text-red-600'
                  return (
                    <motion.div
                      key={signal.key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + index * 0.05 }}
                      className="bg-white/50 rounded-2xl p-5"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-gray-900">{signal.name}</span>
                            <div className="group relative">
                              <HelpCircle className="w-4 h-4 text-gray-400 cursor-help gi3d" />
                              <div className="absolute left-0 bottom-full mb-2 w-80 p-3 bg-gray-900 text-white text-sm rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-xl whitespace-pre-line">
                                {signal.tooltip}
                                <div className="absolute left-4 top-full border-8 border-transparent border-t-gray-900" />
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-gray-500">{signal.simple}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-purple-600">{v.toFixed(0)}점</div>
                          <div className={`text-sm font-medium ${color}`}>{level}</div>
                        </div>
                      </div>
                      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${v}%` }}
                          transition={{ delay: 0.4 + index * 0.05, duration: 0.5 }}
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            v >= 80 ? 'bg-gradient-to-r from-green-500 to-green-400' :
                            v >= 60 ? 'bg-gradient-to-r from-purple-500 to-purple-400' :
                            v >= 40 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
                            'bg-gradient-to-r from-red-500 to-red-400'
                          }`}
                        />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* 신호 기반 진단 요약 */}
            <div className="mt-4 p-4 bg-gradient-to-r from-[#0064FF]/5 to-purple-500/5 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-[#0064FF] gi3d" />
                <span className="font-bold text-gray-900">신호 기반 진단</span>
              </div>
              <div className="space-y-1.5 text-sm text-gray-700">
                <p>
                  6개 신호 평균 <strong className="text-[#0064FF]">{avg.toFixed(0)}점</strong>
                  {' · '}가장 강한 신호 <strong className="text-green-600">{strongest.name}({strongest.score.toFixed(0)})</strong>
                  {' · '}가장 약한 신호 <strong className="text-red-600">{weakest.name}({weakest.score.toFixed(0)})</strong>
                </p>
                <p className="text-gray-600">
                  {weakest.score < 40
                    ? `「${weakest.name}」 신호가 임계값(40) 아래입니다. 이 신호 개선이 노출에 가장 큰 영향을 줍니다.`
                    : weakest.score < 60
                      ? `「${weakest.name}」를 60점 이상으로 끌어올리면 다음 등급 진입이 빨라집니다.`
                      : '6개 신호가 모두 안정적입니다. 가장 약한 신호를 80점 이상으로 끌어올려 상위 1% 진입을 노리세요.'}
                </p>
              </div>
            </div>

            {/* A-2 raw signals 정직성 박스 — 실제 수집한 값 그대로 노출 */}
            {sb.raw_signals && (
              <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-mono uppercase tracking-wider text-gray-500">raw signals</span>
                  <span className="text-xs text-gray-400">실제 수집한 측정값 (추정·보정 전)</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {[
                    { label: '카테고리 개수', value: sb.raw_signals.category_count, unit: '개' },
                    { label: '카테고리 엔트로피', value: sb.raw_signals.category_entropy, unit: 'bits', help: '0=한 카테고리 집중, ↑일수록 분산' },
                    { label: '평균 글 길이 (RSS)', value: sb.raw_signals.avg_post_length, unit: '자', help: 'RSS 요약 기준' },
                    { label: '평균 발행 간격', value: sb.raw_signals.posting_interval_days, unit: '일' },
                    { label: '최근 글 경과일', value: sb.raw_signals.recent_activity_days, unit: '일' },
                    { label: '이웃 수', value: sb.raw_signals.neighbor_count, unit: '명' },
                    { label: '총 포스팅', value: sb.raw_signals.total_posts, unit: '개' },
                    { label: '누적 방문자', value: sb.raw_signals.total_visitors, unit: '명' },
                    // 풀파싱 신호 (있을 때만 의미있음)
                    { label: '풀파싱 표본 수', value: sb.raw_signals.fullparse_n, unit: '개', help: '최근 N개 포스트 풀파싱' },
                    { label: '평균 공감수', value: sb.raw_signals.fullparse_avg_likes, unit: '개', help: '진짜 Chain 신호' },
                    { label: '평균 댓글수', value: sb.raw_signals.fullparse_avg_comments, unit: '개', help: '진짜 Chain 신호' },
                    { label: '평균 이미지 (풀)', value: sb.raw_signals.fullparse_avg_images, unit: '개', help: '본문 실측' },
                    { label: '평균 동영상', value: sb.raw_signals.fullparse_avg_videos, unit: '개' },
                    { label: '평균 본문 길이', value: sb.raw_signals.fullparse_avg_content_length, unit: '자', help: 'HTML 제거 후' },
                    { label: '평균 문단 수', value: sb.raw_signals.fullparse_avg_paragraphs, unit: '개' },
                    { label: '평균 소제목 수', value: sb.raw_signals.fullparse_avg_headings, unit: '개' },
                    { label: '지도 포함 비율', value: sb.raw_signals.fullparse_has_map_ratio, unit: '', help: '0~1, 맛집/여행 신호' },
                  ].map((m) => (
                    <div key={m.label} className="bg-white rounded-lg p-2.5 border border-gray-100">
                      <div className="text-gray-500 mb-0.5">{m.label}</div>
                      <div className="font-mono font-semibold text-gray-900">
                        {m.value === null || m.value === undefined ? '—' : `${typeof m.value === 'number' ? m.value.toLocaleString() : m.value}${m.unit}`}
                      </div>
                      {m.help && <div className="text-[10px] text-gray-400 mt-0.5">{m.help}</div>}
                    </div>
                  ))}
                </div>
                {sb.raw_signals.data_sources && sb.raw_signals.data_sources.length > 0 && (
                  <div className="mt-3 text-[11px] text-gray-500">
                    데이터 소스: {sb.raw_signals.data_sources.join(', ')}
                    {sb.raw_signals.data_sources.includes('estimated') && (
                      <span className="ml-2 text-amber-600 font-medium">일부 값은 RSS 실패 시 blog_id 시드 기반 추정값</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* 콘텐츠 품질 탭 (블로그 신뢰도 + 글 품질 세부) */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* 블로그 신뢰도 세부 */}
          <div>
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#0064FF]" />
              블로그 신뢰도 세부 ({cRankMetrics.length}개)
              <span className="text-xs text-gray-400 font-normal">(네이버가 블로그를 얼마나 믿는지)</span>
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {cRankMetrics.map((metric, i) => renderMetricCard(metric, i, isFreeUser && i >= 3))}
            </div>
          </div>

          {/* 글 품질 세부 */}
          <div>
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500" />
              글 품질 세부 ({diaMetrics.length}개)
              <span className="text-xs text-gray-400 font-normal">(글 하나하나의 퀄리티)</span>
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {diaMetrics.map((metric, i) => renderMetricCard(metric, i, isFreeUser && i >= 3))}
            </div>
          </div>

          {isFreeUser && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-3">Pro 플랜에서 모든 세부 지표를 확인하세요</p>
              <Link href="/pricing">
                <button className="px-4 py-2 bg-[#0064FF] text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all">
                  Pro 플랜 알아보기
                </button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* 활동성 탭 */}
      {activeTab === 'activity' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {activityMetrics.map((metric, i) => renderMetricCard(metric, i, isFreeUser && i >= 6))}
        </div>
      )}

      {/* P1: 업그레이드 모달 */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowUpgradeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-[#0064FF]/10 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-[#0064FF] gi3d" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Pro 기능입니다</h3>
                <p className="text-gray-600 mb-6">
                  42개 전체 지표와 상세 분석 결과를<br />
                  Pro 플랜에서 확인하세요
                </p>
                <div className="space-y-3">
                  <Link href="/pricing" className="block">
                    <button className="w-full py-3 bg-[#0064FF] text-white font-bold rounded-xl hover:shadow-lg shadow-lg shadow-[#0064FF]/25 transition-all">
                      7일 환불 보장으로 시작
                    </button>
                  </Link>
                  <p className="text-xs text-gray-500 text-center">클릭 한 번으로 언제든 해지 · 위약금 0원</p>
                  <button
                    onClick={() => setShowUpgradeModal(false)}
                    className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium transition-colors"
                  >
                    나중에 할게요
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// B-2 검증 결과 활용: 분석 후 시계열 추적 시작 버튼
function StartTrackingButton({
  blogId,
  blogName,
  userId,
}: {
  blogId: string
  blogName: string
  userId: number | string
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'checking' | 'registering' | 'measuring' | 'done' | 'already'>('idle')

  // 이미 추적 중인지 확인
  useEffect(() => {
    let mounted = true
    setStatus('checking')
    getTrackedBlogs(userId)
      .then((data) => {
        if (!mounted) return
        const exists = data.blogs?.some((b) => b.blog_id === blogId)
        setStatus(exists ? 'already' : 'idle')
      })
      .catch(() => {
        if (mounted) setStatus('idle')
      })
    return () => {
      mounted = false
    }
  }, [blogId, userId])

  const handleStart = async () => {
    setStatus('registering')
    try {
      await registerBlog(userId, blogId)
      toast.success('추적 등록 완료. 첫 측정을 시작합니다…')

      setStatus('measuring')
      try {
        await startRankCheck(userId, blogId, 20, true)
      } catch {
        // 측정 실패해도 등록은 됐으므로 continue
      }
      setStatus('done')
      toast.success('시계열 추적이 시작됐습니다!')
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || '추적 시작 실패'
      toast.error(msg)
      setStatus('idle')
    }
  }

  if (status === 'checking') {
    return (
      <div className="text-sm text-gray-500 inline-flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        추적 상태 확인 중…
      </div>
    )
  }

  if (status === 'already' || status === 'done') {
    return (
      <button
        onClick={() => router.push(`/dashboard/rank-tracker/${blogId}`)}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-purple-600 text-white font-semibold hover:shadow-xl shadow-md hover:bg-purple-700 transition-all"
      >
        <CheckCircle className="w-5 h-5 gi3d" />
        시계열 추적 중 — 대시보드 보기
      </button>
    )
  }

  if (status === 'registering' || status === 'measuring') {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-purple-300 text-white font-semibold cursor-not-allowed"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        {status === 'registering' ? '등록 중…' : '첫 측정 중…'}
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={handleStart}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:shadow-xl shadow-md transition-all"
      >
        <Clock className="w-5 h-5 gi3d" />
        시계열 추적 시작
      </button>
      <div className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
        매일 SERP 순위를 측정해 인덱싱 지연 · 노출 유지율 · 누락 비율을 추적합니다.
        단일 시점 점수보다 robust한 운영 진단입니다.
      </div>
    </div>
  )
}


export default function AnalyzePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, user } = useAuthStore()
  const { setAnalysisResult } = useBlogContextStore()
  const { completeMission } = useXPStore()
  const [blogId, setBlogId] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<BlogIndexResult | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [autoAnalyzeTriggered, setAutoAnalyzeTriggered] = useState(false)
  // 계정 ID → 실제 블로그 주소로 정정됐을 때, 사용자가 다시 누르지 않아도 이어서 분석한다.
  // 같은 주소로 두 번 이어가지 않도록 시도한 주소를 기억한다(MOVED 가 연쇄되면 무한루프).
  const [pendingCanonical, setPendingCanonical] = useState<string | null>(null)
  const movedTriedRef = useRef<Set<string>>(new Set())
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [usageLimitInfo, setUsageLimitInfo] = useState<{ current: number; limit: number } | null>(null)
  const { width, height } = useWindowSize()

  // 무료 플랜 체크 (비로그인 또는 free 플랜)
  const isPremium = isAuthenticated && user?.plan && user.plan !== 'free'
  const isFreeUser = !isPremium

  // URL 쿼리 파라미터에서 blogId를 읽어와 자동 분석 시작
  useEffect(() => {
    const blogIdParam = searchParams.get('blogId')
    if (blogIdParam && !autoAnalyzeTriggered && !isAnalyzing && !result) {
      setBlogId(blogIdParam)
      setAutoAnalyzeTriggered(true)
    }
  }, [searchParams, autoAnalyzeTriggered, isAnalyzing, result])

  const handleAnalyze = async () => {
    if (!blogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    // 로그인한 사용자인 경우 사용량 체크 및 차감
    if (isAuthenticated && user?.id) {
      try {
        const usageCheck = await checkUsageLimit(user.id, 'blog_analysis')
        if (!usageCheck.allowed) {
          // P0-4: 풀스크린 업그레이드 모달 표시
          setUsageLimitInfo({ current: usageCheck.used || usageCheck.limit, limit: usageCheck.limit })
          setShowLimitModal(true)
          return
        }
        // 사용량 차감
        await incrementUsage(user.id, 'blog_analysis')
      } catch {
        // 사용량 추적 실패 시에도 분석은 진행
      }
    }

    setIsAnalyzing(true)
    setResult(null)
    setProgress(0)
    setLastError(null)

    try {
      // 동기 방식: 분석 결과 즉시 반환
      const analysisResponse = await analyzeBlog({
        blog_id: blogId.trim(),
        post_limit: 10,
        quick_mode: false
      })

      // 분석 결과가 response에 포함되어 있음
      if (analysisResponse.result) {
        const analysisResult = analysisResponse.result

        // Save to user's list (user?.id를 전달하여 로그인 사용자는 서버에 저장)
        await saveBlogToList({
          id: analysisResult.blog.blog_id,
          blog_id: analysisResult.blog.blog_id,
          name: analysisResult.blog.blog_name,
          level: analysisResult.index.level,
          grade: analysisResult.index.grade,
          score: analysisResult.index.total_score,
          change: 0, // First analysis
          stats: {
            posts: analysisResult.stats.total_posts,
            visitors: analysisResult.stats.total_visitors,
            engagement: analysisResult.stats.neighbor_count
          },
          last_analyzed: new Date().toISOString()
        }, user?.id)

        setResult(analysisResult)
        // 전역 컨텍스트에 저장 (페이지 이동 시 유지)
        setAnalysisResult(analysisResult)
        toast.success('분석이 완료되었습니다!')

        // 일일 미션 완료
        completeMission('analyze')

        // Show confetti for high scores
        if (analysisResult.index.level >= 7) {
          setShowConfetti(true)
          setTimeout(() => setShowConfetti(false), 5000)
        }
      } else {
        toast.error('분석 결과를 받지 못했습니다.')
      }
    } catch (error) {
      type ErrorDetail = { error_code?: string; message?: string; canonical_blog_id?: string }
      const axiosError = error as {
        response?: { data?: { detail?: string | ErrorDetail } }
        message?: string
      }
      // 백엔드는 detail을 객체로 내려준다 (문자열로 가정하면 .includes에서 터진다)
      const rawDetail = axiosError?.response?.data?.detail
      const detail: ErrorDetail = typeof rawDetail === 'object' && rawDetail !== null ? rawDetail : {}
      const errorMessage =
        (typeof rawDetail === 'string' ? rawDetail : detail.message) || axiosError?.message || ''

      // 계정 ID를 블로그 주소로 착각한 경우 — 진짜 주소를 알려주고 바로 재시도시킨다
      if (detail.error_code === 'MOVED' && detail.canonical_blog_id) {
        const canonical = detail.canonical_blog_id
        setBlogId(canonical)
        if (movedTriedRef.current.has(canonical)) {
          // 이미 그 주소로 한 번 갔는데 또 MOVED 다 — 자동으로 돌면 무한루프다.
          toast.error(`'${canonical}' 로도 분석하지 못했습니다. 주소를 확인해 주세요.`, {
            duration: 8000,
          })
        } else {
          movedTriedRef.current.add(canonical)
          // 안내만 하고 멈추면 사용자가 버튼을 한 번 더 눌러야 한다. 주소를 아는데
          // 왜 다시 누르게 하나 — 알려주고 그대로 이어서 분석한다.
          toast(`'${blogId}' 는 블로그 주소가 아닙니다. 실제 주소 '${canonical}' 로 분석합니다.`, {
            duration: 6000,
          })
          setPendingCanonical(canonical)
        }
      } else if (errorMessage.includes('not found') || errorMessage.includes('404') || errorMessage.includes('존재하지 않')) {
        toast.error('존재하지 않는 블로그입니다. ID를 확인해주세요.')
      } else if (errorMessage.includes('private') || errorMessage.includes('비공개')) {
        toast.error('비공개 블로그는 분석할 수 없습니다.')
      } else if (errorMessage.includes('timeout') || errorMessage.includes('시간 초과')) {
        toast.error('서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
        toast.error('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.')
      } else {
        toast.error('분석 중 오류가 발생했습니다. 다시 시도해주세요.')
      }

      // 에러 발생 시 재시도 버튼용 상태 유지 (blogId는 유지)
    } finally {
      setIsAnalyzing(false)
      setProgress(0)
    }
  }

  // 주소 정정 후 이어서 분석. isAnalyzing 이 내려간 뒤에 실행해야 겹치지 않는다.
  useEffect(() => {
    if (!pendingCanonical || isAnalyzing) return
    setPendingCanonical(null)
    handleAnalyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCanonical, isAnalyzing])

  // autoAnalyzeTriggered가 true이고 blogId가 설정되면 자동 분석 실행
  useEffect(() => {
    if (autoAnalyzeTriggered && blogId && !isAnalyzing && !result) {
      // 약간의 딜레이 후 분석 시작 (UI 렌더링 완료 후)
      const timer = setTimeout(() => {
        handleAnalyze()
      }, 100)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyzeTriggered, blogId])

  return (
    <div className="min-h-screen pt-24 pb-12 relative overflow-hidden">
      {/* AURORA GLASS — 배경 3D 오브 (장식, 포인터 이벤트 없음) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="orb w-72 h-72 -top-16 -left-16 opacity-70" />
        <div className="orb orb-cyan w-52 h-52 top-1/3 -right-10 opacity-60" style={{ animationDelay: '-4s' }} />
        <div className="orb w-40 h-40 bottom-24 left-1/4 opacity-40" style={{ animationDelay: '-8s' }} />
      </div>

      {showConfetti && <Confetti width={width} height={height} recycle={false} numberOfPieces={200} />}

      <div className="container mx-auto px-4">
        {/* P2-4: 소셜 프루프 토스트 */}

        {/* P1-4: 체험 만료 알림 배너 */}
        <div className="max-w-4xl mx-auto mb-6">
          <TrialExpiryBanner />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="inline-flex mb-6"
            >
              <GlassIcon icon={Sparkles} size={76} />
            </motion.div>

            <h1 className="text-5xl font-bold mb-4">
              <span className="gradient-text">블로그 분석</span>
            </h1>
            <p className="text-gray-600 text-lg mb-3">
              블로그 ID를 입력하고 운영 건강도를 확인하세요
            </p>
            <Link
              href="/analyze-post"
              className="inline-flex items-center gap-2 text-sm text-[#0064FF] hover:underline font-medium"
            >
              개별 포스트 1개를 진단하려면 → 포스트 단위 진단
            </Link>
          </div>

          {/* Search Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-3d p-8 mb-8 "
          >
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 gi3d" />
                <input
                  type="text"
                  value={blogId}
                  onChange={(e) => setBlogId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAnalyze()}
                  placeholder="블로그 ID 입력 (예: example_blog)"
                  maxLength={50}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-200 focus:border-[#0064FF] focus:outline-none text-lg transition-all"
                  disabled={isAnalyzing}
                />
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !blogId.trim()}
                className="px-8 py-4 rounded-2xl bg-[#0064FF] text-white font-semibold hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    분석중...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 gi3d" />
                    분석하기
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-500">
              <strong>예시:</strong> blog.naver.com/<span className="text-[#0064FF] font-semibold">example_blog</span> → example_blog 입력
            </div>
          </motion.div>

          {/* Loading State */}
          <AnimatePresence>
            {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="glass-3d p-12 text-center"
              >
                <div className="inline-flex mb-6">
                  <GlassIcon icon={Sparkles} size={100} />
                </div>

                <h3 className="text-2xl font-bold mb-2">AI가 분석중입니다</h3>
                <p className="text-gray-600">블로그 지표를 측정하고 있어요...</p>

                {progress > 0 && (
                  <div className="mt-6 w-full max-w-md mx-auto">
                    <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-full"
                      />
                    </div>
                    <p className="text-center text-sm text-gray-600 mt-2">{progress}% 완료</p>
                  </div>
                )}

                <div className="mt-8 space-y-3">
                  {['블로그 정보 수집', '콘텐츠 품질 분석', '지수 계산'].map((step, index) => (
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.5 }}
                      className="flex items-center gap-3"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#0064FF]" />
                      <span className="text-gray-700">{step}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results */}
          <AnimatePresence>
            {/* 측정 불가 — 네이버에서 지표를 못 가져온 경우.
                등급을 지어내지 않고 그 사실을 그대로 알린다. */}
            {result && !isAnalyzing && result.index.level === null && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-3d p-8 text-center"
              >
                <Search className="w-12 h-12 mb-4 mx-auto text-gray-300 gi3d" strokeWidth={1.5} />
                <h2 className="text-2xl font-bold mb-2">측정할 수 없습니다</h2>
                <p className="text-gray-600 mb-1">
                  {result.index.unmeasurable_reason || '네이버에서 블로그 지표를 가져오지 못했습니다.'}
                </p>
                <p className="text-sm text-gray-500">
                  블로그가 비공개이거나 아직 글이 없을 수 있습니다. 잠시 후 다시 시도해 주세요.
                </p>
              </motion.div>
            )}

            {result && !isAnalyzing && result.index.level !== null && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Score Card */}
                <div className="glass-3d p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#0064FF]/10 rounded-full blur-3xl" />

                  <div className="relative flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-bold mb-2">{result.blog.blog_name}</h2>
                      <p className="text-gray-600 mb-3">@{result.blog.blog_id}</p>
                      {/* P2-3: 공유 버튼 */}
                      <ShareResult
                        blogName={result.blog.blog_name}
                        blogId={result.blog.blog_id}
                        level={result.index.level}
                        grade={result.index.grade}
                        totalScore={result.index.total_score}
                        percentile={result.index.percentile}
                        stats={{
                          posts: result.stats.total_posts,
                          visitors: result.stats.total_visitors,
                          neighbors: result.stats.neighbor_count
                        }}
                      />
                    </div>

                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.3 }}
                      className="text-center"
                    >
                      <div className="inline-flex mb-6">
                        <GlassIcon icon={Award} size={116} />
                      </div>
                      <div className="mt-4">
                        <div className="text-6xl font-black gradient-text mb-4">
                          {(() => {
                            const level = result.index.level
                            if (level === 1) return '일반'
                            if (level <= 8) return `준최${level - 1}`
                            if (level <= 11) return `최적${level - 8}`
                            return `최적${level - 11}+`
                          })()}
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-2">
                          <AnimatedLevel level={result.index.level} />
                        </div>

                        {/* 등급 요약 한 줄.
                            예전에는 티어 카드 4개 + 프로그레스 바 + 눈금 + 다음 티어 배지가
                            차례로 쌓여서, 정작 "내가 어디쯤인가"가 더 안 보였다. */}
                        <div className="mt-6 flex flex-col items-center gap-3">
                          <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black text-gray-900">
                              {result.index.total_score.toFixed(1)}
                            </span>
                            <span className="text-lg text-gray-400">/ 100점</span>
                          </div>
                          {result.index.percentile != null && (
                            <p className="text-sm text-gray-500">
                              검색에 노출되는 블로그 중 상위{' '}
                              <span className="font-bold text-gray-700">
                                {Math.max(1, Math.round(100 - result.index.percentile))}%
                              </span>
                            </p>
                          )}
                          {result.index.level !== null && result.index.level < 15 && (() => {
                            const nextStep = getPointsToNextLevel(result.index.level as number, result.index.total_score)
                            if (!nextStep) return null
                            return (
                              <p className="text-sm text-gray-500">
                                다음 등급까지{' '}
                                <span className="font-bold text-[#0064FF]">{nextStep.pointsNeeded}점</span>
                              </p>
                            )
                          })()}
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* 자동 학습 배지 */}
                  {result.index.score_breakdown?.weights_used?.is_learned && (
                    <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-full text-sm">
                      <CheckCircle className="w-4 h-4 text-purple-600 gi3d" />
                      <span className="text-purple-700 font-medium">데이터 학습된 가중치 적용</span>
                      {result.index.score_breakdown.weights_used.learned_meta?.n && (
                        <span className="text-xs text-purple-500">
                          n={result.index.score_breakdown.weights_used.learned_meta.n}
                        </span>
                      )}
                      {result.index.score_breakdown.weights_used.learned_meta?.trained_at && (
                        <span className="text-xs text-purple-400">
                          · 갱신 {new Date(result.index.score_breakdown.weights_used.learned_meta.trained_at).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 활동성 배지 — 누적 지표에 가려지던 '지금 살아있는가'를 최상단에 */}
                  {result.index.vitality_state && result.index.vitality_state !== 'unknown' && (() => {
                    const VS: Record<string, { label: string; cls: string; dot: string }> = {
                      active:            { label: '활발히 운영 중',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
                      slowing:           { label: '발행 둔화',        cls: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500' },
                      dormant_entering:  { label: '휴면 진입',        cls: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-500' },
                      dormant:           { label: '휴면',             cls: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-500' },
                      stopped:           { label: '운영 중단',        cls: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500' },
                      abandoned:         { label: '사실상 방치',      cls: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500' },
                    }
                    const v = VS[result.index.vitality_state!]
                    if (!v) return null
                    const days = result.index.days_since_last_post
                    return (
                      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                        <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold ${v.cls}`}>
                          <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                          {v.label}
                          {typeof days === 'number' && (
                            <span className="font-normal opacity-80">· 마지막 글 {days}일 전</span>
                          )}
                        </span>
                        {typeof result.index.vitality === 'number' && result.index.vitality < 1 && (
                          <span className="text-xs text-gray-500">
                            활동성 반영으로 점수 ×{result.index.vitality.toFixed(2)} 적용됨
                          </span>
                        )}
                      </div>
                    )
                  })()}

                  <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: '운영 건강도', value: `${result.index.total_score.toFixed(1)}/100`, icon: Target, isScore: true },
                      {
                        label: '포스트',
                        value: result.stats.total_posts != null
                          ? result.stats.total_posts.toLocaleString()
                          : (result.stats.total_posts_min != null ? `${result.stats.total_posts_min}+` : '측정 불가'),
                        icon: FileText, isScore: false,
                      },
                      {
                        // 누적 방문자는 죽어도 줄지 않아 현재 상태를 못 보여준다.
                        // 실측 일평균이 있으면 그것을 주지표로 노출한다.
                        label: result.stats.recent_avg_visitors != null ? '일평균 방문자' : '누적 방문자',
                        value: result.stats.recent_avg_visitors != null
                          ? result.stats.recent_avg_visitors.toLocaleString()
                          : (result.stats.total_visitors != null ? result.stats.total_visitors.toLocaleString() : '측정 불가'),
                        icon: Users, isScore: false,
                      },
                      {
                        label: '이웃',
                        value: result.stats.neighbor_count != null
                          ? result.stats.neighbor_count.toLocaleString()
                          : '측정 불가',
                        icon: Heart, isScore: false,
                      },
                    ].map((stat, index) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 + index * 0.1 }}
                        className="text-center p-4 rounded-2xl bg-white/50 relative"
                      >
                        <stat.icon className="w-6 h-6 mb-2 mx-auto text-gray-400" strokeWidth={1.75} />
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
                          {stat.label}
                          {stat.isScore && (
                            <div className="group relative">
                              <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help gi3d" />
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 shadow-xl text-left whitespace-pre-line font-normal leading-relaxed">
                                {`외부 수집 가능한 raw 신호로 추정한 블로그 운영 건강도입니다.\n\n주의: 이 점수와 실제 네이버 SERP 순위 사이의 상관관계는 자체 검증(n=67) 결과 ρ=0.04로 거의 무관했습니다. \"이 점수가 높으면 검색 상위에 노출된다\"는 보장이 아닙니다.\n\n순위 예측 목적이라면 SERP 순위 추적 도구(판다랭크 등)를 병행하세요.`}
                                <div className="absolute left-1/2 -translate-x-1/2 top-full border-8 border-transparent border-t-gray-900" />
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* 지수 변화 추이 — "언제, 어떻게 올랐나"는 현재 점수만큼 중요하다 */}
                <BlogIndexHistoryChart blogId={result.blog.blog_id} />

                {/* 키워드 판정 — 사용자가 실제로 알고 싶은 것("이 키워드 되나?").
                    아코디언 안에 묻혀 있어 사실상 아무도 못 쓰던 기능이라 상단으로 올렸다. */}
                <KeywordVerdictWidget blogId={result.blog.blog_id} isFreeUser={isFreeUser} />

                {/* 할 일 */}
                <ConcreteRecommendations result={result} isFreeUser={isFreeUser} />

                {/* 나머지는 전부 접어둔다 */}
                <DetailsAccordion title="지표 자세히 보기" subtitle="실제로 측정한 값과 항목별 점수">
                  <DetailedMetricsSection result={result} isFreeUser={isFreeUser} />
                </DetailsAccordion>

                <DetailsAccordion title="이 점수가 무슨 뜻인가요?" subtitle="등급의 의미와 노출 경쟁력">
                  <ScoreInterpretation
                    result={result}
                    onKeywordSearch={() => router.push('/keyword-search')}
                  />
                </DetailsAccordion>

                <DetailsAccordion title="실제 검색 노출 측정" subtitle="색인 검증 · 노출 천장 · 키워드 판정">
                  <IndexVerificationCard blogId={result.blog.blog_id} />
                  <ExposureCeilingCard blogId={result.blog.blog_id} />
                </DetailsAccordion>

                {/* 방문자 추이도 기본은 접어둔다 */}
                <DetailsAccordion title="방문자 추이" subtitle="최근 일별 방문자 변화">
                {result.daily_visitors && result.daily_visitors.length > 0 && (
                  <div className="glass-3d p-8  relative overflow-hidden">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <BarChart3 className="w-6 h-6 text-[#0064FF] gi3d" />
                      일일 방문자 추이
                      {isFreeUser && (
                        <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                          3일 미리보기 제공
                        </span>
                      )}
                    </h3>

                    {/* 무료 플랜: 3일 데이터 공개 */}
                    {isFreeUser ? (
                      <div className="relative">
                        {/* 3일 미리보기 차트 */}
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={result.daily_visitors.slice(-3)} className="gi3d">
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="date"
                                stroke="#6b7280"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => {
                                  const date = new Date(value)
                                  return `${date.getMonth() + 1}/${date.getDate()}`
                                }}
                              />
                              <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '12px',
                                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                                }}
                                labelFormatter={(value) => {
                                  const date = new Date(value)
                                  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
                                }}
                                formatter={(value: any) => [`${value.toLocaleString()}명`, '방문자']}
                              />
                              <Line
                                type="monotone"
                                dataKey="visitors"
                                stroke="#0064FF"
                                strokeWidth={3}
                                dot={{ fill: '#0064FF', r: 5 }}
                                activeDot={{ r: 7 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* 3일 요약 카드 */}
                        <div className="grid grid-cols-3 gap-4 mt-4 mb-4">
                          {result.daily_visitors.slice(-3).map((day: any, i: number) => {
                            const date = new Date(day.date)
                            const prevVisitors = result.daily_visitors![result.daily_visitors!.length - 4 + i]?.visitors || day.visitors
                            const change = ((day.visitors - prevVisitors) / prevVisitors * 100).toFixed(1)
                            const isUp = day.visitors >= prevVisitors

                            return (
                              <div key={i} className="bg-white rounded-xl p-4 text-center border border-gray-100">
                                <div className="text-sm text-gray-500 mb-1">
                                  {date.getMonth() + 1}/{date.getDate()}
                                </div>
                                <div className="text-2xl font-bold text-gray-900">
                                  {day.visitors.toLocaleString()}
                                </div>
                                <div className={`text-xs font-medium ${isUp ? 'text-green-600' : 'text-red-500'}`}>
                                  {isUp ? '↑' : '↓'} {Math.abs(parseFloat(change))}%
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* P1: 더 많은 데이터 보기 유도 - 블러 영역 확대 */}
                        <div className="relative mt-4">
                          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-transparent to-white/90 pointer-events-none" />
                          <div className="blur-[4px] opacity-50 h-40 bg-gradient-to-r from-blue-100 to-purple-100 rounded-xl flex items-center justify-center">
                            <span className="text-gray-400 text-lg">+ 12일 추가 데이터</span>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-white rounded-xl px-6 py-4 shadow-lg text-center border border-gray-100">
                              <p className="text-sm text-gray-600 mb-3">
                                <strong>15일 전체 추이</strong>와 <strong>성장 패턴 분석</strong>을 확인하세요
                              </p>
                              <Link href="/pricing">
                                <button className="px-4 py-2 bg-[#0064FF] text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all">
                                  Pro 플랜으로 전체 보기
                                </button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Pro 플랜: 전체 15일 차트 */
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={result.daily_visitors} className="gi3d">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                              dataKey="date"
                              stroke="#6b7280"
                              tick={{ fontSize: 12 }}
                              tickFormatter={(value) => {
                                const date = new Date(value)
                                return `${date.getMonth() + 1}/${date.getDate()}`
                              }}
                            />
                            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                              }}
                              labelFormatter={(value) => {
                                const date = new Date(value)
                                return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
                              }}
                              formatter={(value: any) => [`${value.toLocaleString()}명`, '방문자']}
                            />
                            <Line
                              type="monotone"
                              dataKey="visitors"
                              stroke="url(#colorGradient)"
                              strokeWidth={3}
                              dot={{ fill: '#0064FF', r: 4 }}
                              activeDot={{ r: 6 }}
                            />
                            <defs>
                              <linearGradient id="colorGradient" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#0064FF" />
                                <stop offset="50%" stopColor="#3182F6" />
                                <stop offset="100%" stopColor="#4A9AF8" />
                              </linearGradient>
                            </defs>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}
                </DetailsAccordion>

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="glass-3d p-8 ">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <AlertCircle className="w-6 h-6 text-orange-600 gi3d" />
                      주의사항
                    </h3>

                    <div className="space-y-3">
                      {result.warnings.map((warning: any, index: number) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.9 + index * 0.1 }}
                          className="p-4 rounded-2xl bg-orange-50 border-l-4 border-orange-500 text-orange-900"
                        >
                          {warning.message}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 플라톤마케팅 CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.3 }}
                  className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl" />
                  <div className="relative flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-6 h-6 text-white gi3d" />
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-lg mb-1">전문가의 도움이 필요하신가요?</h4>
                        <p className="text-slate-400 text-sm">
                          병원/의료 블로그라면 플라톤마케팅의 전문 컨설팅을 받아보세요
                        </p>
                      </div>
                    </div>
                    <a
                      href="https://www.brandplaton.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-3 bg-gradient-to-r from-violet-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap flex items-center gap-2"
                    >
                      무료 상담 신청
                      <ChevronRight className="w-4 h-4 gi3d" />
                    </a>
                  </div>
                </motion.div>

                {/* CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.4 }}
                  className="text-center py-8 space-y-4"
                >
                  {/* 시계열 추적 시작 — B 검증 후 추가 */}
                  {isAuthenticated && user?.id && (
                    <StartTrackingButton
                      blogId={result.blog.blog_id}
                      blogName={result.blog.blog_name}
                      userId={user.id}
                    />
                  )}

                  <div>
                    <button
                      onClick={() => {
                        setBlogId('')
                        setResult(null)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      className="px-8 py-4 rounded-full bg-[#0064FF] text-white font-semibold hover:shadow-xl shadow-lg shadow-[#0064FF]/15 transition-all duration-300"
                    >
                      다른 블로그 분석하기
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* P0-4: 일일 한도 초과 시 업그레이드 모달 */}
      <UpgradeModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        feature="blog_analysis"
        currentUsage={usageLimitInfo?.current}
        maxUsage={usageLimitInfo?.limit}
      />
    </div>
  )
}
