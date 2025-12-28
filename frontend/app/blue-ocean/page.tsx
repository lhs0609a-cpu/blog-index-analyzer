'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, TrendingUp, Target, Sparkles, Crown,
  Gem, Medal, ChevronRight, AlertCircle, Info,
  BarChart3, FileText, Image, Loader2, ArrowLeft
} from 'lucide-react'
import Link from 'next/link'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev'

interface BlueOceanKeyword {
  keyword: string
  search_volume: number
  blog_ratio: number
  top10_avg_score: number
  top10_min_score: number
  influencer_count: number
  bos_score: number
  bos_rating: string
  entry_chance: string
  entry_percentage: number
  my_score_gap: number | null
  recommended_content_length: number
  recommended_image_count: number
  tips: string[]
}

interface BlueOceanAnalysis {
  success: boolean
  main_keyword: string
  my_blog_score: number | null
  my_blog_level: number | null
  keywords: BlueOceanKeyword[]
  gold_keywords: BlueOceanKeyword[]
  silver_keywords: BlueOceanKeyword[]
  total_analyzed: number
  analysis_summary: {
    total_keywords: number
    gold_count: number
    silver_count: number
    avg_bos_score: number
    best_keyword: string | null
    recommendation: string
  }
  error?: string
}

const ratingConfig = {
  gold: {
    icon: Crown,
    color: 'from-yellow-400 to-amber-500',
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
    text: 'text-yellow-700',
    label: '황금 키워드'
  },
  silver: {
    icon: Gem,
    color: 'from-gray-300 to-gray-400',
    bg: 'bg-gray-50',
    border: 'border-gray-300',
    text: 'text-gray-700',
    label: '좋은 기회'
  },
  bronze: {
    icon: Medal,
    color: 'from-orange-400 to-orange-500',
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-700',
    label: '도전 가능'
  },
  iron: {
    icon: Target,
    color: 'from-gray-500 to-gray-600',
    bg: 'bg-gray-100',
    border: 'border-gray-400',
    text: 'text-gray-600',
    label: '경쟁 있음'
  },
  blocked: {
    icon: AlertCircle,
    color: 'from-red-400 to-red-500',
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-700',
    label: '레드오션'
  }
}

