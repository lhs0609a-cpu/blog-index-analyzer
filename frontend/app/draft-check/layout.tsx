import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: '발행 전 원고 진단 - 올리기 전에 상위노출 가능성 확인',
  description:
    '블로그 글을 올리기 전에 진단하세요. 목표 키워드 1페이지에 실제로 올라와 있는 글들의 글자수·이미지·소제목 평균과 내 원고를 비교해, 무엇이 얼마나 부족한지 숫자로 알려줍니다.',
  path: '/draft-check',
  keywords: [
    '블로그 글쓰기',
    '블로그 글자수',
    '블로그 상위노출 글쓰기',
    '블로그 원고 검사',
    '블로그 이미지 몇장',
    '블로그 키워드 밀도',
  ],
})

export default function DraftCheckLayout({ children }: { children: React.ReactNode }) {
  return children
}
