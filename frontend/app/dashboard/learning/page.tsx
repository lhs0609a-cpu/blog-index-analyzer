'use client'
// Learning Dashboard Page - Auto-learning from 1 sample

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, Zap, Target, Activity, Award, ArrowUp, ArrowDown, ArrowLeft, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { getApiUrl } from '@/lib/api/apiConfig'

interface LearningStats {
  total_samples: number
  current_accuracy: number
  accuracy_within_3: number
  last_training: string
  training_count: number
}

interface WeightInfo {
  name: string
  value: number
  change: number
  trend: 'up' | 'down' | 'stable'
}

interface AccuracyHistory {
  timestamp: string
  accuracy: number
  samples: number
}

interface WeightChange {
  before: number
  after: number
  change: number
}

interface TrainingSession {
  session_id: string
  timestamp?: string
  started_at?: string
  completed_at?: string
  samples_used: number
  accuracy_before: number
  accuracy_after: number
  improvement: number
  duration_seconds: number
  keywords?: string[]
  weight_changes?: {
    'c_rank.weight'?: WeightChange
    'dia.weight'?: WeightChange
  }
}

interface DeviationAnalysis {
  total_samples: number
  analyzed_samples: number
  overall_deviation: number
  spearman_correlation: number
  rank_accuracy: {
    within_1_rank: number
    within_3_ranks: number
    within_5_ranks: number
    perfect_match: number
  }
  deviation_by_rank: Record<string, {
    count: number
    avg_predicted_rank: number
    avg_deviation: number
    accuracy: number
  }>
  worst_predictions: Array<{
    keyword: string
    blog_id: string
    actual_rank: number
    predicted_rank: number
    deviation: number
    predicted_score: number
  }>
  weight_impact: Record<string, {
    top_avg: number
    bottom_avg: number
    current_weight: number
  }>
  recommendations: string[]
  keyword_analysis: Array<{
    keyword: string
    sample_count: number
    avg_deviation: number
    accuracy: number
  }>
}

