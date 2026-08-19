'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { getApiUrl } from '@/lib/api/apiConfig'
import { useAuthStore } from '@/lib/stores/auth'

/**
 * 페이지뷰 비컨.
 *
 * ⚠️ 설계 원칙: 통계 수집이 사용자 경험을 절대 건드리면 안 된다.
 * - 실패해도 조용히 무시(토스트·콘솔 에러 없음)
 * - keepalive 로 보내 페이지 이탈 중에도 유실 최소화
 * - 같은 경로를 연속으로 두 번 보내지 않는다(리렌더 방지)
 *
 * 봇은 JS 를 실행하지 않으므로 이 방식이면 대부분 자동으로 걸러진다.
 * (서버에서 UA 로 한 번 더 거른다)
 */
export default function PageviewTracker() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const lastSent = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || lastSent.current === pathname) return
    lastSent.current = pathname

    const body = JSON.stringify({
      path: pathname,
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      user_id: user?.id != null ? String(user.id) : null,
      device:
        typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent)
          ? 'mobile'
          : 'desktop',
    })

    try {
      fetch(`${getApiUrl()}/api/analytics/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    } catch {
      // 통계 수집 실패는 무시한다
    }
  }, [pathname, user?.id])

  return null
}
