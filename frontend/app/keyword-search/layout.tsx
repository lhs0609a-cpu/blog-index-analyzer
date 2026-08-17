import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: '키워드 분석 - 네이버 검색량과 경쟁 강도 조회',
  description:
    '네이버 키워드의 월간 검색량과 경쟁 강도를 조회하고, 상위 노출 문서를 분석합니다. 광고 경쟁도와 검색 노출 난이도를 분리해서 보여줍니다.',
  path: '/keyword-search',
  keywords: [
    '키워드 검색량 조회',
    '네이버 키워드 분석',
    '블로그 키워드',
    '검색량 확인',
    '키워드 경쟁도',
    '키워드 도구',
  ],
})

export default function KeywordSearchLayout({ children }: { children: React.ReactNode }) {
  return children
}
