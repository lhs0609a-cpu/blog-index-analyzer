import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'X Autopilot - AI 트위터 자동화 마케팅',
  description: 'AI가 브랜드에 맞는 자연스러운 트윗을 생성하고 최적의 시간에 자동 게시합니다. 90일 캠페인으로 팬을 만드는 스마트 트윗 자동화.',
  keywords: ['X 자동화', '트위터 마케팅', 'AI 트윗', '소셜 미디어 자동화', 'X Autopilot'],
  openGraph: {
    title: 'X Autopilot | 블랭크',
    description: 'AI 기반 X(트위터) 자동 마케팅 도구',
  },
}

export default function XLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
