import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: '블로그 글 분석 - 상위 노출 문서와 비교',
  description:
    '작성한 글이 상위 노출 문서들과 무엇이 다른지 분석합니다. 검색 의도 대응, 문서 구성, 구체성을 기준으로 개선점을 찾아보세요.',
  path: '/analyze-post',
  keywords: ['블로그 글 분석', '포스팅 분석', '상위노출 글 비교', '블로그 글쓰기 점검'],
})

export default function AnalyzePostLayout({ children }: { children: React.ReactNode }) {
  return children
}
