'use client'

/**
 * 블랭크 브랜드 마크 — AURORA GLASS
 * 상승하는 3개의 유리 슬래브 = '지수 측정'.
 * public/icon.svg 와 동일 형상이며, 여기서는 인라인이라 크기·애니메이션 제어가 가능합니다.
 *
 * gradient id 는 인스턴스마다 고유해야 합니다(같은 페이지에 여러 개 렌더될 때 충돌 방지).
 */

let markSeq = 0

interface BlankMarkProps {
  className?: string
}

export function BlankMark({ className = 'w-9 h-9' }: BlankMarkProps) {
  // 인스턴스별 고유 접두사
  const uid = `bm${(markSeq = (markSeq + 1) % 100000)}`

  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-body`} x1="8%" y1="0%" x2="92%" y2="100%">
          <stop offset="0%" stopColor="#4C7DFF" />
          <stop offset="42%" stopColor="#0064FF" />
          <stop offset="100%" stopColor="#6D3BFF" />
        </linearGradient>
        <linearGradient id={`${uid}-spec`} x1="0%" y1="0%" x2="30%" y2="100%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-rim`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-a`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#D8E6FF" stopOpacity="0.62" />
        </linearGradient>
        <linearGradient id={`${uid}-b`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#BFE9FF" stopOpacity="0.48" />
        </linearGradient>
        <linearGradient id={`${uid}-c`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EAF3FF" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#9FC6FF" stopOpacity="0.34" />
        </linearGradient>
        <filter id={`${uid}-sh`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="3.2" floodColor="#001A4D" floodOpacity="0.34" />
        </filter>
      </defs>

      <rect x="4" y="4" width="120" height="120" rx="34" fill={`url(#${uid}-body)`} />
      <rect x="4" y="4" width="120" height="120" rx="34" fill="none" stroke="#001B57" strokeOpacity="0.28" strokeWidth="1.5" />
      <path d="M4 38 A34 34 0 0 1 38 4 H94 A34 34 0 0 1 124 30 C96 46 40 52 4 38 Z" fill={`url(#${uid}-spec)`} />
      <path d="M4 94 A34 34 0 0 0 38 124 H70 C40 118 14 108 4 94 Z" fill={`url(#${uid}-rim)`} />

      <g filter={`url(#${uid}-sh)`}>
        <rect x="30" y="74" width="19" height="28" rx="8" fill={`url(#${uid}-c)`} />
        <rect x="54.5" y="56" width="19" height="46" rx="8" fill={`url(#${uid}-b)`} />
        <rect x="79" y="34" width="19" height="68" rx="8" fill={`url(#${uid}-a)`} />
      </g>

      <rect x="30" y="74" width="19" height="6" rx="3" fill="#fff" fillOpacity="0.55" />
      <rect x="54.5" y="56" width="19" height="6" rx="3" fill="#fff" fillOpacity="0.7" />
      <rect x="79" y="34" width="19" height="6" rx="3" fill="#fff" fillOpacity="0.85" />

      <circle cx="88.5" cy="22" r="4.5" fill="#fff" fillOpacity="0.95" />
      <circle cx="88.5" cy="22" r="8.5" fill="#fff" fillOpacity="0.18" />
    </svg>
  )
}

interface BlankLogoProps {
  /** 마크 크기 클래스 */
  markClassName?: string
  /** 워드마크 노출 여부 */
  showWordmark?: boolean
  /** 워드마크 추가 클래스 (색상 등) */
  wordmarkClassName?: string
}

export default function BlankLogo({
  markClassName = 'w-9 h-9',
  showWordmark = true,
  wordmarkClassName = '',
}: BlankLogoProps) {
  return (
    <span className="flex items-center gap-2">
      <BlankMark className={markClassName} />
      {showWordmark && (
        <span className={`text-lg font-black tracking-tight gradient-text ${wordmarkClassName}`}>
          블랭크
        </span>
      )}
    </span>
  )
}
