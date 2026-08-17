import type { Metadata } from 'next'
import HomeClient from './_home/HomeClient'
import { faqJsonLd, jsonLdScript, SITE_URL } from '@/lib/seo'

/**
 * 홈은 클라이언트 컴포넌트(_home/HomeClient)라 메타데이터를 직접 내보낼 수 없어
 * 이 서버 컴포넌트가 감싼다. canonical 을 페이지마다 명시하기 위한 구조 —
 * 루트 layout 에 canonical 을 두면 전 하위 페이지가 홈으로 정본 지정되어 색인에서 빠진다.
 */
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
}

const homeFaq = [
  {
    question: '네이버 블로그 지수를 무료로 확인할 수 있나요?',
    answer:
      '블랭크에서 블로그 주소나 아이디만 입력하면 가입 없이 무료로 확인할 수 있습니다. 42개 지표를 종합해 11단계(준최1~7, 최적1~4) 중 현재 위치를 추정해 보여줍니다. 다만 이 등급은 네이버가 공개하는 공식 값이 아니라, 외부에서 관측 가능한 지표로 계산한 추정치입니다.',
  },
  {
    question: '블로그 지수는 네이버 공식 개념인가요?',
    answer:
      '아닙니다. 네이버 검색 공식 블로그는 2016년에 "최적화 블로그, 저품질 블로그, 블로그지수 등은 네이버에서 만든 개념이 아닙니다"라고 명시적으로 밝혔습니다. 네이버가 공식적으로 설명한 랭킹 개념은 C-Rank(출처 신뢰도)와 D.I.A.(문서 유용성)입니다.',
  },
  {
    question: '블루오션 키워드는 어떤 기준으로 찾나요?',
    answer:
      '검색량만 보는 것이 아니라 검색 수요, 상위 문서의 실제 경쟁 강도, 내 블로그의 해당 주제 신뢰도 세 가지를 함께 봅니다. 검색량이 큰 키워드는 이미 강한 출처가 자리를 잡고 있어 같은 노력 대비 노출이 오히려 적은 경우가 많습니다.',
  },
  {
    question: '블랭크는 무료로 쓸 수 있나요?',
    answer:
      '무료 플랜으로 블로그 분석 일 2회, 키워드 분석 일 8회를 이용할 수 있습니다. 블루오션 키워드 발굴과 1위 가능 키워드 등 일부 기능은 유료 플랜에서 제공됩니다.',
  },
]

export default function Page() {
  return (
    <>
      <script {...jsonLdScript(faqJsonLd(homeFaq))} />
      <HomeClient />
    </>
  )
}
