'use client'

/**
 * 전자동 광맥 발굴 엔진 설정 UI (Stage 6)
 * 광고주당 1회: 설명 입력 → LLM 프로파일 생성 → 검수 → 저장·자동화 ON.
 * 그 뒤 백엔드 cron(발굴 10분 / 유지보수 3시간)이 무방치로 발굴·게이트·등록·정리.
 */
import { useEffect, useState, useCallback } from 'react'
import { Loader2, Sparkles, Power, ShieldCheck, Ban, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { adGet, adPost } from '@/lib/api'

interface Profile {
  description?: string
  atom_library?: Record<string, string[]>
  relevance_keywords?: string[]
  negative_keywords?: string[]
  enabled?: boolean
  min_score?: number
  target_count?: number
  discovery_cursor?: string
  last_discovery_at?: string | null
  last_maintenance_at?: string | null
}

export default function AutoVeinEngine({ customerId }: { customerId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [desc, setDesc] = useState('')
  const [minScore, setMinScore] = useState(80)
  const [target, setTarget] = useState(100000)
  // 생성된(검수 전) 프로파일
  const [draft, setDraft] = useState<Profile | null>(null)

  const qs = useCallback(
    (extra: Record<string, string | number> = {}) => {
      const p: Record<string, string> = {}
      if (customerId) p.customer_id = customerId
      Object.entries(extra).forEach(([k, v]) => (p[k] = String(v)))
      const e = Object.entries(p)
      return e.length ? '?' + e.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : ''
    },
    [customerId],
  )

  const loadProfile = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    try {
      const res = await adGet<{ success: boolean; profile: Profile }>(
        `/api/naver-ad/keyword-pool/domain-profile${qs()}`,
      )
      const p = res?.profile || null
      setProfile(p)
      if (p) {
        setDesc(p.description || '')
        if (p.min_score) setMinScore(p.min_score)
        if (p.target_count) setTarget(p.target_count)
      }
    } catch {
      /* 미연동 등 — 조용히 */
    } finally {
      setLoading(false)
    }
  }, [customerId, qs])

  useEffect(() => {
    loadProfile()
    setDraft(null)
  }, [loadProfile])

  const handleGenerate = async () => {
    if (!desc.trim()) {
      toast.error('사업 설명을 입력하세요')
      return
    }
    setGenerating(true)
    try {
      const res = await adPost<{ success: boolean; profile?: Profile; message?: string }>(
        `/api/naver-ad/keyword-pool/domain-profile/generate${qs()}`,
        { description: desc.trim(), target_count: target },
      )
      if (!res?.success || !res.profile) {
        toast.error(res?.message || 'AI 프로파일 생성 실패')
        return
      }
      setDraft(res.profile)
      toast.success('프로파일 생성 완료 — 검수 후 저장하세요')
    } catch (e) {
      toast.error('생성 실패: ' + String(e).slice(0, 80))
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async (enable: boolean) => {
    const src = draft || profile
    if (!src) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        description: desc.trim(),
        min_score: minScore,
        target_count: target,
        enabled: enable,
      }
      // draft(신규 생성)면 atom/relevance/negative 도 저장. 기존 프로파일 토글만이면 생략.
      if (draft) {
        body.atom_library = draft.atom_library || {}
        body.negative_keywords = draft.negative_keywords || []
        // relevance 는 기존이 있으면 보존(빈 배열 덮어쓰기 방지) — 있을 때만 저장
        if ((draft.relevance_keywords || []).length) body.relevance_keywords = draft.relevance_keywords
      }
      const res = await adPost<{ success: boolean; profile: Profile }>(
        `/api/naver-ad/keyword-pool/domain-profile/save${qs()}`,
        body,
      )
      setProfile(res?.profile || null)
      setDraft(null)
      toast.success(enable ? '저장 + 자동화 ON ✅' : '저장 완료')
    } catch (e) {
      toast.error('저장 실패: ' + String(e).slice(0, 80))
    } finally {
      setSaving(false)
    }
  }

  const enabled = !!profile?.enabled
  const view = draft || profile
  const atomAxes = view?.atom_library ? Object.entries(view.atom_library) : []
  const comboEst = atomAxes.reduce((acc, [, v]) => acc * Math.max(1, (v as string[]).length), 1)

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-bold text-gray-900">전자동 광맥 발굴 엔진</h3>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {enabled ? '● 자동화 ON' : '○ OFF'}
        </span>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        사업 설명 한 줄만 넣으면 AI가 키워드 사전을 만들고, 이후 손 안 대도 관련성 80점 이상 키워드를
        자동 발굴·등록하고 무관 키워드는 자동 제외합니다.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
        </div>
      ) : (
        <>
          {/* 설명 입력 */}
          <label className="mb-1 block text-sm font-medium text-gray-700">사업 설명</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            placeholder="예: 의료인 대상 대출 — 병원 개원자금, 약사대출, 한의사대출, 의사 신용대출"
            className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI 프로파일 생성
            </button>
            <label className="text-xs text-gray-500">
              관련성 게이트
              <input
                type="number"
                value={minScore}
                min={0}
                max={95}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="ml-1 w-16 rounded border border-gray-300 px-1 py-0.5 text-sm"
              />
              점 이상
            </label>
            <label className="text-xs text-gray-500">
              목표
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="ml-1 w-24 rounded border border-gray-300 px-1 py-0.5 text-sm"
              />
              개
            </label>
          </div>

          {/* 검수 프리뷰 */}
          {view && (atomAxes.length > 0 || (view.relevance_keywords || []).length > 0) && (
            <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
              {draft && (
                <div className="text-xs font-semibold text-amber-600">⚠ 생성됨 — 검수 후 저장하세요</div>
              )}
              {atomAxes.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-gray-700">
                    원자 사전 (조합 약 {comboEst.toLocaleString()}개)
                  </div>
                  {atomAxes.map(([axis, items]) => (
                    <div key={axis} className="mb-1 text-xs text-gray-600">
                      <span className="font-semibold text-indigo-600">[{axis}] {(items as string[]).length}개</span>{' '}
                      {(items as string[]).slice(0, 12).join(', ')}
                      {(items as string[]).length > 12 ? '…' : ''}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                관련성 기준 <b>{(view.relevance_keywords || []).length}</b>개
              </div>
              {(view.negative_keywords || []).length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                    <Ban className="h-3.5 w-3.5 text-red-500" /> 제외 키워드 (drift 차단) {(view.negative_keywords || []).length}개
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(view.negative_keywords || []).slice(0, 24).map((n) => (
                      <span key={n} className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-600">
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 저장 / ON·OFF */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!enabled ? (
              <button
                onClick={() => handleSave(true)}
                disabled={saving || !view}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                저장 + 자동화 켜기
              </button>
            ) : (
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                자동화 끄기
              </button>
            )}
            {draft && (
              <button
                onClick={() => handleSave(enabled)}
                disabled={saving}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                저장만 (ON 유지)
              </button>
            )}
            <button
              onClick={loadProfile}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-gray-400 hover:text-gray-600"
              title="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* 진행 상태 */}
          {enabled && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500 sm:grid-cols-3">
              <div>게이트: <b>≥{profile?.min_score ?? 80}점</b></div>
              <div>목표: <b>{(profile?.target_count ?? 0).toLocaleString()}</b>개</div>
              <div>발굴 진행: <b>{profile?.discovery_cursor || '0'}</b> 조합</div>
              <div className="col-span-2 sm:col-span-3">
                마지막 발굴 {profile?.last_discovery_at ? new Date(profile.last_discovery_at + 'Z').toLocaleString() : '—'}
                {' · '}정리 {profile?.last_maintenance_at ? new Date(profile.last_maintenance_at + 'Z').toLocaleString() : '—'}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
