import AnalyzePostClient from './_AnalyzePostClient'
import SeoContent, { type SeoBlock } from '@/components/seo/SeoContent'

/** 서버 HTML 본문이 뼈대뿐이던 페이지 — 크롤러가 읽을 정적 본문을 붙인다. */

const blocks: SeoBlock[] = [
  { kind: 'h2', text: '포스트 단위 진단이란' },
  {
    kind: 'p',
    text: '블로그 전체가 아니라 글 하나를 놓고, 그 글이 노리는 검색어의 상위 문서들과 무엇이 다른지 비교하는 진단입니다. 블로그 등급은 주제 단위로 천천히 움직이지만, 개별 글의 노출은 그 글 자체의 완성도로 바로 갈립니다.',
  },
  { kind: 'h2', text: '무엇을 비교하나' },
  {
    kind: 'table',
    headers: ['항목', '확인하는 것'],
    rows: [
      ['검색 의도 대응', '그 검색어로 온 사람이 알고 싶던 것에 답했는가'],
      ['문서 구성', '소제목 구조, 정보의 배치 순서'],
      ['구체성', '조건·수치·상황이 있는가, 일반론으로 끝나는가'],
      ['주제 적합', '내 블로그가 다뤄 온 주제 안에 있는가'],
      ['상위 문서 대비', '1페이지 문서들이 다루고 내 글이 빠뜨린 내용'],
    ],
  },
  { kind: 'h2', text: '확실한 것과 통념을 구분하기' },
  {
    kind: 'p',
    text: '네이버가 공식적으로 설명한 랭킹 개념은 C-Rank(출처 신뢰도)와 D.I.A.(문서의 경험·유용성) 두 가지입니다. 반면 "글자 수 1500자 이상", "이미지 10장 이상", "키워드를 본문에 몇 번 반복" 같은 수치 기준은 네이버가 공식화한 적이 없는 업계 통념입니다.',
  },
  {
    kind: 'p',
    text: '이 수치들을 채우는 것이 목적이 되면 정작 중요한 답변의 질을 놓치게 됩니다. 진단도 그 기준으로 하지 않습니다.',
  },
]

const faq = [
  {
    question: '글 하나만 고쳐도 순위가 오르나요?',
    answer:
      '경쟁이 심하지 않은 키워드라면 문서 자체의 개선만으로 순위가 움직이는 경우가 있습니다. 다만 그 주제에서 출처 신뢰(C-Rank)가 아직 없는 신생 블로그라면, 글을 잘 써도 초반에는 밀립니다. 문서 개선과 주제 축적은 대체 관계가 아닙니다.',
  },
  {
    question: '오래된 글을 수정하면 도움이 되나요?',
    answer:
      'D.I.A.가 평가하는 최신성은 문서 내용의 최신성이므로, 낡은 정보를 실제로 갱신하는 수정은 의미가 있습니다. 반면 내용은 그대로 두고 날짜만 바꾸거나 문장을 조금 손보는 식의 수정은 근거가 없습니다.',
  },
  {
    question: 'AI로 쓴 글은 불이익을 받나요?',
    answer:
      '네이버가 안내한 검색 스팸 기준에 따르면 AI 활용 여부만으로 판단하지 않습니다. 문제가 되는 것은 도구가 아니라 결과물입니다. 실제 명칭 대신 검색량이 많은 다른 키워드로 바꿔 쓰는 것처럼, 검색어를 노린 위장 표기는 명시적인 제재 대상입니다.',
  },
]

export default function AnalyzePostPage() {
  return (
    <>
      <AnalyzePostClient />
      <SeoContent
        blocks={blocks}
        faq={faq}
        links={[
          { href: '/guides/blog-post-optimization-checklist', label: '블로그 글 상위 노출 체크리스트' },
          { href: '/guides/naver-crank-dia', label: 'C-Rank와 D.I.A. — 네이버가 실제로 공식화한 것' },
          { href: '/analyze', label: '블로그 전체 분석하기' },
        ]}
      />
    </>
  )
}
