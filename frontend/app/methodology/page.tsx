import InformationPage from '@/components/InformationPage'
import { pageMetadata } from '@/lib/seo'
import { methodologySections, methodologySources } from '@/lib/site-information'

const description = '블스피의 블로그 분석 데이터 출처, 자체 추정 지표와 검색 API의 한계, 새 글 감시 검증 결과와 정정 원칙을 설명합니다.'
export const metadata = pageMetadata({ title: '블로그 분석 기준과 데이터 출처', description, path: '/methodology' })
export default function MethodologyPage() {
  return <InformationPage title="분석 기준과 데이터 출처" summary={description} path="/methodology" type="WebPage" sections={methodologySections} sources={methodologySources} />
}
