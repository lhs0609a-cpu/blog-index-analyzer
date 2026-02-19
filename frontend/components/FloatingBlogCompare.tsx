'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Minimize2, Maximize2, ChevronUp, ChevronDown, Target, Loader2 } from 'lucide-react'

interface DimensionComparison {
  dimension: string
  label: string
  score: number
  detail: string
  my_value: any
  competitor_avg: any
  weight: number
}

interface Recommendation {
  type: string
  message: string
  priority: string
  current?: number
  target?: number
}

interface KeywordCompetitiveness {
  difficulty: string
  difficulty_score: number
  level_floor: number
  high_level_count: number
  avg_level?: number
  detail: string
}

interface MyBlogAnalysis {
  blog_id: string
  blog_name: string
  naver_level: number | null
  related_post_count: number
  already_ranking: number | null
  stats: { total_posts: number | null }
  keyword_competitiveness: KeywordCompetitiveness
  competitive_position: {
    probability_low: number
    probability_mid: number
    probability_high: number
    rank_best: number
    rank_worst: number
    rank_explanation: string
    weighted_score: number
    grade: string
    grade_label: string
    confidence?: string
  }
  dimension_comparisons: DimensionComparison[]
  recommendations: Recommendation[]
  data_quality: {
    estimated_fields: string[]
    warnings: string[]
    limitations?: string[]
    limitation_summary?: string
  }
}

interface FloatingBlogCompareProps {
  myBlogId: string
  setMyBlogId: (id: string) => void
  currentKeyword: string
  myBlogResult: MyBlogAnalysis | null
  isAnalyzing: boolean
  onAnalyze: () => void
}

type WidgetMode = 'minimized' | 'compact' | 'expanded'

