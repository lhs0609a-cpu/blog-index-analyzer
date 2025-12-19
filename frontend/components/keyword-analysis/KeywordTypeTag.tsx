'use client'

import { KeywordType, KEYWORD_TYPE_COLORS } from '@/lib/types/keyword-analysis'

interface KeywordTypeTagProps {
  type: KeywordType
  confidence?: number
  size?: 'sm' | 'md' | 'lg'
  showConfidence?: boolean
  className?: string
}

export default function KeywordTypeTag({
  type,
  confidence,
  size = 'sm',
  showConfidence = false,
  className = ''
}: KeywordTypeTagProps) {
  const colors = KEYWORD_TYPE_COLORS[type] || KEYWORD_TYPE_COLORS['미분류']

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  }

  // 아이콘 매핑
  const icons: Record<KeywordType, string> = {
    '정보형': 'ℹ️',
    '증상형': '🩺',
    '병원탐색형': '🏥',
    '비용검사형': '💰',
    '지역형': '📍',
    '광역형': '🗺️',
    '미분류': '❓'
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${colors.bg} ${colors.text} border ${colors.border}
        ${sizeClasses[size]}
        ${className}
      `}
      title={showConfidence && confidence ? `신뢰도: ${(confidence * 100).toFixed(0)}%` : undefined}
    >
      <span>{icons[type]}</span>
      <span>{type}</span>
      {showConfidence && confidence !== undefined && confidence > 0 && (
        <span className="opacity-60 text-[0.85em]">
          ({(confidence * 100).toFixed(0)}%)
        </span>
      )}
    </span>
  )
}

// 키워드 유형 필터 칩
interface KeywordTypeChipProps {
  type: KeywordType
  count?: number
  selected?: boolean
  onClick?: () => void
}

export function KeywordTypeChip({
  type,
  count,
  selected = false,
  onClick
}: KeywordTypeChipProps) {
  const colors = KEYWORD_TYPE_COLORS[type] || KEYWORD_TYPE_COLORS['미분류']

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
        transition-all duration-200
        ${selected
          ? `${colors.bg} ${colors.text} border-2 ${colors.border} shadow-sm`
          : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
        }
      `}
    >
      <span>{type}</span>
      {count !== undefined && (
        <span className={`
          px-1.5 py-0.5 rounded-full text-xs
          ${selected ? 'bg-white/50' : 'bg-gray-200'}
        `}>
          {count}
        </span>
      )}
    </button>
  )
}

// 모든 키워드 유형 목록
export const ALL_KEYWORD_TYPES: KeywordType[] = [
  '정보형',
  '증상형',
  '병원탐색형',
  '비용검사형',
  '지역형',
  '광역형'
]
