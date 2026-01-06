'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, Trophy, TrendingUp, MessageSquare, Zap, Users,
  Crown, Medal, Star, ThumbsUp, Send, Clock, ArrowUp, ArrowDown,
  Flame, Target, ChevronRight, RefreshCw, Search, Award
} from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth'
import {
  getCommunitySummary, getActivityFeed, getLeaderboard, getInsights,
  getTrendingKeywords, getRankingSuccesses, createInsight, likeInsight,
  getUserPoints, type CommunitySummary, type ActivityFeedItem,
  type LeaderboardEntry, type Insight, type TrendingKeyword, type RankingSuccess, type UserPoints
} from '@/lib/api/community'

// 활동 타입별 아이콘 및 색상
const ACTIVITY_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  keyword_search: { icon: <Search className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' },
  blog_analysis: { icon: <TrendingUp className="w-4 h-4" />, color: 'text-purple-600', bg: 'bg-purple-100' },
  ranking_success: { icon: <Trophy className="w-4 h-4" />, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  level_up: { icon: <Star className="w-4 h-4" />, color: 'text-orange-600', bg: 'bg-orange-100' },
  share_insight: { icon: <MessageSquare className="w-4 h-4" />, color: 'text-green-600', bg: 'bg-green-100' },
  streak: { icon: <Flame className="w-4 h-4" />, color: 'text-red-600', bg: 'bg-red-100' },
  default: { icon: <Activity className="w-4 h-4" />, color: 'text-gray-600', bg: 'bg-gray-100' }
}

// 레벨 아이콘
const LEVEL_ICONS: Record<string, string> = {
  'Bronze': '🥉',
  'Silver': '🥈',
  'Gold': '🥇',
  'Platinum': '💎',
  'Diamond': '👑',
  'Master': '🏆'
}

export default function CommunityPage() {
  const { user, isAuthenticated } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'feed' | 'leaderboard' | 'insights' | 'trends'>('feed')
  const [summary, setSummary] = useState<CommunitySummary | null>(null)
  const [myPoints, setMyPoints] = useState<UserPoints | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 데이터 로딩
  const loadData = useCallback(async () => {
    try {
      const summaryData = await getCommunitySummary()
      setSummary(summaryData)

      if (isAuthenticated && user?.id) {
        const points = await getUserPoints(user.id)
        setMyPoints(points)
      }
    } catch (error) {
      console.error('Failed to load community data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    loadData()
    // 30초마다 자동 새로고침
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadData()
    setIsRefreshing(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">커뮤니티 로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* 헤더 */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">커뮤니티</h1>
                <p className="text-sm text-gray-500">실시간 활동 & 랭킹</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* 실시간 활성 사용자 */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-sm font-medium text-green-700">
                  {summary?.stats.active_users || 0}명 활동중
                </span>
              </div>

              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 내 포인트 카드 */}
        {isAuthenticated && myPoints && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 text-white mb-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-200 text-sm">내 포인트</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-3xl font-bold">{myPoints.total_points.toLocaleString()}P</span>
                  <span className="text-2xl">{LEVEL_ICONS[myPoints.level_name] || '🥉'}</span>
                  <span className="px-3 py-1 bg-white/20 rounded-full text-sm">{myPoints.level_name}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-purple-200 text-sm">연속 접속</p>
                <p className="text-2xl font-bold">{myPoints.streak_days}일 🔥</p>
              </div>
            </div>
            {myPoints.level_info.next_level_points && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-purple-200 mb-1">
                  <span>다음 레벨까지</span>
                  <span>{myPoints.level_info.next_level_points - myPoints.total_points}P 남음</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all"
                    style={{ width: `${myPoints.level_info.progress_to_next}%` }}
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* 플랫폼 통계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatsCard
            icon={<Search className="w-5 h-5" />}
            label="오늘 키워드 검색"
            value={summary?.stats.keyword_searches || 0}
            color="blue"
          />
          <StatsCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="블로그 분석"
            value={summary?.stats.blog_analyses || 0}
            color="purple"
          />
          <StatsCard
            icon={<Trophy className="w-5 h-5" />}
            label="상위노출 성공"
            value={summary?.stats.ranking_successes || 0}
            color="yellow"
          />
          <StatsCard
            icon={<Flame className="w-5 h-5" />}
            label="인기 키워드"
            value={summary?.stats.hot_keyword || '-'}
            color="red"
            isText
          />
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { id: 'feed', label: '실시간 피드', icon: <Activity className="w-4 h-4" /> },
            { id: 'leaderboard', label: '리더보드', icon: <Trophy className="w-4 h-4" /> },
            { id: 'insights', label: '인사이트', icon: <MessageSquare className="w-4 h-4" /> },
            { id: 'trends', label: '트렌드', icon: <TrendingUp className="w-4 h-4" /> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 컨텐츠 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 메인 컨텐츠 */}
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {activeTab === 'feed' && (
                <ActivityFeedSection key="feed" activities={summary?.recent_activities || []} />
              )}
              {activeTab === 'leaderboard' && (
                <LeaderboardSection key="leaderboard" topUsers={summary?.top_users || []} />
              )}
              {activeTab === 'insights' && (
                <InsightsSection key="insights" userId={user?.id} />
              )}
              {activeTab === 'trends' && (
                <TrendsSection key="trends" keywords={summary?.trending_keywords || []} />
              )}
            </AnimatePresence>
          </div>

          {/* 사이드바 */}
          <div className="space-y-6">
            {/* 상위노출 성공 알림 */}
            <SuccessAlertsCard successes={summary?.recent_successes || []} todayCount={summary?.stats.ranking_successes || 0} />

            {/* 포인트 가이드 */}
            <PointsGuideCard />
          </div>
        </div>
      </main>
    </div>
  )
}

// 통계 카드
function StatsCard({
  icon, label, value, color, isText = false
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  color: string
  isText?: boolean
}) {
  const colorClasses: Record<string, { bg: string; text: string; icon: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', icon: 'bg-blue-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', icon: 'bg-purple-100' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600', icon: 'bg-yellow-100' },
    red: { bg: 'bg-red-50', text: 'text-red-600', icon: 'bg-red-100' }
  }

  const colors = colorClasses[color] || colorClasses.blue

  return (
    <div className={`${colors.bg} rounded-xl p-4`}>
      <div className={`w-10 h-10 ${colors.icon} rounded-lg flex items-center justify-center mb-3`}>
        <span className={colors.text}>{icon}</span>
      </div>
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`text-xl font-bold ${colors.text} ${isText ? 'text-base' : ''}`}>
        {isText ? value : typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

// 실시간 활동 피드
function ActivityFeedSection({ activities }: { activities: ActivityFeedItem[] }) {
  const [feed, setFeed] = useState<ActivityFeedItem[]>(activities)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  useEffect(() => {
    setFeed(activities)
  }, [activities])

  const loadMore = async () => {
    setIsLoadingMore(true)
    try {
      const data = await getActivityFeed(50, feed.length)
      setFeed([...feed, ...data.feed])
    } catch (error) {
      console.error('Failed to load more:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diff < 60) return '방금 전'
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
    return `${Math.floor(diff / 86400)}일 전`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
    >
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            LIVE 실시간 활동
          </h2>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {feed.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            아직 활동이 없습니다
          </div>
        ) : (
          feed.map((item, index) => {
            const config = ACTIVITY_CONFIG[item.activity_type] || ACTIVITY_CONFIG.default
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 ${config.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <span className={config.color}>{config.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{item.masked_name}</span>
                      님이 {item.title}
                    </p>
                    {item.description && (
                      <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-gray-400">{formatTime(item.created_at)}</span>
                    {item.points_earned > 0 && (
                      <span className="text-xs font-medium text-purple-600">+{item.points_earned}P</span>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {feed.length > 0 && (
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="w-full py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
          >
            {isLoadingMore ? '로딩 중...' : '더 보기'}
          </button>
        </div>
      )}
    </motion.div>
  )
}

// 리더보드
function LeaderboardSection({ topUsers }: { topUsers: LeaderboardEntry[] }) {
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'all'>('weekly')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(topUsers)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadLeaderboard()
  }, [period])

  const loadLeaderboard = async () => {
    setIsLoading(true)
    try {
      const data = await getLeaderboard(period, 20)
      setLeaderboard(data.leaderboard)
    } catch (error) {
      console.error('Failed to load leaderboard:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return rank
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
    >
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            리더보드
          </h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { id: 'weekly', label: '주간' },
              { id: 'monthly', label: '월간' },
              { id: 'all', label: '전체' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as any)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  period === p.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">로딩 중...</div>
        ) : leaderboard.length === 0 ? (
          <div className="p-8 text-center text-gray-500">아직 참여자가 없습니다</div>
        ) : (
          leaderboard.map((entry, index) => (
            <motion.div
              key={entry.user_id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              className={`p-4 flex items-center gap-4 ${
                entry.rank <= 3 ? 'bg-gradient-to-r from-yellow-50 to-white' : ''
              }`}
            >
              <div className={`w-10 h-10 flex items-center justify-center font-bold ${
                entry.rank <= 3 ? 'text-2xl' : 'text-lg text-gray-500'
              }`}>
                {getRankIcon(entry.rank)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{entry.masked_name}</span>
                  <span className="text-sm">{LEVEL_ICONS[entry.level_name] || '🥉'}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                    {entry.level_name}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-purple-600">
                  {(period === 'weekly' ? entry.weekly_points : period === 'monthly' ? entry.monthly_points : entry.total_points).toLocaleString()}P
                </p>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  )
}

// 인사이트 게시판
function InsightsSection({ userId }: { userId?: number }) {
  const [insights, setInsights] = useState<Insight[]>([])
  const [sortBy, setSortBy] = useState<'recent' | 'popular'>('recent')
  const [newInsight, setNewInsight] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadInsights()
  }, [sortBy])

  const loadInsights = async () => {
    setIsLoading(true)
    try {
      const data = await getInsights({ sort_by: sortBy, limit: 20 })
      setInsights(data.insights)
    } catch (error) {
      console.error('Failed to load insights:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!userId || !newInsight.trim() || newInsight.length < 10) return

    setIsSubmitting(true)
    try {
      await createInsight(userId, newInsight.trim())
      setNewInsight('')
      loadInsights()
    } catch (error) {
      console.error('Failed to create insight:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLike = async (insightId: number) => {
    if (!userId) return
    try {
      await likeInsight(insightId, userId)
      setInsights(insights.map(i =>
        i.id === insightId ? { ...i, likes: i.likes + 1 } : i
      ))
    } catch (error) {
      console.error('Failed to like insight:', error)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
    >
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-500" />
            인사이트 공유
          </h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setSortBy('recent')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sortBy === 'recent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              최신
            </button>
            <button
              onClick={() => setSortBy('popular')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sortBy === 'popular' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              인기
            </button>
          </div>
        </div>
      </div>

      {/* 인사이트 작성 */}
      {userId && (
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <textarea
            value={newInsight}
            onChange={(e) => setNewInsight(e.target.value)}
            placeholder="블로그 운영 팁이나 인사이트를 공유해보세요 (최소 10자)"
            className="w-full p-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            rows={3}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-500">익명으로 게시됩니다</span>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || newInsight.length < 10}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              공유하기
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-50">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">로딩 중...</div>
        ) : insights.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            아직 공유된 인사이트가 없습니다.<br />
            첫 번째 인사이트를 공유해보세요!
          </div>
        ) : (
          insights.map((insight) => (
            <div key={insight.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{LEVEL_ICONS[insight.user_level] || '🥉'}</span>
                    <span className="text-sm font-medium text-gray-700">
                      익명의 {insight.user_level} 블로거
                    </span>
                  </div>
                  <p className="text-gray-800">{insight.content}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <button
                      onClick={() => handleLike(insight.id)}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600 transition-colors"
                    >
                      <ThumbsUp className="w-4 h-4" />
                      {insight.likes}
                    </button>
                    <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600 transition-colors">
                      <MessageSquare className="w-4 h-4" />
                      {insight.comments_count}
                    </button>
                    <span className="text-xs text-gray-400">
                      {new Date(insight.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  )
}

// 키워드 트렌드
function TrendsSection({ keywords }: { keywords: TrendingKeyword[] }) {
  const [trends, setTrends] = useState<TrendingKeyword[]>(keywords)

  useEffect(() => {
    loadTrends()
  }, [])

  const loadTrends = async () => {
    try {
      const data = await getTrendingKeywords(15)
      setTrends(data.keywords)
    } catch (error) {
      console.error('Failed to load trends:', error)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
    >
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          실시간 HOT 키워드
        </h2>
        <p className="text-sm text-gray-500 mt-1">지금 가장 많이 검색되는 키워드</p>
      </div>

      <div className="divide-y divide-gray-50">
        {trends.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            아직 트렌드 데이터가 없습니다
          </div>
        ) : (
          trends.map((keyword, index) => (
            <motion.div
              key={keyword.keyword}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                index < 3 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{keyword.keyword}</span>
                  {keyword.is_hot && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full flex items-center gap-1">
                      <Flame className="w-3 h-3" />
                      HOT
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{keyword.search_count}회 검색</p>
              </div>
              <div className={`flex items-center gap-1 ${
                keyword.change_percent > 0 ? 'text-green-600' : keyword.change_percent < 0 ? 'text-red-600' : 'text-gray-500'
              }`}>
                {keyword.change_percent > 0 ? (
                  <ArrowUp className="w-4 h-4" />
                ) : keyword.change_percent < 0 ? (
                  <ArrowDown className="w-4 h-4" />
                ) : null}
                <span className="text-sm font-medium">
                  {Math.abs(keyword.change_percent).toFixed(0)}%
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  )
}

// 상위노출 성공 알림 카드
function SuccessAlertsCard({ successes, todayCount }: { successes: RankingSuccess[]; todayCount: number }) {
  return (
    <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl p-4 border border-yellow-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Award className="w-5 h-5 text-yellow-600" />
          상위노출 성공
        </h3>
        <span className="px-2 py-1 bg-yellow-200 text-yellow-800 text-xs font-medium rounded-full">
          오늘 {todayCount}건
        </span>
      </div>

      <div className="space-y-3">
        {successes.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            아직 오늘의 성공 사례가 없습니다
          </p>
        ) : (
          successes.slice(0, 5).map((success) => (
            <div key={success.id} className="bg-white rounded-xl p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    "{success.keyword}"
                  </p>
                  <p className="text-xs text-gray-500">
                    {success.masked_name}님 {success.new_rank}위 달성
                    {success.is_new_entry && ' (신규 진입!)'}
                  </p>
                </div>
                <Trophy className="w-5 h-5 text-yellow-500" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// 포인트 가이드 카드
function PointsGuideCard() {
  const points = [
    { action: '키워드 검색', points: 5, icon: <Search className="w-4 h-4" /> },
    { action: '블로그 분석', points: 10, icon: <TrendingUp className="w-4 h-4" /> },
    { action: '상위노출 성공', points: 50, icon: <Trophy className="w-4 h-4" /> },
    { action: '인사이트 공유', points: 20, icon: <MessageSquare className="w-4 h-4" /> },
    { action: '7일 연속 접속', points: 100, icon: <Flame className="w-4 h-4" /> }
  ]

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100">
      <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-purple-600" />
        포인트 획득 방법
      </h3>

      <div className="space-y-3">
        {points.map((item, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-700">
              <span className="text-gray-400">{item.icon}</span>
              <span className="text-sm">{item.action}</span>
            </div>
            <span className="text-sm font-bold text-purple-600">+{item.points}P</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          포인트를 모아 레벨을 올리고 리더보드 상위에 도전하세요!
        </p>
      </div>
    </div>
  )
}
