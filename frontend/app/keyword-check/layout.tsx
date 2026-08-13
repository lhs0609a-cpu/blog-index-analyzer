import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: '키워드 상위노출 판정 - 내 블로그로 1페이지 가능한지 확인',
  description:
    '블로그 ID와 키워드를 넣으면 그 키워드의 실제 네이버 블로그탭 1페이지를 가져와, 지금 그 자리를 차지한 블로그들과 내 블로그를 같은 기준으로 채점해 진입 가능성을 판정합니다.',
  path: '/keyword-check',
  keywords: [
    '키워드 상위노출',
    '블로그 상위노출 가능',
    '네이버 블로그 1페이지',
    '키워드 난이도',
    '블로그 키워드 경쟁도',
    '상위노출 확인',
  ],
})

export default function KeywordCheckLayout({ children }: { children: React.ReactNode }) {
  return children
}
