/**
 * 날 fetch 로 백엔드를 부르는 자리를 위한 최소 유틸.
 *
 * apiClient(axios) 는 인터셉터가 토큰을 붙여주지만, 키워드 검색처럼 fetch 를
 * 직접 쓰는 화면은 **아무 헤더도 안 보내고 있었다**. 서버에 한도가 없던 동안은
 * 표가 안 났지만, 이제 토큰이 없으면 로그인한 사람도 비회원 한도(하루 1회)로
 * 취급된다. 그래서 여기에 모아 둔다 — 같은 실수가 다음 fetch 에서 또 나지 않게.
 */

export type LimitHit = {
  limit: number
  audience: 'guest' | 'member'
  feature?: string
  message?: string
  recentBlockDays?: number
}

/** apiClient 인터셉터와 같은 출처(localStorage.auth_token)를 쓴다. */
export function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...base }
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token')
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return headers
}

/**
 * 429 응답이 '하루 한도 초과'인지 읽는다.
 *
 * 한도가 아닌 429(과부하·레이트리밋)도 있으므로 error_code 로 가른다 —
 * 둘을 뭉치면 서버가 바쁜 것을 "돈 내라"로 보여주게 된다.
 */
export async function readLimitHit(response: Response): Promise<LimitHit | null> {
  if (response.status !== 429) return null
  try {
    const body = await response.clone().json()
    const detail = body?.detail
    if (!detail || typeof detail !== 'object') return null
    if (detail.error_code !== 'DAILY_LIMIT_EXCEEDED') return null
    return {
      limit: typeof detail.limit === 'number' ? detail.limit : 0,
      audience: detail.authenticated === false ? 'guest' : 'member',
      feature: detail.feature,
      message: detail.message,
      // 최근 7일 중 막힌 날 수. 매일 부딪히는 사람에게는 화면이 다른 말을 한다.
      recentBlockDays:
        typeof detail.recent_block_days === 'number' ? detail.recent_block_days : 0,
    }
  } catch {
    return null
  }
}
