'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Activity,
  Database,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
  Target,
  Zap,
  BarChart3,
  PieChart,
  Clock,
  Users,
  FileText,
  Eye,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Play,
  RotateCcw,
} from 'lucide-react'

// 타입 정의
interface LearningWeights {
  c_rank: {
    weight: number
    sub_weights: {
      context: number
      content: number
      chain: number
    }
  }
  dia: {
    weight: number
    sub_weights: {
      depth: number
      information: number
      accuracy: number
    }
  }
  extra_factors: {
    post_count: number
    neighbor_count: number
    blog_age: number
    recent_activity: number
    visitor_count: number
  }
  rank_position_factor: {
    top3: number
    top10: number
    top30: number
    others: number
  }
}

interface LearningStats {
  total_samples: number
  total_learning_sessions: number
  current_weights: LearningWeights
  recent_accuracy: number | null
  last_learning: string | null
}

interface TrainingSample {
  keyword: string
  timestamp: string
  results: {
    blog_id: string
    actual_rank: number
    c_rank_score: number
    dia_score: number
    total_score: number
    post_count: number
    neighbor_count: number
  }[]
}

interface RankDifference {
  blog_id: string
  actual_rank: number
  predicted_rank: number
  difference: number
  actual_score: number
  predicted_score: number
}

interface FactorCorrelation {
  correlation: number
  impact: 'high' | 'medium' | 'low'
  direction: 'positive' | 'negative'
}

interface SearchHistory {
  keyword: string
  timestamp: string
  blog_count: number
  avg_score: number
  avg_c_rank: number
  avg_dia: number
  top_blogs: string[]
}

interface RealtimeUpdate {
  type: 'search' | 'learn' | 'weight_update'
  timestamp: string
  data: any
}

