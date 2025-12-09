'use client'
// Learning Dashboard Page - Auto-learning from 1 sample

import { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, Zap, Target, Activity, Award, ArrowUp, ArrowDown } from 'lucide-react'

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

interface TrainingSession {
  session_id: string
  timestamp: string
  samples_used: number
  accuracy_before: number
  accuracy_after: number
  improvement: number
  duration_seconds: number
}

export default function LearningEnginePage() {
  const [stats, setStats] = useState<LearningStats>({
    total_samples: 0,
    current_accuracy: 0,
    accuracy_within_3: 0,
    last_training: '-',
    training_count: 0
  })

  const [weights, setWeights] = useState<WeightInfo[]>([
    { name: 'C-Rank', value: 0.52, change: 0.02, trend: 'up' },
    { name: 'D.I.A.', value: 0.48, change: -0.02, trend: 'down' },
    { name: '포스트수', value: 0.15, change: 0.03, trend: 'up' },
    { name: '이웃수', value: 0.10, change: 0.00, trend: 'stable' },
    { name: '블로그연령', value: 0.08, change: -0.01, trend: 'down' },
  ])

  const [accuracyHistory, setAccuracyHistory] = useState<AccuracyHistory[]>([
    { timestamp: '10회', accuracy: 62, samples: 100 },
    { timestamp: '20회', accuracy: 68, samples: 200 },
    { timestamp: '30회', accuracy: 73, samples: 300 },
    { timestamp: '40회', accuracy: 76, samples: 400 },
    { timestamp: '50회', accuracy: 78.5, samples: 500 },
  ])

  const [trainingSessions, setTrainingSessions] = useState<TrainingSession[]>([])
  const [loading, setLoading] = useState(false)

  // API에서 데이터 가져오기
  const fetchLearningStatus = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/learning/status`)
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/learning/history?limit=10`)
      if (response.ok) {
        const data = await response.json()
        setTrainingSessions(data.sessions || [])
      }
    } catch (err) {
      console.error('학습 히스토리 조회 실패:', err)
    }
  }

  // 수동 학습 실행
  const runTraining = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/learning/train`, {
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
        alert(`학습 완료!\n정확도: ${result.initial_accuracy}% → ${result.final_accuracy}%\n향상도: ${result.improvement}%`)
        fetchLearningStatus()
        fetchTrainingHistory()
      } else {
        alert('학습 실행 실패')
      }
    } catch (err) {
      console.error('학습 실행 오류:', err)
      alert('학습 실행 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLearningStatus()
    fetchTrainingHistory()

    // 30초마다 자동 갱신
    const interval = setInterval(() => {
      fetchLearningStatus()
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
        </div>

        {/* 실시간 통계 카드 */}
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
            label="±3 순위 이내"
            value={`${stats.accuracy_within_3.toFixed(1)}%`}
            color="from-green-500 to-teal-500"
          />
          <StatCard
            icon={<TrendingUp className="w-6 h-6" />}
            label="학습 횟수"
            value={`${stats.training_count}회`}
            color="from-orange-500 to-red-500"
          />
        </div>

        {/* 정확도 향상 그래프 */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-purple-500" />
            정확도 향상 추이
          </h2>
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
        </div>

        {/* 가중치 분포 */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">현재 가중치 분포</h2>
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
        </div>

        {/* 최근 학습 이력 */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">최근 학습 이력</h2>
          {trainingSessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">시간</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">샘플수</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">정확도 변화</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">향상도</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">소요시간</th>
                  </tr>
                </thead>
                <tbody>
                  {trainingSessions.map((session, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-purple-50 transition-colors">
                      <td className="py-3 px-4 text-gray-600">
                        {new Date(session.timestamp).toLocaleString('ko-KR')}
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
                      <td className="text-center py-3 px-4">
                        <span className={`font-bold ${
                          session.improvement > 0 ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {session.improvement > 0 ? '+' : ''}{session.improvement.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-4 text-gray-600">
                        {session.duration_seconds.toFixed(1)}초
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
