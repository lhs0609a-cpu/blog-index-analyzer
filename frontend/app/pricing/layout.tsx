import { Metadata } from 'next'

export const metadata: Metadata = {
  title: '요금제 - 블랭크 구독 플랜',
  description: '블랭크의 다양한 요금제를 확인하세요. 무료 플랜부터 프로 플랜까지, 블로그 성장 단계에 맞는 최적의 플랜을 선택하세요.',
  keywords: ['블랭크 요금제', '블로그 분석 가격', '구독 플랜', 'SEO 도구 가격'],
  openGraph: {
    title: '요금제 | 블랭크',
    description: '블로그 성장 단계에 맞는 최적의 요금제를 선택하세요',
  },
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
