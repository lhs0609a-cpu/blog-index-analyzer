import { Metadata } from 'next'

export const metadata: Metadata = {
  title: '블로그 챌린지 - 꾸준한 포스팅 습관 만들기',
  description: '블로그 챌린지에 참여하여 꾸준한 포스팅 습관을 만들어보세요. 미션 수행으로 경험치를 쌓고 보상을 받으세요.',
  keywords: ['블로그 챌린지', '포스팅 습관', '블로그 미션', '글쓰기 챌린지'],
  openGraph: {
    title: '블로그 챌린지 | 블랭크',
    description: '꾸준한 포스팅 습관을 만드는 블로그 챌린지',
  },
}

export default function ChallengeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
