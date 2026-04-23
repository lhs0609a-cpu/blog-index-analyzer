'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Upload, FileSpreadsheet, AlertTriangle, Filter, Loader2,
  Trash2, Play, Info, Download, RefreshCw, X, Rocket, CheckCircle2,
  Pause, StopCircle, ArrowRight, BeakerIcon, Sparkles
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
  test_size?: number
  min_pass_rate_pct?: number
  auto_continue_on_canary?: number
  canary_evaluated_at?: string | null
  canary_pass_rate?: number | null
  canary_passed?: number
  should_cancel?: number
  should_pause?: number
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
    paused: { bg: 'bg-yellow-100', fg: 'text-yellow-800', label: '일시정지' },
    canary_failed: { bg: 'bg-orange-100', fg: 'text-orange-800', label: '캐너리 실패(대기)' },
    cancelled: { bg: 'bg-gray-200', fg: 'text-gray-800', label: '취소됨' },
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
  const [testSize, setTestSize] = useState(10000)
  const [minPassRate, setMinPassRate] = useState(2.0)
  const [autoContinue, setAutoContinue] = useState(true)
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
  const [actionInFlight, setActionInFlight] = useState(false)
  // AI 키워드 확장 (관리자 전용)
  const [aiSeeds, setAiSeeds] = useState('')
  const [aiMinVolume, setAiMinVolume] = useState(5)
  const [aiMaxKept, setAiMaxKept] = useState(10000)
  const [aiMaxApiCalls, setAiMaxApiCalls] = useState(2000)
  const [aiMaxDepth, setAiMaxDepth] = useState(3)
  const [aiTopNPerLevel, setAiTopNPerLevel] = useState(50)
  const [aiCoreTerms, setAiCoreTerms] = useState('')
  const [aiBlacklist, setAiBlacklist] = useState('')
  const [aiStarting, setAiStarting] = useState(false)
  // AI 제안
  const [aiTopic, setAiTopic] = useState('')
  const [aiTargetCount, setAiTargetCount] = useState(100000)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [aiSuggestionNote, setAiSuggestionNote] = useState('')
  // 실시간 캠페인 등록 옵션
  const [aiStreamRegister, setAiStreamRegister] = useState(false)
  const [aiCampaignPrefix, setAiCampaignPrefix] = useState(
    `AI_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  )
  const [aiBid, setAiBid] = useState(100)
  const [aiDailyBudget, setAiDailyBudget] = useState(10000)
  const [aiStreamBatch, setAiStreamBatch] = useState(10)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isAdmin = !!user?.is_admin

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
        if (['completed', 'failed', 'cancelled'].includes(res.job.status)) {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          refreshJobs()
          if (res.job.status === 'completed') {
            toast.success(`필터링 완료: ${res.job.passed_count}개 통과`)
            loadPreview(res.job.id)
          } else if (res.job.status === 'cancelled') {
            toast(`취소됨`, { icon: '⏹️' })
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

    const msg = testSize > 0
      ? `검색량 필터링 시작:\n\n· 임계치: 월 ${minVolume} 이상\n· 캐너리: 첫 ${testSize.toLocaleString()}개로 통과율 테스트\n· 통과율 ${minPassRate}% 이상이면 ${autoContinue ? '자동 계속' : '수동 재개 대기'}\n· 미달 시 중단`
      : `검색량 필터링 시작 (캐너리 비활성):\n\n· 임계치: 월 ${minVolume} 이상\n· 전체 바로 처리`
    if (!confirm(msg)) return

    setStarting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('min_volume', String(minVolume))
      fd.append('test_size', String(testSize))
      fd.append('min_pass_rate_pct', String(minPassRate))
      fd.append('auto_continue_on_canary', String(autoContinue))
      const res = await adUpload<{ success: boolean; job_id: number; estimated_minutes: number; message: string }>(
        '/api/naver-ad/keywords/volume-filter', fd
      )
      toast.success(`작업 시작 (#${res.job_id})`)
      setCurrentJobId(res.job_id)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setPreviewResults([])
      setShowRegisterForm(false)
    } catch {} finally {
      setStarting(false)
    }
  }

  const handleAiSuggest = async () => {
    const topic = aiTopic.trim()
    if (!topic) { toast.error('주제를 입력하세요 (예: 대출, 성형외과)'); return }
    if (aiTargetCount <= 0 || aiTargetCount > 1000000) { toast.error('목표 수 1~1000000'); return }

    setAiSuggesting(true)
    try {
      const res = await adPost<{
        success: boolean
        suggestion: {
          seeds: string[]
          core_terms: string[]
          blacklist: string[]
          max_depth: number
          top_n_per_level: number
          suggested_max_api_calls: number
          estimated_keywords: string
          rationale: string
        }
      }>('/api/naver-ad/keywords/ai-suggest-seeds', { topic, target_count: aiTargetCount })

      const s = res.suggestion
      setAiSeeds(s.seeds.join('\n'))
      setAiCoreTerms(s.core_terms.join('\n'))
      setAiBlacklist(s.blacklist.join('\n'))
      setAiMaxDepth(s.max_depth)
      setAiTopNPerLevel(s.top_n_per_level)
      setAiMaxApiCalls(s.suggested_max_api_calls)
      setAiMaxKept(Math.max(aiTargetCount, 1000))
      setAiSuggestionNote(`📊 예상 수집: ${s.estimated_keywords}\n💡 ${s.rationale}`)
      toast.success('AI 제안 완료. 아래에서 수정 후 실행하세요.')
    } catch (e: any) {
      toast.error(`AI 제안 실패: ${e?.message || 'OpenAI 키 설정 확인'}`)
    } finally {
      setAiSuggesting(false)
    }
  }

  const handleAiExpand = async () => {
    const seeds = aiSeeds
      .split(/[\n,]/)
      .map(s => s.trim())
      .filter(Boolean)
    if (seeds.length === 0) { toast.error('씨앗 키워드를 입력하세요'); return }
    if (seeds.length > 500) { toast.error('씨앗은 최대 500개'); return }
    if (aiMinVolume < 0 || aiMinVolume > 100000) { toast.error('임계치 오류'); return }
    if (aiMaxApiCalls <= 0 || aiMaxApiCalls > 20000) { toast.error('API 호출 상한 오류'); return }
    if (aiMaxKept <= 0 || aiMaxKept > 100000) { toast.error('최대 키워드 수 오류'); return }
    if (aiMaxDepth < 0 || aiMaxDepth > 5) { toast.error('depth는 0~5'); return }

    const coreTerms = aiCoreTerms.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
    const blacklist = aiBlacklist.split(/[\n,]/).map(s => s.trim()).filter(Boolean)

    if (aiStreamRegister) {
      if (!aiCampaignPrefix || aiCampaignPrefix.length < 2) { toast.error('캠페인 prefix는 2자 이상'); return }
      if (aiBid < 70 || aiBid > 100000) { toast.error('입찰가 70~100000원'); return }
      if (aiStreamBatch < 1 || aiStreamBatch > 100) { toast.error('배치 크기 1~100'); return }
    }

    const estMin = Math.round(aiMaxApiCalls * 0.35 / 60 * 10) / 10
    const anchorPreview = coreTerms.length > 0
      ? `수동 앵커 ${coreTerms.length}개 (${coreTerms.slice(0, 3).join(', ')}${coreTerms.length > 3 ? '…' : ''})`
      : `씨앗 자동 추출 (드리프트 방지)`
    const streamLine = aiStreamRegister
      ? `\n\n🚀 실시간 캠페인 등록 ON:\n· prefix: ${aiCampaignPrefix}\n· 입찰가: ${aiBid.toLocaleString()}원\n· 일예산: ${aiDailyBudget.toLocaleString()}원/캠페인\n· 배치: ${aiStreamBatch}개 찰 때마다 즉시 등록\n⚠️ 실제 네이버 광고가 바로 생성됨. 비즈머니 확인 필수.`
      : ''
    const msg = `AI 키워드 자동 확장 시작:\n\n· 씨앗: ${seeds.length}개 (${seeds.slice(0, 3).join(', ')}${seeds.length > 3 ? '…' : ''})\n· 필수 앵커: ${anchorPreview}\n· 제외 단어: ${blacklist.length}개\n· 임계치: 월 ${aiMinVolume} 이상\n· BFS 깊이: ${aiMaxDepth}\n· API 상한: ${aiMaxApiCalls}회 (예상 ${estMin}분)\n· 최대 확보: ${aiMaxKept}개${streamLine}\n\n계속?`
    if (!confirm(msg)) return

    setAiStarting(true)
    try {
      const res = await adPost<{ success: boolean; job_id: number; estimated_minutes: number; message: string }>(
        '/api/naver-ad/keywords/ai-expand',
        {
          seeds,
          min_volume: aiMinVolume,
          max_total_kept: aiMaxKept,
          max_api_calls: aiMaxApiCalls,
          max_depth: aiMaxDepth,
          top_n_per_level: aiTopNPerLevel,
          core_terms: coreTerms,
          blacklist,
          stream_register: aiStreamRegister,
          campaign_prefix: aiStreamRegister ? aiCampaignPrefix : '',
          bid: aiBid,
          daily_budget: aiDailyBudget,
          stream_batch_size: aiStreamBatch,
          keywords_per_ad_group: 1000,
        }
      )
      toast.success(`AI 확장 시작 (#${res.job_id})`)
      setCurrentJobId(res.job_id)
      setPreviewResults([])
      setShowRegisterForm(false)
    } catch {} finally {
      setAiStarting(false)
    }
  }

  const handleCancel = async (jobId: number) => {
    if (!confirm('작업을 취소합니다. 진행 상태는 보존되지 않습니다. 계속?')) return
    setActionInFlight(true)
    try {
      await adPost(`/api/naver-ad/keywords/volume-filter/${jobId}/cancel`, {})
      toast('취소 요청됨', { icon: '⏹️' })
    } catch {} finally {
      setActionInFlight(false)
    }
  }

  const handlePause = async (jobId: number) => {
    setActionInFlight(true)
    try {
      await adPost(`/api/naver-ad/keywords/volume-filter/${jobId}/pause`, {})
      toast('일시정지 요청됨 (잠시 후 반영)', { icon: '⏸️' })
    } catch {} finally {
      setActionInFlight(false)
    }
  }

  const handleResume = async (jobId: number) => {
    setActionInFlight(true)
    try {
      const res = await adPost<{ success: boolean; start_index: number; total: number }>(
        `/api/naver-ad/keywords/volume-filter/${jobId}/resume`,
        {}
      )
      toast.success(`재개됨 (${res.start_index}/${res.total})`)
      setCurrentJobId(jobId)
    } catch {} finally {
      setActionInFlight(false)
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
        { campaign_prefix: campaignPrefix, bid, keywords_per_group: keywordsPerGroup, daily_budget: dailyBudget }
      )
      toast.success(`등록 작업 시작 (#${res.register_job_id})`)
      setTimeout(() => { window.location.href = '/ad-optimizer/scale-upload' }, 1500)
    } catch {} finally {
      setRegistering(false)
    }
  }

  const progress = currentJob?.progress_percent ?? 0
  const canCancel = currentJob && ['pending', 'running'].includes(currentJob.status)
  const canPause = currentJob && currentJob.status === 'running'
  const canResume = currentJob && ['paused', 'canary_failed'].includes(currentJob.status)

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

        {/* 캐너리 안내 */}
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <BeakerIcon className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-900">
              <p className="font-semibold mb-1">🧪 캐너리 테스트 + 자동 계속 실행</p>
              <p className="text-emerald-800">
                업로드된 키워드 중 <b>첫 1만개</b>로 먼저 통과율을 측정합니다.
                통과율이 <b>2%</b> 이상이면 나머지도 <b>자동으로 진행</b>,
                미달이면 자동 중단 (강제 진행은 "재개" 버튼).
              </p>
              <p className="text-emerald-800 mt-1">
                <b>언제든 일시정지 / 취소 / 재개 가능</b>합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 소요 시간 */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">소요 시간 안내</p>
              <ul className="space-y-1 text-amber-800">
                <li>• 캐너리 1만개: <b>약 15분</b> 후 자동 판단</li>
                <li>• 10만 개: 약 2시간 40분 / 50만 개: 약 13시간</li>
                <li>• 중간 중단 가능: 일시정지 → 재개하면 이어서 실행</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 관리자 전용: AI 키워드 자동 확장 */}
        {isAdmin && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-300 p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h2 className="font-semibold text-gray-900">AI 키워드 자동 확장</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-600 text-white">ADMIN</span>
            </div>
            <p className="text-sm text-gray-700 mb-4">
              씨앗 키워드에서 출발해 네이버 연관검색어를 <b>BFS로 자동 확장</b>하며
              검색량 있는 키워드만 수집합니다. 파일 업로드 불필요.
            </p>

            {/* Step 0: AI 자동 제안 */}
            <div className="bg-gradient-to-r from-indigo-100 to-purple-100 border border-indigo-300 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-indigo-700" />
                <span className="text-sm font-semibold text-indigo-900">
                  Step 0. 귀찮으면 AI에게 맡겨봐 (주제만 알려주면 씨앗/앵커 자동 생성)
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end mb-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">주제 / 카테고리</label>
                  <input
                    type="text"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="예: 대출, 성형외과, 인테리어, 다이어트"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">목표 키워드 수</label>
                  <input
                    type="number" min={100} max={1000000} step={1000}
                    value={aiTargetCount}
                    onChange={(e) => setAiTargetCount(Number(e.target.value) || 10000)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleAiSuggest}
                disabled={aiSuggesting}
                className="w-full bg-indigo-600 text-white py-2 rounded font-medium hover:bg-indigo-700 disabled:bg-gray-300 flex items-center justify-center gap-2 text-sm"
              >
                {aiSuggesting ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 추천 생성 중...</> :
                  <><Sparkles className="w-4 h-4" /> 씨앗/앵커 AI 추천 받기</>}
              </button>
              {aiSuggestionNote && (
                <div className="mt-2 p-2 bg-white/70 rounded text-xs text-gray-700 whitespace-pre-line">
                  {aiSuggestionNote}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                씨앗 키워드 (줄바꿈 또는 쉼표로 구분, 최대 500개) <span className="text-xs font-normal text-gray-500">— AI 추천 결과를 자유롭게 수정하세요. 10만+ 목표면 수백 개 조합 씨앗이 생성됨</span>
              </label>
              <textarea
                value={aiSeeds}
                onChange={(e) => setAiSeeds(e.target.value)}
                placeholder={'예:\n대출\n신용대출\n사업자대출'}
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  필수 앵커 단어 <span className="text-xs font-normal text-gray-500">(비우면 씨앗에서 자동 추출)</span>
                </label>
                <textarea
                  value={aiCoreTerms}
                  onChange={(e) => setAiCoreTerms(e.target.value)}
                  placeholder={'예:\n대출\n상환\n대환\n자금\n금융'}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">💡 키워드에 이 중 <b>하나라도</b> 포함돼야 채택됨. 드리프트(예: 대출 → 마케팅대행) 방지.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  제외 단어 <span className="text-xs font-normal text-gray-500">(포함 시 즉시 컷)</span>
                </label>
                <textarea
                  value={aiBlacklist}
                  onChange={(e) => setAiBlacklist(e.target.value)}
                  placeholder={'예:\n마케팅\n대행\n블로그\n광고'}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">⚠️ 키워드에 이 중 <b>하나라도</b> 들어가면 버림.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">최소 월 검색량</label>
                <input
                  type="number" min={0} max={100000}
                  value={aiMinVolume}
                  onChange={(e) => setAiMinVolume(Number(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">BFS 깊이 (0~5)</label>
                <input
                  type="number" min={0} max={5}
                  value={aiMaxDepth}
                  onChange={(e) => setAiMaxDepth(Number(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">레벨당 상위 N</label>
                <input
                  type="number" min={10} max={2000} step={10}
                  value={aiTopNPerLevel}
                  onChange={(e) => setAiTopNPerLevel(Number(e.target.value) || 50)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">클수록 넓게</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">API 호출 상한</label>
                <input
                  type="number" min={1} max={50000} step={100}
                  value={aiMaxApiCalls}
                  onChange={(e) => setAiMaxApiCalls(Number(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">최대 확보 개수</label>
                <input
                  type="number" min={1} max={1000000} step={1000}
                  value={aiMaxKept}
                  onChange={(e) => setAiMaxKept(Number(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="text-xs text-gray-600 mb-3">
              💡 예상 소요: API 상한 × 0.35초 ≈ <b>{Math.round(aiMaxApiCalls * 0.35 / 60 * 10) / 10}분</b>.
              각 레벨에서 검색량 상위 50개만 다음 depth 확장 대상으로 선택.
            </div>

            {/* 실시간 캠페인 등록 */}
            <div className="bg-white/60 border border-purple-200 rounded-lg p-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={aiStreamRegister}
                  onChange={(e) => setAiStreamRegister(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-semibold text-purple-900">
                  🚀 실시간 캠페인 등록 (수집하면서 동시에 네이버에 등록)
                </span>
              </label>
              {aiStreamRegister && (
                <>
                  <p className="text-xs text-purple-800 mb-3 pl-6">
                    ⚠️ 배치 크기만큼 찰 때마다 <b>즉시 네이버 캠페인/광고그룹/키워드가 생성</b>됩니다. 비즈머니 잔액/일 예산 확인 필수.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pl-6">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">캠페인 prefix</label>
                      <input
                        type="text"
                        value={aiCampaignPrefix}
                        onChange={(e) => setAiCampaignPrefix(e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">입찰가 (70~)</label>
                      <input
                        type="number" min={70} max={100000}
                        value={aiBid}
                        onChange={(e) => setAiBid(Number(e.target.value) || 100)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">일 예산 (원/캠페인)</label>
                      <input
                        type="number" min={1000} step={1000}
                        value={aiDailyBudget}
                        onChange={(e) => setAiDailyBudget(Number(e.target.value) || 10000)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">배치 크기 (1~100)</label>
                      <input
                        type="number" min={1} max={100}
                        value={aiStreamBatch}
                        onChange={(e) => setAiStreamBatch(Number(e.target.value) || 10)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-0.5">작을수록 실시간, 커질수록 빠름</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleAiExpand}
              disabled={aiStarting}
              className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
            >
              {aiStarting ? <><Loader2 className="w-4 h-4 animate-spin" /> 시작 중...</> :
                <><Sparkles className="w-4 h-4" /> {aiStreamRegister ? 'AI 확장 + 실시간 등록 시작' : 'AI 확장 시작 (수집만)'}</>}
            </button>
          </div>
        )}

        {/* 업로드 + 설정 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">1. 필터링 작업 시작</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                최소 월 검색량 임계치
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={0} max={100000}
                  value={minVolume}
                  onChange={(e) => setMinVolume(Number(e.target.value) || 0)}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 font-semibold"
                />
                <span className="text-sm text-gray-600">회 이상 통과</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                캐너리 테스트 크기
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={0} step={1000}
                  value={testSize}
                  onChange={(e) => setTestSize(Number(e.target.value) || 0)}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 font-semibold"
                />
                <span className="text-sm text-gray-600">개 (0 = 비활성)</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                최소 통과율 (%)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={0} max={100} step={0.5}
                  value={minPassRate}
                  onChange={(e) => setMinPassRate(Number(e.target.value) || 0)}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 font-semibold"
                />
                <span className="text-sm text-gray-600">% 이상이면 계속</span>
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={autoContinue}
                       onChange={(e) => setAutoContinue(e.target.checked)}
                       className="w-4 h-4" />
                <span className="text-sm font-medium text-gray-700">캐너리 통과 시 자동 계속</span>
              </label>
            </div>
          </div>

          <div
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
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
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
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
                ><Trash2 className="w-4 h-4" /></button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-700 font-medium">엑셀 드래그 또는 클릭</p>
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
              <><Filter className="w-4 h-4" /> 캐너리 테스트 시작</>}
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
              <div className="flex items-center gap-2">
                {canPause && (
                  <button
                    onClick={() => handlePause(currentJob.id)}
                    disabled={actionInFlight}
                    className="px-3 py-1.5 bg-yellow-100 text-yellow-800 hover:bg-yellow-200 rounded text-sm flex items-center gap-1"
                  ><Pause className="w-3 h-3" /> 일시정지</button>
                )}
                {canResume && (
                  <button
                    onClick={() => handleResume(currentJob.id)}
                    disabled={actionInFlight}
                    className="px-3 py-1.5 bg-blue-100 text-blue-800 hover:bg-blue-200 rounded text-sm flex items-center gap-1"
                  ><Play className="w-3 h-3" /> 재개</button>
                )}
                {canCancel && (
                  <button
                    onClick={() => handleCancel(currentJob.id)}
                    disabled={actionInFlight}
                    className="px-3 py-1.5 bg-red-100 text-red-800 hover:bg-red-200 rounded text-sm flex items-center gap-1"
                  ><StopCircle className="w-3 h-3" /> 취소</button>
                )}
                <button
                  onClick={() => { setCurrentJobId(null); setCurrentJob(null); setPreviewResults([]); setShowRegisterForm(false) }}
                  className="text-gray-400 hover:text-gray-600"
                ><X className="w-4 h-4" /></button>
              </div>
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

            {/* 캐너리 결과 뱃지 */}
            {currentJob.canary_evaluated_at && (
              <div className={`mt-4 p-3 rounded-lg flex items-center gap-3 ${
                currentJob.canary_passed ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
              }`}>
                <BeakerIcon className={`w-5 h-5 ${currentJob.canary_passed ? 'text-green-700' : 'text-orange-700'}`} />
                <div className="text-sm">
                  <span className="font-semibold">
                    캐너리 {currentJob.canary_passed ? '통과 ✅' : '미달 ⚠️'}:
                  </span>{' '}
                  <span>
                    {currentJob.test_size?.toLocaleString()}개 중 {' '}
                    <b>{currentJob.canary_pass_rate?.toFixed(2)}%</b> 통과
                    (임계치 {currentJob.min_pass_rate_pct}%)
                  </span>
                </div>
              </div>
            )}

            {/* 완료 시 결과 + 등록 */}
            {currentJob.status === 'completed' && currentJob.passed_count > 0 && (
              <>
                <div className="mt-6 flex gap-2">
                  <button
                    onClick={() => downloadCsv(currentJob.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm"
                  ><Download className="w-4 h-4" /> 전체 CSV 다운로드</button>
                  <button
                    onClick={() => setShowRegisterForm(!showRegisterForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  ><Rocket className="w-4 h-4" /> 이 결과로 광고 등록하기</button>
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
                        <input type="text" value={campaignPrefix} onChange={(e) => setCampaignPrefix(e.target.value)}
                               className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">입찰가 (원, 전체 일괄)</label>
                        <input type="number" min={70} max={100000} step={10} value={bid}
                               onChange={(e) => setBid(Number(e.target.value) || 100)}
                               className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-semibold" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">광고그룹당 키워드</label>
                        <input type="number" min={1} max={1000} value={keywordsPerGroup}
                               onChange={(e) => setKeywordsPerGroup(Number(e.target.value) || 500)}
                               className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">캠페인 일 예산 (원)</label>
                        <input type="number" min={1000} step={1000} value={dailyBudget}
                               onChange={(e) => setDailyBudget(Number(e.target.value) || 10000)}
                               className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                      </div>
                    </div>
                    <button
                      onClick={handleRegister}
                      disabled={registering}
                      className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
                    >
                      {registering ? <><Loader2 className="w-4 h-4 animate-spin" /> 시작 중...</> :
                        <><CheckCircle2 className="w-4 h-4" /> {currentJob.passed_count.toLocaleString()}개 광고 등록 시작</>}
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
                    <th className="px-3 py-2 text-right">진행/전체</th>
                    <th className="px-3 py-2 text-right">통과</th>
                    <th className="px-3 py-2 text-left">캐너리</th>
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
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {j.processed_count.toLocaleString()}/{j.total_keywords.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">
                        {j.passed_count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {j.canary_evaluated_at ? (
                          <span className={j.canary_passed ? 'text-green-700' : 'text-orange-700'}>
                            {j.canary_pass_rate?.toFixed(1)}%
                          </span>
                        ) : '-'}
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
