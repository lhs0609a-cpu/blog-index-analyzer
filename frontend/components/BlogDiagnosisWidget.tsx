'use client'

/**
 * 내 블로그 문제진단 — 대시보드 첫 화면.
 *
 * 이 자리에는 "오늘의 1위 가능 키워드" 가 있었다. 후보 풀이 100개뿐이라
 * 피부과 블로그에 `대출계산기` 가 "90% 매우 높음" 으로 떴다. 남의 키워드를
 * 자신 있게 추천하는 대신, 사용자가 실제로 궁금한 것부터 답한다.
 *
 * 표시 원칙(백엔드와 동일):
 *  · 안 잰 항목은 회색 '확인 필요' 다. 초록 ✓ 로 칠하지 않는다.
 *  · 심각한 것이 위로 온다. 근거 숫자를 문장에 같이 싣는다.
 */

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'

type Severity = 'critical' | 'warning' | 'ok' | 'unknown'

interface Finding {
  code: string
  severity: Severity
  title: string
  detail?: string
  action?: string | null
  href?: string | null
}

interface Diagnosis {
  blog_id: string
  headline: string
  all_clear: boolean
  counts: Record<Severity, number>
  findings: Finding[]
}

interface Props {
  blogId?: string
  className?: string
}

const STYLE: Record<Severity, { dot: string; text: string; chip: string; label: string }> = {
  critical: {
    dot: 'bg-red-500',
    text: 'text-red-700',
    chip: 'bg-red-50 text-red-700 border-red-200',
    label: '긴급',
  },
  warning: {
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    label: '주의',
  },
  unknown: {
    dot: 'bg-gray-300',
    text: 'text-gray-500',
    chip: 'bg-gray-50 text-gray-600 border-gray-200',
    label: '확인 필요',
  },
  ok: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: '정상',
  },
}

export default function BlogDiagnosisWidget({ blogId, className = '' }: Props) {
  const [data, setData] = useState<Diagnosis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!blogId) return
    setLoading(true)
    setError(null)
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const res = await fetch(`${base}/api/blogs/${encodeURIComponent(blogId)}/diagnosis`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      // 진단이 실패한 것을 "이상 없음" 으로 보이게 두지 않는다.
      setError('진단을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [blogId])

  useEffect(() => {
    load()
  }, [load])

  if (!blogId) return null

  if (loading && !data) {
    return (
      <div className={`rounded-2xl bg-white border border-gray-100 p-6 ${className}`}>
        <div className="h-5 w-40 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={`rounded-2xl bg-white border border-gray-100 p-6 ${className}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-gray-900">내 블로그 진단</div>
            <div className="text-sm text-gray-500 mt-1">{error || '진단 결과가 없습니다'}</div>
          </div>
          <button
            onClick={load}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  const tone = data.counts.critical > 0 ? 'critical' : data.counts.warning > 0 ? 'warning' : data.all_clear ? 'ok' : 'unknown'
  const t = STYLE[tone as Severity]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl bg-white border border-gray-100 overflow-hidden ${className}`}
    >
      <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${t.dot}`} />
            <span className="text-xs font-medium text-gray-500">내 블로그 진단</span>
          </div>
          <h3 className={`mt-1.5 text-lg font-bold truncate ${t.text}`}>{data.headline}</h3>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="다시 진단"
          className="shrink-0 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? '확인 중…' : '새로고침'}
        </button>
      </div>

      <div className="px-6 pb-5 space-y-2">
        {data.findings.map((f) => {
          const s = STYLE[f.severity]
          return (
            <div
              key={f.code}
              className="flex items-start gap-3 py-2.5 border-t border-gray-50 first:border-t-0"
            >
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{f.title}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded border ${s.chip}`}>
                    {s.label}
                  </span>
                </div>
                {f.detail && (
                  <p className="text-xs text-gray-500 mt-0.5 break-words">{f.detail}</p>
                )}
              </div>
              {f.action && f.href && (
                <Link
                  href={f.href}
                  className="shrink-0 text-xs font-medium text-[#0064FF] hover:underline whitespace-nowrap mt-0.5"
                >
                  {f.action} ›
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
