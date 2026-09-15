import { GUIDES } from './content/guides'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, ORG_LEGAL_NAME, SITE_UPDATED } from './seo'

// Optional discovery summary. Search inclusion does not depend on this file.
export function llmsResponse() {
  const body = `# ${SITE_NAME} (BLSPI)

> ${SITE_DESCRIPTION}

- 공식 웹사이트: ${SITE_URL}
- 서비스 운영 사업자: ${ORG_LEGAL_NAME}
- 문서 갱신일: ${SITE_UPDATED}
- 언어: 한국어

## 서비스와 분석 기준

- [블스피 소개](${SITE_URL}/about): 서비스 범위, 운영자, 기존 계정과 문의 안내.
- [분석 기준과 데이터 출처](${SITE_URL}/methodology): 관측 데이터와 추정값의 구분, 검색 API와 실제 검색의 차이, 측정 한계와 정정 원칙.
- [요금제](${SITE_URL}/pricing): 현재 무료 이용 범위와 유료 기능.
- [전체 안내 문서](${SITE_URL}/llms-full.txt): 소개와 분석 기준의 텍스트 버전.

## 공개 도구

- [블로그 분석](${SITE_URL}/analyze): 공개 블로그 정보를 바탕으로 상태와 자체 지수를 분석.
- [키워드 검색](${SITE_URL}/keyword-search): 검색량과 경쟁 문서 확인.
- [키워드 판정](${SITE_URL}/keyword-check): 내 블로그와 상위 검색 문서 비교.
- [블로그 검색 노출 진단](${SITE_URL}/blog-check): 최근 글의 검색 결과 관측.
- [원고 진단](${SITE_URL}/draft-check): 발행 전 원고와 상위 문서 비교.
- [게시글 분석](${SITE_URL}/analyze-post): 개별 글 진단.
- [키워드별 분석 자료](${SITE_URL}/keyword): 측정 시점이 표시된 공개 분석.

## 결과 해석

블로그 지수와 등급은 블스피의 자체 추정치이며 네이버 내부 점수나 인증이 아닙니다.
검색 API의 상위 결과에서 게시글이 발견되지 않는 것만으로 실제 검색 누락을 확정할 수 없습니다.
검색 결과는 조회 시각·검색어·기기·수집 범위에 따라 달라질 수 있습니다.
새 글 자동 감시는 관리자 검증 단계이며 일반 사용자에게 제공되는 기능으로 안내하지 않습니다.
검색 순위·방문자 수·수익을 보장하지 않습니다.

## 가이드

${GUIDES.map(g => `- [${g.title}](${SITE_URL}/guides/${g.slug}): ${g.description}`).join('\n')}

## 계정과 정책

- [이용약관](${SITE_URL}/terms)
- [개인정보처리방침](${SITE_URL}/privacy)
- [환불정책](${SITE_URL}/refund-policy)

로그인 후 화면, 결제, 관리자, 개인 분석 결과는 공개 인용 자료가 아닙니다.
문의: lhs0609c@naver.com
`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } })
}
