'use client'

import { Loader2, AlertCircle } from 'lucide-react'
import InfluencerCard from './InfluencerCard'

interface SearchResultsProps {
  profiles: any[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  cached: boolean
  platformsFailed: string[]
  onSelectProfile: (profile: any) => void
  onToggleFavorite?: (profileId: string) => void
  onPageChange: (page: number) => void
  favoritedIds?: Set<string>
  hasSearched: boolean
}

export default function SearchResults({
  profiles,
  loading,
  total,
  page,
  pageSize,
  cached,
  platformsFailed,
  onSelectProfile,
  onToggleFavorite,
  onPageChange,
  favoritedIds = new Set(),
  hasSearched,
}: SearchResultsProps) {
  const totalPages = Math.ceil(total / pageSize)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#0064FF] mb-3" />
        <p className="text-sm text-gray-500">인플루언서를 검색하고 있습니다...</p>
      </div>
    )
  }

  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
          <span className="text-3xl">🔍</span>
        </div>
        <p className="text-sm font-medium text-gray-500 mb-1">키워드를 입력하여 검색을 시작하세요</p>
        <p className="text-xs text-gray-400">YouTube, Instagram, TikTok 등에서 인플루언서를 찾아보세요</p>
      </div>
    )
  }

  if (profiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-3">
          <AlertCircle className="w-8 h-8" />
        </div>
        <p className="text-sm font-medium text-gray-500">검색 결과가 없습니다</p>
        <p className="text-xs text-gray-400 mt-1">다른 키워드로 시도해보세요</p>
      </div>
    )
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-600">
            총 <span className="font-bold text-gray-900">{total}</span>명
          </p>
          {cached && (
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-green-50 text-green-600 rounded-full">
              캐시됨
            </span>
          )}
        </div>
        {platformsFailed.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              <strong>{platformsFailed.join(', ')}</strong> 결과 없음
              {platformsFailed.includes('instagram') && ' (Instagram: API 미설정)'}
              {platformsFailed.includes('tiktok') && ' (TikTok: API 미설정)'}
              {platformsFailed.includes('threads') && ' (Threads: 결과 없음)'}
              {platformsFailed.includes('facebook') && ' (Facebook: 결과 없음)'}
              {platformsFailed.includes('x') && ' (X: 결과 없음)'}
            </span>
          </div>
        )}
      </div>

      {/* 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {profiles.map((profile: any) => (
          <InfluencerCard
            key={`${profile.platform}-${profile.username}-${profile.id}`}
            profile={profile}
            onSelect={onSelectProfile}
            onToggleFavorite={onToggleFavorite}
            isFavorited={favoritedIds.has(profile.id)}
          />
        ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          >
            이전
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const p = i + 1
            return (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`w-9 h-9 text-sm rounded-xl transition-colors ${
                  p === page
                    ? 'bg-[#0064FF] text-white font-bold'
                    : 'border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            )
          })}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}
