import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: '블루오션 키워드 - 경쟁 낮은 키워드 발굴',
  description:
    '검색 수요는 있으면서 상위 문서를 넘어설 수 있는 키워드를 찾습니다. 검색량 단독이 아니라 상위 문서의 실제 강도와 내 블로그의 주제 신뢰도를 함께 계산합니다.',
  path: '/blue-ocean',
  keywords: ['블루오션 키워드', '틈새 키워드', '경쟁 낮은 키워드', '롱테일 키워드', '키워드 발굴'],
})

export default function BlueOceanLayout({ children }: { children: React.ReactNode }) {
  return children
}
