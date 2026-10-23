'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bell, BellRing, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { track } from '@/lib/analytics/track'
import {
  addWatch,
  getWatchSummary,
  removeWatch,
  readWatchLimitError,
} from '@/lib/api/postWatch'

/**
 * 분석 결과 화면에 붙는 "새 글 감시" 스위치.
 *
 * 왜 여기인가 — /analyze 는 월 순방문 1,156명으로 최대 유입면이고, 이 제품이
 * 가진 유일한 반복 사용 이유(글을 쓸 때마다 필요한 것)를 그 자리에서 제안해야 한다.
 * 기존 순위 추적은 키워드를 사람이 등록해야 해서 운영 6개월간 등록이 0건이었다.
 * 그래서 이 버튼은 **블로그 ID 하나로 끝난다**.
 *
 * 비로그인은 막지 않고 로그인 후 자동 등록으로 넘긴다(?watch=<blogId>).
 */
export default function PostWatchToggle({ blogId }: { blogId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [watching, setWatching] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !blogId) {
      setWatching(null)
      return
    }
    let alive = true
    getWatchSummary()
      .then((s) => {
        if (alive) setWatching(s.blog_ids.includes(blogId))
      })
      .catch(() => {
        // 조회가 실패해도 버튼은 보여준다 — 누르면 서버가 다시 판단한다
        if (alive) setWatching(false)
      })
    return () => {
      alive = false
    }
  }, [isAuthenticated, blogId])

  /**
   * 가입/로그인하고 돌아온 사람을 대신 눌러준다.
   *
   * 이걸 안 하면 "감시 켜기 → 가입 → 돌아왔는데 아무 일도 안 일어남" 이 되고,
   * 가입 전환을 이 버튼에 걸어둔 의미가 사라진다. 한 번만 시도한다.
   */
  const [autoTried, setAutoTried] = useState(false)
  useEffect(() => {
    if (autoTried || !isAuthenticated || watching !== false) return
    if (searchParams.get('watch') !== blogId) return
    setAutoTried(true)
    addWatch(blogId)
      .then(() => {
        setWatching(true)
        track('post_watch_on', { props: { blog_id: blogId, placement: 'after_signup' } })
        toast.success('새 글 감시를 켰습니다')
      })
      .catch(() => {
        /* 한도 초과 등은 사용자가 직접 누를 때 안내한다 */
      })
  }, [autoTried, isAuthenticated, watching, searchParams, blogId])

  const onToggle = async () => {
    if (!blogId) return

    if (!isAuthenticated) {
      track('limit_cta_click', {
        reason: 'guest',
        props: { feature: 'post_watch', to: 'register', placement: 'analyze_watch' },
      })
      const next = `/analyze?blogId=${encodeURIComponent(blogId)}&watch=${encodeURIComponent(blogId)}`
      router.push(`/register?next=${encodeURIComponent(next)}`)
      return
    }

    setBusy(true)
    try {
      if (watching) {
        await removeWatch(blogId)
        setWatching(false)
        track('post_watch_off', { props: { blog_id: blogId, placement: 'analyze' } })
        toast.success('감시를 껐습니다')
        return
      }
      await addWatch(blogId)
      setWatching(true)
      track('post_watch_on', { props: { blog_id: blogId, placement: 'analyze' } })
      toast.success('새 글이 올라오면 검색에 나오는지 대신 확인합니다')
    } catch (error) {
      const limit = readWatchLimitError(error)
      if (limit) {
        // 한도는 '사라고' 말하기 전에 숫자를 먼저 보여준다
        toast.error(`${limit.message} (${limit.used}/${limit.limit})`)
        track('limit_hit', {
          reason: 'free',
          props: { feature: 'post_watch', limit: limit.limit, at: 'analyze_watch' },
        })
        router.push('/pricing')
        return
      }
      toast.error('감시를 켜지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setBusy(false)
    }
  }

  const on = watching === true

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {on ? (
              <BellRing className="w-5 h-5 text-[#0064FF]" strokeWidth={1.8} />
            ) : (
              <Bell className="w-5 h-5 text-gray-400" strokeWidth={1.8} />
            )}
            <h3 className="font-bold text-gray-900">새 글 감시</h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            글을 올리면 제목을 그대로 검색해 <strong>실제로 노출되는지</strong> 대신
            확인합니다. 게시 후 24시간·72시간에 한 번씩 봅니다.
          </p>
          {/* 못 찾은 것을 '누락'이라 부르지 않는 이유를 미리 말해 둔다 */}
          <p className="text-xs text-gray-400 mt-2">
            검색에서 확인되면 ‘노출 확인’으로, 못 찾으면 ‘지연’·‘확인 불가’로 남깁니다.
            못 찾은 것을 누락으로 단정하지 않습니다.
          </p>
        </div>

        <button
          onClick={onToggle}
          disabled={busy}
          className={`shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-60 ${
            on
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-[#0064FF] text-white hover:bg-[#0050CC]'
          }`}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : on ? (
            '감시 중'
          ) : (
            '감시 켜기'
          )}
        </button>
      </div>
    </div>
  )
}
