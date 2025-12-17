import apiClient from './client'

// ============ 타입 정의 ============

export interface SavedBlog {
  id: number
  blog_id: string
  blog_name: string | null
  blog_url: string | null
  avatar: string
  level: number
  grade: string
  score: number
  change: number
  stats: {
    posts: number
    visitors: number
    engagement: number
  }
  last_analyzed: string | null
}

export interface BlogListResponse {
  blogs: SavedBlog[]
  count: number
}

export interface SaveBlogRequest {
  blog_id: string
  blog_name?: string
  avatar?: string
}

export interface BlogHistoryItem {
  date: string
  score: number
  level: number
}

export interface BlogHistoryResponse {
  blog_id: string
  history: BlogHistoryItem[]
}

// ============ API 함수 ============

/**
 * 사용자 저장 블로그 목록 조회
 */
export async function getSavedBlogs(userId: number | string): Promise<BlogListResponse> {
  const response = await apiClient.get('/api/user-blogs/saved', {
    params: { user_id: userId }
  })
  return response.data
}

/**
 * 블로그 저장 (분석 후 저장)
 */
export async function saveBlog(
  userId: number | string,
  request: SaveBlogRequest
): Promise<{ success: boolean; message: string; blog: SavedBlog }> {
  const response = await apiClient.post('/api/user-blogs/save', request, {
    params: { user_id: userId }
  })
  return response.data
}

/**
 * 저장된 블로그 삭제
 */
export async function deleteSavedBlog(
  userId: number | string,
  blogId: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete(`/api/user-blogs/${blogId}`, {
    params: { user_id: userId }
  })
  return response.data
}

/**
 * 블로그 재분석
 */
export async function refreshBlogAnalysis(
  userId: number | string,
  blogId: string
): Promise<{ success: boolean; message: string; blog: SavedBlog }> {
  const response = await apiClient.post(`/api/user-blogs/${blogId}/refresh`, null, {
    params: { user_id: userId }
  })
  return response.data
}

/**
 * 블로그 분석 히스토리 조회
 */
export async function getBlogHistory(
  userId: number | string,
  blogId: string,
  limit: number = 30
): Promise<BlogHistoryResponse> {
  const response = await apiClient.get(`/api/user-blogs/${blogId}/history`, {
    params: { user_id: userId, limit }
  })
  return response.data
}

/**
 * 사용자 저장 블로그 수 조회
 */
export async function getSavedBlogsCount(userId: number | string): Promise<{ count: number }> {
  const response = await apiClient.get('/api/user-blogs/count', {
    params: { user_id: userId }
  })
  return response.data
}
