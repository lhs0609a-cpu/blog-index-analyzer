import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: '블로그 무료 분석 - 네이버 블로그 지수 조회',
  description:
    '네이버 블로그 주소나 아이디만 입력하면 42개 지표로 현재 상태를 분석합니다. 11단계 레벨 추정, 주제 일관성, 문서 품질, 상위 노출 가능성을 가입 없이 무료로 확인하세요.',
  path: '/analyze',
  keywords: [
    '블로그 지수 조회',
    '블로그 지수 확인',
    '네이버 블로그 분석',
    '블로그 등급 확인',
    '블로그 최적화 단계',
    '무료 블로그 분석',
  ],
})

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
  return children
}