export default function LearningEnginePage() {
  const router = useRouter()
  const [stats, setStats] = useState<LearningStats>({
    total_samples: 0,
    current_accuracy: 0,
    accuracy_within_3: 0,
    last_training: '-',
    training_count: 0
  })

  const [weights, setWeights] = useState<WeightInfo[]>([])

  const [accuracyHistory, setAccuracyHistory] = useState<AccuracyHistory[]>([])

  const [trainingSessions, setTrainingSessions] = useState<TrainingSession[]>([])
  const [deviationAnalysis, setDeviationAnalysis] = useState<DeviationAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'deviation' | 'tuning'>('overview')

  // API에서 데이터 가져오기
  const fetchLearningStatus = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/learning/status`)
      if (response.ok) {
        const data = await response.json()
        setStats(data.statistics)
        // 가중치 데이터 변환
        const weightsData: WeightInfo[] = [
          {
            name: 'C-Rank',
            value: data.current_weights.c_rank.weight,
            change: 0.02, // 이전 값과 비교 필요
            trend: 'up'
          },
          {
            name: 'D.I.A.',
            value: data.current_weights.dia.weight,
            change: -0.02,
            trend: 'down'
          },
          // ... 나머지 가중치
        ]
        setWeights(weightsData)
      }
    } catch (err) {
      console.error('학습 상태 조회 실패:', err)
    }
  }

  const fetchTrainingHistory = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/learning/history?limit=10`)
      if (response.ok) {
        const data = await response.json()
        setTrainingSessions(data.sessions || [])
      }
    } catch (err) {
      console.error('학습 히스토리 조회 실패:', err)
    }
  }

  const fetchDeviationAnalysis = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/learning/deviation-analysis`)
      if (response.ok) {
        const data = await response.json()
        setDeviationAnalysis(data)
      }
    } catch (err) {
      console.error('괴리율 분석 조회 실패:', err)
    }
  }

  // 수동 학습 실행
  const runTraining = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${getApiUrl()}/api/learning/train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batch_size: 100,
          learning_rate: 0.01,
          epochs: 50
        })
      })

      if (response.ok) {
        const result = await response.json()
        alert(`학습 완료!\n정확도: ${result.initial_accuracy?.toFixed(1)}% → ${result.final_accuracy?.toFixed(1)}%\n향상도: ${result.improvement?.toFixed(1)}%`)
        fetchLearningStatus()
        fetchTrainingHistory()
      } else {
        const error = await response.json()
        alert(error.detail || '학습 실행 실패')
      }
    } catch (err) {
      console.error('학습 실행 오류:', err)
      alert('학습 실행 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLearningStatus()
    fetchTrainingHistory()
    fetchDeviationAnalysis()

    // 30초마다 자동 갱신
    const interval = setInterval(() => {
      fetchLearningStatus()
      fetchDeviationAnalysis()
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <ArrowUp className="w-4 h-4 text-green-500" />
    if (trend === 'down') return <ArrowDown className="w-4 h-4 text-red-500" />
    return <div className="w-4 h-4" />
  }

  const getWeightColor = (value: number) => {
    if (value > 0.5) return 'bg-gradient-to-r from-purple-500 to-pink-500'
    if (value > 0.3) return 'bg-gradient-to-r from-blue-500 to-cyan-500'
    if (value > 0.1) return 'bg-gradient-to-r from-green-500 to-teal-500'
    return 'bg-gray-400'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 뒤로가기 버튼 */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white/50 rounded-lg transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">뒤로가기</span>
        </button>

        {/* 헤더 */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-3">
                <Zap className="w-8 h-8 text-purple-500" />
                AI 순위 예측 학습 엔진
              </h1>
              <p className="text-gray-600">
                사용자 검색 데이터로 실시간 학습하여 네이버 알고리즘에 근접합니다
              </p>
            </div>
            <button
              onClick={runTraining}
              disabled={loading}
              className={`px-6 py-3 rounded-xl font-bold text-white transition-all ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:shadow-lg hover:scale-105'
              }`}
            >
              {loading ? '학습 중...' : '수동 학습 실행'}
            </button>
          </div>

          {/* 탭 네비게이션 */}
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'overview'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              개요
            </button>
            <button
              onClick={() => setActiveTab('deviation')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'deviation'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              괴리율 분석
            </button>
            <button
              onClick={() => setActiveTab('tuning')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'tuning'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              실시간 조율
            </button>
          </div>
        </div>

        {/* 실시간 통계 카드 - 항상 표시 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Target className="w-6 h-6" />}
            label="총 학습 샘플"
            value={stats.total_samples.toLocaleString()}
            color="from-purple-500 to-pink-500"
          />
          <StatCard
            icon={<Award className="w-6 h-6" />}
            label="현재 정확도"
            value={`${stats.current_accuracy.toFixed(1)}%`}
            color="from-blue-500 to-cyan-500"
          />
          <StatCard
            icon={<Activity className="w-6 h-6" />}
            label="평균 괴리"
            value={deviationAnalysis?.overall_deviation ? `±${deviationAnalysis.overall_deviation.toFixed(1)}순위` : '-'}
            color="from-green-500 to-teal-500"
          />
          <StatCard
            icon={<TrendingUp className="w-6 h-6" />}
            label="순위 상관계수"
            value={deviationAnalysis?.spearman_correlation ? `${(deviationAnalysis.spearman_correlation * 100).toFixed(1)}%` : '-'}
            color="from-orange-500 to-red-500"
          />
        </div>

        {/* 개요 탭 */}
        {activeTab === 'overview' && (
          <>
            {/* 정확도 향상 그래프 */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-purple-500" />
                정확도 향상 추이
              </h2>
              {accuracyHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={accuracyHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="timestamp" stroke="#6b7280" />
                    <YAxis domain={[0, 100]} stroke="#6b7280" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      name="정확도 (%)"
                      dot={{ fill: '#8b5cf6', r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-gray-400">
                  <TrendingUp className="w-12 h-12 mb-3" />
                  <p className="text-lg font-medium">아직 학습 데이터가 없습니다</p>
                  <p className="text-sm mt-1">키워드 검색을 통해 데이터가 수집되면 그래프가 표시됩니다</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* 괴리율 분석 탭 */}
        {activeTab === 'deviation' && deviationAnalysis && (
          <>
            {/* 순위 예측 정확도 */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Target className="w-6 h-6 text-purple-500" />
                순위 예측 정확도
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <p className="text-3xl font-bold text-green-600">
                    {deviationAnalysis.rank_accuracy?.perfect_match?.toFixed(1) || 0}%
                  </p>
                  <p className="text-sm text-gray-600 mt-1">정확히 일치</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <p className="text-3xl font-bold text-blue-600">
                    {deviationAnalysis.rank_accuracy?.within_1_rank?.toFixed(1) || 0}%
                  </p>
                  <p className="text-sm text-gray-600 mt-1">±1 순위 이내</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-xl">
                  <p className="text-3xl font-bold text-purple-600">
                    {deviationAnalysis.rank_accuracy?.within_3_ranks?.toFixed(1) || 0}%
                  </p>
                  <p className="text-sm text-gray-600 mt-1">±3 순위 이내</p>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-xl">
                  <p className="text-3xl font-bold text-orange-600">
                    {deviationAnalysis.rank_accuracy?.within_5_ranks?.toFixed(1) || 0}%
                  </p>
                  <p className="text-sm text-gray-600 mt-1">±5 순위 이내</p>
                </div>
              </div>
            </div>

            {/* 순위별 괴리율 차트 */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">순위별 예측 정확도</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={Object.entries(deviationAnalysis.deviation_by_rank || {}).map(([rank, data]) => ({
                  rank: `${rank}위`,
                  accuracy: data.accuracy,
                  deviation: data.avg_deviation,
                  count: data.count
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="rank" stroke="#6b7280" />
                  <YAxis domain={[0, 100]} stroke="#6b7280" />
                  <Tooltip />
                  <Bar dataKey="accuracy" fill="#8b5cf6" name="정확도 (%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 가중치 영향 분석 */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Activity className="w-6 h-6 text-purple-500" />
                가중치 영향 분석 (상위권 vs 하위권)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deviationAnalysis.weight_impact && Object.entries(deviationAnalysis.weight_impact).map(([factor, data]) => (
                  <div key={factor} className="border rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-gray-700 capitalize">{factor.replace('_', ' ')}</span>
                      <span className="text-sm text-gray-500">가중치: {(data.current_weight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 mb-1">상위권 (1-3위)</p>
                        <div className="flex items-center gap-2">
                          <div className="h-6 bg-green-200 rounded" style={{ width: `${Math.min(data.top_avg, 100)}%` }} />
                          <span className="text-sm font-medium">{data.top_avg}</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 mb-1">하위권 (10-13위)</p>
                        <div className="flex items-center gap-2">
                          <div className="h-6 bg-red-200 rounded" style={{ width: `${Math.min(data.bottom_avg, 100)}%` }} />
                          <span className="text-sm font-medium">{data.bottom_avg}</span>
                        </div>
                      </div>
                    </div>
                    {data.top_avg > data.bottom_avg * 1.2 && (
                      <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> 상위권에서 높음 - 정상
                      </p>
                    )}
                    {data.bottom_avg > data.top_avg * 1.2 && (
                      <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> 하위권에서 더 높음 - 가중치 조정 필요
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 가장 큰 괴리 예측 */}
            {deviationAnalysis.worst_predictions && deviationAnalysis.worst_predictions.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-6 h-6 text-orange-500" />
                  가장 큰 괴리 예측 (개선 필요)
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2 px-3">키워드</th>
                        <th className="text-left py-2 px-3">블로그</th>
                        <th className="text-center py-2 px-3">실제 순위</th>
                        <th className="text-center py-2 px-3">예측 순위</th>
                        <th className="text-center py-2 px-3">괴리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deviationAnalysis.worst_predictions.map((pred, idx) => (
                        <tr key={idx} className="border-b hover:bg-red-50">
                          <td className="py-2 px-3">{pred.keyword}</td>
                          <td className="py-2 px-3 text-gray-600">{pred.blog_id}</td>
                          <td className="text-center py-2 px-3 font-semibold text-green-600">{pred.actual_rank}위</td>
                          <td className="text-center py-2 px-3 font-semibold text-purple-600">{pred.predicted_rank}위</td>
                          <td className="text-center py-2 px-3">
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                              ±{pred.deviation}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* AI 권장사항 */}
            {deviationAnalysis.recommendations && deviationAnalysis.recommendations.length > 0 && (
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl shadow-lg p-6 text-white">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Zap className="w-6 h-6" />
                  AI 학습 권장사항
                </h2>
                <ul className="space-y-2">
                  {deviationAnalysis.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {activeTab === 'deviation' && !deviationAnalysis && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <AlertTriangle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">분석 데이터 부족</h3>
            <p className="text-gray-500">키워드 검색을 통해 데이터를 수집하면 괴리율 분석이 시작됩니다.</p>
          </div>
        )}

        {/* 실시간 조율 탭 */}
        {activeTab === 'tuning' && (
          <>
            {/* 현재 가중치 상세 */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">현재 학습된 가중치</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border rounded-xl p-4">
                  <h3 className="font-semibold text-purple-600 mb-3">C-Rank 세부 가중치</h3>
                  <div className="space-y-2">
                    {['context', 'content', 'chain'].map((sub) => (
                      <div key={sub} className="flex items-center justify-between">
                        <span className="text-gray-600 capitalize">{sub}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full"
                              style={{ width: `${(weights.find(w => w.name === 'C-Rank')?.value || 0.5) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">33%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border rounded-xl p-4">
                  <h3 className="font-semibold text-pink-600 mb-3">D.I.A. 세부 가중치</h3>
                  <div className="space-y-2">
                    {['depth', 'information', 'accuracy'].map((sub) => (
                      <div key={sub} className="flex items-center justify-between">
                        <span className="text-gray-600 capitalize">{sub}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-pink-500 rounded-full"
                              style={{ width: `${(weights.find(w => w.name === 'D.I.A.')?.value || 0.5) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">33%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-blue-700 text-sm">
                <strong>자동 학습 활성화:</strong> 키워드 검색 시 자동으로 네이버 실제 순위와 비교하여 가중치를 조정합니다.
                검색 횟수가 늘어날수록 예측 정확도가 향상됩니다.
              </p>
            </div>
          </>
        )}

        {/* 가중치 분포 - 개요 탭에서만 표시 */}
        {activeTab === 'overview' && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">현재 가중치 분포</h2>
          {weights.length > 0 ? (
            <div className="space-y-4">
              {weights.map((weight, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-700">{weight.name}</span>
                      {getTrendIcon(weight.trend)}
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-gray-800">
                        {(weight.value * 100).toFixed(1)}%
                      </span>
                      <span className={`ml-2 text-sm ${
                        weight.change > 0 ? 'text-green-600' :
                        weight.change < 0 ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        ({weight.change > 0 ? '+' : ''}{(weight.change * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full ${getWeightColor(weight.value)} transition-all duration-500`}
                      style={{ width: `${weight.value * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Activity className="w-12 h-12 mb-3" />
              <p className="text-lg font-medium">가중치 데이터를 불러오는 중...</p>
              <p className="text-sm mt-1">학습이 진행되면 가중치 분포가 표시됩니다</p>
            </div>
          )}
        </div>
        )}

        {/* 최근 학습 이력 - 개요 탭에서만 표시 */}
        {activeTab === 'overview' && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">최근 학습 이력</h2>
          {trainingSessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">시간</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">학습 키워드</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">샘플수</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">정확도 변화</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">가중치 변화</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">향상도</th>
                  </tr>
                </thead>
                <tbody>
                  {trainingSessions.map((session, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-purple-50 transition-colors">
                      <td className="py-3 px-4 text-gray-600">
                        {new Date(session.started_at || session.timestamp || '').toLocaleString('ko-KR')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {session.keywords && session.keywords.length > 0 ? (
                            session.keywords.slice(0, 5).map((kw, i) => (
                              <span key={i} className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                                {kw}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                          {session.keywords && session.keywords.length > 5 && (
                            <span className="text-gray-400 text-xs">+{session.keywords.length - 5}개</span>
                          )}
                        </div>
                      </td>
                      <td className="text-center py-3 px-4 text-gray-700">
                        {session.samples_used}
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className="text-gray-600">
                          {session.accuracy_before.toFixed(1)}%
                        </span>
                        <span className="mx-1">→</span>
                        <span className="font-semibold text-purple-600">
                          {session.accuracy_after.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {session.weight_changes && Object.keys(session.weight_changes).length > 0 ? (
                          <div className="text-xs space-y-1">
                            {session.weight_changes['c_rank.weight'] && (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-gray-500">C-Rank:</span>
                                <span className="text-gray-600">
                                  {(session.weight_changes['c_rank.weight'].before * 100).toFixed(1)}%
                                </span>
                                <span>→</span>
                                <span className={session.weight_changes['c_rank.weight'].change > 0 ? 'text-green-600' : session.weight_changes['c_rank.weight'].change < 0 ? 'text-red-600' : 'text-gray-600'}>
                                  {(session.weight_changes['c_rank.weight'].after * 100).toFixed(1)}%
                                </span>
                              </div>
                            )}
                            {session.weight_changes['dia.weight'] && (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-gray-500">D.I.A.:</span>
                                <span className="text-gray-600">
                                  {(session.weight_changes['dia.weight'].before * 100).toFixed(1)}%
                                </span>
                                <span>→</span>
                                <span className={session.weight_changes['dia.weight'].change > 0 ? 'text-green-600' : session.weight_changes['dia.weight'].change < 0 ? 'text-red-600' : 'text-gray-600'}>
                                  {(session.weight_changes['dia.weight'].after * 100).toFixed(1)}%
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className={`font-bold ${
                          session.improvement > 0 ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {session.improvement > 0 ? '+' : ''}{session.improvement.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              아직 학습 이력이 없습니다. 검색 데이터가 1개 이상 쌓이면 자동으로 학습이 시작됩니다.
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}

// 통계 카드 컴포넌트
function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className={`bg-gradient-to-r ${color} w-12 h-12 rounded-lg flex items-center justify-center text-white mb-3`}>
        {icon}
      </div>
      <p className="text-sm text-gray-600 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  )
}
