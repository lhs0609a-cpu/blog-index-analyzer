import { BarChart3, Search, FileCheck2, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

export default function AnalysisEmptyState() {
  return <section className="analysis-empty" aria-label="분석 결과 안내"><div className="section-heading"><div><span className="eyebrow">A CLEARER PICTURE</span><h2>내 블로그, 이런 점을 확인해요.</h2></div><Link href="/guides" className="text-link">결과 읽는 법<ArrowUpRight size={15} /></Link></div><div className="analysis-empty-grid">{[
    { icon: Search, title: '검색에서 보이는 정도', text: '글이 검색에 등록되었는지, 통합검색에 노출되는지 확인합니다.', number: '01' },
    { icon: FileCheck2, title: '콘텐츠의 방향과 품질', text: '주제의 일관성과 글의 충실도를 바탕으로 개선할 부분을 살펴봅니다.', number: '02' },
    { icon: BarChart3, title: '다음 행동을 위한 기준', text: '신호별 결과를 비교해 내 블로그에서 먼저 점검할 부분을 찾습니다.', number: '03' },
  ].map(({ icon: Icon, title, text, number }) => <div key={number}><div className="tool-top"><Icon size={22} strokeWidth={1.6} /><span className="tiny-label">{number}</span></div><h3>{title}</h3><p>{text}</p></div>)}</div><p className="analysis-disclaimer">분석 등급은 네이버 공식 점수가 아닌 관측 신호 기반 추정치입니다. 실제 검색 결과와 함께 확인하세요.</p></section>
}