export default function BlueOceanPage() {
  const [keyword, setKeyword] = useState('')
  const [myBlogId, setMyBlogId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BlueOceanAnalysis | null>(null)
  const [selectedKeyword, setSelectedKeyword] = useState<BlueOceanKeyword | null>(null)

  const handleAnalyze = async () => {
    if (!keyword.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const params = new URLSearchParams({
        keyword: keyword.trim(),
        expand: 'true',
        min_search_volume: '100',
        max_keywords: '20'
      })

      if (myBlogId.trim()) {
        params.append('my_blog_id', myBlogId.trim())
      }

      const response = await fetch(`${API_BASE}/api/blue-ocean/analyze?${params}`)
      const data = await response.json()

      setResult(data)
    } catch (error) {
      console.error('Error:', error)
      setResult({
        success: false,
        main_keyword: keyword,
        my_blog_score: null,
        my_blog_level: null,
        keywords: [],
        gold_keywords: [],
        silver_keywords: [],
        total_analyzed: 0,
        analysis_summary: {} as any,
        error: '분석 중 오류가 발생했습니다.'
      })
    } finally {
      setLoading(false)
    }
  }

  const getRatingConfig = (rating: string) => {
    return ratingConfig[rating as keyof typeof ratingConfig] || ratingConfig.iron
  }

  const formatNumber = (num: number) => {
    if (num >= 10000) return `${(num / 10000).toFixed(1)}만`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
    return num.toString()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/tools" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-5 h-5" />
              <span>도구 목록</span>
            </Link>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              🌊 블루오션 키워드 발굴
            </h1>
            <div className="w-20" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Search Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-xl p-6 mb-8"
        >
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              검색량은 높고, 경쟁은 낮은 키워드를 찾아드립니다
            </h2>
            <p className="text-gray-600">
              블루오션 스코어(BOS)로 최적의 키워드를 발굴하세요
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                분석할 키워드 (카테고리)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAnalyze()}
                  placeholder="예: 다이어트, 피부과, 영어공부"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                내 블로그 ID (선택 - 맞춤 분석)
              </label>
              <input
                type="text"
                value={myBlogId}
                onChange={(e) => setMyBlogId(e.target.value)}
                placeholder="예: myblog123"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || !keyword.trim()}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-bold text-lg hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                블루오션 키워드 분석 중...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                블루오션 키워드 발굴하기
              </>
            )}
          </button>

          {/* BOS 등급 설명 */}
          <div className="mt-6 grid grid-cols-5 gap-2 text-center text-xs">
            {Object.entries(ratingConfig).map(([key, config]) => {
              const Icon = config.icon
              return (
                <div key={key} className={`${config.bg} ${config.border} border rounded-lg py-2 px-1`}>
                  <Icon className={`w-4 h-4 mx-auto mb-1 ${config.text}`} />
                  <div className={`font-bold ${config.text}`}>{config.label}</div>
                  <div className="text-gray-500">
                    {key === 'gold' ? '80+' : key === 'silver' ? '60-79' : key === 'bronze' ? '40-59' : key === 'iron' ? '20-39' : '0-19'}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* Results Section */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {result.error ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <p className="text-red-700">{result.error}</p>
                </div>
              ) : (
                <>
                  {/* Summary Card */}
                  {result.analysis_summary && (
                    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
                      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-500" />
                        분석 결과 요약
                      </h3>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-blue-50 rounded-xl p-4 text-center">
                          <div className="text-3xl font-bold text-blue-600">{result.total_analyzed}</div>
                          <div className="text-sm text-gray-600">분석 키워드</div>
                        </div>
                        <div className="bg-yellow-50 rounded-xl p-4 text-center">
                          <div className="text-3xl font-bold text-yellow-600">{result.analysis_summary.gold_count || 0}</div>
                          <div className="text-sm text-gray-600">황금 키워드</div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4 text-center">
                          <div className="text-3xl font-bold text-gray-600">{result.analysis_summary.silver_count || 0}</div>
                          <div className="text-sm text-gray-600">좋은 기회</div>
                        </div>
                        <div className="bg-cyan-50 rounded-xl p-4 text-center">
                          <div className="text-3xl font-bold text-cyan-600">{result.analysis_summary.avg_bos_score || 0}</div>
                          <div className="text-sm text-gray-600">평균 BOS</div>
                        </div>
                      </div>

                      {result.my_blog_score && (
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-purple-500 text-white rounded-full w-12 h-12 flex items-center justify-center font-bold">
                              Lv.{result.my_blog_level}
                            </div>
                            <div>
                              <div className="font-bold text-purple-800">내 블로그 점수: {result.my_blog_score}점</div>
                              <div className="text-sm text-purple-600">맞춤 진입 가능성이 계산되었습니다</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {result.analysis_summary.recommendation && (
                        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl p-4">
                          <p className="font-medium">{result.analysis_summary.recommendation}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Keywords Table */}
                  <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">블루오션 키워드 목록</h3>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">등급</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">키워드</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">BOS</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">검색량</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">상위10 평균</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">진입 확률</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">상세</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {result.keywords.map((kw, idx) => {
                            const config = getRatingConfig(kw.bos_rating)
                            const Icon = config.icon

                            return (
                              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${config.bg} ${config.border} border`}>
                                    <Icon className={`w-3 h-3 ${config.text}`} />
                                    <span className={`text-xs font-bold ${config.text}`}>{config.label}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="font-medium text-gray-800">{kw.keyword}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-lg font-bold ${
                                    kw.bos_score >= 80 ? 'text-yellow-600' :
                                    kw.bos_score >= 60 ? 'text-gray-600' :
                                    kw.bos_score >= 40 ? 'text-orange-600' : 'text-gray-500'
                                  }`}>
                                    {kw.bos_score}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="text-blue-600 font-medium">{formatNumber(kw.search_volume)}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="text-gray-600">{kw.top10_avg_score}점</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          kw.entry_percentage >= 70 ? 'bg-green-500' :
                                          kw.entry_percentage >= 50 ? 'bg-yellow-500' :
                                          kw.entry_percentage >= 20 ? 'bg-orange-500' : 'bg-red-500'
                                        }`}
                                        style={{ width: `${kw.entry_percentage}%` }}
                                      />
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">{kw.entry_percentage}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => setSelectedKeyword(kw)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                  >
                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keyword Detail Modal */}
        <AnimatePresence>
          {selectedKeyword && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedKeyword(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-gray-800">{selectedKeyword.keyword}</h3>
                    <div className={`px-3 py-1 rounded-full ${getRatingConfig(selectedKeyword.bos_rating).bg} ${getRatingConfig(selectedKeyword.bos_rating).border} border`}>
                      <span className={`font-bold ${getRatingConfig(selectedKeyword.bos_rating).text}`}>
                        BOS {selectedKeyword.bos_score}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 rounded-xl p-3">
                        <div className="text-sm text-gray-600">월간 검색량</div>
                        <div className="text-xl font-bold text-blue-600">{formatNumber(selectedKeyword.search_volume)}</div>
                      </div>
                      <div className="bg-purple-50 rounded-xl p-3">
                        <div className="text-sm text-gray-600">상위10 평균</div>
                        <div className="text-xl font-bold text-purple-600">{selectedKeyword.top10_avg_score}점</div>
                      </div>
                      <div className="bg-green-50 rounded-xl p-3">
                        <div className="text-sm text-gray-600">진입 확률</div>
                        <div className="text-xl font-bold text-green-600">{selectedKeyword.entry_percentage}%</div>
                      </div>
                      <div className="bg-orange-50 rounded-xl p-3">
                        <div className="text-sm text-gray-600">인플루언서</div>
                        <div className="text-xl font-bold text-orange-600">{selectedKeyword.influencer_count}명</div>
                      </div>
                    </div>

                    {/* Score Gap */}
                    {selectedKeyword.my_score_gap !== null && (
                      <div className={`rounded-xl p-4 ${selectedKeyword.my_score_gap >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <div className="flex items-center gap-2">
                          {selectedKeyword.my_score_gap >= 0 ? (
                            <TrendingUp className="w-5 h-5 text-green-600" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-red-600" />
                          )}
                          <span className={`font-medium ${selectedKeyword.my_score_gap >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {selectedKeyword.my_score_gap >= 0
                              ? `상위 최저 점수보다 ${selectedKeyword.my_score_gap}점 높습니다`
                              : `상위 진입까지 ${Math.abs(selectedKeyword.my_score_gap)}점 필요`
                            }
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        권장 콘텐츠 스펙
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-500" />
                          <span className="text-sm text-gray-600">글자수:</span>
                          <span className="font-bold text-gray-800">{selectedKeyword.recommended_content_length.toLocaleString()}자+</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Image className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-gray-600">사진:</span>
                          <span className="font-bold text-gray-800">{selectedKeyword.recommended_image_count}장+</span>
                        </div>
                      </div>
                    </div>

                    {/* Tips */}
                    {selectedKeyword.tips.length > 0 && (
                      <div className="bg-blue-50 rounded-xl p-4">
                        <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                          <Info className="w-4 h-4" />
                          공략 팁
                        </h4>
                        <ul className="space-y-2">
                          {selectedKeyword.tips.map((tip, idx) => (
                            <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="text-blue-500 mt-0.5">•</span>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedKeyword(null)}
                    className="w-full mt-6 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-gray-700 transition-colors"
                  >
                    닫기
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
