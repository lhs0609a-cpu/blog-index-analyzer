/**
 * 커뮤니티 API 클라이언트
 */
import { getApiUrl } from './apiConfig'

const API_BASE = getApiUrl()

// ============ Types ============

export interface LevelInfo {
  level: number
  level_name: string
  level_icon: string
  next_level_points: number | null
  progress_to_next: number
}

export interface UserPoints {
  user_id: number
  total_points: number
  weekly_points: number
  monthly_points: number
  level: number
  level_name: string
  streak_days: number
  top_ranking_count: number
  level_info: LevelInfo
}

export interface LeaderboardEntry {
  rank: number
  user_id: number
  total_points: number
  weekly_points: number
  monthly_points: number
  level: number
  level_name: string
  masked_name: string
  level_info: LevelInfo
}

export interface ActivityFeedItem {
  id: number
  user_id: number
  masked_name: string
  activity_type: string
  title: string
  description: string | null
  metadata: Record<string, any> | null
  points_earned: number
  created_at: string
}

export interface Insight {
  id: number
  user_id: number
  user_level: string
  content: string
  category: string
  likes: number
  comments_count: number
  is_anonymous: boolean
  created_at: string
}

export interface InsightComment {
  id: number
  insight_id: number
  user_id: number
  user_level: string
  content: string
  is_anonymous: boolean
  created_at: string
}

export interface TrendingKeyword {
  rank: number
  keyword: string
  search_count: number
  trend_score: number
  prev_score: number
  change_percent: number
  is_hot: boolean
}

export interface RankingSuccess {
  id: number
  user_id: number
  masked_name: string
  blog_id: string | null
  keyword: string
  prev_rank: number | null
  new_rank: number
  post_url: string | null
  is_new_entry: boolean
  consecutive_days: number
  created_at: string
}

export interface PlatformStats {
  keyword_searches: number
  blog_analyses: number
  ranking_successes: number
  active_users: number
  hot_keyword: string | null
}

export interface CommunitySummary {
  stats: PlatformStats
  recent_activities: ActivityFeedItem[]
  trending_keywords: TrendingKeyword[]
  recent_successes: RankingSuccess[]
  top_users: LeaderboardEntry[]
  timestamp: string
}

// ============ API Functions ============

// 포인트 관련
export async function getUserPoints(userId: number): Promise<UserPoints> {
  const res = await fetch(`${API_BASE}/api/community/points/${userId}`)
  if (!res.ok) throw new Error('Failed to fetch user points')
  return res.json()
}

export async function addPoints(
  userId: number,
  actionType: string,
  description?: string,
  metadata?: Record<string, any>
): Promise<{ success: boolean; points_earned: number; total_points: number; leveled_up: boolean }> {
  const res = await fetch(`${API_BASE}/api/community/points/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      action_type: actionType,
      description,
      metadata
    })
  })
  if (!res.ok) throw new Error('Failed to add points')
  return res.json()
}

export async function getPointsConfig(): Promise<{
  point_values: Record<string, number>
  level_thresholds: Array<{ points: number; name: string; icon: string }>
}> {
  const res = await fetch(`${API_BASE}/api/community/points/config`)
  if (!res.ok) throw new Error('Failed to fetch points config')
  return res.json()
}

// 리더보드 관련
export async function getLeaderboard(
  period: 'weekly' | 'monthly' | 'all' = 'weekly',
  limit: number = 20
): Promise<{ period: string; leaderboard: LeaderboardEntry[] }> {
  const res = await fetch(`${API_BASE}/api/community/leaderboard?period=${period}&limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch leaderboard')
  return res.json()
}

export async function getMyRank(
  userId: number,
  period: 'weekly' | 'monthly' | 'all' = 'weekly'
): Promise<{ rank: number | null; total_participants: number; points: number }> {
  const res = await fetch(`${API_BASE}/api/community/leaderboard/my-rank/${userId}?period=${period}`)
  if (!res.ok) throw new Error('Failed to fetch my rank')
  return res.json()
}

// 활동 피드 관련
export async function getActivityFeed(
  limit: number = 50,
  offset: number = 0
): Promise<{ feed: ActivityFeedItem[]; active_users: number }> {
  const res = await fetch(`${API_BASE}/api/community/feed?limit=${limit}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to fetch activity feed')
  return res.json()
}

export async function logActivity(
  userId: number,
  activityType: string,
  title: string,
  options?: {
    description?: string
    metadata?: Record<string, any>
    points_earned?: number
    user_name?: string
    is_public?: boolean
  }
): Promise<{ success: boolean; activity_id: number }> {
  const res = await fetch(`${API_BASE}/api/community/feed/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      activity_type: activityType,
      title,
      ...options
    })
  })
  if (!res.ok) throw new Error('Failed to log activity')
  return res.json()
}

