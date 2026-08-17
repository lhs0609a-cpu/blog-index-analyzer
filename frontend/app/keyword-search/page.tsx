import { Suspense } from 'react'
import KeywordSearchClient from './_KeywordSearchClient'
import SeoContent, { type SeoBlock } from '@/components/seo/SeoContent'

/**
 * 서버 컴포넌트 껍데기 — /analyze 와 같은 이유.
 * _KeywordSearchClient 가 useSearchParams() 를 쓰므로 Suspense 가 없으면
 * 라우트 전체가 클라이언트 렌더링으로 이탈해 크롤러에게 본문이 0자가 된다.
 */

const blocks: SeoBlock[] = [
  {
    kind: 'p',
    text: '키워드를 입력하면 네이버 검색광고 기준 월간 검색수, 경쟁 강도, 그리고 그 키워드로 상위에 노출되고 있는 문서를 함께 확인할 수 있습니다. 무료 플랜에서 하루 8회까지 조회할 수 있습니다.',
  },
  {
    kind: 'p',
    text: '블랭크는 광고 경쟁도와 검색 노출 난이도를 분리해서 보여줍니다. 이 둘은 자주 혼동되지만 전혀 다른 값입니다. 광고 경쟁이 치열하지만 블로그 상위 노출은 쉬운 키워드가 실제로 존재하고, 그 반대도 존재합니다.',
  },
  { kind: 'h2', text: '키워드를 고르는 세 가지 기준' },
  {
    kind: 'table',
    headers: ['기준', '확인할 것'],
    rows: [
      ['수요', '월간 검색량과 검색어 길이 — "< 10" 표시는 별도로 분류한다'],
      ['경쟁', '1페이지 문서들의 출처 강도와 완성도 — 광고 입찰가와 혼동하지 않는다'],
      ['적합', '내 블로그가 그 주제를 다뤄 왔는가 — 주제 밖 키워드는 잘 뚫리지 않는다'],
    ],
  },
  {
    kind: 'p',
    text: '검색량이 큰 키워드부터 고르는 것이 가장 흔한 실패입니다. 검색량 1만짜리에서 20위인 글은 사실상 유입이 없고, 검색량 300짜리에서 2위인 글이 훨씬 많은 방문을 만듭니다.',
  },
]

const faq = [
  {
    question: '키워드 검색량은 어디 기준인가요?',
    answer:
      '네이버 검색광고에서 제공하는 월간 검색수를 기준으로 합니다. PC와 모바일이 분리되어 제공되며, 블랭크는 두 값을 함께 보여줍니다.',
  },
  {
    question: '검색량이 10으로 표시되는 키워드는 어떻게 봐야 하나요?',
    answer:
      '주의가 필요합니다. 월 검색량이 10 미만인 키워드는 조회 도구에서 "< 10" 형태로 묶여 나오는 경우가 있어, 이것을 숫자 10으로 읽으면 수요가 거의 없는 키워드를 유효한 것으로 착각하게 됩니다. 실제 데이터에서 이런 키워드가 대량으로 섞여 나오는 경우가 흔합니다.',
  },
  {
    question: '경쟁 정도가 낮으면 상위 노출이 쉬운 건가요?',
    answer:
      '아닙니다. 키워드 도구가 보여주는 경쟁 정도는 네이버 검색광고 기준, 즉 광고를 걸려는 광고주가 얼마나 많은지를 뜻합니다. 블로그 글이 상위에 오르기 얼마나 어려운지와는 다른 값입니다. 실제 노출 난이도는 그 키워드의 검색 결과 1페이지 문서들을 봐야 알 수 있습니다.',
  },
  {
    question: '연관검색어가 없어졌는데 키워드는 어떻게 확장하나요?',
    answer:
      '2026년 4월 30일 연관검색어가 종료되어, 지금은 자동완성이 1차 확장 경로입니다. 검색어 뒤에 초성이나 글자를 하나씩 붙여 자동완성을 여러 번 호출하면 한 번 호출할 때보다 훨씬 넓은 후보를 얻을 수 있습니다.',
  },
]

export default function KeywordSearchPage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-[#0064FF] animate-spin" />
          </div>
        }
      >
        <KeywordSearchClient />
      </Suspense>

      <SeoContent
        h1="네이버 키워드 검색량 조회"
        blocks={blocks}
        faq={faq}
        links={[
          { href: '/guides/find-blue-ocean-keywords', label: '블루오션 키워드 찾는 법 — 검색량보다 먼저 볼 것' },
          { href: '/guides/search-intent-journey', label: '검색 의도 5단계 — 팔리는 키워드는 따로 있다' },
          { href: '/guides/naver-search-2026-changes', label: '2026년 네이버 검색의 변화와 블로그 유입' },
        ]}
      />
    </>
  )
}
