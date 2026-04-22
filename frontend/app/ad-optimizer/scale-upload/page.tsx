'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2,
  Trash2, Play, Info, Layers, Target, Download, RefreshCw, X
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { adGet, adUpload, getApiBaseUrl } from '@/lib/api'

interface ScaleJob {
  id: number
  status: string
  filename: string
  campaign_prefix: string
  keywords_per_group: number
  bid: number
  daily_budget: number
  total_keywords: number
  processed_count: number
  succeeded_count: number
  failed_count: number
  campaigns_created: number
  ad_groups_created: number
  current_step: string
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  progress_percent?: number
}

interface StartResponse {
  success: boolean
  job_id: number
  total_keywords: number
  estimated: {
    campaigns: number
    ad_groups: number
    keywords_per_group: number
    estimated_seconds: number
  }
  message: string
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}초`
  if (sec < 3600) return `${Math.round(sec / 60)}분`
  return `${Math.floor(sec / 3600)}시간 ${Math.round((sec % 3600) / 60)}분`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending: { bg: 'bg-gray-100', fg: 'text-gray-700', label: '대기 중' },
    running: { bg: 'bg-blue-100', fg: 'text-blue-800', label: '실행 중' },
    completed: { bg: 'bg-green-100', fg: 'text-green-800', label: '완료' },
    completed_with_errors: { bg: 'bg-amber-100', fg: 'text-amber-800', label: '완료(일부 실패)' },
    failed: { bg: 'bg-red-100', fg: 'text-red-800', label: '실패' },
  }
  const s = map[status] || map.pending
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.fg}`}>{s.label}</span>
}

