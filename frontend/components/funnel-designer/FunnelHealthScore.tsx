'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity, RefreshCw, AlertTriangle, CheckCircle, Info,
  ShieldCheck, BarChart3
} from 'lucide-react'
import {
  RadialBarChart, RadialBar, ResponsiveContainer
} from 'recharts'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api/client'

interface FunnelHealthScoreProps {
  funnelId: number | null
  funnelData: { nodes: any[]; edges: any[] }
}

interface HealthResult {
  total_score: number
  grade: string
  categories: Record<string, { score: number; max: number }>
  recommendations: Array<{
    category: string
    severity: string
    message: string
  }>
}

const GRADE_COLORS: Record<string, string> = {
  S: 'text-purple-600',
  A: 'text-green-600',
  B: 'text-blue-600',
  C: 'text-amber-600',
  D: 'text-orange-600',
  F: 'text-red-600',
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  high: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: AlertTriangle },
  medium: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: Info },
  low: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: CheckCircle },
}

const CATEGORY_COLORS = ['#8b5cf6', '#3b82f6', '#f59e0b', '#22c55e', '#ef4444']

export default function FunnelHealthScore({ funnelId, funnelData }: FunnelHealthScoreProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HealthResult | null>(null)

  const [showSaveGuide, setShowSaveGuide] = useState(false)

  const runHealthCheck = async () => {
    if (!funnelId) {
      setShowSaveGuide(true)
      return
    }
    setShowSaveGuide(false)
    if (!funnelData.nodes?.length) {
      toast.error('퍼널에 노드가 없습니다')
      return
    }

    setLoading(true)
    try {
      const { data } = await apiClient.post(`/api/funnel-designer/funnels/${funnelId}/health-score`)
      setResult(data.health_score)
      toast.success('헬스 스코어 채점 완료!')
    } catch {
      // apiClient handles error display
    } finally {
      setLoading(false)
    }
  }

  const radialData = result ? [
    { name: 'score', value: result.total_score, fill: result.total_score >= 80 ? '#22c55e' : result.total_score >= 50 ? '#f59e0b' : '#ef4444' }
  ] : []

  const categoryBarData = result
    ? Object.entries(result.categories).map(([name, cat], i) => ({
        name,
        score: cat.score,
        max: cat.max,
        fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }))
    : []

  return (
    <div className="space-y-6">
      {/* 채점 버튼 */}
      <div className="bg-white rounded-xl p-6 shadow-sm text-center">
        <ShieldCheck className="w-12 h-12 text-purple-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold mb-2">퍼널 헬스 스코어</h3>
        <p className="text-sm text-gray-500 mb-4">
          5개 카테고리(채널 다양성, 전환 논리, 이탈 방지, 데이터 추적, 비용 효율)로 퍼널을 채점합니다
        </p>
        <button
          onClick={runHealthCheck}
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50 font-medium"
        >
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
          {loading ? '채점 중...' : '채점하기'}
        </button>
        {showSaveGuide && (
          <p className="mt-3 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            상단의 <strong>'저장'</strong> 버튼을 눌러 퍼널을 먼저 저장해주세요.
          </p>
        )}
      </div>

      {result && (
        <>
          {/* 총점 게이지 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-xl p-6 shadow-sm text-center"
            >
              <h4 className="font-semibold mb-4">총점</h4>
              <div className="relative w-48 h-48 mx-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="70%"
                    outerRadius="100%"
                    data={radialData}
                    startAngle={180}
                    endAngle={0}
                  >
                    <RadialBar
                      dataKey="value"
                      cornerRadius={10}
                      background={{ fill: '#f3f4f6' }}
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-4xl font-bold ${GRADE_COLORS[result.grade] || 'text-gray-700'}`}>
                    {result.total_score}
                  </span>
                  <span className={`text-lg font-bold ${GRADE_COLORS[result.grade] || 'text-gray-500'}`}>
                    {result.grade}등급
                  </span>
                </div>
              </div>
            </motion.div>

            {/* 카테고리별 바 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl p-6 shadow-sm"
            >
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                카테고리별 점수
              </h4>
              <div className="space-y-3">
                {categoryBarData.map((cat) => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-gray-500">{cat.score}/{cat.max}</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(cat.score / cat.max) * 100}%` }}
                        transition={{ duration: 0.5 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: cat.fill }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* 개선 권장사항 */}
          {result.recommendations.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl p-6 shadow-sm"
            >
              <h4 className="font-semibold mb-4">개선 권장사항</h4>
              <div className="space-y-3">
                {result.recommendations.map((rec, i) => {
                  const style = SEVERITY_STYLES[rec.severity] || SEVERITY_STYLES.low
                  const Icon = style.icon
                  return (
                    <div key={i} className={`p-4 rounded-lg border ${style.bg}`}>
                      <div className="flex items-start gap-3">
                        <Icon className={`w-5 h-5 mt-0.5 ${style.text}`} />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                              rec.severity === 'high' ? 'bg-red-100 text-red-700' :
                              rec.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {rec.severity === 'high' ? '높음' : rec.severity === 'medium' ? '중간' : '낮음'}
                            </span>
                            <span className="text-xs text-gray-500">{rec.category}</span>
                          </div>
                          <p className="text-sm text-gray-700">{rec.message}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}
