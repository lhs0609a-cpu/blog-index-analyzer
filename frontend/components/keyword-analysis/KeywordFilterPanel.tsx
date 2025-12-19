'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Filter, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { KeywordType, CompetitionLevel } from '@/lib/types/keyword-analysis'
import { KeywordTypeChip, ALL_KEYWORD_TYPES } from './KeywordTypeTag'

interface FilterState {
  selectedTypes: KeywordType[]
  minSearchVolume: number
  maxSearchVolume: number | null
  competitionLevels: CompetitionLevel[]
  showMobileOnly: boolean
}

interface KeywordFilterPanelProps {
  typeDistribution?: Record<KeywordType, number>
  onFilterChange: (filters: FilterState) => void
  initialFilters?: Partial<FilterState>
  totalKeywords?: number
  filteredCount?: number
}

const DEFAULT_FILTERS: FilterState = {
  selectedTypes: [],
  minSearchVolume: 100,
  maxSearchVolume: null,
  competitionLevels: [],
  showMobileOnly: true
}

export default function KeywordFilterPanel({
  typeDistribution = {},
  onFilterChange,
  initialFilters = {},
  totalKeywords = 0,
  filteredCount = 0
}: KeywordFilterPanelProps) {
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    ...initialFilters
  })
  const [isExpanded, setIsExpanded] = useState(false)

  const updateFilters = (updates: Partial<FilterState>) => {
    const newFilters = { ...filters, ...updates }
    setFilters(newFilters)
    onFilterChange(newFilters)
  }

  const toggleType = (type: KeywordType) => {
    const newTypes = filters.selectedTypes.includes(type)
      ? filters.selectedTypes.filter(t => t !== type)
      : [...filters.selectedTypes, type]
    updateFilters({ selectedTypes: newTypes })
  }

  const toggleCompetition = (level: CompetitionLevel) => {
    const newLevels = filters.competitionLevels.includes(level)
      ? filters.competitionLevels.filter(l => l !== level)
      : [...filters.competitionLevels, level]
    updateFilters({ competitionLevels: newLevels })
  }

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS)
    onFilterChange(DEFAULT_FILTERS)
  }

  const hasActiveFilters =
    filters.selectedTypes.length > 0 ||
    filters.competitionLevels.length > 0 ||
    filters.minSearchVolume !== 100 ||
    filters.maxSearchVolume !== null

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-700">필터</span>
          {hasActiveFilters && (
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
              활성
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {totalKeywords > 0 && (
            <span className="text-sm text-gray-500">
              {filteredCount}/{totalKeywords} 키워드
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* 필터 패널 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-100"
          >
            <div className="p-4 space-y-4">
              {/* 키워드 유형 필터 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  키워드 유형
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_KEYWORD_TYPES.map(type => (
                    <KeywordTypeChip
                      key={type}
                      type={type}
                      count={typeDistribution[type] || 0}
                      selected={filters.selectedTypes.includes(type)}
                      onClick={() => toggleType(type)}
                    />
                  ))}
                </div>
              </div>

              {/* 검색량 필터 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  월간 검색량
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={filters.minSearchVolume}
                      onChange={(e) => updateFilters({ minSearchVolume: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="최소"
                      min={0}
                    />
                  </div>
                  <span className="text-gray-400">~</span>
                  <div className="flex-1">
                    <input
                      type="number"
                      value={filters.maxSearchVolume || ''}
                      onChange={(e) => updateFilters({ maxSearchVolume: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="최대 (무제한)"
                      min={0}
                    />
                  </div>
                </div>
                {/* 검색량 프리셋 */}
                <div className="flex gap-2 mt-2">
                  {[
                    { label: '100+', min: 100, max: null },
                    { label: '500+', min: 500, max: null },
                    { label: '1,000+', min: 1000, max: null },
                    { label: '100~1,000', min: 100, max: 1000 },
                    { label: '1,000~10,000', min: 1000, max: 10000 }
                  ].map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => updateFilters({
                        minSearchVolume: preset.min,
                        maxSearchVolume: preset.max
                      })}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${
                        filters.minSearchVolume === preset.min && filters.maxSearchVolume === preset.max
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 경쟁도 필터 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  경쟁도
                </label>
                <div className="flex gap-2">
                  {(['낮음', '중간', '높음'] as CompetitionLevel[]).map(level => {
                    const colors = {
                      '낮음': 'bg-green-100 text-green-700 border-green-300',
                      '중간': 'bg-yellow-100 text-yellow-700 border-yellow-300',
                      '높음': 'bg-red-100 text-red-700 border-red-300'
                    }
                    const isSelected = filters.competitionLevels.includes(level)

                    return (
                      <button
                        key={level}
                        onClick={() => toggleCompetition(level)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                          isSelected
                            ? colors[level]
                            : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'
                        }`}
                      >
                        {level}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 모바일 검색량 우선 */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showMobileOnly"
                  checked={filters.showMobileOnly}
                  onChange={(e) => updateFilters({ showMobileOnly: e.target.checked })}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="showMobileOnly" className="text-sm text-gray-700">
                  모바일 검색량 기준으로 정렬
                </label>
              </div>

              {/* 필터 초기화 버튼 */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                  필터 초기화
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// 필터 적용 함수 (유틸리티)
export function applyKeywordFilters<T extends {
  keyword_type?: KeywordType
  monthly_total_search?: number
  monthly_mobile_search?: number
  competition?: string
}>(
  keywords: T[],
  filters: FilterState
): T[] {
  return keywords.filter(kw => {
    // 유형 필터
    if (filters.selectedTypes.length > 0 && kw.keyword_type) {
      if (!filters.selectedTypes.includes(kw.keyword_type)) {
        return false
      }
    }

    // 검색량 필터
    const volume = filters.showMobileOnly
      ? (kw.monthly_mobile_search || 0)
      : (kw.monthly_total_search || 0)

    if (volume < filters.minSearchVolume) {
      return false
    }

    if (filters.maxSearchVolume !== null && volume > filters.maxSearchVolume) {
      return false
    }

    // 경쟁도 필터
    if (filters.competitionLevels.length > 0 && kw.competition) {
      if (!filters.competitionLevels.includes(kw.competition as CompetitionLevel)) {
        return false
      }
    }

    return true
  })
}
