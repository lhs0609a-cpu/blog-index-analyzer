'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { platformConfig } from './PlatformBadge'

interface PlatformFilterBarProps {
  selectedPlatforms: string[]
  onPlatformsChange: (platforms: string[]) => void
  filters: FilterValues
  onFiltersChange: (filters: FilterValues) => void
  allowedPlatforms?: string[]
}

export interface FilterValues {
  min_followers: number
  max_followers: number
  min_engagement_rate: number
  region: string
  language: string
  category: string
  verified_only: boolean
}

export const defaultFilters: FilterValues = {
  min_followers: 0,
  max_followers: 0,
  min_engagement_rate: 0,
  region: '',
  language: '',
  category: '',
  verified_only: false,
}

const allPlatforms = ['youtube', 'instagram', 'tiktok', 'threads', 'facebook', 'x']

const categories = [
  { value: '', label: '전체' },
  { value: '뷰티', label: '뷰티' },
  { value: '맛집', label: '맛집/푸드' },
  { value: '여행', label: '여행' },
  { value: 'IT', label: 'IT/테크' },
  { value: '패션', label: '패션' },
  { value: '건강', label: '건강/피트니스' },
  { value: '교육', label: '교육' },
  { value: '엔터', label: '엔터테인먼트' },
  { value: '게임', label: '게임' },
  { value: '육아', label: '육아/가족' },
]

const regions = [
  { value: '', label: '전체' },
  { value: 'KR', label: '한국' },
  { value: 'US', label: '미국' },
  { value: 'JP', label: '일본' },
  { value: 'CN', label: '중국' },
  { value: 'TW', label: '대만' },
]

const followerPresets = [
  { label: '전체', min: 0, max: 0 },
  { label: '나노 (1K~10K)', min: 1000, max: 10000 },
  { label: '마이크로 (10K~100K)', min: 10000, max: 100000 },
  { label: '미드 (100K~500K)', min: 100000, max: 500000 },
  { label: '매크로 (500K~1M)', min: 500000, max: 1000000 },
  { label: '메가 (1M+)', min: 1000000, max: 0 },
]

export default function PlatformFilterBar({
  selectedPlatforms,
  onPlatformsChange,
  filters,
  onFiltersChange,
  allowedPlatforms,
}: PlatformFilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const effectivePlatforms = allowedPlatforms || allPlatforms

  const togglePlatform = (platform: string) => {
    if (!effectivePlatforms.includes(platform)) return
    if (selectedPlatforms.includes(platform)) {
      if (selectedPlatforms.length > 1) {
        onPlatformsChange(selectedPlatforms.filter((p) => p !== platform))
      }
    } else {
      onPlatformsChange([...selectedPlatforms, platform])
    }
  }

  return (
    <div className="space-y-3">
      {/* 플랫폼 토글 */}
      <div className="flex flex-wrap items-center gap-2">
        {allPlatforms.map((p) => {
          const config = platformConfig[p]
          const selected = selectedPlatforms.includes(p)
          const disabled = !effectivePlatforms.includes(p)
          return (
            <button
              key={p}
              onClick={() => togglePlatform(p)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                selected
                  ? 'bg-[#0064FF] text-white border-[#0064FF] shadow-md shadow-[#0064FF]/20'
                  : disabled
                  ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#0064FF]/50 hover:text-[#0064FF]'
              }`}
            >
              <span>{config?.icon}</span>
              <span>{config?.label || p}</span>
              {disabled && <span className="text-[10px] ml-1 opacity-60">PRO</span>}
            </button>
          )
        })}

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors ml-auto"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>고급 필터</span>
          {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* 고급 필터 패널 */}
      {showAdvanced && (
        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 팔로워 범위 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">팔로워 범위</label>
            <div className="flex flex-wrap gap-1">
              {followerPresets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      min_followers: preset.min,
                      max_followers: preset.max,
                    })
                  }
                  className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                    filters.min_followers === preset.min && filters.max_followers === preset.max
                      ? 'bg-[#0064FF] text-white border-[#0064FF]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#0064FF]/50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 최소 참여율 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
              최소 참여율: {filters.min_engagement_rate}%
            </label>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={filters.min_engagement_rate}
              onChange={(e) =>
                onFiltersChange({ ...filters, min_engagement_rate: parseFloat(e.target.value) })
              }
              className="w-full accent-[#0064FF]"
            />
          </div>

          {/* 지역 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">지역</label>
            <select
              value={filters.region}
              onChange={(e) => onFiltersChange({ ...filters, region: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30"
            >
              {regions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* 카테고리 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">카테고리</label>
            <select
              value={filters.category}
              onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
