'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Download, ExternalLink, Layers, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import {
  addWatch,
  addWatchesBulk,
  downloadWatchCsv,
  getMyWatches,
  isExportNotInPlan,
  removeWatch,
  readWatchLimitError,
  STATUS_TONE,
  type WatchList,
  type WatchedPost,
} from '@/lib/api/postWatch'

/**
 * 감시 현황.
 *
 * 이 화면이 보여주는 건 점수가 아니라 **관측 기록**이다 — 어떤 글을 언제 확인했고
 * 검색에서 찾았는지. 그래서 '누락' 같은 단정적인 단어를 쓰지 않는다(서버도
 * asserts_missing: false 로 못을 박는다).
 */

function timeAgo(iso: string | null): string {
  if (!iso) return '-'
  const t = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z').getTime()
  if (Number.isNaN(t)) return '-'
  const diff = Date.now() - t
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return '방금'
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function PostRow({ post }: { post: WatchedPost }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <span
        className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-md border text-xs font-bold ${
          STATUS_TONE[post.status]
        }`}
      >
        {post.status_label}
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-900 hover:text-[#0064FF] font-medium line-clamp-2 inline-flex items-start gap-1"
        >
          {post.title}
          <ExternalLink className="w-3 h-3 mt-1 shrink-0 opacity-50" />
        </a>
        <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3">
          <span>게시 {timeAgo(post.published_at)}</span>
          {post.last_checked_at && <span>확인 {timeAgo(post.last_checked_at)}</span>}
          {post.checks_done ? <span>{post.checks_done}회 확인</span> : null}
          {post.status === 'indexed' && post.first_rank ? (
            <span className="text-emerald-600">검색결과 {post.first_rank}번째에서 확인</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function PostWatchClient() {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)

  const [data, setData] = useState<WatchList | null>(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await getMyWatches())
    } catch {
      toast.error('감시 목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?next=/dashboard/post-watch')
      return
    }
    load()
  }, [isAuthenticated, load, router])

  const onAdd = async (blogId: string) => {
    const bid = blogId.trim()
    if (!bid) return
    setBusy(true)
    try {
      await addWatch(bid)
      setInput('')
      toast.success('감시를 켰습니다')
      await load()
    } catch (error) {
      const limit = readWatchLimitError(error)
      if (limit) {
        toast.error(`${limit.message} (${limit.used}/${limit.limit})`)
        return
      }
      toast.error('등록하지 못했습니다. 블로그 주소나 아이디를 확인해주세요.')
    } finally {
      setBusy(false)
    }
  }

  /** 줄바꿈·쉼표로 붙여넣은 목록을 그대로 받는다 — 대행사는 스프레드시트에서 복사해 온다. */
  const onBulk = async () => {
    const ids = bulkText
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
    if (ids.length === 0) return
    setBusy(true)
    try {
      const r = await addWatchesBulk(ids)
      // 무엇이 빠졌는지 반드시 말한다. 조용히 앞의 몇 개만 등록되면 운영이 틀어진다.
      const over = r.skipped.filter((x) => x.reason === 'limit_exceeded').length
      const dup = r.skipped.filter((x) => x.reason === 'already_watching').length
      const parts = [`${r.added.length}개 등록`]
      if (dup) parts.push(`${dup}개는 이미 감시 중`)
      if (over) parts.push(`${over}개는 한도 초과`)
      if (r.invalid.length) parts.push(`${r.invalid.length}개는 주소 인식 실패`)
      toast.success(parts.join(' · '))
      setBulkText('')
      await load()
    } catch {
      toast.error('일괄 등록에 실패했습니다')
    } finally {
      setBusy(false)
    }
  }

  const onExport = async () => {
    setBusy(true)
    try {
      await downloadWatchCsv()
    } catch (error) {
      if (isExportNotInPlan(error)) {
        toast.error('내보내기는 프로 플랜부터 사용할 수 있습니다')
        router.push('/pricing')
        return
      }
      toast.error('내보내지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async (blogId: string) => {
    setBusy(true)
    try {
      await removeWatch(blogId)
      await load()
    } catch {
      toast.error('해제하지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#0064FF]" />
      </div>
    )
  }

  const full = data ? data.limit !== -1 && data.used >= data.limit : false

  return (
    <div className="min-h-screen bg-[#FAFAFA] py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="w-6 h-6 text-[#0064FF]" strokeWidth={1.8} />
          <h1 className="text-2xl font-bold text-gray-900">새 글 감시</h1>
        </div>
        <p className="text-gray-600 mb-1">
          새 글이 올라오면 제목을 그대로 검색해 실제로 노출되는지 대신 확인합니다.
        </p>
        <p className="text-xs text-gray-400 mb-8">
          확인 시점: 게시 후{' '}
          {(data?.checkpoints_hours ?? [24, 72]).map((h) => `${h}시간`).join(' · ')}.
          검색에서 찾으면 ‘노출 확인’, 못 찾으면 ‘지연’·‘확인 불가’로 남깁니다 — 못 찾은
          것을 누락으로 단정하지 않습니다.
        </p>

        {/* 등록 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">감시 블로그</h2>
            <span className="text-sm text-gray-500">
              {data?.used ?? 0}
              {data?.limit === -1 ? '' : ` / ${data?.limit ?? 1}`}
            </span>
          </div>

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAdd(input)
              }}
              placeholder="블로그 아이디 또는 blog.naver.com/아이디"
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#0064FF]"
            />
            <button
              onClick={() => onAdd(input)}
              disabled={busy || !input.trim()}
              className="px-4 py-2.5 rounded-xl bg-[#0064FF] text-white font-bold text-sm hover:bg-[#0050CC] disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              추가
            </button>
          </div>

          {/* 내 블로그가 프로필에 있으면 한 번에 등록 */}
          {user?.blog_id && !data?.blogs.some((b) => b.blog_id === user.blog_id) && (
            <button
              onClick={() => onAdd(user.blog_id as string)}
              disabled={busy}
              className="mt-3 text-sm text-[#0064FF] hover:underline"
            >
              내 블로그({user.blog_id}) 바로 등록
            </button>
          )}

          {/* 블로그를 여러 개 다루는 사람용. 한도가 1개인 플랜에는 의미가 없어 숨긴다. */}
          {data && data.limit !== 1 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setBulkOpen((v) => !v)}
                  className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1.5"
                >
                  <Layers className="w-4 h-4" />
                  여러 개 붙여넣기
                </button>
                <button
                  onClick={onExport}
                  disabled={busy}
                  className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  CSV 내보내기
                </button>
              </div>

              {bulkOpen && (
                <div className="mt-3">
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    rows={4}
                    placeholder={[
                      '블로그 아이디를 줄바꿈이나 쉼표로 구분해 붙여넣으세요',
                      'naver_id_1',
                      'blog.naver.com/naver_id_2',
                    ].join('\n')}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:border-[#0064FF]"
                  />
                  <button
                    onClick={onBulk}
                    disabled={busy || !bulkText.trim()}
                    className="mt-2 px-4 py-2 rounded-xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    한 번에 등록
                  </button>
                </div>
              )}
            </div>
          )}

          {full && (
            <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              현재 플랜의 감시 한도를 다 쓰셨습니다.{' '}
              <Link href="/pricing" className="font-bold underline">
                요금제 보기
              </Link>
            </p>
          )}
        </div>

        {/* 블로그별 글 상태 */}
        {(data?.blogs.length ?? 0) === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
            <p className="text-gray-500 mb-3">아직 감시하는 블로그가 없습니다.</p>
            <Link href="/analyze" className="text-[#0064FF] font-bold hover:underline">
              블로그 분석부터 해보기
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {data!.blogs.map((blog) => (
              <div
                key={blog.blog_id}
                className="bg-white rounded-2xl border border-gray-200 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{blog.blog_id}</h3>
                    <p className="text-xs text-gray-400">
                      RSS 확인 {timeAgo(blog.last_rss_at)}
                      {blog.rss_state !== 'ok' && (
                        <span className="ml-2 text-amber-600">
                          {blog.rss_state === 'disabled'
                            ? 'RSS가 꺼져 있어 새 글을 못 읽습니다'
                            : 'RSS 읽기에 실패하고 있습니다'}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={load}
                      disabled={busy}
                      title="새로고침"
                      className="p-2 text-gray-400 hover:text-gray-700"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onRemove(blog.blog_id)}
                      disabled={busy}
                      title="감시 해제"
                      className="p-2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {blog.posts.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">
                    감시 시작 이후 올라온 새 글이 아직 없습니다. 글을 올리면 자동으로 잡습니다.
                  </p>
                ) : (
                  <div>
                    {blog.posts.map((p) => (
                      <PostRow key={p.id} post={p} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
