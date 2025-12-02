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
      // 현재 API URL로 서비스 업데이트
      const currentUrl = getApiUrl()
      const updatedServices = status.services.map(s => ({
        ...s,
        url: `${currentUrl}/health`
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
  }, [status.services, checkHealth, enabled])

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