export async function getActiveUsersCount(): Promise<{ active_users: number }> {
  const res = await fetch(`${API_BASE}/api/community/feed/active-users`)
  if (!res.ok) throw new Error('Failed to fetch active users count')
  return res.json()
}

// 인사이트 관련
export async function getInsights(
  options?: {
    category?: string
    sort_by?: 'recent' | 'popular'
    limit?: number
    offset?: number
  }
): Promise<{ insights: Insight[] }> {
  const params = new URLSearchParams()
  if (options?.category) params.set('category', options.category)
  if (options?.sort_by) params.set('sort_by', options.sort_by)
  if (options?.limit) params.set('limit', options.limit.toString())
  if (options?.offset) params.set('offset', options.offset.toString())

  const res = await fetch(`${API_BASE}/api/community/insights?${params}`)
  if (!res.ok) throw new Error('Failed to fetch insights')
  return res.json()
}

export async function createInsight(
  userId: number,
  content: string,
  category: string = 'general',
  isAnonymous: boolean = true
): Promise<{ success: boolean; insight_id: number }> {
  const res = await fetch(`${API_BASE}/api/community/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      content,
      category,
      is_anonymous: isAnonymous
    })
  })
  if (!res.ok) throw new Error('Failed to create insight')
  return res.json()
}

export async function likeInsight(
  insightId: number,
  userId: number
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/community/insights/${insightId}/like?user_id=${userId}`, {
    method: 'POST'
  })
  if (!res.ok) throw new Error('Failed to like insight')
  return res.json()
}

export async function getInsightComments(insightId: number): Promise<{ comments: InsightComment[] }> {
  const res = await fetch(`${API_BASE}/api/community/insights/${insightId}/comments`)
  if (!res.ok) throw new Error('Failed to fetch insight comments')
  return res.json()
}

export async function addInsightComment(
  insightId: number,
  userId: number,
  content: string,
  isAnonymous: boolean = true
): Promise<{ success: boolean; comment_id: number }> {
  const res = await fetch(`${API_BASE}/api/community/insights/${insightId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      content,
      is_anonymous: isAnonymous
    })
  })
  if (!res.ok) throw new Error('Failed to add comment')
  return res.json()
}

// 키워드 트렌드 관련
export async function getTrendingKeywords(limit: number = 10): Promise<{ keywords: TrendingKeyword[] }> {
  const res = await fetch(`${API_BASE}/api/community/trends/keywords?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch trending keywords')
  return res.json()
}

export async function updateKeywordTrend(keyword: string, userId?: number): Promise<{ keyword: string; updated: boolean }> {
  const params = new URLSearchParams({ keyword })
  if (userId) params.set('user_id', userId.toString())

  const res = await fetch(`${API_BASE}/api/community/trends/keywords/update?${params}`, {
    method: 'POST'
  })
  if (!res.ok) throw new Error('Failed to update keyword trend')
  return res.json()
}

export async function recommendKeyword(
  userId: number,
  keyword: string,
  reason: string
): Promise<{ success: boolean; trend_id: number }> {
  const res = await fetch(`${API_BASE}/api/community/trends/keywords/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, keyword, reason })
  })
  if (!res.ok) throw new Error('Failed to recommend keyword')
  return res.json()
}

// 상위노출 성공 관련
export async function getRankingSuccesses(
  limit: number = 20,
  todayOnly: boolean = false
): Promise<{ successes: RankingSuccess[]; today_count: number }> {
  const res = await fetch(`${API_BASE}/api/community/ranking-success?limit=${limit}&today_only=${todayOnly}`)
  if (!res.ok) throw new Error('Failed to fetch ranking successes')
  return res.json()
}

export async function logRankingSuccess(
  userId: number,
  keyword: string,
  newRank: number,
  options?: {
    prev_rank?: number
    blog_id?: string
    post_url?: string
    user_name?: string
  }
): Promise<{ success: boolean; success_id: number }> {
  const res = await fetch(`${API_BASE}/api/community/ranking-success`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      keyword,
      new_rank: newRank,
      ...options
    })
  })
  if (!res.ok) throw new Error('Failed to log ranking success')
  return res.json()
}

// 통계 관련
export async function getPlatformStats(): Promise<PlatformStats> {
  const res = await fetch(`${API_BASE}/api/community/stats`)
  if (!res.ok) throw new Error('Failed to fetch platform stats')
  return res.json()
}

export async function getCommunitySummary(): Promise<CommunitySummary> {
  const res = await fetch(`${API_BASE}/api/community/stats/summary`)
  if (!res.ok) throw new Error('Failed to fetch community summary')
  return res.json()
}