export default function FloatingBlogCompare({
  myBlogId,
  setMyBlogId,
  currentKeyword,
  myBlogResult,
  isAnalyzing,
  onAnalyze,
}: FloatingBlogCompareProps) {
  const [mode, setMode] = useState<WidgetMode>('compact')
  const [isVisible, setIsVisible] = useState(true)

  // Reset to compact when keyword changes
  useEffect(() => {
    if (myBlogResult) {
      setMode('compact')
      setIsVisible(true)
    }
  }, [currentKeyword])

  const getLevelColor = (level: number | null) => {
    if (!level || level <= 1) return 'bg-gray-400'
    if (level === 2) return 'bg-blue-500'
    if (level === 3) return 'bg-indigo-600'
    return 'bg-gradient-to-r from-amber-500 to-orange-500'
  }

  const getGradeBg = (grade: string) => {
    if (grade === 'A') return 'bg-green-50 border-green-300 text-green-800'
    if (grade === 'B') return 'bg-blue-50 border-blue-300 text-blue-800'
    if (grade === 'C') return 'bg-orange-50 border-orange-300 text-orange-800'
    return 'bg-red-50 border-red-300 text-red-800'
  }

  const getDifficultyBadge = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return { label: '쉬움', color: 'bg-green-50 text-green-700', dot: 'bg-green-500' }
      case 'moderate': return { label: '보통', color: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-500' }
      case 'hard': return { label: '어려움', color: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' }
      case 'very_hard': return { label: '매우 어려움', color: 'bg-red-50 text-red-700', dot: 'bg-red-500' }
      default: return { label: '미분류', color: 'bg-gray-50 text-gray-700', dot: 'bg-gray-500' }
    }
  }

  if (!isVisible) {
    return (
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        onClick={() => { setIsVisible(true); setMode('compact') }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-shadow"
        title="내 블로그 비교"
      >
        <Target className="w-6 h-6" />
      </motion.button>
    )
  }

  const cp = myBlogResult?.competitive_position
  const probMid = cp?.probability_mid ?? 0
  const probColor = probMid >= 50 ? 'text-green-600' : probMid >= 35 ? 'text-blue-600' : probMid >= 20 ? 'text-orange-600' : 'text-red-600'
  const barColor = probMid >= 50 ? 'from-green-400 to-green-600' : probMid >= 35 ? 'from-blue-400 to-blue-600' : probMid >= 20 ? 'from-orange-400 to-orange-600' : 'from-red-400 to-red-600'

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.9 }}
        className="fixed bottom-6 right-6 z-50"
        style={{ maxWidth: mode === 'expanded' ? '420px' : '360px', width: mode === 'minimized' ? 'auto' : '100%' }}
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-blue-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0064FF] to-[#3182F6] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Target className="w-4 h-4" />
              <span className="font-bold text-sm">
                {myBlogResult ? `${myBlogResult.blog_name}` : '내 블로그 비교'}
              </span>
              {myBlogResult && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${getLevelColor(myBlogResult.naver_level)} text-white`}>
                  Lv.{myBlogResult.naver_level || '?'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {mode !== 'minimized' && (
                <button
                  onClick={() => setMode(mode === 'expanded' ? 'compact' : 'expanded')}
                  className="p-1 text-white/80 hover:text-white transition-colors"
                  title={mode === 'expanded' ? '축소' : '확장'}
                >
                  {mode === 'expanded' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={() => setMode(mode === 'minimized' ? 'compact' : 'minimized')}
                className="p-1 text-white/80 hover:text-white transition-colors"
                title={mode === 'minimized' ? '열기' : '최소화'}
              >
                {mode === 'minimized' ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="p-1 text-white/80 hover:text-white transition-colors"
                title="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Minimized: just header */}
          {mode === 'minimized' && myBlogResult && cp && (
            <div className="px-4 py-2 flex items-center justify-between bg-gray-50 cursor-pointer" onClick={() => setMode('compact')}>
              <span className="text-xs text-gray-600">"{currentKeyword}"</span>
              <span className={`text-sm font-bold ${probColor}`}>{probMid}점</span>
            </div>
          )}

          {/* Content: compact or expanded */}
          {mode !== 'minimized' && (
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {/* Blog ID Input */}
              {!myBlogResult && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-2">블로그 ID를 입력하면 "{currentKeyword}" 키워드의 10위권 진입 가능성을 분석합니다</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={myBlogId}
                      onChange={(e) => setMyBlogId(e.target.value)}
                      placeholder="블로그 ID"
                      maxLength={50}
                      className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-[#0064FF] focus:border-transparent bg-white"
                      disabled={isAnalyzing}
                      onKeyDown={(e) => { if (e.key === 'Enter' && myBlogId.trim()) onAnalyze() }}
                    />
                    <button
                      onClick={onAnalyze}
                      disabled={isAnalyzing || !myBlogId.trim()}
                      className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap ${
                        isAnalyzing || !myBlogId.trim()
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white hover:shadow-lg'
                      }`}
                    >
                      {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : '분석'}
                    </button>
                  </div>
                </div>
              )}

              {/* Analysis Result - Compact */}
              {myBlogResult && cp && (
                <>
                  {/* Re-analyze bar */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={myBlogId}
                      onChange={(e) => setMyBlogId(e.target.value)}
                      placeholder="블로그 ID"
                      maxLength={50}
                      className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50"
                      disabled={isAnalyzing}
                    />
                    <button
                      onClick={onAnalyze}
                      disabled={isAnalyzing || !myBlogId.trim()}
                      className="px-3 py-1.5 rounded-lg font-semibold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : '재분석'}
                    </button>
                  </div>

                  {/* Already ranking */}
                  {myBlogResult.already_ranking && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 text-xs text-green-700 font-bold text-center">
                      현재 {myBlogResult.already_ranking}위 노출 중
                    </div>
                  )}

                  {/* Core metric */}
                  <div className="bg-gradient-to-r from-[#0064FF]/5 to-[#3182F6]/5 rounded-xl p-4 mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-700">10위권 진입 경쟁력</span>
                      <div className="text-right">
                        <span className={`text-2xl font-bold ${probColor}`}>{probMid}</span>
                        <span className="text-xs text-gray-400 ml-1">/100</span>
                      </div>
                    </div>
                    <div className="relative h-5 bg-white rounded-full overflow-hidden mb-2">
                      <div
                        className="absolute inset-y-0 bg-gray-100 rounded-full"
                        style={{ left: `${cp.probability_low}%`, width: `${Math.max(1, cp.probability_high - cp.probability_low)}%` }}
                      />
                      <div
                        className={`absolute inset-y-0 left-0 flex items-center justify-end pr-2 text-white text-[10px] font-bold transition-all duration-1000 bg-gradient-to-r ${barColor} rounded-full`}
                        style={{ width: `${Math.max(3, probMid)}%` }}
                      >
                        {probMid >= 15 && `${probMid}`}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">예상 순위</span>
                      <span className="font-bold text-[#0064FF]">
                        {cp.rank_best === cp.rank_worst
                          ? (cp.rank_best > 10 ? '순위권 밖' : `${cp.rank_best}위`)
                          : (cp.rank_worst > 10 ? `${cp.rank_best}위 이상` : `${cp.rank_best}위 ~ ${cp.rank_worst}위`)}
                      </span>
                    </div>
                    {cp.confidence === 'low' && (
                      <p className="text-[10px] text-amber-600 mt-1">* 데이터 부족으로 정확도가 낮을 수 있습니다</p>
                    )}
                  </div>

                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className={`rounded-lg p-2 text-center border ${getGradeBg(cp.grade)}`}>
                      <p className="text-[9px] font-medium mb-0.5">등급</p>
                      <p className="text-lg font-bold">{cp.grade}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center border border-gray-200">
                      <p className="text-[9px] font-medium text-gray-500 mb-0.5">레벨</p>
                      <p className="text-lg font-bold text-gray-800">Lv.{myBlogResult.naver_level || '?'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center border border-gray-200">
                      <p className="text-[9px] font-medium text-gray-500 mb-0.5">관련 글</p>
                      <p className="text-lg font-bold text-gray-800">{myBlogResult.related_post_count}개</p>
                    </div>
                  </div>

                  {/* Topic warning */}
                  {myBlogResult.related_post_count === 0 && (
                    <div className="bg-red-50 border-l-4 border-red-400 p-2 rounded mb-3">
                      <p className="text-xs text-red-700 font-medium">관련 글이 없습니다. 먼저 관련 글을 작성하세요.</p>
                    </div>
                  )}

                  {/* Expanded: dimension comparisons + recommendations */}
                  {mode === 'expanded' && (
                    <>
                      {/* Keyword difficulty */}
                      {myBlogResult.keyword_competitiveness && myBlogResult.keyword_competitiveness.difficulty !== 'unknown' && (() => {
                        const kc = myBlogResult.keyword_competitiveness
                        const diffBadge = getDifficultyBadge(kc.difficulty)
                        return (
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium mb-3 ${diffBadge.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${diffBadge.dot}`} />
                            난이도: {diffBadge.label}
                            {kc.high_level_count > 0 && (
                              <span className="opacity-75">(상위 {kc.high_level_count}개 고레벨)</span>
                            )}
                          </div>
                        )
                      })()}

                      {/* 6-dimension comparison */}
                      <div className="mb-3">
                        <h6 className="text-xs font-bold text-gray-700 mb-2">차원별 경쟁력</h6>
                        <div className="grid grid-cols-2 gap-2">
                          {myBlogResult.dimension_comparisons.map((dim) => (
                            <div key={dim.dimension} className="bg-gray-50 rounded-lg p-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-medium text-gray-600">{dim.label}</span>
                                <span className={`text-xs font-bold ${
                                  dim.score >= 65 ? 'text-green-600' : dim.score >= 40 ? 'text-orange-600' : 'text-red-600'
                                }`}>{dim.score}</span>
                              </div>
                              <div className="relative h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                                    dim.score >= 65 ? 'bg-green-500' : dim.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${dim.score}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Recommendations (top 3) */}
                      <div className="bg-yellow-50 border-l-3 border-yellow-400 p-3 rounded mb-3">
                        <h6 className="text-xs font-bold text-gray-800 mb-2">개선 방안</h6>
                        <ul className="space-y-1.5">
                          {myBlogResult.recommendations.slice(0, 3).map((rec, idx) => (
                            <li key={idx} className="text-[11px] text-gray-700 flex items-start gap-1.5">
                              <span className={`mt-0.5 ${
                                rec.type === 'critical' ? 'text-red-500' :
                                rec.type === 'opportunity' ? 'text-green-500' :
                                rec.type === 'success' ? 'text-blue-500' :
                                'text-yellow-500'
                              }`}>
                                {rec.type === 'critical' ? '!!' : rec.type === 'success' ? 'V' : '*'}
                              </span>
                              <span>{rec.message}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Data quality */}
                      {myBlogResult.data_quality.warnings.length > 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded p-2">
                          <p className="text-[10px] text-gray-400 mb-0.5 font-medium">데이터 품질 안내</p>
                          {myBlogResult.data_quality.warnings.slice(0, 2).map((w, i) => (
                            <p key={i} className="text-[10px] text-gray-400">{w}</p>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Loading state */}
              {isAnalyzing && !myBlogResult && (
                <div className="text-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-[#0064FF] mx-auto mb-2" />
                  <p className="text-xs text-gray-500">경쟁력 분석 중...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
