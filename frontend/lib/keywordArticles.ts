// 자동 생성 목록 — 키워드별 가이드 글 (content/keyword-articles/*.json). 새 글은 이 목록에 추가한다.
export interface KeywordArticle {
  slug: string
  keyword: string
  title: string
  intro: string
  sections: { heading: string; body: string[] }[]
  faq: { q: string; a: string }[]
  data_note: string
}

import a0 from '@/content/keyword-articles/네이버블로그만들기.json'
import a1 from '@/content/keyword-articles/블로그마케팅.json'
import a2 from '@/content/keyword-articles/블로그만들기.json'
import a3 from '@/content/keyword-articles/블로그방문자.json'
import a4 from '@/content/keyword-articles/블로그수익.json'
import a5 from '@/content/keyword-articles/블로그애드포스트.json'
import a6 from '@/content/keyword-articles/블로그지수.json'
import a7 from '@/content/keyword-articles/블로그체험단사이트.json'
import a8 from '@/content/keyword-articles/블로그체험단신청.json'
import a9 from '@/content/keyword-articles/블로그협찬.json'
import a10 from '@/content/keyword-articles/애드포스트수익.json'
import a11 from '@/content/keyword-articles/체험단모집.json'

const ARTICLES: Record<string, KeywordArticle> = {
  "네이버블로그만들기": a0 as KeywordArticle,
  "블로그마케팅": a1 as KeywordArticle,
  "블로그만들기": a2 as KeywordArticle,
  "블로그방문자": a3 as KeywordArticle,
  "블로그수익": a4 as KeywordArticle,
  "블로그애드포스트": a5 as KeywordArticle,
  "블로그지수": a6 as KeywordArticle,
  "블로그체험단사이트": a7 as KeywordArticle,
  "블로그체험단신청": a8 as KeywordArticle,
  "블로그협찬": a9 as KeywordArticle,
  "애드포스트수익": a10 as KeywordArticle,
  "체험단모집": a11 as KeywordArticle,
}

export function getKeywordArticle(keyword: string): KeywordArticle | null {
  return ARTICLES[keyword] ?? null
}
