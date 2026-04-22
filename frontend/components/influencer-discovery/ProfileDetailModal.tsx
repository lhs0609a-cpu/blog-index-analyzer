'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ExternalLink,
  Heart,
  Users,
  Eye,
  MessageCircle,
  ThumbsUp,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import PlatformBadge from './PlatformBadge'

interface ProfileDetailModalProps {
  profile: any
  isOpen: boolean
  onClose: () => void
  onToggleFavorite?: (profileId: string) => void
  isFavorited?: boolean
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://blog-index-analyzer.fly.dev'

export default function ProfileDetailModal({
  profile,
  isOpen,
  onClose,
  onToggleFavorite,
  isFavorited = false,
}: ProfileDetailModalProps) {
  const [posts, setPosts] = useState<any[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  useEffect(() => {
    if (isOpen && profile?.id) {
      loadPosts()
    }
    return () => {
      setPosts([])
    }
  }, [isOpen, profile?.id])

  const loadPosts = async () => {
    if (!profile?.id) return
    setLoadingPosts(true)
    try {
      const resp = await fetch(`${API_BASE}/api/influencer-discovery/profile/${profile.id}/posts?limit=12`)
      const data = await resp.json()
      if (data.success) {
        setPosts(data.posts || [])
      }
    } catch (e) {
      console.error('Posts load error:', e)
    } finally {
      setLoadingPosts(false)
    }
  }

  if (!profile) return null

  const score = profile.relevance_score || 0

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[640px] md:max-h-[85vh] bg-white rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-lg text-gray-900">프로필 상세</h2>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* 프로필 헤더 */}
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 rounded-2xl bg-gray-100 overflow-hidden flex-shrink-0">
                  {profile.profile_image_url ? (
                    <img
                      src={profile.profile_image_url}
                      alt={profile.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-400">
                      {(profile.display_name || profile.username || '?')[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-xl text-gray-900 truncate">
                      {profile.display_name || profile.username}
                    </h3>
                    {profile.verified ? <CheckCircle2 className="w-5 h-5 text-blue-500" /> : null}
                  </div>
                  <p className="text-sm text-gray-400 mb-2">@{profile.username}</p>
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={profile.platform} size="md" />
                  </div>
                </div>
                {onToggleFavorite && (
                  <button
                    onClick={() => onToggleFavorite(profile.id)}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    <Heart
                      className={`w-5 h-5 ${
                        isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-300'
                      }`}
                    />
                  </button>
                )}
              </div>

              {/* 바이오 */}
              {profile.bio && (
                <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3">
                  {profile.bio}
                </p>
              )}

              {/* 통계 그리드 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <Users className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                  <p className="font-bold text-lg text-gray-900">
                    {formatCount(profile.follower_count || 0)}
                  </p>
                  <p className="text-[11px] text-gray-400">팔로워</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <ThumbsUp className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                  <p className="font-bold text-lg text-gray-900">
                    {(profile.avg_engagement_rate || 0).toFixed(2)}%
                  </p>
                  <p className="text-[11px] text-gray-400">참여율</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <Eye className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                  <p className="font-bold text-lg text-gray-900">
                    {formatCount(profile.avg_views || 0)}
                  </p>
                  <p className="text-[11px] text-gray-400">평균 조회</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <MessageCircle className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                  <p className="font-bold text-lg text-gray-900">
                    {formatCount(profile.avg_comments || 0)}
                  </p>
                  <p className="text-[11px] text-gray-400">평균 댓글</p>
                </div>
              </div>

              {/* 스코어 */}
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">관련성 스코어</span>
                  <span className="text-lg font-bold text-[#0064FF]">{score.toFixed(0)}/100</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#0064FF] to-[#00C8FF] rounded-full transition-all"
                    style={{ width: `${Math.min(score, 100)}%` }}
                  />
                </div>
              </div>

              {/* 프로필 바로가기 CTA */}
              {profile.profile_url && (
                <a
                  href={profile.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-[#0064FF] hover:bg-[#0050CC] text-white font-bold rounded-xl transition-colors shadow-md shadow-[#0064FF]/20"
                >
                  <ExternalLink className="w-4 h-4" />
                  {profile.platform === 'youtube' && '유튜브 채널 바로가기'}
                  {profile.platform === 'instagram' && '인스타그램 프로필 바로가기'}
                  {profile.platform === 'tiktok' && '틱톡 프로필 바로가기'}
                  {profile.platform === 'threads' && '쓰레드 프로필 바로가기'}
                  {profile.platform === 'facebook' && '페이스북 페이지 바로가기'}
                  {profile.platform === 'x' && 'X (트위터) 프로필 바로가기'}
                  {!['youtube', 'instagram', 'tiktok', 'threads', 'facebook', 'x'].includes(profile.platform) && '프로필 바로가기'}
                </a>
              )}

              {/* 최근 게시물 */}
              <div>
                <h4 className="font-bold text-sm text-gray-700 mb-3">최근 게시물</h4>
                {loadingPosts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ) : posts.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">게시물 정보가 없습니다</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {posts.map((post: any, idx: number) => (
                      <a
                        key={post.id || idx}
                        href={post.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block"
                      >
                        <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden relative">
                          {post.thumbnail_url ? (
                            <img
                              src={post.thumbnail_url}
                              alt={post.content_text}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center p-2">
                              <p className="text-[10px] text-gray-400 line-clamp-4 text-center">
                                {post.content_text || '내용 없음'}
                              </p>
                            </div>
                          )}
                          {/* 통계 오버레이 */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <div className="text-white text-[10px] text-center space-y-0.5">
                              {post.view_count > 0 && <p>👁 {formatCount(post.view_count)}</p>}
                              {post.like_count > 0 && <p>❤ {formatCount(post.like_count)}</p>}
                              {post.comment_count > 0 && <p>💬 {formatCount(post.comment_count)}</p>}
                            </div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
