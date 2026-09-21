import { noindexMetadata } from '@/lib/seo'

export const metadata = noindexMetadata(
  '비밀번호 찾기',
  '블스피 비밀번호 재설정 링크를 요청하는 화면입니다.'
)

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
