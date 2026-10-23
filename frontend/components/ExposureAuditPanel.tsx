'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, ScanSearch } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getAudit,
  getLatestAudit,
  readAuditError,
  startAudit,
  type AuditJob,
} from '@/lib/api/postWatch'

/**
 * 전수 노출 감사 패널.
 *
 * 경쟁 도구 10곳은 전부 점수(지수 0~100, 준최/최적)를 준다. 이 화면은 점수를
 * 주지 않는다 — **제목 N개를 실제로 검색한 결과**를 준다. 그래서 숫자 옆에
 * 항상 글 목록이 붙는다. 목록 없는 집계는 "87개 안 보임"이라는 공포만 남기고
 * 사용자가 할 수 있는 일을 주지 않는다.
 *
 * 문구 규칙: '안 보임'과 '측정 실패'를 합치지 않는다. 합치면 우리가 주장하지
 * 않는 '누락 판정'이 된다.
 */

const POLL_MS = 3000

export default function ExposureAuditPanel({ blogCount }: { blogCount: number }) {
  const [job, setJob] = useState<AuditJob | null>(null)
  const [starting, setStarting] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const poll = useCallback(
    async (jobId: number) => {
      try {
        const next = await getAudit(jobId)
        setJob(next)
        if (next.status === 'queued' || next.status === 'running') {
          timer.current = setTimeout(() => poll(jobId), POLL_MS)
        }
      } catch {
        stopPolling()
      }
    },
    [stopPolling]
  )

  useEffect(() => {
    let alive = true
    getLatestAudit()
      .then((j) => {
        if (!alive) return
        setJob(j)
        if (j.job_id && (j.status === 'queued' || j.status === 'running')) {
          poll(j.job_id)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
      stopPolling()
    }
  }, [poll, stopPolling])

  const onStart = async () => {
    setStarting(true)
    try {
      const { job_id, blog_ids, posts_per_blog } = await startAudit()
      toast.success(`블로그 ${blog_ids.length}개 × 최근 ${posts_per_blog}글을 검색합니다`)
      setJob({ status: 'queued', job_id, blog_ids })
      poll(job_id)
    } catch (error) {
      toast.error(readAuditError(error) ?? '감사를 시작하지 못했습니다')
    } finally {
      setStarting(false)
    }
  }

  const running = job?.status === 'queued' || job?.status === 'running'
  const result = job?.status === 'done' ? job.result : null
  const t = result?.totals

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <ScanSearch className="w-5 h-5 text-[#0064FF]" strokeWidth={1.8} />
            <h2 className="font-bold text-gray-900">전수 노출 감사</h2>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            감시 중인 블로그의 최근 글 <strong>제목을 하나씩 그대로 검색해</strong> 몇 개가
            검색 결과에 없는지 셉니다. 점수가 아니라 관측입니다.
          </p>
        </div>
        <button
          onClick={onStart}
          disabled={starting || running || blogCount === 0}
          className="shrink-0 px-4 py-2.5 rounded-xl bg-[#0064FF] text-white font-bold text-sm hover:bg-[#0050CC] disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {starting || running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            '전부 검색해보기'
          )}
        </button>
      </div>

      {/* 진행 */}
      {running && (
        <div>
          <div className="flex items-baseline justify-between text-sm mb-1.5">
            <span className="text-gray-700">
              {job?.total
                ? `${job.checked ?? 0} / ${job.total}글 확인`
                : '글 목록을 모으는 중'}
            </span>
            <span className="text-gray-400 text-xs">
              글 하나에 1초씩 — 창을 닫아도 계속 돕니다
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-[#0064FF] transition-all"
              style={{
                width: job?.total
                  ? `${Math.min(100, ((job.checked ?? 0) / job.total) * 100)}%`
                  : '8%',
              }}
            />
          </div>
        </div>
      )}

      {job?.status === 'failed' && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          감사가 중단됐습니다. {job.error}
        </p>
      )}

      {/* 결과 */}
      {result && t && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-gray-50 px-3 py-2.5">
              <div className="text-xs text-gray-500 mb-0.5">검색한 글</div>
              <div className="text-xl font-bold text-gray-900">{t.checked}</div>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
              <div className="text-xs text-emerald-700 mb-0.5">노출 확인</div>
              <div className="text-xl font-bold text-emerald-800">{t.indexed}</div>
            </div>
            <div className="rounded-xl bg-orange-50 px-3 py-2.5">
              <div className="text-xs text-orange-800 mb-0.5">검색결과에 없음</div>
              <div className="text-xl font-bold text-orange-900">{t.absent}</div>
            </div>
          </div>

          {t.unmeasurable > 0 && (
            <p className="text-xs text-gray-500 mb-3">
              측정 실패 {t.unmeasurable}건은 위 숫자에 넣지 않았습니다 — 검색 페이지를
              제대로 못 본 경우이고, 안 보인다는 뜻이 아닙니다.
            </p>
          )}

          {result.stopped_reason === 'daily_budget' && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
              오늘 검색 예산을 거의 다 써서 중간에 멈췄습니다. 남은 글은 내일 이어서
              확인할 수 있습니다.
            </p>
          )}

          {/* 블로그별 */}
          <div className="space-y-3">
            {result.blogs
              .slice()
              .sort((a, b) => b.absent - a.absent)
              .map((b) => (
                <div key={b.blog_id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="font-bold text-gray-900 truncate">{b.blog_id}</span>
                    <span className="text-sm shrink-0">
                      {b.checked === 0 ? (
                        <span className="text-gray-400">글 없음</span>
                      ) : (
                        <>
                          <span className="text-orange-700 font-bold">{b.absent}</span>
                          <span className="text-gray-400"> / {b.checked}글 안 보임</span>
                        </>
                      )}
                    </span>
                  </div>

                  {b.absent_posts.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {b.absent_posts.slice(0, 10).map((p, i) => (
                        <a
                          key={i}
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-1.5 text-sm text-gray-700 hover:text-[#0064FF]"
                        >
                          <span className="text-orange-400 mt-0.5">·</span>
                          <span className="line-clamp-1 flex-1">{p.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 mt-1 opacity-40" />
                        </a>
                      ))}
                      {b.absent_posts.length > 10 && (
                        <p className="text-xs text-gray-400 pl-3">
                          외 {b.absent_posts.length - 10}건
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>

          {result.rss_failed.length > 0 && (
            <p className="text-xs text-amber-700 mt-3">
              RSS를 읽지 못한 블로그: {result.rss_failed.join(', ')} — 블로그 설정에서
              RSS 공개를 켜야 글을 가져올 수 있습니다.
            </p>
          )}

          <p className="text-xs text-gray-400 mt-3 leading-relaxed">{result.caveat}</p>
        </div>
      )}
    </div>
  )
}
