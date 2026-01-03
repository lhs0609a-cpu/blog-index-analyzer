import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Threads Autopilot - AI 스레드 자동화 마케팅',
  description: 'AI 페르소나가 브랜드 톤에 맞는 스레드 콘텐츠를 자동 생성하고 게시합니다. 인스타그램 스레드 마케팅을 자동화하세요.',
  keywords: ['Threads 자동화', '스레드 마케팅', 'AI 콘텐츠', '인스타그램 스레드', 'SNS 자동화'],
  openGraph: {
    title: 'Threads Autopilot | 블랭크',
    description: 'AI 기반 Threads 자동 마케팅 도구',
  },
}

export default function ThreadsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
