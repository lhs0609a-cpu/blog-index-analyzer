import { Metadata } from 'next'

export const metadata: Metadata = {
  title: '키워드 분석 - 네이버 블로그 키워드 검색량 분석',
  description: '네이버 블로그 키워드의 검색량, 경쟁 강도, 상위 노출 블로그를 분석합니다. AI 기반 블루오션 키워드를 발굴하고 최적의 키워드 전략을 수립하세요.',
  keywords: ['키워드 분석', '네이버 키워드', '블로그 키워드', '검색량 분석', '키워드 경쟁도'],
  openGraph: {
    title: '키워드 분석 | 블랭크',
    description: '네이버 블로그 키워드 검색량 및 경쟁 강도 분석',
  },
}

export default function KeywordSearchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
