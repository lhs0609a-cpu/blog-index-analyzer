import { Metadata } from 'next'

export const metadata: Metadata = {
  title: '블루오션 키워드 - 경쟁 낮은 고수익 키워드 발굴',
  description: '경쟁은 낮고 검색량은 높은 블루오션 키워드를 AI가 자동으로 발굴합니다. 틈새시장 키워드로 블로그 상위 노출을 쉽게 달성하세요.',
  keywords: ['블루오션 키워드', '틈새 키워드', '경쟁 낮은 키워드', '롱테일 키워드', '키워드 발굴'],
  openGraph: {
    title: '블루오션 키워드 | 블랭크',
    description: '경쟁 낮은 고수익 키워드를 AI가 자동 발굴',
  },
}

export default function BlueOceanLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
