import { Metadata } from 'next'

export const metadata: Metadata = {
  title: '글쓰기 가이드 - AI 기반 블로그 작성 도우미',
  description: '키워드에 최적화된 블로그 글쓰기 가이드를 AI가 제공합니다. 권장 글자수, 이미지 수, 소제목 구성까지 상위 노출을 위한 맞춤 가이드.',
  keywords: ['블로그 글쓰기', '글쓰기 가이드', 'AI 글쓰기', '콘텐츠 작성', '블로그 작성법'],
  openGraph: {
    title: '글쓰기 가이드 | 블랭크',
    description: 'AI 기반 블로그 글쓰기 가이드로 상위 노출을 달성하세요',
  },
}

export default function WritingGuideLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
