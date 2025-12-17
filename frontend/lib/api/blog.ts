import apiClient from './client'
import type {
  BlogAnalysisRequest,
  BlogAnalysisResponse,
  JobStatusResponse,
  BlogIndexResult,
  BlogListItem,
  HealthCheckResponse,
} from '../types/api'

/**
 * Health check
 */
export async function healthCheck(): Promise<HealthCheckResponse> {
  const response = await apiClient.get<HealthCheckResponse>('/health')
  return response.data
}

/**
 * Analyze a blog (synchronous - returns result immediately)
 * Backend has changed from async Celery tasks to synchronous processing
 */
export async function analyzeBlog(
  request: BlogAnalysisRequest
): Promise<BlogAnalysisResponse> {
  const response = await apiClient.post<BlogAnalysisResponse>('/api/blogs/analyze', request)
  return response.data
}

/**
 * Get job status - DEPRECATED
 * This endpoint no longer exists as Backend now processes requests synchronously
 * Kept for backward compatibility but will always throw an error
 * @deprecated Use analyzeBlog() directly instead
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  throw new Error('Job status endpoint is deprecated. Backend now processes requests synchronously.')
}

/**
 * Get blog index by blog_id
 */
export async function getBlogIndex(blogId: string): Promise<BlogIndexResult> {
  const response = await apiClient.get<BlogIndexResult>(`/api/blogs/${blogId}/index`)
  return response.data
}

/**
 * Poll job status until completion - DEPRECATED
 * Backend now processes requests synchronously, so polling is no longer needed
 * @deprecated Use analyzeBlog() directly instead
 */
export async function pollJobStatus(
  jobId: string,
  onProgress?: (progress: number) => void,
  maxAttempts: number = 60,
  interval: number = 2000
): Promise<BlogIndexResult> {
  throw new Error('Job polling is deprecated. Backend now processes requests synchronously. Use analyzeBlog() directly.')
}

/**
 * Get list of user's blogs
 * Uses real API if user is authenticated, falls back to localStorage for guests
 */
export async function getUserBlogs(userId?: number | string): Promise<BlogListItem[]> {
  // 로그인한 사용자는 실제 API 사용
  if (userId) {
    try {
      const { getSavedBlogs } = await import('./userBlogs')
      const response = await getSavedBlogs(userId)
      return response.blogs.map(blog => ({
        blog_id: blog.blog_id,
        name: blog.blog_name || blog.blog_id,
        avatar: blog.avatar || '📝',
        level: blog.level,
        score: blog.score,
        change: blog.change,
        stats: blog.stats,
        lastUpdated: blog.last_analyzed || new Date().toISOString()
      }))
    } catch (error) {
      console.error('Failed to fetch saved blogs:', error)
      // API 실패 시 localStorage 폴백
    }
  }

  // 비로그인 또는 API 실패 시 localStorage 사용
  const cachedBlogs = typeof window !== 'undefined'
    ? localStorage.getItem('cached_blogs')
    : null

  if (cachedBlogs) {
    return JSON.parse(cachedBlogs)
  }

  return []
}

/**
 * Save blog to user's list
 * Uses real API if user is authenticated, falls back to localStorage for guests
 */
export async function saveBlogToList(blog: BlogListItem, userId?: number | string): Promise<void> {
  // 로그인한 사용자는 실제 API 사용
  if (userId) {
    try {
      const { saveBlog } = await import('./userBlogs')
      await saveBlog(userId, {
        blog_id: blog.blog_id,
        blog_name: blog.name,
        avatar: blog.avatar
      })
      return
    } catch (error) {
      console.error('Failed to save blog to server:', error)
      // API 실패 시 localStorage에도 저장
    }
  }

  // 비로그인 또는 API 실패 시 localStorage 사용
  if (typeof window !== 'undefined') {
    const existingBlogs = await getUserBlogs()
    const updatedBlogs = [...existingBlogs.filter(b => b.blog_id !== blog.blog_id), blog]
    localStorage.setItem('cached_blogs', JSON.stringify(updatedBlogs))
  }
}

/**
 * Delete blog from user's list
 */
export async function deleteBlogFromList(blogId: string, userId?: number | string): Promise<void> {
  // 로그인한 사용자는 실제 API 사용
  if (userId) {
    try {
      const { deleteSavedBlog } = await import('./userBlogs')
      await deleteSavedBlog(userId, blogId)
      return
    } catch (error) {
      console.error('Failed to delete blog from server:', error)
    }
  }

  // 비로그인 또는 API 실패 시 localStorage에서 삭제
  if (typeof window !== 'undefined') {
    const existingBlogs = await getUserBlogs()
    const updatedBlogs = existingBlogs.filter(b => b.blog_id !== blogId)
    localStorage.setItem('cached_blogs', JSON.stringify(updatedBlogs))
  }
}

/**
 * Get full blog details including history
 */
export async function getBlogDetails(blogId: string): Promise<BlogIndexResult> {
  // For now, get from index endpoint
  // Later this can include more detailed history and analytics
  const result = await getBlogIndex(blogId)

  // Try to get from cache if available
  if (typeof window !== 'undefined') {
    const cachedBlogs = await getUserBlogs()
    const cachedBlog = cachedBlogs.find(b => b.blog_id === blogId)

    if (cachedBlog) {
      // Merge cached data with fresh data
      return {
        ...result,
        blog: {
          ...result.blog,
          description: result.blog.description || `${cachedBlog.name}의 블로그`,
        }
      }
    }
  }

  return result
}

/**
 * Get score breakdown for a blog
 */
export async function getScoreBreakdown(blogId: string): Promise<any> {
  const response = await apiClient.get(`/api/blogs/${blogId}/score-breakdown`)
  return response.data
}

/**
 * Check if blog exists in database
 */
export async function checkBlogExists(blogId: string): Promise<boolean> {
  try {
    const response = await apiClient.get<{ exists: boolean }>(`/api/blogs/${blogId}/exists`)
    return response.data.exists
  } catch (error) {
    return false
  }
}

/**
 * Search blogs by keyword (returns all results at once)
 */
export async function searchKeyword(keyword: string, limit: number = 100): Promise<any> {
  const response = await apiClient.post('/api/blogs/search-keyword', {
    keyword,
    limit
  })
  return response.data
}

/**
 * Search blogs by keyword with tab classification (VIEW/SMART_BLOCK/BLOG)
 */
export async function searchKeywordWithTabs(keyword: string, limit: number = 100): Promise<any> {
  const response = await apiClient.post('/api/blogs/search-keyword-with-tabs', {
    keyword,
    limit
  })
  return response.data
}
