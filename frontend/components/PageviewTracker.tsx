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
 *
 * ⚠️ referrer 는 랜딩(첫 페이지뷰)에서만 보낸다.
 * Next 는 라우트가 바뀌어도 문서를 다시 읽지 않으므로 document.referrer 는
 * 세션 내내 처음 들어온 값 그대로다. 그걸 매 이동마다 같이 보내면 한 사람이
 * 5페이지를 보는 동안 "네이버에서 5번 들어왔다"로 기록된다 — 유입 경로 PV 가
 * 페이지 깊이만큼 부풀려진다. 유입은 들어온 횟수이지 본 페이지 수가 아니다.
 */
export default function PageviewTracker() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const lastSent = useRef<string | null>(null)
  const isLanding = useRef(true)

  useEffect(() => {
    if (!pathname || lastSent.current === pathname) return
    lastSent.current = pathname

    const landing = isLanding.current
    isLanding.current = false

    const body = JSON.stringify({
      path: pathname,
      referrer: landing && typeof document !== 'undefined' ? document.referrer : '',
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
