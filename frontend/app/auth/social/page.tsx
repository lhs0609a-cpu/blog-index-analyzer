'use client'

/**
 * 소셜 로그인 착지점. 서버 콜백이 #token=…&next=…&new=… 로 돌려보낸다.
 * 토큰을 해시에 실은 건 서버 로그·Referer 에 남지 않게 하려는 것 — 읽자마자 주소에서 지운다.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import { getCurrentUser } from '@/lib/api/auth'
import { safeNextPath } from '@/lib/auth/nextPath'
import { track } from '@/lib/analytics/track'

export default function SocialAuthLanding() {
  const router = useRouter()
  const { login } = useAuthStore()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token = params.get('token')
    const next = safeNextPath(params.get('next'))
    const isNew = params.get('new') === '1'
    const provider = params.get('provider') || 'social'
    window.history.replaceState(null, '', window.location.pathname)

    if (!token) {
      setFailed(true)
      return
    }
    // apiClient 인터셉터가 localStorage 토큰을 붙이므로 먼저 넣고 내 정보를 받는다.
    localStorage.setItem('auth_token', token)
    getCurrentUser()
      .then((user) => {
        login(user, token)
        track(isNew ? 'signup_success' : 'login_success', { userId: user?.id, props: { method: provider } })
        router.replace(next)
      })
      .catch(() => {
        localStorage.removeItem('auth_token')
        setFailed(true)
      })
  }, [login, router])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      {failed ? (
        <div className="text-center">
          <p className="text-gray-800 font-semibold mb-2">로그인을 마치지 못했습니다</p>
          <p className="text-sm text-gray-500 mb-4">잠시 후 다시 시도하거나 이메일로 로그인해 주세요.</p>
          <Link href="/login" className="text-[#0064FF] font-semibold">로그인 화면으로</Link>
        </div>
      ) : (
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0064FF] mx-auto mb-4" />
          <p className="text-gray-600">로그인 중...</p>
        </div>
      )}
    </div>
  )
}
