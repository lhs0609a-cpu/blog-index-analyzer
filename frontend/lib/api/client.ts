import axios, { AxiosInstance, AxiosError } from 'axios'
import toast from 'react-hot-toast'
import { getApiUrl, subscribeToApiUrl, isProduction } from './apiConfig'

// Create axios instance with dynamic baseURL
// 프로덕션에서는 더 긴 타임아웃 사용 (분석 작업이 오래 걸릴 수 있음)
const defaultTimeout = isProduction() ? 120000 : 60000 // 프로덕션: 2분, 로컬: 1분

const apiClient: AxiosInstance = axios.create({
  baseURL: getApiUrl(),
  timeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || String(defaultTimeout)),
  headers: {
    'Content-Type': 'application/json',
  },
})

// API URL이 변경되면 baseURL 업데이트
if (typeof window !== 'undefined') {
  subscribeToApiUrl((newUrl) => {
    apiClient.defaults.baseURL = newUrl
  })
}

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // 매 요청마다 최신 API URL 사용
    config.baseURL = getApiUrl()

    // Add auth token if available
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error: AxiosError) => {
    // Handle errors
    if (error.response) {
      // Server responded with error
      const status = error.response.status
      const data = error.response.data as any

      let message = error.message

      // Extract error message from different formats
      if (typeof data === 'string') {
        message = data
      } else if (data?.detail) {
        // FastAPI single error
        if (typeof data.detail === 'string') {
          message = data.detail
        } else if (Array.isArray(data.detail)) {
          // FastAPI validation errors
          message = data.detail.map((err: any) => {
            const field = err.loc ? err.loc.join('.') : 'field'
            return `${field}: ${err.msg}`
          }).join(', ')
        } else if (typeof data.detail === 'object') {
          // 구조화된 오류: { error_code, message, ... }
          // 예전엔 통째로 JSON.stringify 해서 사용자에게 중괄호가 그대로 보였다.
          message = data.detail.message || data.detail.detail || JSON.stringify(data.detail)
        }
      } else if (data?.message) {
        message = data.message
      }

      // 인증 관련 요청(로그인/회원가입)은 각 페이지에서 직접 에러를 처리하므로 여기서 toast 표시하지 않음
      const requestUrl = error.config?.url || ''
      const isAuthRequest = requestUrl.includes('/api/auth/login') || requestUrl.includes('/api/auth/register')

      // ⚠️ 구조화된 오류(error_code 가 있는 것)는 **호출한 화면이 직접 처리**한다.
      // 예: 블로그 주소 오타 → analyze 화면이 "실제 주소는 'xxx' 입니다" 안내를 띄운다.
      // 여기서 또 토스트를 띄우면 친절한 안내 옆에 "요청한 리소스를 찾을 수 없습니다"
      // 같은 개발자 문구가 나란히 떠서 사용자를 헷갈리게 한다(실제 사고).
      const isStructured =
        data && typeof data.detail === 'object' && !Array.isArray(data.detail) && data.detail?.error_code

      if (status === 401) {
        // Unauthorized - clear token and redirect to login
        // 단, 로그인/회원가입 요청 자체의 401은 리다이렉트 하지 않음 (에러 메시지 표시 위해)
        if (typeof window !== 'undefined' && !isAuthRequest) {
          localStorage.removeItem('auth_token')
          window.location.href = '/login'
        }
      } else if (!isAuthRequest && !isStructured) {
        // 인증 요청이 아니고, 화면이 직접 처리하는 구조화 오류도 아닐 때만 toast
        if (status === 404) {
          // 서버가 준 설명이 있으면 그걸 쓴다. 'lhs0609c 는 블로그 주소가 아닙니다'
          // 같은 문장을 버리고 generic 문구를 띄우면 사용자는 뭘 고쳐야 할지 모른다.
          toast.error(message && message !== error.message ? message : '요청한 리소스를 찾을 수 없습니다')
        } else if (status === 422) {
          toast.error(`입력 오류: ${message}`)
        } else if (status === 500) {
          toast.error('서버 오류가 발생했습니다')
        } else {
          toast.error(message)
        }
      }
    } else if (error.request) {
      // Request made but no response
      toast.error('서버에 연결할 수 없습니다. 네트워크를 확인해주세요.')
    } else {
      // Something else happened
      toast.error('요청 처리 중 오류가 발생했습니다')
    }

    return Promise.reject(error)
  }
)

export default apiClient