export default function ScaleUploadPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [file, setFile] = useState<File | null>(null)
  const [campaignPrefix, setCampaignPrefix] = useState(
    `대량등록_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  )
  const [bid, setBid] = useState(100)
  const [keywordsPerGroup, setKeywordsPerGroup] = useState(500)
  const [dailyBudget, setDailyBudget] = useState(10000)
  const [isDragging, setIsDragging] = useState(false)
  const [starting, setStarting] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<number | null>(null)
  const [currentJob, setCurrentJob] = useState<ScaleJob | null>(null)
  const [jobs, setJobs] = useState<ScaleJob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isAuthenticated && !user) {
      window.location.href = '/login'
    }
  }, [isAuthenticated, user])

  const refreshJobs = async () => {
    try {
      const res = await adGet<{ success: boolean; jobs: ScaleJob[] }>(
        '/api/naver-ad/keywords/scale-register/jobs',
        { showToast: false }
      )
      setJobs(res.jobs || [])
    } catch {}
  }

  useEffect(() => {
    refreshJobs()
  }, [])

  useEffect(() => {
    if (!currentJobId) return

    const poll = async () => {
      try {
        const res = await adGet<{ success: boolean; job: ScaleJob }>(
          `/api/naver-ad/keywords/scale-register/${currentJobId}/status`,
          { showToast: false }
        )
        setCurrentJob(res.job)
        const terminal = ['completed', 'completed_with_errors', 'failed']
        if (terminal.includes(res.job.status)) {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          refreshJobs()
          if (res.job.status === 'completed') {
            toast.success(`등록 완료: ${res.job.succeeded_count}개 성공`)
          } else if (res.job.status === 'completed_with_errors') {
            toast(`등록 완료 (일부 실패): ${res.job.succeeded_count} 성공 / ${res.job.failed_count} 실패`, { icon: '⚠️' })
          } else {
            toast.error(`작업 실패: ${res.job.error_message || '알 수 없는 오류'}`)
          }
        }
      } catch {}
    }

    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [currentJobId])

  const handleFile = (f: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      toast.error('.xlsx, .xls, .csv 파일만 가능합니다')
      return
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error('파일은 50MB 이하')
      return
    }
    setFile(f)
  }

  const handleStart = async () => {
    if (!file) {
      toast.error('엑셀 파일을 업로드하세요')
      return
    }
    if (bid < 70 || bid > 100000) {
      toast.error('입찰가는 70~100,000원이어야 합니다')
      return
    }
    if (!campaignPrefix || campaignPrefix.length < 2) {
      toast.error('캠페인 prefix를 입력하세요')
      return
    }

    const msg = `네이버 광고에 대량 등록을 시작합니다.\n\n` +
      `· 입찰가: ${bid.toLocaleString()}원 (전체 적용)\n` +
      `· 광고그룹당 키워드: ${keywordsPerGroup}개\n` +
      `· 캠페인 일 예산: ${dailyBudget.toLocaleString()}원\n\n` +
      `※ 실제 네이버 광고 계정에 캠페인과 광고그룹이 생성됩니다.\n` +
      `※ 시작 후 중단이 어렵습니다. 계속하시겠습니까?`
    if (!confirm(msg)) return

    setStarting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('campaign_prefix', campaignPrefix)
      fd.append('bid', String(bid))
      fd.append('keywords_per_group', String(keywordsPerGroup))
      fd.append('daily_budget', String(dailyBudget))
      const res = await adUpload<StartResponse>('/api/naver-ad/keywords/scale-register', fd)
      toast.success(`작업 시작 (job #${res.job_id})`)
      setCurrentJobId(res.job_id)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      // toast handled
    } finally {
      setStarting(false)
    }
  }

  const downloadFailuresCsv = (jobId: number) => {
    const url = `${getApiBaseUrl()}/api/naver-ad/keywords/scale-register/${jobId}/failures?format=csv`
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    // auth header 필요 - blob fetch 방식
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `failures_job_${jobId}.csv`
        a.click()
        URL.revokeObjectURL(a.href)
      })
      .catch(() => toast.error('다운로드 실패'))
  }

  const selected = currentJob
  const progress = selected?.progress_percent ?? 0

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            <Layers className="inline w-8 h-8 mr-2 text-indigo-600" />
            키워드 대량 등록 (10만 규모)
          </h1>
          <p className="text-gray-600">
            엑셀을 업로드하면 네이버 제한(광고그룹당 500개)에 맞춰 캠페인과 광고그룹을 자동 생성하고 키워드를 분배 등록합니다.
          </p>
        </div>

        {/* 경고 카드 */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">중요 안내</p>
              <ul className="space-y-1 text-amber-800">
                <li>• 실제 네이버 광고 계정에 <b>캠페인이 생성되고 예산이 설정</b>됩니다</li>
                <li>• 캠페인마다 <b>일 예산</b>만큼 최대 광고비가 나갈 수 있습니다</li>
                <li>• 10만 개 등록 시 처리 시간 <b>약 30~60분</b>, 중간 중단 시 일부만 등록된 상태가 됩니다</li>
                <li>• 먼저 <b>1,000개 규모로 테스트</b>해보는 것을 강력히 권장합니다</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 설정 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">등록 설정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                캠페인 이름 prefix
              </label>
              <input
                type="text"
                value={campaignPrefix}
                onChange={(e) => setCampaignPrefix(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                예: <code>대량등록_20260422</code> → <code>대량등록_20260422_001</code>, <code>_002</code>...
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                입찰가 (원) <span className="text-indigo-600">— 전체 키워드 일괄</span>
              </label>
              <input
                type="number"
                min={70}
                max={100000}
                step={10}
                value={bid}
                onChange={(e) => setBid(Number(e.target.value) || 100)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-semibold"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                광고그룹당 키워드 수
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={keywordsPerGroup}
                onChange={(e) => setKeywordsPerGroup(Number(e.target.value) || 500)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                기본 500 (네이버 권장치). 최대 1,000
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                캠페인당 일 예산 (원)
              </label>
              <input
                type="number"
                min={1000}
                step={1000}
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value) || 10000)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                캠페인당 설정 (최소 1,000원 권장)
              </p>
            </div>
          </div>
        </div>

        {/* 파일 업로드 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">엑셀 파일</h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-900 flex gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>A열에 키워드만 넣으세요. 입찰가는 위에서 설정한 값으로 모든 키워드에 일괄 적용됩니다.</span>
          </div>
          <div
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-green-600" />
                <div className="text-left">
                  <div className="font-medium">{file.name}</div>
                  <div className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="ml-4 p-2 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-700 font-medium">엑셀 파일을 끌어놓거나 클릭해서 선택</p>
                <p className="text-sm text-gray-500 mt-1">.xlsx, .xls, .csv (최대 50MB)</p>
              </>
            )}
          </div>
          <button
            onClick={handleStart}
            disabled={!file || starting}
            className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
          >
            {starting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> 시작 중...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> 대량 등록 시작
              </>
            )}
          </button>
        </div>

        {/* 진행 중 작업 */}
        {selected && (
          <div className="bg-white rounded-xl border-2 border-indigo-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-gray-900">
                  작업 #{selected.id}
                </h2>
                <StatusBadge status={selected.status} />
              </div>
              <button
                onClick={() => { setCurrentJobId(null); setCurrentJob(null) }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-sm text-gray-700 mb-1">
                <span className="font-medium">{selected.current_step}</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">캠페인 생성</div>
                <div className="text-lg font-bold text-gray-900">{selected.campaigns_created}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">광고그룹 생성</div>
                <div className="text-lg font-bold text-gray-900">{selected.ad_groups_created}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-xs text-green-700">성공</div>
                <div className="text-lg font-bold text-green-900">
                  {selected.succeeded_count.toLocaleString()}
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <div className="text-xs text-red-700">실패</div>
                <div className="text-lg font-bold text-red-900">
                  {selected.failed_count.toLocaleString()}
                </div>
              </div>
            </div>

            {selected.failed_count > 0 && (
              <button
                onClick={() => downloadFailuresCsv(selected.id)}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
              >
                <Download className="w-4 h-4" /> 실패 키워드 CSV 다운로드 ({selected.failed_count}개)
              </button>
            )}

            {selected.error_message && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                {selected.error_message}
              </div>
            )}
          </div>
        )}

        {/* 이력 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">작업 이력</h2>
            <button
              onClick={refreshJobs}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> 새로고침
            </button>
          </div>
          {jobs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">아직 작업 이력이 없습니다</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">ID</th>
                    <th className="px-3 py-2 text-left">상태</th>
                    <th className="px-3 py-2 text-left">캠페인</th>
                    <th className="px-3 py-2 text-right">키워드</th>
                    <th className="px-3 py-2 text-right">성공/실패</th>
                    <th className="px-3 py-2 text-left">생성일</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono">#{j.id}</td>
                      <td className="px-3 py-2"><StatusBadge status={j.status} /></td>
                      <td className="px-3 py-2 text-gray-700">{j.campaign_prefix}</td>
                      <td className="px-3 py-2 text-right font-mono">{j.total_keywords.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        <span className="text-green-700">{j.succeeded_count.toLocaleString()}</span>
                        {' / '}
                        <span className="text-red-700">{j.failed_count.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {j.created_at ? new Date(j.created_at).toLocaleString('ko-KR') : '-'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setCurrentJobId(j.id)}
                          className="text-indigo-600 hover:underline text-xs"
                        >
                          상세
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
