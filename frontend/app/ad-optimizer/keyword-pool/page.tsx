'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, RefreshCw, Database, Activity, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { adGet, adPost } from '@/lib/api'

interface PoolStats {
  total?: number
  by_status?: Record<string, number>
  first_discovered?: string
  last_discovered?: string
}

interface RegStats {
  total?: number
  active?: number
  ad_groups?: number
  campaigns?: number
  first_at?: string
  last_at?: string
}

interface PoolStatsResponse {
  success: boolean
  customer_id?: number
  pool: PoolStats
  registered: RegStats
  account_cap: number
  message?: string
}

export default function KeywordPoolPage() {
  const { isAuthenticated } = useAuthStore()
  const [stats, setStats] = useState<PoolStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [seedInput, setSeedInput] = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await adGet<PoolStatsResponse>('/api/naver-ad/keyword-pool/stats')
      setStats(data)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '로드 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return
    load()
    const t = setInterval(load, 30_000) // 30초마다 자동 갱신
    return () => clearInterval(t)
  }, [isAuthenticated])

  const handleAddSeeds = async () => {
    const seeds = seedInput
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!seeds.length) {
      toast.error('시드를 입력하세요')
      return
    }
    setAdding(true)
    try {
      const res = await adPost<{ success: boolean; added: number; total_input: number }>(
        '/api/naver-ad/keyword-pool/seeds',
        { seeds }
      )
      toast.success(`${res.added}개 시드 추가 (입력 ${res.total_input}개)`)
      setSeedInput('')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '추가 실패')
    } finally {
      setAdding(false)
    }
  }

  const cap = stats?.account_cap ?? 100_000
  const used = stats?.registered?.active ?? 0
  const pending = stats?.pool?.by_status?.pending ?? 0
  const registered = stats?.pool?.by_status?.registered ?? 0
  const failed = stats?.pool?.by_status?.failed ?? 0
  const usePct = Math.min(100, Math.round((used / cap) * 100))

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white pt-24 pb-12">
      <div className="max-w-5xl mx-auto px-4">
        <Link
          href="/ad-optimizer"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          광고 최적화
        </Link>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">키워드 풀 (24h 자동)</h1>
            <p className="text-gray-600 mt-1">
              씨드 → 자동 수집 → 자동 등록. 계정당 10만개 한도 자동 가드.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {/* 한도 사용량 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-5 h-5 text-[#0064FF]" />
            <h2 className="font-bold text-gray-900">계정 한도 사용량</h2>
          </div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-3xl font-bold text-gray-900">{used.toLocaleString()}</span>
            <span className="text-sm text-gray-500">/ {cap.toLocaleString()} ({usePct}%)</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                usePct >= 90 ? 'bg-red-500' : usePct >= 70 ? 'bg-yellow-500' : 'bg-[#0064FF]'
              }`}
              style={{ width: `${usePct}%` }}
            />
          </div>
          {usePct >= 90 && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              계정 한도 90% 초과 — 자동 수집 중단됨. 기존 키워드 정리 또는 다른 계정 사용 필요.
            </div>
          )}
        </div>

        {/* 풀 status */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label="대기 (pending)" value={pending} color="text-yellow-600" />
          <StatCard label="등록 완료" value={registered} color="text-green-600" />
          <StatCard label="실패" value={failed} color="text-red-600" />
        </div>

        {/* 시드 추가 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-5 h-5 text-[#0064FF]" />
            <h2 className="font-bold text-gray-900">초기 시드 추가</h2>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            자동 수집의 출발 키워드. 한 줄에 하나 또는 콤마 구분. cron이 매 15분마다
            이 시드의 연관 키워드를 발굴해 풀에 채웁니다.
          </p>
          <textarea
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            rows={5}
            placeholder={'대출\n신용대출\n사업자대출'}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm font-mono focus:ring-2 focus:ring-[#0064FF] focus:border-transparent outline-none"
            disabled={adding}
          />
          <button
            onClick={handleAddSeeds}
            disabled={adding || !seedInput.trim()}
            className="mt-3 px-4 py-2 bg-[#0064FF] text-white rounded-lg font-medium hover:shadow-lg disabled:bg-gray-300 inline-flex items-center gap-2"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            시드 추가
          </button>
        </div>

        {/* 안내 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
          <div className="flex items-start gap-2">
            <Activity className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>자동 운영 흐름</strong>
              <ul className="mt-1 text-xs space-y-0.5 list-disc pl-5">
                <li>매 15분 — 풀에 새 키워드 자동 추가 (keywordstool 연관 검색)</li>
                <li>매 15분 — pending 1,000개를 네이버에 자동 등록 (광고그룹 자동 생성)</li>
                <li>중복 키워드는 절대 재등록 안 됨 (DB UNIQUE 보장)</li>
                <li>10만개 한도 도달 시 수집/등록 자동 정지</li>
                <li>시드를 늘리면 다양성 ↑, 줄이면 특정 분야 집중 ↑</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
    </div>
  )
}
