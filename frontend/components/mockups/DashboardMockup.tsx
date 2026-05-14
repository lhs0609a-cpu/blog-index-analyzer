'use client'

import { motion } from 'framer-motion'

/**
 * 실제 프로그램 화면을 추상화한 SVG mockup 일러스트.
 * 좌측: 사이드바 + 메뉴, 중앙: KPI 카드 3개, 우측: 라인 차트.
 * login/landing 페이지 hero, empty state 등에서 "실제감 있는" 일러스트로 사용.
 */
export default function DashboardMockup({
  className = '',
  width = 520,
  height = 340,
}: {
  className?: string
  width?: number
  height?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={className}
      style={{ width, height }}
    >
      <svg
        viewBox="0 0 520 340"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="블랭크 대시보드 미리보기"
      >
        <defs>
          <linearGradient id="bg-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F5F7FF" />
            <stop offset="100%" stopColor="#EDF2FF" />
          </linearGradient>
          <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0064FF" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0064FF" stopOpacity="0" />
          </linearGradient>
          <filter id="card-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
            <feOffset dx="0" dy="4" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.12" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="520" height="340" rx="20" fill="url(#bg-grad)" />

        {/* 브라우저 chrome */}
        <rect x="16" y="16" width="488" height="308" rx="14" fill="#FFFFFF" filter="url(#card-shadow)" />
        <rect x="16" y="16" width="488" height="32" rx="14" fill="#F8F9FC" />
        <circle cx="34" cy="32" r="4" fill="#FF6058" />
        <circle cx="50" cy="32" r="4" fill="#FFBD2E" />
        <circle cx="66" cy="32" r="4" fill="#28C840" />
        <rect x="86" y="24" width="180" height="16" rx="6" fill="#E9ECF5" />

        {/* 사이드바 */}
        <rect x="32" y="64" width="100" height="244" rx="10" fill="#F4F6FB" />
        <rect x="44" y="80" width="60" height="6" rx="3" fill="#0064FF" />
        <rect x="44" y="104" width="76" height="6" rx="3" fill="#CBD3E5" />
        <rect x="44" y="124" width="60" height="6" rx="3" fill="#CBD3E5" />
        <rect x="44" y="144" width="72" height="6" rx="3" fill="#CBD3E5" />
        <rect x="44" y="164" width="50" height="6" rx="3" fill="#CBD3E5" />
        <rect x="44" y="184" width="64" height="6" rx="3" fill="#CBD3E5" />

        {/* KPI 카드 3개 */}
        <g>
          <rect x="148" y="64" width="108" height="78" rx="10" fill="#FFFFFF" stroke="#E9ECF5" />
          <rect x="160" y="76" width="44" height="6" rx="3" fill="#9BA4BE" />
          <text x="160" y="110" fontSize="22" fontWeight="700" fill="#111827" fontFamily="system-ui">99.4k</text>
          <rect x="160" y="120" width="58" height="6" rx="3" fill="#10B981" />
        </g>
        <g>
          <rect x="264" y="64" width="108" height="78" rx="10" fill="#FFFFFF" stroke="#E9ECF5" />
          <rect x="276" y="76" width="44" height="6" rx="3" fill="#9BA4BE" />
          <text x="276" y="110" fontSize="22" fontWeight="700" fill="#111827" fontFamily="system-ui">+1,777</text>
          <rect x="276" y="120" width="48" height="6" rx="3" fill="#0064FF" />
        </g>
        <g>
          <rect x="380" y="64" width="108" height="78" rx="10" fill="#FFFFFF" stroke="#E9ECF5" />
          <rect x="392" y="76" width="44" height="6" rx="3" fill="#9BA4BE" />
          <text x="392" y="110" fontSize="22" fontWeight="700" fill="#111827" fontFamily="system-ui">47%</text>
          <rect x="392" y="120" width="52" height="6" rx="3" fill="#10B981" />
        </g>

        {/* 라인 차트 영역 */}
        <rect x="148" y="156" width="340" height="152" rx="10" fill="#FFFFFF" stroke="#E9ECF5" />
        <rect x="160" y="168" width="80" height="8" rx="3" fill="#6B7280" />

        {/* y축 grid */}
        <line x1="172" y1="208" x2="476" y2="208" stroke="#F1F3F8" strokeWidth="1" />
        <line x1="172" y1="232" x2="476" y2="232" stroke="#F1F3F8" strokeWidth="1" />
        <line x1="172" y1="256" x2="476" y2="256" stroke="#F1F3F8" strokeWidth="1" />
        <line x1="172" y1="280" x2="476" y2="280" stroke="#F1F3F8" strokeWidth="1" />

        {/* 영역 차트 */}
        <motion.path
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: 'easeInOut', delay: 0.3 }}
          d="M172 270 L208 252 L244 240 L280 224 L316 232 L352 208 L388 196 L424 188 L460 176"
          fill="none"
          stroke="#0064FF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <motion.path
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.4 }}
          d="M172 270 L208 252 L244 240 L280 224 L316 232 L352 208 L388 196 L424 188 L460 176 L460 296 L172 296 Z"
          fill="url(#chart-grad)"
        />

        {/* 데이터 포인트 */}
        {[
          [172, 270],
          [208, 252],
          [244, 240],
          [280, 224],
          [316, 232],
          [352, 208],
          [388, 196],
          [424, 188],
          [460, 176],
        ].map(([cx, cy], i) => (
          <motion.circle
            key={i}
            cx={cx}
            cy={cy}
            r="3"
            fill="#0064FF"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.5 + i * 0.06, duration: 0.25 }}
          />
        ))}
      </svg>
    </motion.div>
  )
}
