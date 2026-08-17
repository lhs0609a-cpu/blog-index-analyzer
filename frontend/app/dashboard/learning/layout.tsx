import { noindexMetadata } from '@/lib/seo'

/** 로그인 뒤 화면 — 색인 제외 (과거 sitemap 에 priority 0.9 로 올라가 있었다) */
export const metadata = noindexMetadata(
  'AI 키워드 학습',
  '상위 노출 문서의 패턴을 학습하는 내부 분석 화면입니다.'
)

export default function LearningLayout({ children }: { children: React.ReactNode }) {
  return children
}
