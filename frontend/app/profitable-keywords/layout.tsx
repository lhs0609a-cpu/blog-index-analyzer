import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: '돈 되는 키워드 - 전환에 가까운 검색어 찾기',
  description:
    '검색량이 큰 키워드가 아니라 실제 문의로 이어지는 키워드를 찾습니다. 구매 여정 단계와 지역 조건을 반영해 우선순위를 정리해 드립니다.',
  path: '/profitable-keywords',
  keywords: ['돈되는 키워드', '수익 키워드', '전환 키워드', '구매 의도 키워드', '키워드 우선순위'],
})

export default function ProfitableKeywordsLayout({ children }: { children: React.ReactNode }) {
  return children
}
