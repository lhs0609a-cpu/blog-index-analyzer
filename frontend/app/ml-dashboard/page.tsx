'use client'

import { useState, useEffect } from 'react'
import { ArrowPathIcon, PlayIcon, StopIcon, ChartBarIcon, ClockIcon } from '@heroicons/react/24/outline'

interface AutoTrainStatus {
  is_running: boolean
  interval_minutes: number
  min_samples: number
  last_training_time: string | null
  training_history: Array<{
    trained_at: string
    model_id?: number
    mae?: number
    rmse?: number
    r2_score?: number
    training_samples?: number
    duration_seconds?: number
    error?: string
  }>
}

interface MLWeights {
  c_rank_score: number
  dia_score: number
  blog_age_days: number
  total_posts: number
  neighbor_count: number
  total_visitors: number
}

interface MLStats {
  total_samples: number
  avg_rank_difference: number
  recent_samples: number
  top_keywords: Array<{ keyword: string; count: number }>
}

interface WeightHistory {
  model_id: number
  model_version: string
  trained_at: string
  weights: {
    c_rank: number
    dia: number
    blog_age: number
    posts: number
    neighbors: number
    visitors: number
  }
  metrics: {
    mae: number
    rmse: number
    r2_score: number
  }
  training_samples: number
  is_active: boolean
}

