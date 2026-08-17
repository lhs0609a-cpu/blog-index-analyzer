import { noindexMetadata } from '@/lib/seo'

/**
 * 색인 제외 구역. 로그인 뒤 화면·결제·개별 분석 결과는 검색 결과에 뜨면 안 된다.
 * (과거 /blue-ocean 이 색인되어 검색 결과에 "유료 기능입니다" 페이월만 노출된 적이 있다)
 */
export const metadata = noindexMetadata('광고 대시보드', '연동된 광고 계정의 성과 화면입니다.')

export default function AdDashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
