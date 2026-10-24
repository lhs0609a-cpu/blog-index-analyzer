import PostWatchClient from './_PostWatchClient'

export const metadata = {
  title: '새 글 감시 | 블스피',
  description:
    '블로그에 새 글이 올라오면 제목을 그대로 검색해 실제로 노출되는지 대신 확인합니다.',
}

export default function PostWatchPage() {
  return <PostWatchClient />
}
