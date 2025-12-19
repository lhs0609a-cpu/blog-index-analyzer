'use client'

import { motion } from 'framer-motion'
import {
  CompetitionAnalysis,
  EntryDifficulty,
  ENTRY_DIFFICULTY_COLORS,
  formatSearchVolume
} from '@/lib/types/keyword-analysis'
import { TrendingUp, Users, FileText, Eye } from 'lucide-react'

interface CompetitionGaugeProps {
  analysis: CompetitionAnalysis
  myBlogScore?: number
  className?: string
}

export default function CompetitionGauge({
  analysis,
  myBlogScore,
  className = ''
}: CompetitionGaugeProps) {
  const { top10_stats, entry_difficulty, recommended_blog_score } = analysis

  const difficultyColors = ENTRY_DIFFICULTY_COLORS[entry_difficulty as EntryDifficulty] || ENTRY_DIFFICULTY_COLORS['도전가능']

  // 게이지 퍼센트 계산 (0-100)
  const gaugePercent = Math.min(Math.max(top10_stats.avg_total_score, 0), 100)

  // 내 블로그와 비교
  const myScorePercent = myBlogScore ? Math.min(Math.max(myBlogScore, 0), 100) : null
  const gap = myBlogScore ? top10_stats.avg_total_score - myBlogScore : null

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-purple-500" />
        경쟁도 분석
      </h3>

      {/* 진입 난이도 배지 */}
      <div className="mb-4">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${difficultyColors.bg}`}>
          <span className="text-xl">{difficultyColors.emoji}</span>
          <span className={`font-semibold ${difficultyColors.text}`}>
            진입 난이도: {entry_difficulty}
          </span>
        </div>
      </div>

      {/* 게이지 바 */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">상위 10개 블로그 평균 점수</span>
          <span className="font-bold text-gray-800">{top10_stats.avg_total_score.toFixed(1)}점</span>
        </div>

        <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
          {/* 상위 평균 게이지 */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${gaugePercent}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
          />

          {/* 내 블로그 점수 마커 */}
          {myScorePercent !== null && (
            <motion.div
              initial={{ left: 0 }}
              animate={{ left: `${myScorePercent}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 border-2 border-white rounded-full shadow-lg"
              style={{ marginLeft: '-6px' }}
            />
          )}

          {/* 권장 점수 마커 */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-green-500"
            style={{ left: `${recommended_blog_score}%` }}
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-green-600">
              권장 {recommended_blog_score.toFixed(0)}점
            </div>
          </div>
        </div>

        {/* 스케일 */}
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>

      {/* 내 블로그 비교 */}
      {myBlogScore !== undefined && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-700">내 블로그 점수</span>
            <span className="font-bold text-blue-800">{myBlogScore.toFixed(1)}점</span>
          </div>
          {gap !== null && (
            <div className="mt-1 text-sm">
              {gap > 0 ? (
                <span className="text-orange-600">
                  상위 평균보다 {gap.toFixed(1)}점 부족
                </span>
              ) : (
                <span className="text-green-600">
                  상위 평균보다 {Math.abs(gap).toFixed(1)}점 높음! 진입 가능성 높음
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 상위 블로그 통계 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4" />
            평균 C-Rank
          </div>
          <div className="font-bold text-gray-800">{top10_stats.avg_c_rank.toFixed(1)}점</div>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4" />
            평균 D.I.A.
          </div>
          <div className="font-bold text-gray-800">{top10_stats.avg_dia.toFixed(1)}점</div>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <FileText className="w-4 h-4" />
            평균 포스트
          </div>
          <div className="font-bold text-gray-800">{top10_stats.avg_posts.toLocaleString()}개</div>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Eye className="w-4 h-4" />
            평균 방문자
          </div>
          <div className="font-bold text-gray-800">{top10_stats.avg_visitors.toLocaleString()}명</div>
        </div>
      </div>

      {/* 점수 범위 */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">상위 10개 점수 범위</span>
          <span className="text-gray-700">
            {top10_stats.min_score.toFixed(1)} ~ {top10_stats.max_score.toFixed(1)}점
          </span>
        </div>
      </div>
    </div>
  )
}