export default function LearningDashboard() {
  // 상태 관리
  const [stats, setStats] = useState<LearningStats | null>(null)
  const [weights, setWeights] = useState<LearningWeights | null>(null)
  const [samples, setSamples] = useState<TrainingSample[]>([])
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([])
  const [realtimeUpdates, setRealtimeUpdates] = useState<RealtimeUpdate[]>([])
  const [factorCorrelations, setFactorCorrelations] = useState<{ [key: string]: FactorCorrelation }>({})

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [training, setTraining] = useState(false)
  const [error, setError] = useState('')

  const [showWeightsDetail, setShowWeightsDetail] = useState(false)
  const [showSamplesDetail, setShowSamplesDetail] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

  // 학습 통계 로드
  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/blogs/learning/stats`)
      if (response.ok) {
        const data = await response.json()
        setStats(data)
        setWeights(data.current_weights)
      }
    } catch (err) {
      console.error('Failed to load learning stats:', err)
    }
  }, [API_URL])

  // 현재 가중치 로드
  const loadWeights = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/blogs/learning/weights`)
      if (response.ok) {
        const data = await response.json()
        setWeights(data.weights)
      }
    } catch (err) {
      console.error('Failed to load weights:', err)
    }
  }, [API_URL])

  // 학습 샘플 로드 (백엔드에서 직접)
  const loadSamples = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/blogs/learning/samples?limit=50`)
      if (response.ok) {
        const data = await response.json()
        setSamples(data.samples || [])
      }
    } catch (err) {
      console.error('Failed to load samples:', err)
    }
  }, [API_URL])

  // 검색 이력 로드
  const loadSearchHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/blogs/learning/search-history?limit=50`)
      if (response.ok) {
        const data = await response.json()
        setSearchHistory(data.history || [])
      }
    } catch (err) {
      console.error('Failed to load search history:', err)
    }
  }, [API_URL])

  // 전체 데이터 새로고침
  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([loadStats(), loadWeights(), loadSearchHistory(), loadSamples()])

      // 새로고침 이벤트 추가
      setRealtimeUpdates(prev => [{
        type: 'search',
        timestamp: new Date().toISOString(),
        data: { message: '데이터 새로고침 완료' }
      }, ...prev.slice(0, 49)])

    } catch (err) {
      setError('데이터 로드 실패')
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [loadStats, loadWeights, loadSearchHistory, loadSamples])

  // 수동 학습 실행
  const runTraining = async () => {
    setTraining(true)
    try {
      const response = await fetch(`${API_URL}/api/blogs/learning/train?learning_rate=0.1`, {
        method: 'POST'
      })

      if (response.ok) {
        const data = await response.json()

        // 학습 결과 업데이트 추가
        setRealtimeUpdates(prev => [{
          type: 'learn',
          timestamp: new Date().toISOString(),
          data: {
            accuracy_before: data.accuracy_before,
            accuracy_after: data.accuracy_after,
            improvement: data.improvement,
            samples_used: data.samples_used
          }
        }, ...prev.slice(0, 49)])

        // 새 가중치 로드
        await loadWeights()
        await loadStats()
      }
    } catch (err) {
      setError('학습 실행 실패')
    } finally {
      setTraining(false)
    }
  }

  // 가중치 초기화
  const resetWeights = async () => {
    if (!confirm('가중치를 기본값으로 초기화하시겠습니까?')) return

    try {
      const response = await fetch(`${API_URL}/api/blogs/learning/reset-weights`, {
        method: 'POST'
      })

      if (response.ok) {
        setRealtimeUpdates(prev => [{
          type: 'weight_update',
          timestamp: new Date().toISOString(),
          data: { message: '가중치 초기화 완료' }
        }, ...prev.slice(0, 49)])

        await loadWeights()
        await loadStats()
      }
    } catch (err) {
      setError('가중치 초기화 실패')
    }
  }

  // 초기 로드
  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // 자동 새로고침 (30초마다)
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      refreshAll()
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshAll])

  // 가중치 변화율 계산
  const getWeightChangeIndicator = (current: number, baseline: number) => {
    const diff = current - baseline
    if (Math.abs(diff) < 1) return null
    return diff > 0 ? (
      <span className="text-green-500 text-xs flex items-center">
        <TrendingUp className="w-3 h-3 mr-1" />+{diff.toFixed(1)}
      </span>
    ) : (
      <span className="text-red-500 text-xs flex items-center">
        <TrendingDown className="w-3 h-3 mr-1" />{diff.toFixed(1)}
      </span>
    )
  }

  // 정확도 색상
  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 70) return 'text-green-500'
    if (accuracy >= 50) return 'text-yellow-500'
    return 'text-red-500'
  }

  // 상관관계 영향도 색상
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-green-100 text-green-700'
      case 'medium': return 'bg-yellow-100 text-yellow-700'
      case 'low': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="p-6 rounded-full instagram-gradient"
        >
          <Brain className="w-8 h-8 text-white" />
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      <div className="container mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="p-2 rounded-full hover:bg-white/50 transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-4xl font-bold mb-2">
                <span className="gradient-text">학습 대시보드</span>
              </h1>
              <p className="text-gray-600">실시간 순위 학습 현황을 모니터링하세요</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 자동 새로고침 토글 */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                autoRefresh
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              <Activity className={`w-4 h-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
              {autoRefresh ? '실시간' : '수동'}
            </button>

            {/* 새로고침 버튼 */}
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-gray-50 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              새로고침
            </button>

            {/* 학습 실행 버튼 */}
            <button
              onClick={runTraining}
              disabled={training || (stats?.total_samples || 0) < 5}
              className="flex items-center gap-2 px-6 py-2 rounded-full instagram-gradient text-white font-semibold disabled:opacity-50 transition-all"
            >
              {training ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              학습 실행
            </button>
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2"
          >
            <AlertCircle className="w-5 h-5" />
            {error}
            <button onClick={() => setError('')} className="ml-auto">
              <ChevronUp className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* 주요 지표 카드 */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {/* 학습 샘플 수 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <Database className="w-6 h-6 text-purple-600" />
              </div>
              <span className="text-xs text-gray-500">총 샘플</span>
            </div>
            <div className="text-3xl font-bold gradient-text">
              {stats?.total_samples || 0}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {(stats?.total_samples || 0) < 10
                ? `${10 - (stats?.total_samples || 0)}개 더 필요`
                : '학습 가능'}
            </p>
          </motion.div>

          {/* 학습 세션 수 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-pink-100 flex items-center justify-center">
                <Brain className="w-6 h-6 text-pink-600" />
              </div>
              <span className="text-xs text-gray-500">학습 횟수</span>
            </div>
            <div className="text-3xl font-bold gradient-text">
              {stats?.total_learning_sessions || 0}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {stats?.last_learning
                ? `마지막: ${new Date(stats.last_learning).toLocaleDateString()}`
                : '아직 학습 없음'}
            </p>
          </motion.div>

          {/* 현재 정확도 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <Target className="w-6 h-6 text-green-600" />
              </div>
              <span className="text-xs text-gray-500">예측 정확도</span>
            </div>
            <div className={`text-3xl font-bold ${getAccuracyColor(stats?.recent_accuracy || 0)}`}>
              {stats?.recent_accuracy?.toFixed(1) || '0'}%
            </div>
            <p className="text-sm text-gray-500 mt-1">
              3위 이내 오차 비율
            </p>
          </motion.div>

          {/* C-Rank vs D.I.A 비율 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                <PieChart className="w-6 h-6 text-orange-600" />
              </div>
              <span className="text-xs text-gray-500">가중치 비율</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-purple-600">
                C:{weights?.c_rank?.weight || 50}
              </span>
              <span className="text-gray-400">/</span>
              <span className="text-lg font-bold text-pink-600">
                D:{weights?.dia?.weight || 50}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">C-Rank / D.I.A.</p>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* 왼쪽: 현재 가중치 상세 */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6 mb-6"
            >
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowWeightsDetail(!showWeightsDetail)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl instagram-gradient flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">현재 학습된 가중치</h2>
                    <p className="text-sm text-gray-500">클릭하여 상세 보기</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); resetWeights(); }}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    title="가중치 초기화"
                  >
                    <RotateCcw className="w-4 h-4 text-gray-500" />
                  </button>
                  {showWeightsDetail ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </div>
              </div>

              <AnimatePresence>
                {showWeightsDetail && weights && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-6 space-y-6"
                  >
                    {/* C-Rank 가중치 */}
                    <div className="bg-purple-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-purple-700">C-Rank (출처 신뢰도)</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-purple-600">
                            {weights.c_rank?.weight || 50}%
                          </span>
                          {getWeightChangeIndicator(weights.c_rank?.weight || 50, 50)}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-xs text-gray-500 mb-1">Context</div>
                          <div className="font-bold">{weights.c_rank?.sub_weights?.context || 40}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-xs text-gray-500 mb-1">Content</div>
                          <div className="font-bold">{weights.c_rank?.sub_weights?.content || 30}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-xs text-gray-500 mb-1">Chain</div>
                          <div className="font-bold">{weights.c_rank?.sub_weights?.chain || 30}</div>
                        </div>
                      </div>
                    </div>

                    {/* D.I.A 가중치 */}
                    <div className="bg-pink-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-pink-700">D.I.A. (문서 품질)</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-pink-600">
                            {weights.dia?.weight || 50}%
                          </span>
                          {getWeightChangeIndicator(weights.dia?.weight || 50, 50)}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-xs text-gray-500 mb-1">Depth</div>
                          <div className="font-bold">{weights.dia?.sub_weights?.depth || 35}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-xs text-gray-500 mb-1">Information</div>
                          <div className="font-bold">{weights.dia?.sub_weights?.information || 35}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-xs text-gray-500 mb-1">Accuracy</div>
                          <div className="font-bold">{weights.dia?.sub_weights?.accuracy || 30}</div>
                        </div>
                      </div>
                    </div>

                    {/* 추가 요소 가중치 */}
                    <div className="bg-orange-50 rounded-xl p-4">
                      <h3 className="font-semibold text-orange-700 mb-3">추가 요소 보너스</h3>
                      <div className="grid grid-cols-5 gap-3">
                        <div className="bg-white rounded-lg p-3 text-center">
                          <FileText className="w-4 h-4 mx-auto text-gray-400 mb-1" />
                          <div className="text-xs text-gray-500">포스트</div>
                          <div className="font-bold">{weights.extra_factors?.post_count || 5}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <Users className="w-4 h-4 mx-auto text-gray-400 mb-1" />
                          <div className="text-xs text-gray-500">이웃</div>
                          <div className="font-bold">{weights.extra_factors?.neighbor_count || 5}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <Clock className="w-4 h-4 mx-auto text-gray-400 mb-1" />
                          <div className="text-xs text-gray-500">블로그 나이</div>
                          <div className="font-bold">{weights.extra_factors?.blog_age || 5}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <Zap className="w-4 h-4 mx-auto text-gray-400 mb-1" />
                          <div className="text-xs text-gray-500">최근 활동</div>
                          <div className="font-bold">{weights.extra_factors?.recent_activity || 10}</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <Eye className="w-4 h-4 mx-auto text-gray-400 mb-1" />
                          <div className="text-xs text-gray-500">방문자</div>
                          <div className="font-bold">{weights.extra_factors?.visitor_count || 5}</div>
                        </div>
                      </div>
                    </div>

                    {/* 순위별 보정 계수 */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-700 mb-3">순위별 보정 계수</h3>
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-white rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500">TOP 3</div>
                          <div className="font-bold text-green-600">
                            x{weights.rank_position_factor?.top3 || 1.2}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500">TOP 10</div>
                          <div className="font-bold text-blue-600">
                            x{weights.rank_position_factor?.top10 || 1.0}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500">TOP 30</div>
                          <div className="font-bold text-yellow-600">
                            x{weights.rank_position_factor?.top30 || 0.9}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-500">Others</div>
                          <div className="font-bold text-gray-600">
                            x{weights.rank_position_factor?.others || 0.8}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* 점수 계산 공식 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass rounded-2xl p-6"
            >
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                현재 점수 계산 공식
              </h2>

              <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm text-green-400 overflow-x-auto">
                <div className="mb-2 text-gray-500">// 최종 점수 계산</div>
                <div className="text-white">
                  final_score = (C-Rank × <span className="text-purple-400">{(weights?.c_rank?.weight || 50) / 100}</span>) +
                  (D.I.A × <span className="text-pink-400">{(weights?.dia?.weight || 50) / 100}</span>) + bonus
                </div>
                <div className="mt-4 text-gray-500">// 보너스 점수 (최대 15점)</div>
                <div className="text-white text-xs">
                  bonus = post_bonus + neighbor_bonus + age_bonus + activity_bonus + visitor_bonus
                </div>
              </div>

              <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                <p className="text-sm text-blue-700">
                  <strong>학습 방식:</strong> 실제 네이버 검색 순위와 예측 순위를 비교하여,
                  오차를 최소화하는 방향으로 가중치를 자동 조정합니다.
                  샘플이 10개 이상 쌓이면 자동 학습이 실행됩니다.
                </p>
              </div>
            </motion.div>
          </div>

          {/* 오른쪽: 실시간 피드 */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-2xl p-6 h-fit sticky top-8"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-green-500" />
                  실시간 피드
                </h2>
                {autoRefresh && (
                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Live
                  </span>
                )}
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {realtimeUpdates.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Brain className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>아직 활동이 없습니다</p>
                    <p className="text-xs mt-1">키워드 검색을 하면 여기에 표시됩니다</p>
                  </div>
                ) : (
                  realtimeUpdates.map((update, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-3 rounded-xl border ${
                        update.type === 'learn'
                          ? 'bg-purple-50 border-purple-200'
                          : update.type === 'weight_update'
                          ? 'bg-orange-50 border-orange-200'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {update.type === 'learn' && <Brain className="w-4 h-4 text-purple-600 mt-0.5" />}
                        {update.type === 'search' && <Search className="w-4 h-4 text-blue-600 mt-0.5" />}
                        {update.type === 'weight_update' && <RefreshCw className="w-4 h-4 text-orange-600 mt-0.5" />}

                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            {update.type === 'learn' && '학습 완료'}
                            {update.type === 'search' && '검색 수행'}
                            {update.type === 'weight_update' && '가중치 변경'}
                          </div>

                          {update.type === 'learn' && update.data && (
                            <div className="text-xs text-gray-600 mt-1">
                              정확도: {update.data.accuracy_before}% → {update.data.accuracy_after}%
                              {update.data.improvement > 0 && (
                                <span className="text-green-600"> (+{update.data.improvement}%)</span>
                              )}
                            </div>
                          )}

                          {update.data?.message && (
                            <div className="text-xs text-gray-600 mt-1">
                              {update.data.message}
                            </div>
                          )}

                          <div className="text-xs text-gray-400 mt-1">
                            {new Date(update.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* 키워드 검색 바로가기 */}
              <Link
                href="/keyword-search"
                className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:shadow-lg transition-all"
              >
                <Search className="w-4 h-4" />
                키워드 검색하러 가기
              </Link>
            </motion.div>
          </div>
        </div>

        {/* 검색 이력 섹션 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 glass rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              검색 이력 및 학습 데이터
            </h2>
            <button
              onClick={loadSearchHistory}
              className="text-sm text-blue-600 hover:underline"
            >
              전체 보기
            </button>
          </div>

          {searchHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>검색 이력이 없습니다</p>
              <p className="text-xs mt-1">키워드 검색을 하면 여기에 이력이 표시됩니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {searchHistory.slice(0, 10).map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Search className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-semibold">{item.keyword}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(item.timestamp).toLocaleString()} · {item.blog_count}개 블로그
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* 평균 점수 */}
                    <div className="text-center">
                      <div className="text-sm font-bold">{item.avg_score}</div>
                      <div className="text-xs text-gray-500">평균 점수</div>
                    </div>

                    {/* C-Rank / D.I.A */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                        C:{item.avg_c_rank}
                      </span>
                      <span className="px-2 py-1 bg-pink-100 text-pink-700 rounded">
                        D:{item.avg_dia}
                      </span>
                    </div>

                    {/* TOP 3 블로그 */}
                    <div className="hidden md:flex items-center gap-1">
                      {item.top_blogs?.slice(0, 3).map((blogId, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-1 bg-gray-100 rounded truncate max-w-[80px]"
                          title={blogId}
                        >
                          {i + 1}. {blogId}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* 순위 비교 차트 섹션 */}
        {searchHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-8 glass rounded-2xl p-6"
          >
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-500" />
              키워드별 평균 점수 비교
            </h2>

            <div className="space-y-3">
              {searchHistory.slice(0, 8).map((item, idx) => {
                const maxScore = Math.max(...searchHistory.map(h => h.avg_score || 0))
                const percentage = maxScore > 0 ? (item.avg_score / maxScore) * 100 : 0

                return (
                  <div key={idx} className="flex items-center gap-4">
                    <div className="w-32 text-sm font-medium truncate" title={item.keyword}>
                      {item.keyword}
                    </div>
                    <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.5, delay: idx * 0.1 }}
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg"
                      />
                      <div className="absolute inset-0 flex items-center justify-end pr-3">
                        <span className="text-sm font-bold text-gray-700">
                          {item.avg_score}
                        </span>
                      </div>
                    </div>
                    <div className="w-20 text-xs text-gray-500 text-right">
                      {item.blog_count}개
                    </div>
                  </div>
                )
              })}
            </div>

            {/* C-Rank vs D.I.A 분포 */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-semibold mb-4">C-Rank vs D.I.A. 평균 분포</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-purple-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-purple-700">C-Rank 평균</span>
                    <span className="text-xl font-bold text-purple-600">
                      {searchHistory.length > 0
                        ? (searchHistory.reduce((sum, h) => sum + (h.avg_c_rank || 0), 0) / searchHistory.length).toFixed(1)
                        : '0'}
                    </span>
                  </div>
                  <div className="h-2 bg-purple-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{
                        width: `${searchHistory.length > 0
                          ? (searchHistory.reduce((sum, h) => sum + (h.avg_c_rank || 0), 0) / searchHistory.length)
                          : 0}%`
                      }}
                    />
                  </div>
                </div>
                <div className="bg-pink-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-pink-700">D.I.A. 평균</span>
                    <span className="text-xl font-bold text-pink-600">
                      {searchHistory.length > 0
                        ? (searchHistory.reduce((sum, h) => sum + (h.avg_dia || 0), 0) / searchHistory.length).toFixed(1)
                        : '0'}
                    </span>
                  </div>
                  <div className="h-2 bg-pink-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-pink-500 rounded-full"
                      style={{
                        width: `${searchHistory.length > 0
                          ? (searchHistory.reduce((sum, h) => sum + (h.avg_dia || 0), 0) / searchHistory.length)
                          : 0}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* 하단: 학습 가이드 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 glass rounded-2xl p-6"
        >
          <h2 className="text-xl font-bold mb-4">학습 프로세스 가이드</h2>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-purple-600">1</span>
              </div>
              <div>
                <h3 className="font-semibold">키워드 검색</h3>
                <p className="text-sm text-gray-500">키워드 검색 시 자동으로 학습 샘플 수집</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-pink-600">2</span>
              </div>
              <div>
                <h3 className="font-semibold">데이터 축적</h3>
                <p className="text-sm text-gray-500">실제 순위 vs 예측 순위 비교 데이터 저장</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-orange-600">3</span>
              </div>
              <div>
                <h3 className="font-semibold">자동 학습</h3>
                <p className="text-sm text-gray-500">10개 이상 샘플 시 자동으로 가중치 최적화</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-green-600">4</span>
              </div>
              <div>
                <h3 className="font-semibold">정확도 향상</h3>
                <p className="text-sm text-gray-500">지속적 학습으로 예측 정확도 개선</p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-yellow-800">
                <strong>팁:</strong> 더 많은 키워드를 검색할수록 학습 데이터가 풍부해지고,
                예측 정확도가 높아집니다. 다양한 키워드로 검색해보세요!
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
