'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Loader2, FileText, Phone } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { adGet, adPost, adDelete, adPatch } from '@/lib/api'

interface Template {
  id: number
  headline_pc: string
  description_pc: string
  display_url: string
  final_url_pc: string
  is_active: number
  used_count: number
  last_used_at: string | null
}

interface Extension {
  id: number
  kind: string
  payload: any
  is_active: number
}

interface ListResponse {
  success: boolean
  templates: Template[]
  extensions: Extension[]
}

export default function AdTemplatesPage() {
  const { isAuthenticated } = useAuthStore()
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showExtForm, setShowExtForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // 템플릿 폼
  const [tpl, setTpl] = useState({
    headline_pc: '',
    description_pc: '',
    display_url: '',
    final_url_pc: '',
  })

  // 확장소재 폼
  const [extKind, setExtKind] = useState('PHONE_NUMBER')
  const [extPayloadStr, setExtPayloadStr] = useState('{"phoneNumber":"02-1234-5678"}')

  const load = async () => {
    setLoading(true)
    try {
      const res = await adGet<ListResponse>('/api/naver-ad/ad-templates')
      setData(res)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '로드 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) load()
  }, [isAuthenticated])

  const handleCreateTpl = async () => {
    if (!tpl.headline_pc || !tpl.description_pc || !tpl.display_url || !tpl.final_url_pc) {
      toast.error('필수 항목을 모두 입력하세요')
      return
    }
    setSubmitting(true)
    try {
      await adPost('/api/naver-ad/ad-templates', tpl)
      toast.success('템플릿 추가됨')
      setTpl({ headline_pc: '', description_pc: '', display_url: '', final_url_pc: '' })
      setShowForm(false)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '추가 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggle = async (id: number, currentActive: boolean) => {
    try {
      await adPatch(`/api/naver-ad/ad-templates/${id}/active?is_active=${!currentActive}`, {})
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '실패')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return
    try {
      await adDelete(`/api/naver-ad/ad-templates/${id}`)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '삭제 실패')
    }
  }

  const handleCreateExt = async () => {
    let payload: any
    try {
      payload = JSON.parse(extPayloadStr)
    } catch {
      toast.error('payload는 valid JSON이어야 합니다')
      return
    }
    setSubmitting(true)
    try {
      await adPost('/api/naver-ad/ad-templates/extensions', { kind: extKind, payload })
      toast.success('확장소재 추가됨')
      setShowExtForm(false)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '추가 실패')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteExt = async (id: number) => {
    if (!confirm('확장소재를 삭제하시겠습니까?')) return
    try {
      await adDelete(`/api/naver-ad/ad-templates/extensions/${id}`)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || '실패')
    }
  }

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

        <h1 className="text-3xl font-bold text-gray-900 mb-2">소재 템플릿</h1>
        <p className="text-gray-600 mb-6">
          광고그룹 자동 생성 시 라운드로빈으로 매칭. 템플릿 N개 등록하면 균등 분배됩니다.
        </p>

        {/* 템플릿 목록 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#0064FF]" />
              <h2 className="text-lg font-bold text-gray-900">
                일반 소재 (T&D) — {data?.templates?.length ?? 0}개
              </h2>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-[#0064FF] text-white rounded-lg hover:shadow-md"
            >
              <Plus className="w-4 h-4" />
              {showForm ? '취소' : '템플릿 추가'}
            </button>
          </div>

          {showForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 space-y-3">
              <input
                type="text"
                placeholder="제목 (PC, 최대 15자)"
                maxLength={15}
                value={tpl.headline_pc}
                onChange={(e) => setTpl({ ...tpl, headline_pc: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
              <textarea
                placeholder="설명 (PC, 최대 45자)"
                maxLength={45}
                rows={2}
                value={tpl.description_pc}
                onChange={(e) => setTpl({ ...tpl, description_pc: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="표시 URL (예: example.com)"
                value={tpl.display_url}
                onChange={(e) => setTpl({ ...tpl, display_url: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="연결 URL (예: https://example.com/landing)"
                value={tpl.final_url_pc}
                onChange={(e) => setTpl({ ...tpl, final_url_pc: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
              <button
                onClick={handleCreateTpl}
                disabled={submitting}
                className="w-full px-4 py-2 bg-[#0064FF] text-white rounded-lg font-medium disabled:bg-gray-300"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : '추가'}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {(data?.templates ?? []).map((t) => (
              <div
                key={t.id}
                className={`border rounded-lg p-3 ${
                  t.is_active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-gray-900 truncate">
                      {t.headline_pc}
                    </div>
                    <div className="text-xs text-gray-600 truncate">{t.description_pc}</div>
                    <div className="text-xs text-gray-400 mt-1 truncate">
                      {t.display_url} · 사용 {t.used_count}회
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(t.id, !!t.is_active)}
                      className={`text-xs px-2 py-1 rounded ${
                        t.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {t.is_active ? '활성' : '비활성'}
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!loading && (data?.templates?.length ?? 0) === 0 && (
              <div className="text-center text-sm text-gray-500 py-6">
                등록된 템플릿 없음. 추가하지 않으면 광고그룹 생성 시 소재가 자동 등록되지
                않습니다 (광고 노출 0).
              </div>
            )}
          </div>
        </div>

        {/* 확장소재 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">
                확장소재 — {data?.extensions?.length ?? 0}개
              </h2>
            </div>
            <button
              onClick={() => setShowExtForm(!showExtForm)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:shadow-md"
            >
              <Plus className="w-4 h-4" />
              {showExtForm ? '취소' : '확장소재 추가'}
            </button>
          </div>

          {showExtForm && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4 space-y-3">
              <select
                value={extKind}
                onChange={(e) => setExtKind(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              >
                <option value="PHONE_NUMBER">전화번호</option>
                <option value="DESCRIPTION_EXTENSION">부가설명</option>
                <option value="SUBLINK">서브링크</option>
                <option value="PRICE_LINK">가격링크</option>
              </select>
              <textarea
                rows={4}
                value={extPayloadStr}
                onChange={(e) => setExtPayloadStr(e.target.value)}
                placeholder='{"phoneNumber":"02-1234-5678"} 같은 JSON'
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono"
              />
              <button
                onClick={handleCreateExt}
                disabled={submitting}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg font-medium disabled:bg-gray-300"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : '추가'}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {(data?.extensions ?? []).map((e) => (
              <div key={e.id} className="border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wider text-purple-600 font-bold">
                    {e.kind}
                  </div>
                  <pre className="text-xs text-gray-600 mt-1 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(e.payload, null, 0)}
                  </pre>
                </div>
                <button
                  onClick={() => handleDeleteExt(e.id)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {!loading && (data?.extensions?.length ?? 0) === 0 && (
              <div className="text-center text-sm text-gray-500 py-4">
                확장소재 없음. 전화번호·부가설명을 추가하면 광고그룹마다 자동으로 함께 등록됩니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
