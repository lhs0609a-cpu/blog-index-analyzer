import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: '네이버 광고 최적화 - 키워드·입찰·예산 진단',
  description:
    '네이버 검색광고 계정을 진단해 낭비되는 광고비를 찾습니다. 무관 키워드, 자기 경쟁, 과지불 입찰, 예산 병목을 키워드 단위로 점검합니다.',
  path: '/ad-optimizer',
  keywords: ['네이버 광고 최적화', '검색광고 관리', 'CPC 절감', '광고비 절감', '키워드 광고 진단'],
})

export default function AdOptimizerLayout({ children }: { children: React.ReactNode }) {
  return children
}
