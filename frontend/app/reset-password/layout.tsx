import { noindexMetadata } from '@/lib/seo'

/**
 * 반드시 색인에서 뺀다. 주소에 재설정 토큰이 실려 있어, 색인되면 그 토큰이
 * 검색 결과에 남는다(만료 전이라면 그대로 쓸 수 있는 열쇠다).
 */
export const metadata = noindexMetadata(
  '비밀번호 재설정',
  '블스피 새 비밀번호를 정하는 화면입니다.'
)

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
