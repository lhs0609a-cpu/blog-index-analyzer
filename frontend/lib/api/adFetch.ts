/**
 * 광고 최적화 페이지용 인증 fetch 래퍼
 * - JWT 토큰 자동 첨부
 * - API/네트워크 에러 분류
 * - 자동 재시도 (네트워크 에러 시)
 * - 401 시 로그인 리다이렉트
 * - 사용자 친화적 에러 메시지
 */
import toast from 'react-hot-toast'
import { getApiUrl, notifyServerDown } from './apiConfig'

// 에러 타입 분류
export type ApiErrorType = 'network' | 'auth' | 'validation' | 'server' | 'not_found' | 'unknown'

export class ApiError extends Error {
  type: ApiErrorType
  status?: number
  detail?: string

  constructor(type: ApiErrorType, message: string, status?: number, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.type = type
    this.status = status
    this.detail = detail
  }
}

interface AdFetchOptions extends RequestInit {
  /** 자동 재시도 횟수 (기본: 2, 네트워크 에러만) */
  retries?: number
  /** 재시도 간격 ms (기본: 1000, 지수 백오프 적용) */
  retryDelay?: number
  /** 에러 시 토스트 표시 여부 (기본: true) */
  showToast?: boolean
  /** 타임아웃 ms (기본: 30000) */
  timeout?: number
  /** user_id를 query param으로 추가 (JWT 전환 전 호환용) */
  userId?: number
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

function handleAuthError() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token')
    // zustand persist store도 정리
    const stored = localStorage.getItem('auth-storage')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        parsed.state.user = null
        parsed.state.token = null
        parsed.state.isAuthenticated = false
        localStorage.setItem('auth-storage', JSON.stringify(parsed))
      } catch { /* ignore */ }
    }
    window.location.href = '/login'
  }
}

function classifyError(status: number): ApiErrorType {
  if (status === 401) return 'auth'
  if (status === 403) return 'auth'
  if (status === 404) return 'not_found'
  if (status === 422) return 'validation'
  if (status >= 500) return 'server'
  return 'unknown'
}

function getErrorMessage(type: ApiErrorType, detail?: string): string {
  switch (type) {
    case 'network':
      return '서버에 연결할 수 없습니다. 네트워크를 확인해주세요.'
    case 'auth':
      return '인증이 만료되었습니다. 다시 로그인해주세요.'
    case 'validation':
      return detail || '입력 데이터를 확인해주세요.'
    case 'server':
      return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    case 'not_found':
      return '요청한 데이터를 찾을 수 없습니다.'
    default:
      return detail || '오류가 발생했습니다.'
  }
}

async function extractErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const data = await response.json()
    if (typeof data.detail === 'string') return data.detail
    if (Array.isArray(data.detail)) {
      return data.detail.map((e: any) => {
        const field = e.loc ? e.loc.join('.') : 'field'
        return `${field}: ${e.msg}`
      }).join(', ')
    }
    if (data.message) return data.message
    return undefined
  } catch {
    return undefined
  }
}

/**
 * 인증된 API 요청을 수행합니다.
 *
 * @example
 * // GET
 * const data = await adFetch('/api/naver-ad/dashboard')
 *
 * // POST with body
 * const result = await adFetch('/api/naver-ad/account/connect', {
 *   method: 'POST',
 *   body: JSON.stringify(formData)
 * })
 *
 * // With user_id (JWT 전환 전 호환)
 * const data = await adFetch('/api/naver-ad/dashboard', { userId: 1 })
 */
export async function adFetch<T = any>(
  path: string,
  options: AdFetchOptions = {}
): Promise<T> {
  const {
    retries = 2,
    retryDelay = 1000,
    showToast = true,
    timeout = 30000,
    userId,
    ...fetchOptions
  } = options

  const baseUrl = getApiUrl()

  // user_id를 query param으로 추가 (호환용)
  let url = `${baseUrl}${path}`
  if (userId !== undefined) {
    const separator = url.includes('?') ? '&' : '?'
    url = `${url}${separator}user_id=${userId}`
  }

  // 헤더 설정
  const token = getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let lastError: Error | null = null
  const maxAttempts = retries + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // 서버 다운 감지
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        notifyServerDown(true)
        throw new ApiError('server', '서버가 일시적으로 응답하지 않습니다.', response.status)
      }

      // 성공이면 서버 복구 알림
      if (response.ok) {
        notifyServerDown(false)
      }

      // 에러 응답 처리
      if (!response.ok) {
        const detail = await extractErrorDetail(response)
        const errorType = classifyError(response.status)

        if (errorType === 'auth') {
          handleAuthError()
          throw new ApiError('auth', getErrorMessage('auth'), response.status, detail)
        }

        throw new ApiError(errorType, getErrorMessage(errorType, detail), response.status, detail)
      }

      // 204 No Content
      if (response.status === 204) {
        return undefined as T
      }

      return await response.json() as T
    } catch (error) {
      lastError = error as Error

      // ApiError는 재시도하지 않음 (auth, validation, not_found)
      if (error instanceof ApiError && error.type !== 'server' && error.type !== 'network') {
        break
      }

      // 네트워크 에러 분류
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        lastError = new ApiError('network', getErrorMessage('network'))
        notifyServerDown(true)
      }

      // AbortError (timeout)
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new ApiError('network', '요청 시간이 초과되었습니다. 다시 시도해주세요.')
      }

      // 마지막 시도가 아니면 대기 후 재시도
      if (attempt < maxAttempts) {
        const delay = retryDelay * Math.pow(2, attempt - 1) // 지수 백오프
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
    }
  }

  // 모든 재시도 실패
  const apiError = lastError instanceof ApiError
    ? lastError
    : new ApiError('unknown', lastError?.message || '알 수 없는 오류가 발생했습니다.')

  if (showToast) {
    toast.error(apiError.message)
  }

  throw apiError
}

/**
 * adFetch의 편의 래퍼 - GET 요청
 */
export function adGet<T = any>(path: string, opts?: Omit<AdFetchOptions, 'method' | 'body'>) {
  return adFetch<T>(path, { ...opts, method: 'GET' })
}

/**
 * adFetch의 편의 래퍼 - POST 요청
 */
export function adPost<T = any>(path: string, body?: any, opts?: Omit<AdFetchOptions, 'method' | 'body'>) {
  return adFetch<T>(path, { ...opts, method: 'POST', body: body ? JSON.stringify(body) : undefined })
}
