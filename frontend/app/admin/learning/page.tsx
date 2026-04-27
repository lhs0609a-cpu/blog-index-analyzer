'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Activity,
  Database,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth'
import apiClient from '@/lib/api/client'

interface LearningStatus {
  archive: {
    file_count: number
    oldest_file: string | null
    newest_file: string | null
    total_samples: number
    files: Array<{ name: string; n?: number; created_at?: string; error?: string }>
  }
  learned: {
    exists: boolean
    trained_at?: string
    total_samples?: number
    min_n?: number
    error?: string
    categories?: Array<{
      category: string
      n: number
      rhos: Record<string, number>
      c_rank_weight: number
      dia_weight: number
      c_sub_weights: Record<string, number>
      d_sub_weights: Record<string, number>
    }>
  }
  cron_health: {
    last_archive_age_hours: number | null
    daily_cron_likely_ok: boolean
    weekly_learning_likely_ok: boolean
  }
}

interface CronHealth {
  recent_24h: {
    total: number
    completed: number
    failed: number
    running: number
  }
  recent_cron_tasks: Array<{
    task_id: string
    status: string
    started_at: string
    completed_at?: string
    error_message?: string
    total_keywords?: number
  }>
  active_tracked_blogs: number
}

export default function AdminLearningPage() {
  const { user } = useAuthStore()
  const [status, setStatus] = useState<LearningStatus | null>(null)
  const [cron, setCron] = useState<CronHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.is_admin) {
      setError('관리자 권한이 필요합니다.')
      setLoading(false)
      return
    }
    Promise.all([
      apiClient.get<LearningStatus>('/api/admin/learning-status').then((r) => r.data),
      apiClient.get<CronHealth>('/api/admin/cron-health').then((r) => r.data),
    ])
      .then(([s, c]) => {
        setStatus(s)
        setCron(c)
      })
      .catch((e) => {
        setError(e?.response?.data?.detail || e?.message || '로드 실패')
      })
      .finally(() => setLoading(false))
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#0064FF]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-24">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
          <div className="text-red-800 font-bold">오류</div>
          <div className="text-sm text-gray-700 mt-2">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          관리자 대시보드
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">자동 학습 시스템</h1>
        <p className="text-gray-600 mb-8">
          B 검증 → 카테고리 가중치 자동 학습 파이프라인 운영 상태
        </p>

        {/* Cron 상태 카드 */}
        {status && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <HealthCard
              title="Daily SERP 측정 cron"
              ok={status.cron_health.daily_cron_likely_ok}
              detail={
                status.cron_health.last_archive_age_hours !== null
                  ? `마지막 archive: ${status.cron_health.last_archive_age_hours}시간 전`
                  : 'archive 없음'
              }
            />
            <HealthCard
              title="Weekly 학습 cron"
              ok={status.cron_health.weekly_learning_likely_ok}
              detail={
                status.learned?.trained_at
                  ? `마지막 학습: ${new Date(status.learned.trained_at).toLocaleString('ko-KR')}`
                  : '학습 결과 없음'
              }
            />
          </div>
        )}

        {/* Archive 통계 */}
        {status && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-[#0064FF]" />
              <h2 className="text-xl font-bold text-gray-900">검증 archive</h2>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Metric label="archive 파일 수" value={status.archive.file_count.toString()} />
              <Metric label="누적 샘플" value={status.archive.total_samples.toLocaleString()} />
              <Metric label="최신 파일" value={status.archive.newest_file || '—'} small />
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                최근 10개 파일 ({status.archive.files.length}개)
              </summary>
              <div className="mt-3 space-y-1 text-xs font-mono">
                {status.archive.files.map((f) => (
                  <div key={f.name} className="flex justify-between bg-gray-50 px-3 py-1.5 rounded">
                    <span>{f.name}</span>
                    <span className="text-gray-500">
                      {f.error ? `❌ ${f.error}` : `n=${f.n} · ${f.created_at}`}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* 학습된 가중치 */}
        {status?.learned?.exists && status.learned.categories && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-bold text-gray-900">카테고리별 학습 가중치</h2>
              <span className="text-xs text-gray-500">
                ({status.learned.total_samples} samples, min n={status.learned.min_n})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200">
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="py-2 pr-4">카테고리</th>
                    <th className="py-2 pr-4">n</th>
                    <th className="py-2 pr-4">c_rank 가중치</th>
                    <th className="py-2 pr-4">c_sub (ctx/cnt/chn)</th>
                    <th className="py-2 pr-4">dia 가중치</th>
                    <th className="py-2 pr-4">d_sub (dpt/inf/acc)</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {status.learned.categories.map((c) => (
                    <tr key={c.category} className="border-b border-gray-100">
                      <td className="py-3 pr-4 font-bold text-gray-900">{c.category}</td>
                      <td className="py-3 pr-4">{c.n}</td>
                      <td className="py-3 pr-4">{c.c_rank_weight?.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-gray-600">
                        {c.c_sub_weights.context?.toFixed(2) ?? '-'} /{' '}
                        {c.c_sub_weights.content?.toFixed(2) ?? '-'} /{' '}
                        {c.c_sub_weights.chain?.toFixed(2) ?? '-'}
                      </td>
                      <td className="py-3 pr-4">{c.dia_weight?.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-gray-600">
                        {c.d_sub_weights.depth?.toFixed(2) ?? '-'} /{' '}
                        {c.d_sub_weights.information?.toFixed(2) ?? '-'} /{' '}
                        {c.d_sub_weights.accuracy?.toFixed(2) ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Cron health 상세 */}
        {cron && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Cron 작업 (최근 24h)</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <Metric label="추적 활성 블로그" value={cron.active_tracked_blogs.toString()} />
              <Metric label="총 작업 (24h)" value={(cron.recent_24h.total || 0).toString()} />
              <Metric label="완료" value={(cron.recent_24h.completed || 0).toString()} />
              <Metric label="실패" value={(cron.recent_24h.failed || 0).toString()} danger={(cron.recent_24h.failed || 0) > 0} />
              <Metric label="실행 중" value={(cron.recent_24h.running || 0).toString()} />
            </div>
            {cron.recent_cron_tasks.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                  최근 cron 작업 {cron.recent_cron_tasks.length}건
                </summary>
                <div className="mt-3 space-y-1 text-xs font-mono">
                  {cron.recent_cron_tasks.map((t) => (
                    <div key={t.task_id} className="bg-gray-50 px-3 py-1.5 rounded">
                      <div className="flex justify-between">
                        <span>{t.task_id}</span>
                        <span
                          className={
                            t.status === 'completed'
                              ? 'text-green-600'
                              : t.status === 'failed'
                              ? 'text-red-600'
                              : 'text-yellow-600'
                          }
                        >
                          {t.status}
                        </span>
                      </div>
                      <div className="text-gray-500 text-[10px]">
                        시작: {t.started_at} {t.completed_at && `· 완료: ${t.completed_at}`}
                        {t.error_message && (
                          <span className="text-red-600 ml-2">· {t.error_message.slice(0, 80)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function HealthCard({ title, ok, detail }: { title: string; ok: boolean; detail: string }) {
  return (
    <div className={`rounded-2xl p-5 border ${ok ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        {ok ? (
          <CheckCircle className="w-5 h-5 text-green-600" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        )}
        <span className="font-bold text-gray-900">{title}</span>
      </div>
      <div className="text-sm text-gray-600">{detail}</div>
      <div className={`text-xs mt-2 font-medium ${ok ? 'text-green-700' : 'text-amber-700'}`}>
        {ok ? '✓ 정상 추정' : '⚠ 점검 필요'}
      </div>
    </div>
  )
}

function Metric({ label, value, danger, small }: { label: string; value: string; danger?: boolean; small?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`${small ? 'text-sm' : 'text-2xl'} font-bold ${danger ? 'text-red-600' : 'text-gray-900'} ${small ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  )
}
