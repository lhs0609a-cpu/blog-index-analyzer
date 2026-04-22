'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, AlertTriangle, Filter, Loader2,
  Trash2, Play, Info, Download, RefreshCw, X, Rocket, CheckCircle2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { adGet, adUpload, adPost, getApiBaseUrl } from '@/lib/api'

interface FilterJob {
  id: number
  status: string
  filename: string
  min_volume: number
  total_keywords: number
  processed_count: number
  passed_count: number
  failed_api_count: number
  current_step: string
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  progress_percent?: number
}

interface FilterResult {
  keyword: string
  monthly_pc: number
  monthly_mobile: number
  monthly_total: number
  comp_idx: string
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending: { bg: 'bg-gray-100', fg: 'text-gray-700', label: '대기' },
    running: { bg: 'bg-blue-100', fg: 'text-blue-800', label: '실행 중' },
    completed: { bg: 'bg-green-100', fg: 'text-green-800', label: '완료' },
    failed: { bg: 'bg-red-100', fg: 'text-red-800', label: '실패' },
  }
  const s = map[status] || map.pending
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.fg}`}>{s.label}</span>
}

export default function VolumeFilterPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [file, setFile] = useState<File | null>(null)
  const [minVolume, setMinVolume] = useState(10)
  const [isDragging, setIsDragging] = useState(false)
  const [starting, setStarting] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<number | null>(null)
  const [currentJob, setCurrentJob] = useState<FilterJob | null>(null)
  const [jobs, setJobs] = useState<FilterJob[]>([])
  const [previewResults, setPreviewResults] = useState<FilterResult[]>([])
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [campaignPrefix, setCampaignPrefix] = useState(
    `필터등록_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  )
  const [bid, setBid] = useState(100)
  const [keywordsPerGroup, setKeywordsPerGroup] = useState(500)
  const [dailyBudget, setDailyBudget] = useState(10000)
  const [registering, setRegistering] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isAuthenticated && !user) window.location.href = '/login'
  }, [isAuthenticated, user])

  const refreshJobs = async () => {
    try {
      const res = await adGet<{ success: boolean; jobs: FilterJob[] }>(
        '/api/naver-ad/keywords/volume-filter/jobs',
        { showToast: false }
      )
      setJobs(res.jobs || [])
    } catch {}
  }

  useEffect(() => { refreshJobs() }, [])

  useEffect(() => {
    if (!currentJobId) return
    const poll = async () => {
      try {
        const res = await adGet<{ success: boolean; job: FilterJob }>(
          `/api/naver-ad/keywords/volume-filter/${currentJobId}/status`,
          { showToast: false }
        )
        setCurrentJob(res.job)
        if (['completed', 'failed'].includes(res.job.status)) {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          refreshJobs()
          if (res.job.status === 'completed') {
            toast.success(`필터링 완료: ${res.job.passed_count}개 통과`)
            loadPreview(res.job.id)
          } else {
            toast.error(`실패: ${res.job.error_message || ''}`)
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

  const loadPreview = async (jobId: number) => {
    try {
      const res = await adGet<{ success: boolean; results: FilterResult[] }>(
        `/api/naver-ad/keywords/volume-filter/${jobId}/results?limit=100`,
        { showToast: false }
      )
      setPreviewResults(res.results || [])
    } catch {}
  }

  const handleFile = (f: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      toast.error('.xlsx, .xls, .csv만 가능')
      return
    }
    if (f.size > 100 * 1024 * 1024) {
      toast.error('파일은 100MB 이하')
      return
    }
    setFile(f)
  }

  const handleStart = async () => {
    if (!file) { toast.error('파일을 업로드하세요'); return }
    if (minVolume < 0 || minVolume > 100000) { toast.error('임계치 오류'); return }

    if (!confirm(`검색량 필터링을 시작합니다.\n\n· 임계치: 월 ${minVolume} 이상\n· 네이버 API를 5개씩 배치 호출합니다\n· 대량 파일의 경우 수 시간 걸릴 수 있습니다`)) return

    setStarting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('min_volume', String(minVolume))
      const res = await adUpload<{ success: boolean; job_id: number; estimated_minutes: number }>(
        '/api/naver-ad/keywords/volume-filter', fd
      )
      toast.success(`작업 시작 (#${res.job_id}, 예상 ${res.estimated_minutes}분)`)
      setCurrentJobId(res.job_id)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setPreviewResults([])
      setShowRegisterForm(false)
    } catch {} finally {
      setStarting(false)
    }
  }

  const downloadCsv = (jobId: number) => {
    const url = `${getApiBaseUrl()}/api/naver-ad/keywords/volume-filter/${jobId}/results?format=csv`
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `filtered_${jobId}.csv`
        a.click()
        URL.revokeObjectURL(a.href)
      })
      .catch(() => toast.error('다운로드 실패'))
  }

  const handleRegister = async () => {
    if (!currentJob) return
    if (bid < 70 || bid > 100000) { toast.error('입찰가 70~100000원'); return }
    if (!campaignPrefix || campaignPrefix.length < 2) { toast.error('캠페인 prefix 필수'); return }

    const msg = `필터 통과 ${currentJob.passed_count}개 키워드를 등록합니다.\n\n` +
      `· 입찰가: ${bid.toLocaleString()}원 (전체)\n` +
      `· 그룹당 키워드: ${keywordsPerGroup}개\n` +
      `· 일 예산: ${dailyBudget.toLocaleString()}원/캠페인\n\n계속하시겠습니까?`
    if (!confirm(msg)) return

    setRegistering(true)
    try {
      const res = await adPost<{ success: boolean; register_job_id: number }>(
        `/api/naver-ad/keywords/volume-filter/${currentJob.id}/register`,
        {
          campaign_prefix: campaignPrefix,
          bid,
          keywords_per_group: keywordsPerGroup,
          daily_budget: dailyBudget,
        }
      )
      toast.success(`등록 작업 시작 (#${res.register_job_id})`)
      setTimeout(() => {
        window.location.href = '/ad-optimizer/scale-upload'
      }, 1500)
    } catch {} finally {
      setRegistering(false)
    }
  }

  const progress = currentJob?.progress_percent ?? 0

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            <Filter className="inline w-8 h-8 mr-2 text-indigo-600" />
            검색량 필터링 (50만 규모)
          </h1>
          <p className="text-gray-600">
            엑셀의 키워드를 네이버 검색광고 API로 조회해서 <b>월 검색량 있는 것만</b> 추려낸 뒤,
            그 결과로 캠페인에 자동 등록합니다.
          </p>
        </div>

        {/* 경고 */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">소요 시간 안내</p>
              <ul className="space-y-1 text-amber-800">
                <li>• 네이버 API는 초당 2~3건 제한 → 키워드 5개당 약 0.4초</li>
                <li>• 1만 개: <b>약 15분</b> / 10만 개: <b>약 2시간 40분</b> / 50만 개: <b>약 13시간</b></li>
                <li>• 처음에는 <b>1,000개로 테스트</b> 후 스케일업 권장</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 업로드 + 설정 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">1. 필터링 작업 시작</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              최소 월 검색량 임계치
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={0}
                max={100000}
                value={minVolume}
                onChange={(e) => setMinVolume(Number(e.target.value) || 0)}
                className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-lg font-semibold"
              />
              <span className="text-sm text-gray-600">회 이상만 통과 (PC + 모바일 합산)</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              권장: 10 (검색량 거의 없는 키워드 제거) / 100 (상업적 가치 있는 키워드만)
            </p>
          </div>

          <div
            onDrop={(e) => {
              e.preventDefault(); setIsDragging(false)
              const f = e.dataTransfer.files?.[0]; if (f) handleFile(f)
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
                const f = e.target.files?.[0]; if (f) handleFile(f)
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-green-600" />
                <div className="text-left">
                  <div className="font-medium">{file.name}</div>
                  <div className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
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
                <p className="text-gray-700 font-medium">엑셀을 끌어놓거나 클릭</p>
                <p className="text-sm text-gray-500 mt-1">.xlsx, .xls, .csv (최대 100MB)</p>
              </>
            )}
          </div>

          <button
            onClick={handleStart}
            disabled={!file || starting}
            className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
          >
            {starting ? <><Loader2 className="w-4 h-4 animate-spin" /> 시작 중...</> :
              <><Filter className="w-4 h-4" /> 검색량 필터링 시작</>}
          </button>
        </div>

        {/* 진행 중 작업 */}
        {currentJob && (
          <div className="bg-white rounded-xl border-2 border-indigo-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-gray-900">필터 작업 #{currentJob.id}</h2>
                <StatusBadge status={currentJob.status} />
              </div>
              <button
                onClick={() => { setCurrentJobId(null); setCurrentJob(null); setPreviewResults([]); setShowRegisterForm(false) }}
                className="text-gray-400 hover:text-gray-600"
              ><X className="w-4 h-4" /></button>
            </div>

            <div className="mb-3">
              <div className="flex justify-between text-sm text-gray-700 mb-1">
                <span>{currentJob.current_step}</span>
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
                <div className="text-xs text-gray-500">전체 키워드</div>
                <div className="text-lg font-bold">{currentJob.total_keywords.toLocaleString()}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-xs text-blue-700">조회 완료</div>
                <div className="text-lg font-bold text-blue-900">{currentJob.processed_count.toLocaleString()}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-xs text-green-700">검색량 통과</div>
                <div className="text-lg font-bold text-green-900">{currentJob.passed_count.toLocaleString()}</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <div className="text-xs text-red-700">API 실패</div>
                <div className="text-lg font-bold text-red-900">{currentJob.failed_api_count.toLocaleString()}</div>
              </div>
            </div>

            {/* 완료 시 결과 프리뷰 + 등록 */}
            {currentJob.status === 'completed' && currentJob.passed_count > 0 && (
              <>
                <div className="mt-6 flex gap-2">
                  <button
                    onClick={() => downloadCsv(currentJob.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm"
                  >
                    <Download className="w-4 h-4" /> 전체 CSV 다운로드
                  </button>
                  <button
                    onClick={() => setShowRegisterForm(!showRegisterForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    <Rocket className="w-4 h-4" /> 이 결과로 광고 등록하기
                  </button>
                </div>

                {previewResults.length > 0 && (
                  <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 text-xs text-gray-600 font-medium">
                      상위 100개 미리보기 (전체 {currentJob.passed_count.toLocaleString()}개)
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-600 sticky top-0">
                          <tr>
                            <th className="px-3 py-1.5 text-left">키워드</th>
                            <th className="px-3 py-1.5 text-right">PC</th>
                            <th className="px-3 py-1.5 text-right">모바일</th>
                            <th className="px-3 py-1.5 text-right">총 검색량</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewResults.slice(0, 100).map((r, i) => (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="px-3 py-1.5">{r.keyword}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs">{r.monthly_pc.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-xs">{r.monthly_mobile.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right font-mono font-semibold">{r.monthly_total.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {showRegisterForm && (
                  <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Rocket className="w-4 h-4" /> 2. 광고 등록 설정
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">캠페인 prefix</label>
                        <input
                          type="text" value={campaignPrefix} onChange={(e) => setCampaignPrefix(e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">입찰가 (원, 전체 일괄)</label>
                        <input
                          type="number" min={70} max={100000} step={10} value={bid}
                          onChange={(e) => setBid(Number(e.target.value) || 100)}
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">광고그룹당 키워드</label>
                        <input
                          type="number" min={1} max={1000} value={keywordsPerGroup}
                          onChange={(e) => setKeywordsPerGroup(Number(e.target.value) || 500)}
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">캠페인 일 예산 (원)</label>
                        <input
                          type="number" min={1000} step={1000} value={dailyBudget}
                          onChange={(e) => setDailyBudget(Number(e.target.value) || 10000)}
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleRegister}
                      disabled={registering}
                      className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
                    >
                      {registering ? <><Loader2 className="w-4 h-4 animate-spin" /> 시작 중...</> :
                        <><CheckCircle2 className="w-4 h-4" /> {currentJob.passed_count.toLocaleString()}개 키워드 광고 등록 시작</>}
                    </button>
                  </div>
                )}
              </>
            )}

            {currentJob.error_message && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                {currentJob.error_message}
              </div>
            )}
          </div>
        )}

        {/* 이력 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">필터 작업 이력</h2>
            <button onClick={refreshJobs} className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> 새로고침
            </button>
          </div>
          {jobs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">작업 이력이 없습니다</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">ID</th>
                    <th className="px-3 py-2 text-left">상태</th>
                    <th className="px-3 py-2 text-left">파일</th>
                    <th className="px-3 py-2 text-right">임계치</th>
                    <th className="px-3 py-2 text-right">전체</th>
                    <th className="px-3 py-2 text-right">통과</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono">#{j.id}</td>
                      <td className="px-3 py-2"><StatusBadge status={j.status} /></td>
                      <td className="px-3 py-2 text-xs text-gray-700 truncate max-w-48">{j.filename}</td>
                      <td className="px-3 py-2 text-right font-mono">≥{j.min_volume}</td>
                      <td className="px-3 py-2 text-right font-mono">{j.total_keywords.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">
                        {j.passed_count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => { setCurrentJobId(j.id); if (j.status === 'completed') loadPreview(j.id) }}
                          className="text-indigo-600 hover:underline text-xs"
                        >상세</button>
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
