import { Suspense } from 'react'
import AnalyzeClient from './_AnalyzeClient'
import SeoContent, { type SeoBlock } from '@/components/seo/SeoContent'

/**
 * 서버 컴포넌트 껍데기.
 *
 * _AnalyzeClient 가 useSearchParams() 를 쓰기 때문에 Suspense 로 감싸지 않으면
 * 라우트 전체가 클라이언트 렌더링으로 이탈한다(bailout). 실제로 그 상태였고,
 * 크롤러에게는 app/loading.tsx 의 "불러오는 중..." 만 노출돼 본문이 0자였다.
 */

const blocks: SeoBlock[] = [
  {
    kind: 'p',
    text: '블로그 지수 조회는 내 블로그가 네이버 검색에서 어느 정도 위치에 있는지를 추정하는 작업입니다. 블랭크는 블로그 주소만으로 발행 이력, 주제 일관성, 문서 구성, 검색 노출 결과 등 42개 지표를 수집해 준최1부터 최적4까지 11단계 중 현재 위치를 추정합니다.',
  },
  {
    kind: 'p',
    text: '다만 이 등급은 네이버가 부여하는 공식 값이 아닙니다. 네이버 검색 공식 블로그는 2016년에 "최적화 블로그, 저품질 블로그, 블로그지수 등은 네이버에서 만든 개념이 아닙니다"라고 밝혔습니다. 시중의 모든 지수 서비스가 보여주는 등급은 각자의 추정치이며, 서비스마다 결과가 다른 것이 정상입니다.',
  },
  { kind: 'h2', text: '무엇을 분석하나' },
  {
    kind: 'table',
    headers: ['영역', '확인하는 것'],
    rows: [
      ['주제 일관성', '한 주제를 꾸준히 다뤘는지 — C-Rank 가 출처 신뢰를 쌓는 축'],
      ['문서 품질', '글의 구성, 구체성, 검색 의도 대응 수준'],
      ['활동성', '발행 주기와 최근 활동 (자체 휴리스틱)'],
      ['검색 노출', '실제 검색 결과에서 관측되는 위치'],
      ['성장 여력', '현재 상태에서 진입 가능한 키워드 범위'],
    ],
  },
]

const faq = [
  {
    question: '블로그 지수를 무료로 조회할 수 있나요?',
    answer:
      '네. 블로그 주소나 아이디만 입력하면 가입 없이 무료로 확인할 수 있습니다. 무료 플랜에서는 하루 2회까지 분석할 수 있습니다.',
  },
  {
    question: '분석에 무엇이 필요한가요?',
    answer:
      '네이버 블로그 주소(blog.naver.com/아이디) 또는 블로그 아이디만 있으면 됩니다. 네이버 계정 로그인이나 블로그 소유 인증은 필요하지 않으며, 다른 사람의 블로그도 분석할 수 있습니다.',
  },
  {
    question: '여기서 나오는 등급이 네이버 공식 값인가요?',
    answer:
      '아닙니다. 네이버는 블로그별 점수를 공개하지 않으며, 2016년 공식 블로그에서 "블로그지수"가 자사 개념이 아니라고 밝혔습니다. 블랭크의 11단계 레벨은 외부에서 관측 가능한 지표로 계산한 추정치입니다.',
  },
  {
    question: '분석에 얼마나 걸리나요?',
    answer:
      '블로그 규모에 따라 다르지만 보통 수십 초 안에 끝납니다. 발행 글이 많은 블로그는 더 걸릴 수 있습니다.',
  },
]

export default function AnalyzePage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-[#0064FF] animate-spin" />
          </div>
        }
      >
        <AnalyzeClient />
      </Suspense>

      <SeoContent
        h1="네이버 블로그 지수 조회"
        blocks={blocks}
        faq={faq}
        links={[
          { href: '/guides/naver-blog-index-truth', label: '네이버 "블로그 지수"는 실제로 존재하는가' },
          { href: '/guides/blog-level-11-scale', label: '블로그 레벨 11단계 — 무엇을 기준으로 나누는가' },
          { href: '/guides/naver-crank-dia', label: 'C-Rank와 D.I.A. — 네이버가 실제로 공식화한 것' },
        ]}
      />
    </>
  )
}
