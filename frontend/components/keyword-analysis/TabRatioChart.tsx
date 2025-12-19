'use client'

import { motion } from 'framer-motion'
import { TabRatio, toPercent } from '@/lib/types/keyword-analysis'
import { FileText, Users, HelpCircle, Globe } from 'lucide-react'

interface TabRatioChartProps {
  tabRatio: TabRatio
  className?: string
}

export default function TabRatioChart({
  tabRatio,
  className = ''
}: TabRatioChartProps) {
  const tabs = [
    {
      key: 'blog',
      label: '블로그',
      ratio: tabRatio.blog,
      count: tabRatio.blog_count,
      color: 'from-green-400 to-green-600',
      bgColor: 'bg-green-100',
      textColor: 'text-green-700',
      icon: FileText
    },
    {
      key: 'cafe',
      label: '카페',
      ratio: tabRatio.cafe,
      count: tabRatio.cafe_count,
      color: 'from-orange-400 to-orange-600',
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-700',
      icon: Users
    },
    {
      key: 'kin',
      label: '지식인',
      ratio: tabRatio.kin,
      count: tabRatio.kin_count,
      color: 'from-blue-400 to-blue-600',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-700',
      icon: HelpCircle
    },
    {
      key: 'web',
      label: '웹문서',
      ratio: tabRatio.web,
      count: tabRatio.web_count,
      color: 'from-purple-400 to-purple-600',
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-700',
      icon: Globe
    }
  ]

  const totalCount = tabRatio.blog_count + tabRatio.cafe_count + tabRatio.kin_count + tabRatio.web_count

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Globe className="w-5 h-5 text-purple-500" />
        탭별 검색 비율
      </h3>

      {/* 도넛 차트 */}
      <div className="flex justify-center mb-6">
        <div className="relative w-40 h-40">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* 배경 원 */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#f3f4f6"
              strokeWidth="12"
            />

            {/* 각 탭별 호 */}
            {(() => {
              let cumulativePercent = 0
              return tabs.map((tab, index) => {
                const percent = tab.ratio * 100
                const startOffset = cumulativePercent
                cumulativePercent += percent

                // 원의 둘레 (2 * PI * r)
                const circumference = 2 * Math.PI * 40
                const strokeDasharray = `${(percent / 100) * circumference} ${circumference}`
                const strokeDashoffset = -((startOffset / 100) * circumference)

                const gradientId = `gradient-${tab.key}`

                return (
                  <g key={tab.key}>
                    <defs>
                      <linearGradient id={gradientId}>
                        <stop offset="0%" className={tab.color.split(' ')[0].replace('from-', 'text-')} stopColor="currentColor" />
                        <stop offset="100%" className={tab.color.split(' ')[1].replace('to-', 'text-')} stopColor="currentColor" />
                      </linearGradient>
                    </defs>
                    <motion.circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={`url(#${gradientId})`}
                      strokeWidth="12"
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                    />
                  </g>
                )
              })
            })()}
          </svg>

          {/* 중앙 텍스트 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-gray-800">
              {totalCount.toLocaleString()}
            </span>
            <span className="text-xs text-gray-500">총 결과</span>
          </div>
        </div>
      </div>

      {/* 범례 */}
      <div className="grid grid-cols-2 gap-3">
        {tabs.map((tab, index) => {
          const Icon = tab.icon
          return (
            <motion.div
              key={tab.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className={`p-3 rounded-lg ${tab.bgColor}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${tab.textColor}`} />
                <span className={`text-sm font-medium ${tab.textColor}`}>
                  {tab.label}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-xl font-bold ${tab.textColor}`}>
                  {toPercent(tab.ratio)}
                </span>
                <span className="text-xs text-gray-500">
                  ({tab.count.toLocaleString()}건)
                </span>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* 인사이트 */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        {tabRatio.blog > 0.4 && (
          <div className="flex items-start gap-2 p-2 bg-green-50 rounded-lg">
            <FileText className="w-4 h-4 text-green-600 mt-0.5" />
            <p className="text-sm text-green-700">
              블로그 콘텐츠가 {toPercent(tabRatio.blog)}로 높습니다. 블로그 SEO에 집중하세요!
            </p>
          </div>
        )}
        {tabRatio.cafe > 0.3 && (
          <div className="flex items-start gap-2 p-2 bg-orange-50 rounded-lg mt-2">
            <Users className="w-4 h-4 text-orange-600 mt-0.5" />
            <p className="text-sm text-orange-700">
              카페 콘텐츠 비율이 높습니다. 네이버 카페 활동도 고려해보세요.
            </p>
          </div>
        )}
        {tabRatio.kin > 0.25 && (
          <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg mt-2">
            <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5" />
            <p className="text-sm text-blue-700">
              지식인 비율이 높습니다. Q&A 형식의 콘텐츠가 효과적일 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// 간단한 바 차트 버전
export function TabRatioBar({ tabRatio, className = '' }: TabRatioChartProps) {
  const tabs = [
    { key: 'blog', label: '블로그', ratio: tabRatio.blog, color: 'bg-green-500' },
    { key: 'cafe', label: '카페', ratio: tabRatio.cafe, color: 'bg-orange-500' },
    { key: 'kin', label: '지식인', ratio: tabRatio.kin, color: 'bg-blue-500' },
    { key: 'web', label: '웹문서', ratio: tabRatio.web, color: 'bg-purple-500' }
  ]

  return (
    <div className={`space-y-2 ${className}`}>
      {tabs.map(tab => (
        <div key={tab.key} className="flex items-center gap-3">
          <span className="w-16 text-sm text-gray-600">{tab.label}</span>
          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${tab.ratio * 100}%` }}
              transition={{ duration: 0.5 }}
              className={`h-full ${tab.color} rounded-full`}
            />
          </div>
          <span className="w-12 text-right text-sm font-medium text-gray-700">
            {toPercent(tab.ratio)}
          </span>
        </div>
      ))}
    </div>
  )
}
