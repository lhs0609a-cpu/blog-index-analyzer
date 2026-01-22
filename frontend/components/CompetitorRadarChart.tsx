'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
  Tooltip
} from 'recharts'
import { Users, TrendingUp, ChevronDown, ChevronUp, Crown, Target } from 'lucide-react'

interface BlogData {
  blog_id: string
  blog_name: string
  rank: number
  index: {
    level: number
    total_score: number
    score_breakdown: {
      c_rank: number
      dia: number
    }
  } | null
  stats: {
    total_posts: number
    total_visitors: number
    neighbor_count: number
  } | null
}

interface CompetitorRadarChartProps {
  competitors: BlogData[]
  myBlog?: BlogData | null
  keyword: string
}

// 점수를 0-100 스케일로 정규화
function normalizeScore(value: number, max: number): number {
  return Math.min(100, Math.round((value / max) * 100))
}

export default function CompetitorRadarChart({ competitors, myBlog, keyword }: CompetitorRadarChartProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>([])

  // 상위 5개 블로그만 선택
  const topCompetitors = competitors.slice(0, 5).filter(c => c.index !== null)

  // 최대값 계산 (정규화용)
  const maxValues = {
    level: 11,
    totalScore: 100,
    cRank: 100,
    dia: 100,
    posts: Math.max(...competitors.map(c => c.stats?.total_posts || 0), 1000),
    visitors: Math.max(...competitors.map(c => c.stats?.total_visitors || 0), 10000),
    neighbors: Math.max(...competitors.map(c => c.stats?.neighbor_count || 0), 5000)
  }

  // 레이더 차트 데이터 생성
  const radarData = [
    {
      metric: '블로그 레벨',
      fullMark: 100,
      ...topCompetitors.reduce((acc, c, i) => ({
        ...acc,
        [`competitor${i}`]: normalizeScore(c.index?.level || 0, maxValues.level)
      }), {}),
      ...(myBlog?.index ? { myBlog: normalizeScore(myBlog.index.level, maxValues.level) } : {})
    },
    {
      metric: '신뢰도',
      fullMark: 100,
      ...topCompetitors.reduce((acc, c, i) => ({
        ...acc,
        [`competitor${i}`]: c.index?.score_breakdown?.c_rank || 0
      }), {}),
      ...(myBlog?.index ? { myBlog: myBlog.index.score_breakdown?.c_rank || 0 } : {})
    },
    {
      metric: '글 품질',
      fullMark: 100,
      ...topCompetitors.reduce((acc, c, i) => ({
        ...acc,
        [`competitor${i}`]: c.index?.score_breakdown?.dia || 0
      }), {}),
      ...(myBlog?.index ? { myBlog: myBlog.index.score_breakdown?.dia || 0 } : {})
    },
    {
      metric: '포스트 수',
      fullMark: 100,
      ...topCompetitors.reduce((acc, c, i) => ({
        ...acc,
        [`competitor${i}`]: normalizeScore(c.stats?.total_posts || 0, maxValues.posts)
      }), {}),
      ...(myBlog?.stats ? { myBlog: normalizeScore(myBlog.stats.total_posts, maxValues.posts) } : {})
    },
    {
      metric: '방문자',
      fullMark: 100,
      ...topCompetitors.reduce((acc, c, i) => ({
        ...acc,
        [`competitor${i}`]: normalizeScore(c.stats?.total_visitors || 0, maxValues.visitors)
      }), {}),
      ...(myBlog?.stats ? { myBlog: normalizeScore(myBlog.stats.total_visitors, maxValues.visitors) } : {})
    },
    {
      metric: '이웃 수',
      fullMark: 100,
      ...topCompetitors.reduce((acc, c, i) => ({
        ...acc,
        [`competitor${i}`]: normalizeScore(c.stats?.neighbor_count || 0, maxValues.neighbors)
      }), {}),
      ...(myBlog?.stats ? { myBlog: normalizeScore(myBlog.stats.neighbor_count, maxValues.neighbors) } : {})
    }
  ]

  // 색상 팔레트
  const colors = [
    '#FF6B6B', // 1위 - 빨강
    '#4ECDC4', // 2위 - 청록
    '#45B7D1', // 3위 - 하늘
    '#96CEB4', // 4위 - 민트
    '#FFEAA7', // 5위 - 노랑
  ]

  const myBlogColor = '#0064FF' // 내 블로그 - 토스 블루

  // 경쟁자 토글
  const toggleCompetitor = (blogId: string) => {
    setSelectedCompetitors(prev =>
      prev.includes(blogId)
        ? prev.filter(id => id !== blogId)
        : [...prev, blogId]
    )
  }

  // 선택된 경쟁자만 표시 (없으면 모두 표시)
  const displayedCompetitors = selectedCompetitors.length > 0
    ? topCompetitors.filter(c => selectedCompetitors.includes(c.blog_id))
    : topCompetitors

  if (topCompetitors.length === 0) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden"
    >
      {/* 헤더 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-gray-900">경쟁자 비교 분석</h3>
            <p className="text-sm text-gray-600">"{keyword}" 상위 노출 블로그와 비교</p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-gray-500" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="p-6">
              {/* 경쟁자 선택 칩 */}
              <div className="flex flex-wrap gap-2 mb-6">
                {myBlog && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0064FF]/10 border-2 border-[#0064FF]">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: myBlogColor }} />
                    <span className="text-sm font-bold text-[#0064FF]">내 블로그</span>
                  </div>
                )}
                {topCompetitors.map((competitor, index) => (
                  <button
                    key={competitor.blog_id}
                    onClick={() => toggleCompetitor(competitor.blog_id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border-2 transition-all ${
                      selectedCompetitors.length === 0 || selectedCompetitors.includes(competitor.blog_id)
                        ? 'bg-gray-100 border-gray-300'
                        : 'bg-gray-50 border-gray-200 opacity-50'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: colors[index] }}
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {competitor.rank}위
                    </span>
                    {competitor.rank === 1 && <Crown className="w-3 h-3 text-yellow-500" />}
                  </button>
                ))}
              </div>

              {/* 레이더 차트 */}
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                    />

                    {/* 내 블로그 레이더 */}
                    {myBlog && (
                      <Radar
                        name="내 블로그"
                        dataKey="myBlog"
                        stroke={myBlogColor}
                        fill={myBlogColor}
                        fillOpacity={0.3}
                        strokeWidth={3}
                      />
                    )}

                    {/* 경쟁자 레이더 */}
                    {displayedCompetitors.map((competitor, index) => {
                      const originalIndex = topCompetitors.findIndex(c => c.blog_id === competitor.blog_id)
                      return (
                        <Radar
                          key={competitor.blog_id}
                          name={`${competitor.rank}위 ${competitor.blog_name}`}
                          dataKey={`competitor${originalIndex}`}
                          stroke={colors[originalIndex]}
                          fill={colors[originalIndex]}
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                      )
                    })}

                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                      formatter={(value: number) => [`${value}점`, '']}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="circle"
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* 인사이트 카드 */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 강점 분석 */}
                {myBlog && (
                  <div className="p-4 rounded-xl bg-green-50 border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="font-bold text-green-800">나의 강점</span>
                    </div>
                    <p className="text-sm text-green-700">
                      {(() => {
                        const myLevel = myBlog.index?.level || 0
                        const avgLevel = topCompetitors.reduce((sum, c) => sum + (c.index?.level || 0), 0) / topCompetitors.length

                        if (myLevel > avgLevel) {
                          return `블로그 레벨이 경쟁자 평균보다 ${(myLevel - avgLevel).toFixed(1)} 높습니다!`
                        } else if (myBlog.index?.score_breakdown?.dia > 70) {
                          return '글 품질 점수가 우수합니다. 꾸준히 유지하세요!'
                        } else if (myBlog.stats?.neighbor_count > 1000) {
                          return '이웃 네트워크가 강력합니다. 이를 활용하세요!'
                        }
                        return '분석 데이터를 기반으로 전략을 수립해보세요.'
                      })()}
                    </p>
                  </div>
                )}

                {/* 개선 포인트 */}
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-amber-800">경쟁 전략</span>
                  </div>
                  <p className="text-sm text-amber-700">
                    {(() => {
                      const top1 = topCompetitors[0]
                      if (!top1) return '더 많은 데이터가 필요합니다.'

                      const level = top1.index?.level || 0
                      if (level >= 8) {
                        return `1위 블로그는 Lv.${level}의 강력한 경쟁자입니다. 틈새 키워드 공략을 권장합니다.`
                      } else if (level >= 5) {
                        return `1위 블로그는 Lv.${level}입니다. 글 품질 개선으로 경쟁 가능합니다!`
                      }
                      return `경쟁 강도가 낮습니다. 적극적으로 공략해보세요!`
                    })()}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
