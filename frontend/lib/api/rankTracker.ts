import apiClient from './client'

// ============ 타입 정의 ============

export interface TrackedBlog {
  id: number
  blog_id: string
  blog_name: string | null
  is_active: boolean
  last_checked_at: string | null
  created_at: string
  posts_count: number
}

export interface RankResult {
  keyword_id: number
  keyword: string
  post_title: string
  post_url: string
  rank_blog_tab: number | null
  rank_view_tab: number | null
  blog_classification: string
  view_classification: string
  checked_at: string | null
}

export interface RankStatistics {
  total_keywords: number
  blog_tab: {
    exposed_count: number
    exposure_rate: number
    avg_rank: number
    best_rank: number
    worst_rank: number
    top3_count: number
    mid_count: number
    low_count: number
  }
  view_tab: {
    exposed_count: number
    exposure_rate: number
    avg_rank: number
    best_rank: number
    worst_rank: number
    top3_count: number
    mid_count: number
    low_count: number
  }
}

export interface RankHistory {
  check_date: string
  total_keywords: number
  blog_exposed: number
  view_exposed: number
  avg_blog_rank: number | null
  avg_view_rank: number | null
  best_blog_rank: number | null
  best_view_rank: number | null
}

export interface TaskStatus {
  task_id: string
  status: 'pending' | 'running' | 'completed' | 'error'
  progress: number
  total_keywords: number
  completed_keywords: number
  current_keyword: string | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}

export interface PostKeyword {
  keyword_id: number
  keyword: string
  priority: number
  is_manual: boolean
  post_id: number
  post_title: string
  post_url: string
  published_date: string | null
}

// ============ 블로그 관리 API ============

export async function getTrackedBlogs(userId: number | string): Promise<{ blogs: TrackedBlog[]; count: number }> {
  const response = await apiClient.get('/api/rank-tracker/blogs', {
    params: { user_id: userId }
  })
  return response.data
}

export async function registerBlog(
  userId: number | string,
  blogId: string
): Promise<{ success: boolean; message: string; blog: TrackedBlog }> {
  const response = await apiClient.post('/api/rank-tracker/blogs',
    { blog_id: blogId },
    { params: { user_id: userId } }
  )
  return response.data
}

export async function getTrackedBlogDetail(
  userId: number | string,
  blogId: string
): Promise<{ blog: TrackedBlog; posts_count: number; statistics: RankStatistics }> {
  const response = await apiClient.get(`/api/rank-tracker/blogs/${blogId}`, {
    params: { user_id: userId }
  })
  return response.data
}

export async function deleteTrackedBlog(
  userId: number | string,
  blogId: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete(`/api/rank-tracker/blogs/${blogId}`, {
    params: { user_id: userId }
  })
  return response.data
}

// ============ 순위 확인 API ============

export async function startRankCheck(
  userId: number | string,
  blogId: string,
  maxPosts: number = 50,
  forceRefresh: boolean = false
): Promise<{ success: boolean; message: string; task_id: string }> {
  const response = await apiClient.post(`/api/rank-tracker/check/${blogId}`,
    { max_posts: maxPosts, force_refresh: forceRefresh },
    { params: { user_id: userId } }
  )
  return response.data
}

export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const response = await apiClient.get(`/api/rank-tracker/status/${taskId}`)
  return response.data
}

export async function stopRankCheck(taskId: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post(`/api/rank-tracker/stop/${taskId}`)
  return response.data
}

// ============ 결과 조회 API ============

export async function getRankResults(
  userId: number | string,
  blogId: string
): Promise<{
  blog: { blog_id: string; blog_name: string | null }
  results: RankResult[]
  statistics: RankStatistics
  last_checked_at: string | null
}> {
  const response = await apiClient.get(`/api/rank-tracker/results/${blogId}`, {
    params: { user_id: userId }
  })
  return response.data
}

export async function getRankHistory(
  userId: number | string,
  blogId: string,
  days: number = 30
): Promise<{ blog_id: string; days: number; history: RankHistory[] }> {
  const response = await apiClient.get(`/api/rank-tracker/history/${blogId}`, {
    params: { user_id: userId, days }
  })
  return response.data
}

export async function getRankStatistics(
  userId: number | string,
  blogId: string
): Promise<RankStatistics> {
  const response = await apiClient.get(`/api/rank-tracker/statistics/${blogId}`, {
    params: { user_id: userId }
  })
  return response.data
}

// ============ 키워드 관리 API ============

export async function getKeywords(
  userId: number | string,
  blogId: string
): Promise<{ blog_id: string; keywords: PostKeyword[]; count: number }> {
  const response = await apiClient.get(`/api/rank-tracker/keywords/${blogId}`, {
    params: { user_id: userId }
  })
  return response.data
}

export async function addKeyword(
  userId: number | string,
  postId: number,
  keyword: string,
  priority: number = 1
): Promise<{ success: boolean; message: string; keyword: PostKeyword }> {
  const response = await apiClient.post('/api/rank-tracker/keywords',
    { post_id: postId, keyword, priority },
    { params: { user_id: userId } }
  )
  return response.data
}

// ============ Excel 내보내기 ============

export async function exportToExcel(userId: number | string, blogId: string): Promise<Blob> {
  const response = await apiClient.get(`/api/rank-tracker/export/${blogId}`, {
    params: { user_id: userId },
    responseType: 'blob'
  })
  return response.data
}

export function downloadExcel(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
