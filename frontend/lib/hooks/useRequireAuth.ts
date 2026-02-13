'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth'

/**
 * 인증이 필요한 페이지에서 사용하는 훅
 * 미인증 시 로그인 페이지로 리다이렉트
 *
 * @returns { user, userId, token, isAuthenticated, isLoading }
 *
 * @example
 * const { userId, isLoading } = useRequireAuth()
 * if (isLoading) return <LoadingSpinner />
 */
export function useRequireAuth() {
  const router = useRouter()
  const { user, token, isAuthenticated, isLoading } = useAuthStore()

  useEffect(() => {
    // 로딩 중이면 판단 보류
    if (isLoading) return

    // zustand persist가 아직 hydrate 안 되었을 수 있으므로 약간 대기
    const timer = setTimeout(() => {
      const currentState = useAuthStore.getState()
      if (!currentState.isAuthenticated && !currentState.token) {
        router.replace('/login')
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [isAuthenticated, isLoading, router])

  return {
    user,
    userId: user?.id ?? null,
    token,
    isAuthenticated,
    isLoading,
  }
}
