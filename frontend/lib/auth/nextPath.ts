/**
 * 로그인·가입 뒤 "원래 하려던 자리"로 돌려보내기.
 *
 * 왜 필요한가 — 2026-09-16 실측: 29일간 /pricing 에 온 81명 중 로그인 상태는
 * 12명뿐이었다. 비로그인으로 플랜 버튼을 누르면 /login 으로 보내고, 로그인에
 * 성공하면 무조건 /dashboard 로 떨어뜨렸다. 요금을 보고 마음먹은 사람이
 * 로그인 한 번에 요금제 화면을 잃어버린다.
 *
 * ⚠️ next 는 사용자가 주소로 넘길 수 있는 값이다. 외부 주소가 들어오면
 * 우리 로그인 화면이 남의 사이트로 튕겨 보내는 오픈 리다이렉트가 되므로
 * **같은 출처의 경로만** 허용한다.
 */

const DEFAULT_AFTER_AUTH = '/dashboard'

export function safeNextPath(raw: string | null | undefined, fallback = DEFAULT_AFTER_AUTH): string {
  if (!raw) return fallback
  // '//evil.com' 과 'https://evil.com' 을 모두 막는다. 경로는 '/' 하나로 시작해야 한다.
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  if (raw.startsWith('/login') || raw.startsWith('/register')) return fallback
  return raw
}

/** 지금 화면으로 돌아오는 next 파라미터를 붙인 주소 */
export function withNext(target: string, next?: string): string {
  const path =
    next ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '')
  if (!path || path === '/') return target
  return `${target}?next=${encodeURIComponent(path)}`
}
