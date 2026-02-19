'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/lib/stores/auth'
import { getCurrentUser } from '@/lib/api/auth'

/**
 * 앱 로드 시 토큰 유효성을 자동으로 검증하는 컴포넌트.
 * 만료된 토큰이 있으면 자동으로 로그아웃 처리.
 */
export default function AuthInitializer() {
  const { token, isAuthenticated, logout, setUser } = useAuthStore()
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
      } catch {
        // 토큰이 만료되었거나 유효하지 않음 → 로그아웃
        logout()
      }
    }

    verifyAuth()
  }, [])

  return null
}
