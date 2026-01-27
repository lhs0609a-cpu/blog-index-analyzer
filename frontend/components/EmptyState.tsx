'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Search, FileText, BarChart3, Target, TrendingUp,
  Sparkles, Users, Bookmark, Clock, AlertCircle
} from 'lucide-react'

/**
 * P3-2: Empty State 컴포넌트
 * 데이터가 없을 때 친근한 메시지와 다음 행동 유도
 */

type EmptyStateType =
  | 'no-results'      // 검색 결과 없음
  | 'no-blogs'        // 등록된 블로그 없음
  | 'no-keywords'     // 분석된 키워드 없음
  | 'no-tracking'     // 순위 추적 데이터 없음
  | 'no-history'      // 히스토리 없음
  | 'error'           // 오류 발생
  | 'coming-soon'     // 준비 중
  | 'empty-list'      // 일반 빈 목록

interface EmptyStateProps {
  type: EmptyStateType
  title?: string
  description?: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  className?: string
}

const emptyStateConfig: Record<EmptyStateType, {
  icon: React.ElementType
  defaultTitle: string
  defaultDescription: string
  iconBg: string
  iconColor: string
}> = {
  'no-results': {
    icon: Search,
    defaultTitle: '검색 결과가 없어요',
    defaultDescription: '다른 키워드로 다시 검색해보세요.',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-500'
  },
  'no-blogs': {
    icon: FileText,
    defaultTitle: '등록된 블로그가 없어요',
    defaultDescription: '블로그를 분석하면 여기에 표시됩니다.',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-500'
  },
  'no-keywords': {
    icon: Target,
    defaultTitle: '분석된 키워드가 없어요',
    defaultDescription: '키워드 검색으로 경쟁 현황을 파악해보세요.',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-500'
  },
  'no-tracking': {
    icon: TrendingUp,
    defaultTitle: '순위 추적 데이터가 없어요',
    defaultDescription: '키워드를 등록하면 매일 순위를 추적해드려요.',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-500'
  },
  'no-history': {
    icon: Clock,
    defaultTitle: '아직 기록이 없어요',
    defaultDescription: '활동을 시작하면 여기에 기록됩니다.',
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-500'
  },
  'error': {
    icon: AlertCircle,
    defaultTitle: '문제가 발생했어요',
    defaultDescription: '잠시 후 다시 시도해주세요.',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-500'
  },
  'coming-soon': {
    icon: Sparkles,
    defaultTitle: '곧 만나요!',
    defaultDescription: '이 기능은 열심히 준비 중입니다.',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600'
  },
  'empty-list': {
    icon: Bookmark,
    defaultTitle: '아직 데이터가 없어요',
    defaultDescription: '데이터가 추가되면 여기에 표시됩니다.',
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-500'
  }
}

export default function EmptyState({
  type,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className = ''
}: EmptyStateProps) {
  const config = emptyStateConfig[type]
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-center py-12 px-6 ${className}`}
    >
      {/* 아이콘 */}
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className={`w-20 h-20 ${config.iconBg} rounded-full flex items-center justify-center mx-auto mb-6`}
      >
        <Icon className={`w-10 h-10 ${config.iconColor}`} />
      </motion.div>

      {/* 텍스트 */}
      <h3 className="text-xl font-bold text-gray-800 mb-2">
        {title || config.defaultTitle}
      </h3>
      <p className="text-gray-500 mb-6 max-w-sm mx-auto">
        {description || config.defaultDescription}
      </p>

      {/* 액션 버튼 */}
      {(actionLabel && (actionHref || onAction)) && (
        actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0064FF] text-white font-semibold rounded-xl hover:bg-[#0052D4] transition-colors shadow-lg shadow-[#0064FF]/20"
          >
            {actionLabel}
          </Link>
        ) : (
          <button
            onClick={onAction}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0064FF] text-white font-semibold rounded-xl hover:bg-[#0052D4] transition-colors shadow-lg shadow-[#0064FF]/20"
          >
            {actionLabel}
          </button>
        )
      )}
    </motion.div>
  )
}

/**
 * 심플한 인라인 Empty State (작은 영역용)
 */
export function InlineEmptyState({
  message,
  className = ''
}: {
  message: string
  className?: string
}) {
  return (
    <div className={`text-center py-6 text-gray-500 ${className}`}>
      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
        <Bookmark className="w-5 h-5 text-gray-400" />
      </div>
      <p className="text-sm">{message}</p>
    </div>
  )
}
