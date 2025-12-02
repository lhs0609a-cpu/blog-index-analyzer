/**
 * API 응답 타입 정의
 */

export interface UserResponse {
  id: string
  email: string
  name: string
  created_at: string
  updated_at: string
}

export interface ApiError {
  detail: string
  status_code: number
}

export interface PaginationMeta {
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface PaginatedResponse<T> {
  items: T[]
  meta: PaginationMeta
}
