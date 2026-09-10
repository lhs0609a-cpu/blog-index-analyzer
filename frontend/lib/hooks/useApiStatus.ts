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
  // 'checking' = 아직 아무것도 확정되지 않음(첫 체크 전, 또는 실패를 보류 중).
  // 이게 없으면 첫 체크가 끝나기도 전에 배지가 '연결 끊김'으로 보인다.
  overallStatus: 'connected' | 'partial' | 'disconnected' | 'checking'
}

// 프로덕션에서는 더 긴 간격과 타임아웃 사용
const HEALTH_CHECK_INTERVAL = 30000 // 30초마다 체크 (프로덕션에서는 덜 자주)
// 상태에서 읽지 않고 여기서 정의한다 — 상태를 의존성에 넣으면 루프가 된다.
const SERVICE_NAMES = ['Backend API'] as const
const HEALTH_CHECK_TIMEOUT = 15000 // 15초 타임아웃 (프로덕션 서버 응답 대기)
// 체크가 1회 빗나갔다고 '연결 끊김'으로 넘기지 않는다. fly 머신 재시작은 실측 13초 +
// lifespan 스케줄러 부팅이라, 정상 배포 중에도 한 번은 반드시 실패한다.
// 임계치를 못 채운 실패는 직전 상태를 그대로 유지한다 (BackendStatus 와 동일한 규칙).
const FAILURE_THRESHOLD = 2
// 실패한 뒤에는 30초를 다 기다리지 않고 빨리 되물어본다.
const RETRY_CHECK_INTERVAL = 5000

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
    overallStatus: 'checking',
  })

  // 요청 중인지 추적하여 중복 요청 방지
  const isCheckingRef = useRef(false)
  // 서비스별 연속 실패 횟수 / 마지막으로 확정된 상태. 렌더에 쓰이지 않으므로 ref.
  const failureCountsRef = useRef<Record<string, number>>({})
  const lastSettledStatusRef = useRef<Record<string, ApiStatusCheck['status']>>({})

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

      // 실패를 즉시 확정하지 않고 FAILURE_THRESHOLD 회 연속으로 쌓일 때까지 보류한다.
      // 보류 중에는 직전에 확정된 상태를 그대로 쓴다 — 첫 체크라 직전 상태가 없으면
      // 'checking'(노란불)이 되어 "끊겼다"고 단정하지 않는다.
      const settled = results.map((result) => {
        const failing = result.status !== 'connected'
        const count = failing ? (failureCountsRef.current[result.name] ?? 0) + 1 : 0
        failureCountsRef.current[result.name] = count

        if (failing && count < FAILURE_THRESHOLD) {
          const held = lastSettledStatusRef.current[result.name] ?? 'checking'
          // latency/lastCheck 는 방금 잰 값이 맞으므로 유지하고, 상태와 에러만 보류한다.
          return { ...result, status: held, error: undefined }
        }

        lastSettledStatusRef.current[result.name] = result.status
        return result
      })

      const connectedCount = settled.filter((s) => s.status === 'connected').length
      const totalCount = settled.length

      const checkingCount = settled.filter((s) => s.status === 'checking').length

      let overallStatus: ApiStatusState['overallStatus']
      if (connectedCount === totalCount) {
        overallStatus = 'connected'
      } else if (connectedCount > 0) {
        overallStatus = 'partial'
      } else if (checkingCount > 0) {
        // 실패를 보류 중이라 아직 '끊김'으로 단정할 수 없다.
        overallStatus = 'checking'
      } else {
        overallStatus = 'disconnected'
      }

      setStatus({
        services: settled,
        overallStatus,
      })
    } finally {
      isCheckingRef.current = false
    }
  }, [checkHealth, enabled])

  // 초기 체크 및 주기적 체크
  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    // setInterval 대신 자기 자신을 다시 예약한다 — 실패를 보류 중일 때 주기를 줄여
    // 13초짜리 재시작이 30초 넘게 미해결로 남지 않게 한다.
    // (checkAllServices 는 의존성이 안정적이라 위 주석의 무한 루프는 재발하지 않는다.)
    const run = async () => {
      await checkAllServices()
      if (cancelled) return
      const pending = Object.values(failureCountsRef.current).some((n) => n > 0)
      timer = setTimeout(run, pending ? RETRY_CHECK_INTERVAL : HEALTH_CHECK_INTERVAL)
    }

    run()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, checkAllServices])

  return {
    ...status,
    refresh: checkAllServices,
  }
}
