'use client'

import { useMemo } from 'react'
import { RadialBarChart, RadialBar, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { AlertTriangle, RotateCcw, TrendingDown, CheckCircle2 } from 'lucide-react'
import type { SimStats, NodeCoord } from './useSimulationEngine'

interface SimulationResultsProps {
  stats: SimStats
  nodeCoords: NodeCoord[]
  onRestart: () => void
}

export default function SimulationResults({ stats, nodeCoords, onRestart }: SimulationResultsProps) {
  const overallPassRate = stats.totalSpawned > 0
    ? Math.round((stats.totalPassed / stats.totalSpawned) * 100)
    : 0

  // 노드별 데이터
  const nodeChartData = useMemo(() => {
    const data: { name: string; arrived: number; passed: number; dropped: number; type: string }[] = []
    for (const node of nodeCoords) {
      const ns = stats.nodeStats.get(node.id)
      if (ns) {
        data.push({
          name: node.label,
          arrived: ns.arrived,
          passed: ns.passed,
          dropped: ns.dropped,
          type: node.type,
        })
      }
    }
    return data
  }, [nodeCoords, stats.nodeStats])

  // 병목 TOP 3 (이탈률 높은 순)
  const bottlenecks = useMemo(() => {
    const items: { nodeId: string; label: string; dropRate: number; arrived: number; dropped: number }[] = []
    for (const node of nodeCoords) {
      const ns = stats.nodeStats.get(node.id)
      if (ns && ns.arrived > 3) {
        const dropRate = ns.dropped / ns.arrived
        items.push({
          nodeId: node.id,
          label: node.label,
          dropRate,
          arrived: ns.arrived,
          dropped: ns.dropped,
        })
      }
    }
    return items.sort((a, b) => b.dropRate - a.dropRate).slice(0, 3)
  }, [nodeCoords, stats.nodeStats])

  // 원형 게이지 데이터
  const gaugeData = [
    { name: '통과율', value: overallPassRate, fill: overallPassRate >= 50 ? '#22c55e' : overallPassRate >= 25 ? '#f59e0b' : '#ef4444' },
  ]

  const IMPROVEMENT_SUGGESTIONS: Record<string, string[]> = {
    traffic: ['유입 채널의 타겟팅 정확도를 확인하세요', 'CPC 대비 전환 효율을 분석하세요'],
    content: ['콘텐츠 품질과 관련성을 개선하세요', 'A/B 테스트로 최적 콘텐츠를 찾으세요'],
    conversion: ['CTA 버튼 위치와 문구를 개선하세요', '전환 폼의 단계를 줄여보세요'],
    revenue: ['결제 프로세스를 간소화하세요', '신뢰 요소(리뷰, 보증)를 추가하세요'],
  }

  return (
    <div className="space-y-6">
      {/* 전체 통과율 */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">시뮬레이션 결과</h3>
        <div className="flex items-center gap-8">
          <div className="w-48 h-48">
            <ResponsiveContainer>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="90%"
                data={gaugeData}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar
                  dataKey="value"
                  cornerRadius={10}
                  background={{ fill: '#f1f5f9' }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div className="text-5xl font-bold" style={{ color: gaugeData[0].fill }}>
              {overallPassRate}%
            </div>
            <p className="text-gray-500 mt-1">최종 전환율 (매출 도달)</p>
            <div className="flex gap-6 mt-4 text-sm">
              <div>
                <span className="text-gray-500">총 유입</span>
                <p className="font-bold text-lg text-gray-900">{stats.totalSpawned}명</p>
              </div>
              <div>
                <span className="text-gray-500">매출 도달</span>
                <p className="font-bold text-lg text-green-600">{stats.totalPassed}명</p>
              </div>
              <div>
                <span className="text-gray-500">이탈</span>
                <p className="font-bold text-lg text-red-500">{stats.totalDropped}명</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 노드별 퍼널 차트 */}
      {nodeChartData.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">노드별 통과/이탈 현황</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={nodeChartData} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = { passed: '통과', dropped: '이탈', arrived: '도착' }
                    return [value, labels[name] || name]
                  }}
                />
                <Legend
                  formatter={(value: string) => {
                    const labels: Record<string, string> = { passed: '통과', dropped: '이탈' }
                    return labels[value] || value
                  }}
                />
                <Bar dataKey="passed" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="dropped" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 병목 TOP 3 */}
      {bottlenecks.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            병목 포인트 TOP {bottlenecks.length}
          </h3>
          <div className="space-y-4">
            {bottlenecks.map((bn, idx) => {
              const node = nodeCoords.find(n => n.id === bn.nodeId)
              const nodeType = node?.type || 'content'
              const suggestions = IMPROVEMENT_SUGGESTIONS[nodeType] || []
              const isHigh = bn.dropRate > 0.7
              const isMedium = bn.dropRate > 0.5

              return (
                <div
                  key={bn.nodeId}
                  className={`p-4 rounded-lg border ${
                    isHigh ? 'bg-red-50 border-red-200' : isMedium ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${isHigh ? 'text-red-600' : isMedium ? 'text-amber-600' : 'text-blue-600'}`}>
                        #{idx + 1}
                      </span>
                      <AlertTriangle className={`w-4 h-4 ${isHigh ? 'text-red-500' : isMedium ? 'text-amber-500' : 'text-blue-500'}`} />
                      <span className="font-medium text-gray-900">{bn.label}</span>
                    </div>
                    <span className={`text-sm font-bold ${isHigh ? 'text-red-600' : isMedium ? 'text-amber-600' : 'text-blue-600'}`}>
                      이탈률 {Math.round(bn.dropRate * 100)}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    도착 {bn.arrived}명 중 {bn.dropped}명 이탈
                  </p>
                  {suggestions.length > 0 && (
                    <div className="text-xs text-gray-500 space-y-1">
                      {suggestions.map((s, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 다시 실행 */}
      <div className="flex justify-center">
        <button
          onClick={onRestart}
          className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition font-medium"
        >
          <RotateCcw className="w-5 h-5" />
          다시 시뮬레이션
        </button>
      </div>
    </div>
  )
}
