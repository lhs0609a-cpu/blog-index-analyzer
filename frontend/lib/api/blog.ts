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
 * Get list of user's blogs (mock for now, will need auth)
 */
export async function getUserBlogs(): Promise<BlogListItem[]> {
  // This will be implemented when auth is added
  // For now, return empty array or use localStorage
  const cachedBlogs = typeof window !== 'undefined'
    ? localStorage.getItem('cached_blogs')
    : null

  if (cachedBlogs) {
    return JSON.parse(cachedBlogs)
  }

  return []
}

/**
 * Save blog to user's list (mock for now)
 */
export async function saveBlogToList(blog: BlogListItem): Promise<void> {
  if (typeof window !== 'undefined') {
    const existingBlogs = await getUserBlogs()
    const updatedBlogs = [...existingBlogs.filter(b => b.blog_id !== blog.blog_id), blog]
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
