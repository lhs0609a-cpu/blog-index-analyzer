import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: '블로그 저품질 확인 - 내 글이 검색에 나오는지 무료 진단',
  description:
    '네이버 블로그 저품질을 추측이 아니라 실제 색인 결과로 확인합니다. 최근 글 제목을 그대로 검색해 노출 여부를 보여주고, 검색에서 빠진 글을 목록으로 알려줍니다. 가입 없이 6초.',
  path: '/blog-check',
  keywords: [
    '블로그 저품질 확인',
    '저품질 블로그',
    '네이버 블로그 검색 누락',
    '블로그 검색 안됨',
    '블로그 노출 확인',
    '저품질 탈출',
  ],
})

export default function BlogCheckLayout({ children }: { children: React.ReactNode }) {
  return children
}
