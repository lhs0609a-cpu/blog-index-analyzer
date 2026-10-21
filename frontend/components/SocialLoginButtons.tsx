'use client'

/**
 * 카카오·네이버로 시작하기.
 *
 * 가입 폼은 이름·이메일·비밀번호·확인 4칸이었다 — 한도에 막혀 "가입하면 이어서 한다"는
 * 말을 들은 사람에게 그 자리의 4칸은 높은 벽이다(30일 가입률 2.4%).
 * 서버에 키가 설정된 제공자만 보인다(/api/auth/oauth/providers). 하나도 없으면 아무것도 안 그린다.
 */
import { useEffect, useState } from 'react'
import { getApiUrl } from '@/lib/api/apiConfig'
import { track } from '@/lib/analytics/track'

type Providers = { kakao?: boolean; naver?: boolean }

export default function SocialLoginButtons({ next, at }: { next: string; at: 'login' | 'register' }) {
  const [providers, setProviders] = useState<Providers>({})

  useEffect(() => {
    let alive = true
    fetch(`${getApiUrl()}/api/auth/oauth/providers`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((p) => alive && setProviders(p || {}))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!providers.kakao && !providers.naver) return null

  const go = (provider: 'kakao' | 'naver') => {
    track('signup_submit', { props: { method: provider, at } })
    window.location.href = `${getApiUrl()}/api/auth/oauth/${provider}/start?next=${encodeURIComponent(next)}`
  }

  return (
    <div className="space-y-3 mb-6">
      {providers.kakao && (
        <button
          type="button"
          onClick={() => go('kakao')}
          className="w-full py-3.5 rounded-xl font-bold text-[#191919] bg-[#FEE500] hover:brightness-95 transition flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#191919" d="M12 3C6.48 3 2 6.48 2 10.77c0 2.77 1.86 5.2 4.66 6.57-.2.75-.74 2.72-.85 3.14-.13.52.19.51.4.37.17-.11 2.65-1.8 3.72-2.53.67.1 1.36.15 2.07.15 5.52 0 10-3.48 10-7.7S17.52 3 12 3z" />
          </svg>
          카카오로 3초 만에 시작하기
        </button>
      )}
      {providers.naver && (
        <button
          type="button"
          onClick={() => go('naver')}
          className="w-full py-3.5 rounded-xl font-bold text-white bg-[#03C75A] hover:brightness-95 transition flex items-center justify-center gap-2"
        >
          <span className="font-black text-lg leading-none" aria-hidden="true">N</span>
          네이버로 시작하기
        </button>
      )}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">또는 이메일로</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
    </div>
  )
}
