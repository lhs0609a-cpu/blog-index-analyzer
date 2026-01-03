import { Metadata } from 'next'

export const metadata: Metadata = {
  title: '블로그 도구 - 블로거를 위한 유틸리티',
  description: '블로거를 위한 다양한 유틸리티 도구를 제공합니다. 글자수 세기, 이미지 최적화, 해시태그 생성 등 블로그 작성에 필요한 모든 도구.',
  keywords: ['블로그 도구', '글자수 세기', '블로거 유틸리티', '블로그 작성 도구'],
  openGraph: {
    title: '블로그 도구 | 블랭크',
    description: '블로거를 위한 유틸리티 도구 모음',
  },
}

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
