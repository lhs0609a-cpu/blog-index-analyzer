import { noindexMetadata } from '@/lib/seo'

/** 로그인·계정 연동이 필요한 도구 화면 — 색인 제외 */
export const metadata = noindexMetadata('creative-fatigue')

export default function AdOptimizerCreativeFatigueLayout({ children }: { children: React.ReactNode }) {
  return children
}
