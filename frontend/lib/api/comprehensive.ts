import apiClient from './client'

/**
 * Comprehensive Analysis API
 * Advanced blog analysis features
 */

export interface ComprehensiveAnalysisRequest {
  blog_url: string
  analyze_posts?: boolean
  max_posts?: number
}

export interface ComprehensiveAnalysisResponse {
  blog_id: string
  blog_name: string
  analysis: {
    basic_info: any
    post_analysis: any
    engagement_metrics: any
    seo_analysis: any
    recommendations: any[]
  }
  analyzed_at: string
}

export interface EngagementTrendResponse {
  blog_id: string
  trend: {
    dates: string[]
    views: number[]
    comments: number[]
    likes: number[]
  }
}

export interface EngagementCompareResponse {
  blog_id: string
  comparison: {
    avg_views: number
    avg_comments: number
    avg_likes: number
    percentile: number
  }
}

export interface SearchRankingsResponse {
  blog_id: string
  rankings: Array<{
    keyword: string
    rank: number
    url: string
    date: string
  }>
}

export interface AIContentQualityResponse {
  blog_id: string
  quality_scores: {
    originality: number
    depth: number
    readability: number
    overall: number
  }
  suggestions: string[]
}

/**
 * Perform comprehensive blog analysis
 * Includes post analysis, engagement metrics, SEO analysis
 */
export async function analyzeComprehensive(
  request: ComprehensiveAnalysisRequest
): Promise<ComprehensiveAnalysisResponse> {
  const response = await apiClient.post<ComprehensiveAnalysisResponse>(
    '/api/comprehensive/analyze-comprehensive',
    request
  )
  return response.data
}

/**
 * Get engagement trend for a blog
 * Shows how views, comments, likes change over time
 */
export async function getEngagementTrend(blogId: string): Promise<EngagementTrendResponse> {
  const response = await apiClient.get<EngagementTrendResponse>(
    `/api/comprehensive/engagement-trend/${blogId}`
  )
  return response.data
}

/**
 * Compare blog engagement with others
 * Shows percentile ranking and average metrics
 */
export async function getEngagementCompare(blogId: string): Promise<EngagementCompareResponse> {
  const response = await apiClient.get<EngagementCompareResponse>(
    `/api/comprehensive/engagement-compare/${blogId}`
  )
  return response.data
}

/**
 * Get search rankings for blog posts
 * Shows which keywords the blog ranks for
 */
export async function getSearchRankings(blogId: string): Promise<SearchRankingsResponse> {
  const response = await apiClient.get<SearchRankingsResponse>(
    `/api/comprehensive/search-rankings/${blogId}`
  )
  return response.data
}

/**
 * Get AI-powered content quality analysis
 * Uses AI to evaluate content originality and quality
 */
export async function getAIContentQuality(blogId: string): Promise<AIContentQualityResponse> {
  const response = await apiClient.get<AIContentQualityResponse>(
    `/api/comprehensive/ai-content-quality/${blogId}`
  )
  return response.data
}

/**
 * Test comprehensive analysis endpoint
 */
export async function testComprehensive(): Promise<any> {
  const response = await apiClient.get('/api/comprehensive/test/comprehensive')
  return response.data
}
