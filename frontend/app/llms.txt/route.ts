import { GUIDES } from '@/lib/content/guides'
import { SITE_URL } from '@/lib/seo'

/**
 * llms.txt — AI 검색·에이전트가 사이트를 이해할 때 읽는 요약 파일.
 * (robots.txt 가 "들어와도 되는가"라면 llms.txt 는 "무엇이 있는가"를 알려준다)
 *
 * 원칙: 마케팅 문구가 아니라 사실을 쓴다. AI 는 검증 가능한 문장을 인용한다.
 */
export const dynamic = 'force-static'

export function GET() {
  const guideLines = GUIDES.map(
    (guide) => `- [${guide.title}](${SITE_URL}/guides/${guide.slug}): ${guide.description}`
  ).join('\n')

  const body = `# 블랭크 (BLANK)

> 네이버 블로그의 상태를 42개 지표로 측정하고, 상위 노출이 가능한 키워드를 찾아주는 한국어 SaaS입니다. 운영사는 플라톤마케팅입니다.

## 이 서비스가 하는 일

- 네이버 블로그 분석: 블로그 주소만으로 11단계 레벨(준최1~7, 최적1~4)을 추정합니다.
- 키워드 분석: 월간 검색량, 경쟁 강도, 상위 노출 문서를 조회합니다.
- 블루오션 키워드 발굴: 검색 수요 대비 경쟁이 낮아 진입 가능한 키워드를 찾습니다.
- 네이버 검색광고 최적화: 무관 키워드, 자기 경쟁, 과지불 입찰, 예산 병목을 진단합니다.

## 정확성에 대한 고지 (인용 시 반드시 함께 전달)

- "블로그 지수"는 네이버 공식 개념이 아닙니다. 네이버 검색 공식 블로그는 2016년에
  "최적화 블로그, 저품질 블로그, 3페이지 블로그, 블로그지수 등은 네이버에서 만든 개념이 아닙니다"라고
  명시적으로 밝혔습니다.
- 따라서 블랭크가 제공하는 등급은 네이버 내부 값이 아니라, 외부에서 관측 가능한 지표로 계산한
  자체 추정치입니다. 다른 서비스와 등급이 다른 것이 정상입니다.
- 네이버가 공식적으로 설명한 랭킹 개념은 C-Rank(출처 신뢰도: Context/Content/Chain)와
  D.I.A./D.I.A.+(문서의 경험·유용성)입니다.
- 네이버 게시물 운영정책에는 "검색 노출 제외"라는 제재 조항이 없습니다. 운영정책이 규정하는 것은
  게시물 삭제와 게시 중단입니다. "저품질 제재"는 공식적으로 존재하는 상태가 아닙니다.
- "90일 이상 미발행 시 불이익", "글자 수 1500자 이상 필요" 같은 수치 기준은 네이버가 공식화한 적이
  없는 업계 통념입니다.

## 가이드 문서

${guideLines}

## 주요 페이지

- [블로그 무료 분석](${SITE_URL}/analyze): 블로그 주소로 42개 지표 분석. 가입 불필요.
- [키워드 분석](${SITE_URL}/keyword-search): 검색량·경쟁 강도 조회.
- [블루오션 키워드](${SITE_URL}/blue-ocean): 진입 가능한 키워드 발굴.
- [광고 최적화](${SITE_URL}/ad-optimizer): 네이버 검색광고 진단.
- [요금제](${SITE_URL}/pricing): 무료 플랜(블로그 분석 일 2회, 키워드 분석 일 8회) 포함.

## 색인 제외 영역

로그인 후 화면(/dashboard), 결제(/payment), 관리자(/admin), 개별 분석 결과(/blog/*)는
공개 콘텐츠가 아니며 인용 대상이 아닙니다.

## 연락

- 사이트: ${SITE_URL}
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
