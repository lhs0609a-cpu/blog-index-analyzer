'use client'

import { motion } from 'framer-motion'
import { Heart, ExternalLink, CheckCircle2 } from 'lucide-react'
import PlatformBadge from './PlatformBadge'

interface InfluencerCardProps {
  profile: any
  onSelect: (profile: any) => void
  onToggleFavorite?: (profileId: string) => void
  isFavorited?: boolean
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function InfluencerCard({
  profile,
  onSelect,
  onToggleFavorite,
  isFavorited = false,
}: InfluencerCardProps) {
  const score = profile.relevance_score || 0
  const scoreColor =
    score >= 70 ? 'text-green-600 bg-green-50' :
    score >= 40 ? 'text-yellow-600 bg-yellow-50' :
    'text-gray-500 bg-gray-50'

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(profile)}
      className="relative bg-white rounded-2xl border border-gray-100 p-4 cursor-pointer transition-all hover:border-[#0064FF]/30 group"
    >
      {/* 즐겨찾기 버튼 */}
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite(profile.id)
          }}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-100 transition-colors z-10"
        >
          <Heart
            className={`w-4 h-4 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-300 group-hover:text-gray-400'}`}
          />
        </button>
      )}

      {/* 프로필 */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">
          {profile.profile_image_url ? (
            <img
              src={profile.profile_image_url}
              alt={profile.display_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg font-bold">
              {(profile.display_name || profile.username || '?')[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-sm text-gray-900 truncate">
              {profile.display_name || profile.username}
            </h3>
            {profile.verified ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /> : null}
          </div>
          <p className="text-xs text-gray-400 truncate">@{profile.username}</p>
        </div>
      </div>

      {/* 플랫폼 배지 + 바로가기 */}
      <div className="flex items-center justify-between mb-3">
        <PlatformBadge platform={profile.platform} />
        {profile.profile_url && (
          <a
            href={profile.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#0064FF] bg-[#0064FF]/5 hover:bg-[#0064FF]/10 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            바로가기
          </a>
        )}
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900">{formatCount(profile.follower_count || 0)}</p>
          <p className="text-[10px] text-gray-400">팔로워</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900">
            {(profile.avg_engagement_rate || 0).toFixed(1)}%
          </p>
          <p className="text-[10px] text-gray-400">참여율</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-gray-900">{formatCount(profile.post_count || 0)}</p>
          <p className="text-[10px] text-gray-400">게시물</p>
        </div>
      </div>

      {/* 스코어 바 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#0064FF] rounded-full transition-all"
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${scoreColor}`}>
          {score.toFixed(0)}
        </span>
      </div>

      {/* 바이오 미리보기 */}
      {profile.bio && (
        <p className="mt-2 text-xs text-gray-500 line-clamp-2">{profile.bio}</p>
      )}
    </motion.div>
  )
}
