import apiClient from './client'

/**
 * 네이버 AI 브리핑(AI 답변) 인용 점검.
 *
 * ⚠️ `has_ai_answer === false` 는 **'인용 안 됨'이 아니라 'AI 답변이 없는 키워드'** 다.
 * 이 둘을 같은 말로 쓰면 거짓이 된다 — 서버도 두 값을 따로 돌려준다.
 */

export interface AiCitationSource {
  order: number | null
  title: string
  url: string
  platform: string
  is_naver_blog: boolean
  blog_id: string | null
  log_no: string | null
}

export interface AiCitationResult {
  ok: boolean
  keyword: string
  has_ai_answer: boolean
  sources: AiCitationSource[]
  source_count: number
  blog_source_count: number
  cited: boolean
  my_citations: AiCitationSource[]
  cached: boolean
  fetched_at: number
  note: string
}

export async function checkAiCitation(
  keyword: string,
  blogId?: string
): Promise<AiCitationResult> {
  const res = await apiClient.post(
    '/api/ai-citation',
    { keyword, blog_id: blogId ?? null },
    { timeout: 40000 }
  )
  return res.data
}
