'use client'

/**
 * GlassIcon — 추상 글래스 아이콘 배지 (강도 III)
 * ------------------------------------------------
 * 납작한 `rounded-full bg-[#0064FF]` + lucide 아이콘 조합을,
 * 색수차·굴절·이리데선스·부유 샤드가 들어간 스퀘어클 유리 오브로 대체한다.
 * 스타일 정의는 app/globals.css 의 `.giorb` 네임스페이스(배경 장식용 `.orb` 와 별개).
 *
 * 사용:
 *   <GlassIcon icon={Sparkles} size={72} />
 *   <GlassIcon icon={Lock} size={48} animated={false} />
 */

import type { LucideIcon } from 'lucide-react'

interface GlassIconProps {
  /** lucide 아이콘 컴포넌트 (예: Sparkles) */
  icon: LucideIcon
  /** 오브 한 변 크기(px). 기본 64 */
  size?: number
  /** idle 부유/회전 애니메이션. 기본 true */
  animated?: boolean
  /** 컨테이너 추가 클래스 (여백 등) */
  className?: string
}

export default function GlassIcon({
  icon: Icon,
  size = 64,
  animated = true,
  className = '',
}: GlassIconProps) {
  const glyph = Math.round(size * 0.44)
  return (
    <span
      className={`giorb ${animated ? 'gi-float' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <i className="gi-fc" />
      <i className="gi-fm" />
      <i className="gi-base" />
      <i className={`gi-iris ${animated ? 'gi-spin' : ''}`} />
      <i className="gi-pane gi-p1" />
      <i className="gi-pane gi-p2" />
      <i className="gi-spec" />
      <i className="gi-shard gi-s1" />
      <i className="gi-shard gi-s2" />
      <span className="gi-glyph" style={{ width: glyph, height: glyph }}>
        <Icon strokeWidth={2} />
      </span>
    </span>
  )
}
