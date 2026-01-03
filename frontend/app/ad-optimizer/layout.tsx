import { Metadata } from 'next'

export const metadata: Metadata = {
  title: '광고 최적화 - 네이버 광고 효율 분석',
  description: '네이버 광고 캠페인의 효율을 분석하고 최적화합니다. 키워드별 CPC, 클릭률, 전환율을 분석하여 광고비를 절감하세요.',
  keywords: ['네이버 광고', '광고 최적화', 'CPC 분석', '키워드 광고', '광고 효율'],
  openGraph: {
    title: '광고 최적화 | 블랭크',
    description: '네이버 광고 효율 분석 및 최적화 도구',
  },
}

export default function AdOptimizerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
