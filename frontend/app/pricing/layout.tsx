import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: '요금제 - 블랭크 구독 플랜',
  description:
    '무료 플랜으로 블로그 분석 일 2회, 키워드 분석 일 8회를 사용할 수 있습니다. 블루오션 키워드 발굴과 1위 가능 키워드가 필요할 때 유료 플랜을 선택하세요.',
  path: '/pricing',
  keywords: ['블랭크 요금제', '블로그 분석 가격', '구독 플랜', '키워드 도구 가격'],
})

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
