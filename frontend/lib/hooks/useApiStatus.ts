import { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl, isProduction } from '@/lib/api/apiConfig'

interface ApiStatusCheck {
  name: string
  url: string
  status: 'checking' | 'connected' | 'disconnected' | 'error'
  latency?: number
  lastCheck?: Date
  error?: string
}

interface ApiStatusState {
  services: ApiStatusCheck[]
  overallStatus: 'connected' | 'partial' | 'disconnected'
}

// 프로덕션에서는 더 긴 간격과 타임아웃 사용
const HEALTH_CHECK_INTERVAL = 30000 // 30초마다 체크 (프로덕션에서는 덜 자주)
// 상태에서 읽지 않고 여기서 정의한다 — 상태를 의존성에 넣으면 루프가 된다.
const SERVICE_NAMES = ['Backend API'] as const
const HEALTH_CHECK_TIMEOUT = 15000 // 15초 타임아웃 (프로덕션 서버 응답 대기)

export function useApiStatus(enabled = true) {
  const apiUrl = getApiUrl()
  const [status, setStatus] = useState<ApiStatusState>({
    services: [
      {
        name: 'Backend API',
        url: `${apiUrl}/health`,
        status: 'checking',
      },
    ],
    overallStatus: 'disconnected',
  })

  // 요청 중인지 추적하여 중복 요청 방지
  const isCheckingRef = useRef(false)

  const checkHealth = useCallback(async (service: ApiStatusCheck): Promise<ApiStatusCheck> => {
    const startTime = performance.now()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT)

      const response = await fetch(service.url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      clearTimeout(timeoutId)
      const endTime = performance.now()
      const latency = Math.round(endTime - startTime)

      if (response.ok) {
        return {
          ...service,
          status: 'connected',
          latency,
          lastCheck: new Date(),
        }
      } else {
        return {
          ...service,
          status: 'error',
          latency,
          lastCheck: new Date(),
          error: `HTTP ${response.status}`,
        }
      }
    } catch (error) {
      const endTime = performance.now()
      const latency = Math.round(endTime - startTime)

      return {
        ...service,
        status: 'disconnected',
        latency,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  }, [])

  const checkAllServices = useCallback(async () => {
    if (!enabled || isCheckingRef.current) return

    isCheckingRef.current = true

    try {
      // ⚠️ status.services 를 읽지 않는다.
      // 예전엔 여기서 status.services 를 map 하고 아래에서 setStatus 로 교체했는데,
      // 그 값이 이 useCallback 의 의존성에 들어 있어 무한 루프가 됐다:
      //   setStatus → services 참조 변경 → useCallback 재생성 → useEffect 재실행
      //   → 즉시 checkAllServices() → 처음으로
      // fetch 왕복(~80ms)만큼만 쉬어서 /health 를 **초당 12회** 때리고 있었다
      // (실측: 30초에 367건). 서비스 목록은 이름 상수 + 현재 URL 로 매번 새로
      // 만들면 되므로 상태를 읽을 이유가 없다.
      const currentUrl = getApiUrl()
      const updatedServices: ApiStatusCheck[] = SERVICE_NAMES.map((name) => ({
        name,
        url: `${currentUrl}/health`,
        status: 'checking',
      }))

      const results = await Promise.all(
        updatedServices.map((service) => checkHealth(service))
      )

      const connectedCount = results.filter((s) => s.status === 'connected').length
      const totalCount = results.length

      let overallStatus: 'connected' | 'partial' | 'disconnected'
      if (connectedCount === totalCount) {
        overallStatus = 'connected'
      } else if (connectedCount > 0) {
        overallStatus = 'partial'
      } else {
        overallStatus = 'disconnected'
      }

      setStatus({
        services: results,
        overallStatus,
      })
    } finally {
      isCheckingRef.current = false
    }
  }, [checkHealth, enabled])

  // 초기 체크 및 주기적 체크
  useEffect(() => {
    if (!enabled) return

    checkAllServices()

    const interval = setInterval(() => {
      checkAllServices()
    }, HEALTH_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [enabled, checkAllServices])

  return {
    ...status,
    refresh: checkAllServices,
  }
}
