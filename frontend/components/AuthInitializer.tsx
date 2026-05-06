'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/lib/stores/auth'
import { getCurrentUser } from '@/lib/api/auth'

/**
 * 앱 로드 시 토큰 유효성을 검증.
 * 정책: **401/403 (실제 인증 실패) 만 로그아웃.** 네트워크/timeout/5xx 등 일시 장애는
 * 토큰 유지 — 다음 API 호출에서 자연스럽게 재검증되도록.
 *
 * Why: 이전엔 모든 에러를 catch 후 logout 했더니 백엔드 일시 hang (fly.io 재시작 / circuit
 * breaker 등) 만 발생해도 사용자가 강제 로그아웃됨 → "계속 자동으로 풀린다" 보고.
 */
export default function AuthInitializer() {
  const { logout, setUser } = useAuthStore()
  const verified = useRef(false)

  useEffect(() => {
    if (verified.current) return
    verified.current = true

    const verifyAuth = async () => {
      const storedToken = localStorage.getItem('auth_token')
      if (!storedToken) return

      try {
        const user = await getCurrentUser()
        setUser(user)
      } catch (err: any) {
        // 401/403 만 logout — 그 외 (네트워크 / 5xx / timeout) 는 토큰 보존.
        // axios 에러는 err.response.status, fetch 에러는 err.status 또는 status 누락
        const status = err?.response?.status ?? err?.status
        if (status === 401 || status === 403) {
          logout()
        } else {
          // 네트워크/서버 일시 장애 — 토큰 유지. 다음 API 호출에서 401 받으면 그때 logout.
          console.warn('[AuthInitializer] verify 실패 (logout 안 함, 토큰 보존):', status, err?.message)
        }
      }
    }

    verifyAuth()
  }, [])

  return null
}