export default function MLDashboard() {
  const [autoTrainStatus, setAutoTrainStatus] = useState<AutoTrainStatus | null>(null)
  const [currentWeights, setCurrentWeights] = useState<MLWeights | null>(null)
  const [mlStats, setMlStats] = useState<MLStats | null>(null)
  const [weightHistory, setWeightHistory] = useState<WeightHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [training, setTraining] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState(30)

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

  // 데이터 로드
  const loadData = async () => {
    try {
      const [statusRes, weightsRes, statsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/api/blogs/ml/auto-train/status`),
        fetch(`${API_BASE}/api/blogs/ml/weights`),
        fetch(`${API_BASE}/api/blogs/ml/stats`),
        fetch(`${API_BASE}/api/blogs/ml/weights/history?limit=10`)
      ])

      if (statusRes.ok) {
        const data = await statusRes.json()
        setAutoTrainStatus(data)
        setIntervalMinutes(data.interval_minutes)
      }

      if (weightsRes.ok) {
        const data = await weightsRes.json()
        setCurrentWeights(data.weights)
      }

      if (statsRes.ok) {
        const data = await statsRes.json()
        setMlStats(data.stats)
      }

      if (historyRes.ok) {
        const data = await historyRes.json()
        setWeightHistory(data.history)
      }
    } catch (error) {
      console.error('데이터 로드 오류:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // 30초마다 자동 새로고침
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  // 자동 학습 시작
  const handleStartAutoTrain = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/blogs/ml/auto-train/start`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        setAutoTrainStatus(data.status)
        alert('자동 재학습이 시작되었습니다')
      } else {
        alert(data.message)
      }
    } catch (error) {
      console.error('자동 학습 시작 오류:', error)
      alert('자동 학습 시작 실패')
    }
  }

  // 자동 학습 중지
  const handleStopAutoTrain = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/blogs/ml/auto-train/stop`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        setAutoTrainStatus(data.status)
        alert('자동 재학습이 중지되었습니다')
      } else {
        alert(data.message)
      }
    } catch (error) {
      console.error('자동 학습 중지 오류:', error)
      alert('자동 학습 중지 실패')
    }
  }

  // 주기 변경
  const handleChangeInterval = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/blogs/ml/auto-train/interval?minutes=${intervalMinutes}`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        setAutoTrainStatus(data.status)
        alert(`재학습 주기가 ${intervalMinutes}분으로 변경되었습니다`)
      }
    } catch (error) {
      console.error('주기 변경 오류:', error)
      alert('주기 변경 실패')
    }
  }

  // 수동 학습
  const handleManualTrain = async () => {
    if (!confirm('수동 학습을 시작하시겠습니까? (최소 50개 샘플 필요)')) return

    setTraining(true)
    try {
      const res = await fetch(`${API_BASE}/api/blogs/ml/train?min_samples=50`, {
        method: 'POST'
      })
      const data = await res.json()

      if (data.success) {
        alert(`학습 완료!\nMAE: ${data.result.mae.toFixed(2)}, R²: ${data.result.r2_score.toFixed(3)}`)
        await loadData()
      }
    } catch (error) {
      console.error('수동 학습 오류:', error)
      alert('학습 실패')
    } finally {
      setTraining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">ML 학습 대시보드</h1>
            <p className="text-gray-600 mt-1">머신러닝 자동 가중치 조정 시스템</p>
          </div>
          <button
            onClick={handleManualTrain}
            disabled={training}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-5 w-5 ${training ? 'animate-spin' : ''}`} />
            {training ? '학습 중...' : '수동 학습 실행'}
          </button>
        </div>

        {/* 자동 학습 상태 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <ClockIcon className="h-6 w-6 text-blue-600" />
            자동 재학습 상태
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <span className="text-sm font-medium text-gray-700">상태:</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  autoTrainStatus?.is_running
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {autoTrainStatus?.is_running ? '🟢 실행 중' : '⚪ 중지됨'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">재학습 주기:</span>
                  <span className="font-medium">{autoTrainStatus?.interval_minutes}분</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">최소 샘플 수:</span>
                  <span className="font-medium">{autoTrainStatus?.min_samples}개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">마지막 학습:</span>
                  <span className="font-medium">
                    {autoTrainStatus?.last_training_time
                      ? new Date(autoTrainStatus.last_training_time).toLocaleString('ko-KR')
                      : '없음'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={handleStartAutoTrain}
                  disabled={autoTrainStatus?.is_running}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlayIcon className="h-5 w-5" />
                  시작
                </button>
                <button
                  onClick={handleStopAutoTrain}
                  disabled={!autoTrainStatus?.is_running}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <StopIcon className="h-5 w-5" />
                  중지
                </button>
              </div>

              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  min={5}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="재학습 주기 (분)"
                />
                <button
                  onClick={handleChangeInterval}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap"
                >
                  주기 변경
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 학습 통계 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">총 학습 샘플</div>
            <div className="text-3xl font-bold text-blue-600">{mlStats?.total_samples || 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">최근 샘플 (7일)</div>
            <div className="text-3xl font-bold text-green-600">{mlStats?.recent_samples || 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">평균 순위 차이</div>
            <div className="text-3xl font-bold text-orange-600">{mlStats?.avg_rank_difference || 0}</div>
          </div>
        </div>

        {/* 현재 가중치 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <ChartBarIcon className="h-6 w-6 text-blue-600" />
            현재 활성 가중치
          </h2>

          {currentWeights ? (
            <div className="space-y-3">
              {Object.entries(currentWeights).map(([key, value]) => {
                const labels: Record<string, string> = {
                  c_rank_score: 'C-Rank 점수',
                  dia_score: 'D.I.A 점수',
                  blog_age_days: '블로그 나이',
                  total_posts: '총 포스트 수',
                  neighbor_count: '이웃 수',
                  total_visitors: '총 방문자 수'
                }

                const percentage = (value * 100).toFixed(1)

                return (
                  <div key={key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{labels[key]}</span>
                      <span className="font-medium">{percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-500">가중치 데이터가 없습니다</p>
          )}
        </div>

        {/* 학습 이력 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">학습 이력</h2>

          {weightHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">시간</th>
                    <th className="text-left py-2 px-2">버전</th>
                    <th className="text-right py-2 px-2">MAE</th>
                    <th className="text-right py-2 px-2">RMSE</th>
                    <th className="text-right py-2 px-2">R²</th>
                    <th className="text-right py-2 px-2">샘플</th>
                    <th className="text-center py-2 px-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {weightHistory.map((item) => (
                    <tr key={item.model_id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-2">
                        {new Date(item.trained_at).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-2 px-2 text-gray-600">{item.model_version}</td>
                      <td className="py-2 px-2 text-right font-medium">{item.metrics.mae.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-medium">{item.metrics.rmse.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-medium">{item.metrics.r2_score.toFixed(3)}</td>
                      <td className="py-2 px-2 text-right">{item.training_samples}</td>
                      <td className="py-2 px-2 text-center">
                        {item.is_active && (
                          <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">학습 이력이 없습니다</p>
          )}
        </div>

        {/* 자동 학습 이력 */}
        {autoTrainStatus?.training_history && autoTrainStatus.training_history.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">자동 학습 이력 (최근 10개)</h2>
            <div className="space-y-2">
              {autoTrainStatus.training_history.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="text-sm font-medium">
                      {new Date(item.trained_at).toLocaleString('ko-KR')}
                    </div>
                    {item.error ? (
                      <div className="text-xs text-red-600">오류: {item.error}</div>
                    ) : (
                      <div className="text-xs text-gray-600">
                        MAE: {item.mae?.toFixed(2)} | R²: {item.r2_score?.toFixed(3)} |
                        샘플: {item.training_samples} | 소요: {item.duration_seconds?.toFixed(1)}초
                      </div>
                    )}
                  </div>
                  {!item.error && (
                    <span className="text-green-600 text-sm">✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 키워드별 샘플 수 */}
        {mlStats?.top_keywords && mlStats.top_keywords.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">키워드별 학습 샘플</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {mlStats.top_keywords.map((item, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm font-medium truncate">{item.keyword}</div>
                  <div className="text-2xl font-bold text-blue-600">{item.count}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
