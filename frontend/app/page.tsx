import type { Metadata } from 'next'
import HomeClient from './_home/HomeClient'
import { homeFaq } from '@/lib/home-faq'
import { faqJsonLd, jsonLdScript, SITE_URL } from '@/lib/seo'

/**
 * 홈은 클라이언트 컴포넌트(_home/HomeClient)라 메타데이터를 직접 내보낼 수 없어
 * 이 서버 컴포넌트가 감싼다. canonical 을 페이지마다 명시하기 위한 구조 —
 * 루트 layout 에 canonical 을 두면 전 하위 페이지가 홈으로 정본 지정되어 색인에서 빠진다.
 */
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
}



export default function Page() {
  return (
    <>
      <script {...jsonLdScript(faqJsonLd(homeFaq))} />
      <HomeClient />
    </>
  )
}
