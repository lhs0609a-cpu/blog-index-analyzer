/**
 * 퍼널 이벤트 비컨.
 *
 * PageviewTracker 와 같은 원칙 — 수집이 사용자 경험을 절대 건드리지 않는다.
 * 실패해도 조용히 무시하고, keepalive 로 보내 화면이 넘어가는 중에도 유실을 줄인다.
 *
 * ⚠️ props 에 개인정보를 넣지 말 것. 이메일·비밀번호·카드번호는 절대 금지다.
 * 실패 사유는 사람이 읽는 문장이 아니라 **코드**로 보낸다 —
 * 문장은 문구가 바뀌면 집계가 쪼개지고, 에러 메시지에 개인정보가 섞여 들어온다.
 */
import { getApiUrl } from '@/lib/api/apiConfig'

/** 서버 화이트리스트(FUNNEL_EVENTS)와 반드시 같은 목록이어야 한다. */
export type FunnelEvent =
  | 'signup_form_start'
  | 'signup_submit'
  | 'signup_success'
  | 'signup_fail'
  | 'login_submit'
  | 'login_success'
  | 'login_fail'
  | 'activation_first_run'
  | 'limit_hit'
  | 'limit_cta_click'
  | 'pricing_plan_click'
  | 'checkout_blocked_anonymous'
  | 'checkout_consent_open'
  | 'checkout_start'
  | 'payment_widget_open'
  | 'payment_widget_error'
  | 'payment_return_fail'
  | 'payment_register_fail'
  | 'payment_success'

type TrackOptions = {
  /** 실패 사유 **코드**. 사람이 읽는 문장이 아니라 집계 가능한 짧은 키. */
  reason?: string
  props?: Record<string, string | number | boolean | null>
  userId?: string | number | null
}

function device(): 'mobile' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop'
  return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
}

export function track(name: FunnelEvent, opts: TrackOptions = {}): void {
  if (typeof window === 'undefined') return
  try {
    const body = JSON.stringify({
      name,
      path: window.location?.pathname || '',
      user_id: opts.userId != null ? String(opts.userId) : null,
      device: device(),
      reason: opts.reason ? String(opts.reason).slice(0, 200) : null,
      props: opts.props ?? null,
    })
    fetch(`${getApiUrl()}/api/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // 수집 실패는 무시한다
  }
}

/**
 * 활성화(첫 가치 경험)를 사람당 한 번만 남긴다.
 *
 * '가입 → 활성화' 는 가입한 사람 중 값을 한 번이라도 본 비율이다. 실행할 때마다
 * 찍으면 분자가 분모를 넘어 비율이 성립하지 않고, 비회원까지 찍으면 분모(가입)와
 * 모집단이 아예 달라진다. 그래서 **로그인한 사용자의 첫 성공**에만 남긴다.
 *
 * 브라우저를 바꾸면 한 번 더 찍힐 수 있다(localStorage 기준). 그래도 '매번'
 * 보다 20배 이상 정확하고, 서버에 활성화 칼럼을 새로 만들 이유는 아직 없다.
 */
export function markActivated(userId?: number | string | null): void {
  if (!userId || typeof window === 'undefined') return
  const key = `activated_v1_${userId}`
  try {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
  } catch {
    // 저장소를 못 쓰면(사생활 보호 모드 등) 그냥 남긴다 — 안 남기는 것보다 낫다
  }
  track('activation_first_run', { userId })
}

/**
 * 서버 에러를 집계 가능한 **사유 코드**로 접는다.
 *
 * 왜 접는가: 백엔드 detail 문장은 문구가 조금만 바뀌어도 새 항목으로 쪼개져
 * "가장 많은 실패 사유"를 영원히 못 찾게 된다. 원문은 props.raw 에 잘라서만 남긴다.
 */
export function signupFailReason(message: string, httpStatus?: number): string {
  const m = (message || '').toLowerCase()
  if (httpStatus === 429) return 'rate_limited'
  if (m.includes('already') || message.includes('이미') || m.includes('exist') || m.includes('registered'))
    return 'email_taken'
  if (m.includes('password') || message.includes('비밀번호')) return 'password_rejected'
  if (m.includes('email') || message.includes('이메일')) return 'email_invalid'
  if (httpStatus && httpStatus >= 500) return 'server_error'
  if (!httpStatus) return 'network_error'
  return 'other'
}
