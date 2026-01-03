import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI 키워드 학습 - 상위 노출 패턴 분석',
  description: '네이버 블로그 상위 노출 게시물의 패턴을 AI가 학습합니다. 글자수, 이미지 수, 소제목 구성 등 상위 노출의 비밀을 데이터로 분석하세요.',
  keywords: ['AI 학습', '상위 노출 분석', '블로그 패턴', '콘텐츠 분석', '네이버 상위 노출'],
  openGraph: {
    title: 'AI 키워드 학습 | 블랭크',
    description: '상위 노출 블로그의 패턴을 AI가 학습하고 분석합니다',
  },
}

export default function LearningLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
