'use client'

import { useState, useEffect, useCallback } from 'react'
import { getApiUrl } from '@/lib/api/apiConfig'
import {
  Sparkles, Loader2, FileText, Plus, Trash2, RefreshCw,
  Star, TrendingUp, TrendingDown, AlertTriangle, Copy, Check,
  Search, X, ChevronDown, ChevronUp, Swords
} from 'lucide-react'
import toast from 'react-hot-toast'

// ===== Interfaces =====

interface InsightReport {
  summary: string
  strengths: string[]
  weaknesses: string[]
  improvements: Array<{ title: string; description: string; priority: string }>
  risk_alert?: string | null
  positive_highlight?: string
  recommended_actions: string[]
}

interface CompetitorAnalysis {
  position: string
  advantages: string[]
  disadvantages: string[]
  strategies: Array<{ title: string; description: string }>
  benchmark?: string
}

interface Competitor {
  id: string
  competitor_name: string
  naver_place_id?: string
  cached_rating: number
  cached_review_count: number
  cached_negative_count: number
  last_checked_at?: string
}

interface Template {
  id: string
  template_name: string
  template_text: string
  tone: string
  category?: string
  created_at: string
}

interface StoreInfo {
  id: string
  store_name: string
}

interface PlaceResult {
  place_id: string
  name: string
  category: string
  address: string
  road_address: string
  rating: string
}

export default function ReportPage() {
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // AI 인사이트
  const [report, setReport] = useState<InsightReport | null>(null)
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null)
  const [generatingReport, setGeneratingReport] = useState(false)

  // 경쟁업체
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [competitorAnalysis, setCompetitorAnalysis] = useState<CompetitorAnalysis | null>(null)
  const [analyzingCompetitor, setAnalyzingCompetitor] = useState(false)
  const [showAddCompetitor, setShowAddCompetitor] = useState(false)
  const [compSearchQuery, setCompSearchQuery] = useState('')
  const [compSearchResults, setCompSearchResults] = useState<PlaceResult[]>([])
  const [compSearching, setCompSearching] = useState(false)
  const [addingComp, setAddingComp] = useState(false)

  // 답변 템플릿
  const [templates, setTemplates] = useState<Template[]>([])
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [tplName, setTplName] = useState('')
  const [tplText, setTplText] = useState('')
  const [tplTone, setTplTone] = useState('professional')
  const [tplCategory, setTplCategory] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [copiedTpl, setCopiedTpl] = useState<string | null>(null)

  // 탭
  const [activeTab, setActiveTab] = useState<'insight' | 'competitor' | 'template'>('insight')

  useEffect(() => {
    const loadStores = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/reputation/stores?user_id=demo_user`)
        const data = await res.json()
        if (data.success && data.stores.length > 0) {
          setStores(data.stores)
          setStoreId(data.stores[0].id)
        }
      } catch {
        console.error('Failed to load stores')
      } finally {
        setLoading(false)
      }
    }
    loadStores()
  }, [])

  // 인사이트 리포트 로드
  const fetchReport = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/report/${storeId}`)
      const data = await res.json()
      if (data.success && data.report) {
        setReport(data.report)
        setReportGeneratedAt(data.generated_at)
      }
    } catch {
      console.error('Failed to fetch report')
    }
  }, [storeId])

  // 경쟁업체 로드
  const fetchCompetitors = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/competitors?store_id=${storeId}`)
      const data = await res.json()
      if (data.success) setCompetitors(data.competitors)
    } catch {
      console.error('Failed to fetch competitors')
    }
  }, [storeId])

  // 템플릿 로드
  const fetchTemplates = useCallback(async () => {
    if (!storeId) return
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/templates?store_id=${storeId}`)
      const data = await res.json()
      if (data.success) setTemplates(data.templates)
    } catch {
      console.error('Failed to fetch templates')
    }
  }, [storeId])

  useEffect(() => {
    if (storeId) {
      fetchReport()
      fetchCompetitors()
      fetchTemplates()
    }
  }, [storeId, fetchReport, fetchCompetitors, fetchTemplates])

  // ===== AI 인사이트 =====
  const generateReport = async () => {
    if (!storeId) return
    setGeneratingReport(true)
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/report/generate?store_id=${storeId}`, { method: 'POST' })
      const data = await res.json()
      if (data.success && data.report) {
        setReport(data.report)
        setReportGeneratedAt(new Date().toISOString())
        toast.success('AI 인사이트 리포트가 생성되었습니다')
      } else {
        toast.error(data.message || '리포트 생성 실패')
      }
    } catch {
      toast.error('리포트 생성 중 오류')
    } finally {
      setGeneratingReport(false)
    }
  }

  // ===== 경쟁업체 =====
  const searchCompetitors = async () => {
    if (!compSearchQuery.trim()) return
    setCompSearching(true)
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/search-place?query=${encodeURIComponent(compSearchQuery)}&platform=naver`)
      const data = await res.json()
      if (data.success) setCompSearchResults(data.places)
    } catch {
      toast.error('검색 실패')
    } finally {
      setCompSearching(false)
    }
  }

  const addCompetitor = async (place: PlaceResult) => {
    if (!storeId) return
    setAddingComp(true)
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/competitors?store_id=${storeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitor_name: place.name,
          naver_place_id: place.place_id,
          category: place.category,
          address: place.road_address || place.address,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${place.name} 경쟁업체 등록 완료`)
        setShowAddCompetitor(false)
        setCompSearchQuery('')
        setCompSearchResults([])
        fetchCompetitors()
      }
    } catch {
      toast.error('등록 실패')
    } finally {
      setAddingComp(false)
    }
  }

  const deleteCompetitor = async (id: string) => {
    if (!confirm('이 경쟁업체를 삭제할까요?')) return
    try {
      await fetch(`${getApiUrl()}/api/reputation/competitors/${id}`, { method: 'DELETE' })
      setCompetitors(prev => prev.filter(c => c.id !== id))
      toast.success('삭제 완료')
    } catch {
      toast.error('삭제 실패')
    }
  }

  const refreshCompetitor = async (id: string) => {
    try {
      toast.loading('통계 갱신 중...', { id: 'refresh-comp' })
      await fetch(`${getApiUrl()}/api/reputation/competitors/${id}/refresh`, { method: 'POST' })
      toast.success('갱신 완료', { id: 'refresh-comp' })
      fetchCompetitors()
    } catch {
      toast.error('갱신 실패', { id: 'refresh-comp' })
    }
  }

  const analyzeCompetitors = async () => {
    if (!storeId) return
    setAnalyzingCompetitor(true)
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/report/competitor-analysis?store_id=${storeId}`, { method: 'POST' })
      const data = await res.json()
      if (data.success && data.analysis) {
        setCompetitorAnalysis(data.analysis)
        toast.success('경쟁 분석 완료')
      } else {
        toast.error(data.message || '분석 실패')
      }
    } catch {
      toast.error('분석 중 오류')
    } finally {
      setAnalyzingCompetitor(false)
    }
  }

  // ===== 답변 템플릿 =====
  const saveTemplate = async () => {
    if (!storeId || !tplName.trim() || !tplText.trim()) return
    setSavingTemplate(true)
    try {
      if (editingTemplate) {
        const res = await fetch(`${getApiUrl()}/api/reputation/templates/${editingTemplate}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_name: tplName, template_text: tplText, tone: tplTone, category: tplCategory || null }),
        })
        const data = await res.json()
        if (data.success) {
          toast.success('템플릿 수정 완료')
        }
      } else {
        const res = await fetch(`${getApiUrl()}/api/reputation/templates?store_id=${storeId}&user_id=demo_user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_name: tplName, template_text: tplText, tone: tplTone, category: tplCategory || null }),
        })
        const data = await res.json()
        if (data.success) {
          toast.success('템플릿 생성 완료')
        }
      }
      resetTemplateForm()
      fetchTemplates()
    } catch {
      toast.error('저장 실패')
    } finally {
      setSavingTemplate(false)
    }
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm('이 템플릿을 삭제할까요?')) return
    try {
      await fetch(`${getApiUrl()}/api/reputation/templates/${id}`, { method: 'DELETE' })
      setTemplates(prev => prev.filter(t => t.id !== id))
      toast.success('삭제 완료')
    } catch {
      toast.error('삭제 실패')
    }
  }

  const startEditTemplate = (t: Template) => {
    setEditingTemplate(t.id)
    setTplName(t.template_name)
    setTplText(t.template_text)
    setTplTone(t.tone)
    setTplCategory(t.category || '')
    setShowAddTemplate(true)
  }

  const resetTemplateForm = () => {
    setShowAddTemplate(false)
    setEditingTemplate(null)
    setTplName('')
    setTplText('')
    setTplTone('professional')
    setTplCategory('')
  }

  const copyTemplate = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedTpl(id)
    toast.success('복사됨')
    setTimeout(() => setCopiedTpl(null), 2000)
  }

  const priorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'bg-red-100 text-red-700'
      case 'medium': return 'bg-yellow-100 text-yellow-700'
      default: return 'bg-green-100 text-green-700'
    }
  }

  const toneLabel = (t: string) => {
    switch (t) {
      case 'professional': return '전문적'
      case 'friendly': return '친근한'
      case 'apologetic': return '사과'
      default: return t
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#0064FF] animate-spin" />
      </div>
    )
  }

  if (stores.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">가게를 먼저 등록하세요</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 가게 선택 + 서브 탭 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {stores.length > 1 && (
            <select
              value={storeId || ''}
              onChange={e => setStoreId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.store_name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-1">
            {([
              { key: 'insight' as const, label: 'AI 인사이트', icon: Sparkles },
              { key: 'competitor' as const, label: '경쟁업체 비교', icon: Swords },
              { key: 'template' as const, label: '답변 템플릿', icon: FileText },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-[#0064FF] text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== AI 인사이트 탭 ===== */}
      {activeTab === 'insight' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#0064FF]" />
                AI 인사이트 리포트
              </h2>
              {reportGeneratedAt && (
                <p className="text-xs text-gray-400 mt-0.5">
                  최근 생성: {new Date(reportGeneratedAt).toLocaleDateString('ko-KR')} {new Date(reportGeneratedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <button
              onClick={generateReport}
              disabled={generatingReport}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50"
            >
              {generatingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generatingReport ? '분석 중...' : '리포트 생성'}
            </button>
          </div>

          {!report && !generatingReport && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">아직 생성된 리포트가 없습니다</p>
              <p className="text-sm text-gray-400 mt-1">위 버튼을 눌러 AI 인사이트를 생성하세요</p>
            </div>
          )}

          {report && (
            <>
              {/* 요약 */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
                <h3 className="font-semibold text-blue-800 mb-2">전체 요약</h3>
                <p className="text-sm text-blue-700 leading-relaxed">{report.summary}</p>
              </div>

              {/* 위험 알림 */}
              {report.risk_alert && (
                <div className="bg-red-50 rounded-xl border border-red-200 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-red-800 text-sm">시급한 주의 필요</h4>
                    <p className="text-sm text-red-700 mt-0.5">{report.risk_alert}</p>
                  </div>
                </div>
              )}

              {/* 강점/약점 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-green-200 p-5">
                  <h3 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    강점
                  </h3>
                  <ul className="space-y-2">
                    {report.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5 flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-red-200 p-5">
                  <h3 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4" />
                    약점
                  </h3>
                  <ul className="space-y-2">
                    {report.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 flex-shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 개선 포인트 */}
              {report.improvements && report.improvements.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-800 mb-4">개선 포인트</h3>
                  <div className="space-y-3">
                    {report.improvements.map((imp, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${priorityColor(imp.priority)}`}>
                          {imp.priority === 'high' ? '긴급' : imp.priority === 'medium' ? '보통' : '낮음'}
                        </span>
                        <div>
                          <h4 className="font-medium text-gray-800 text-sm">{imp.title}</h4>
                          <p className="text-xs text-gray-600 mt-0.5">{imp.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 이번 주 실행 액션 */}
              {report.recommended_actions && report.recommended_actions.length > 0 && (
                <div className="bg-[#0064FF]/5 rounded-xl border border-[#0064FF]/20 p-6">
                  <h3 className="font-semibold text-[#0064FF] mb-3">이번 주 실행할 액션</h3>
                  <ol className="space-y-2">
                    {report.recommended_actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                        <span className="flex-shrink-0 w-6 h-6 bg-[#0064FF] text-white rounded-full flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        {a}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ===== 경쟁업체 탭 ===== */}
      {activeTab === 'competitor' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Swords className="w-5 h-5 text-[#0064FF]" />
              경쟁업체 비교
            </h2>
            <div className="flex gap-2">
              {competitors.length > 0 && (
                <button
                  onClick={analyzeCompetitors}
                  disabled={analyzingCompetitor}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white rounded-lg text-xs font-medium hover:shadow-md disabled:opacity-50"
                >
                  {analyzingCompetitor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  AI 경쟁 분석
                </button>
              )}
              <button
                onClick={() => setShowAddCompetitor(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50"
              >
                <Plus className="w-3.5 h-3.5" />
                경쟁업체 추가
              </button>
            </div>
          </div>

          {/* 경쟁업체 카드 */}
          {competitors.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Swords className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">등록된 경쟁업체가 없습니다</p>
              <p className="text-sm text-gray-400 mt-1">주변 경쟁 가게를 등록하여 비교 분석하세요</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {competitors.map(comp => (
                <div key={comp.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 text-sm">{comp.competitor_name}</h3>
                    <div className="flex items-center gap-1">
                      <button onClick={() => refreshCompetitor(comp.id)} className="p-1 text-gray-400 hover:text-[#0064FF]">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteCompetitor(comp.id)} className="p-1 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">평점</span>
                      <span className="flex items-center gap-1 text-sm font-bold text-yellow-600">
                        <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                        {comp.cached_rating || '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">리뷰 수</span>
                      <span className="text-sm font-medium text-gray-700">{comp.cached_review_count}건</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">부정 리뷰</span>
                      <span className="text-sm font-medium text-red-600">{comp.cached_negative_count}건</span>
                    </div>
                  </div>
                  {comp.last_checked_at && (
                    <p className="text-[10px] text-gray-400 mt-2">
                      마지막 확인: {new Date(comp.last_checked_at).toLocaleDateString('ko-KR')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* AI 경쟁 분석 결과 */}
          {competitorAnalysis && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0064FF]" />
                AI 경쟁 분석 결과
              </h3>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <p className="text-sm text-blue-800 font-medium">{competitorAnalysis.position}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-green-700 mb-2">경쟁 우위</h4>
                  <ul className="space-y-1">
                    {competitorAnalysis.advantages.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5 flex-shrink-0" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-red-700 mb-2">열위 요소</h4>
                  <ul className="space-y-1">
                    {competitorAnalysis.disadvantages.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 flex-shrink-0" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {competitorAnalysis.strategies && competitorAnalysis.strategies.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-800 mb-2">추천 전략</h4>
                  <div className="space-y-2">
                    {competitorAnalysis.strategies.map((s, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3">
                        <h5 className="font-medium text-sm text-gray-800">{s.title}</h5>
                        <p className="text-xs text-gray-600 mt-0.5">{s.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {competitorAnalysis.benchmark && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                  <span className="font-medium">벤치마크:</span> {competitorAnalysis.benchmark}
                </p>
              )}
            </div>
          )}

          {/* 경쟁업체 추가 모달 */}
          {showAddCompetitor && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddCompetitor(false)}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">경쟁업체 추가</h2>
                  <button onClick={() => setShowAddCompetitor(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={compSearchQuery}
                    onChange={e => setCompSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchCompetitors()}
                    placeholder="경쟁 가게명 검색"
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30"
                  />
                  <button onClick={searchCompetitors} disabled={compSearching} className="px-4 py-2.5 bg-[#0064FF] text-white rounded-lg text-sm font-medium disabled:opacity-50">
                    {compSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2">
                  {compSearchResults.map((place, idx) => (
                    <div key={`${place.place_id}-${idx}`} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-[#0064FF]">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="font-medium text-gray-800 text-sm">{place.name}</div>
                        <div className="text-xs text-gray-500 truncate">{place.road_address || place.address}</div>
                      </div>
                      <button
                        onClick={() => addCompetitor(place)}
                        disabled={addingComp}
                        className="px-3 py-1.5 bg-[#0064FF] text-white rounded-md text-xs font-medium disabled:opacity-50 flex-shrink-0"
                      >
                        {addingComp ? '추가 중...' : '추가'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 답변 템플릿 탭 ===== */}
      {activeTab === 'template' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#0064FF]" />
              답변 템플릿
            </h2>
            <button
              onClick={() => { resetTemplateForm(); setShowAddTemplate(true) }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#0064FF] text-white rounded-lg text-xs font-medium hover:bg-[#0052CC]"
            >
              <Plus className="w-3.5 h-3.5" />
              새 템플릿
            </button>
          </div>

          {/* 템플릿 생성/편집 폼 */}
          {showAddTemplate && (
            <div className="bg-white rounded-xl shadow-sm border border-[#0064FF]/30 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">
                {editingTemplate ? '템플릿 수정' : '새 템플릿 만들기'}
              </h3>
              <input
                type="text"
                value={tplName}
                onChange={e => setTplName(e.target.value)}
                placeholder="템플릿 이름 (예: 음식 불만 답변)"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30"
              />
              <textarea
                value={tplText}
                onChange={e => setTplText(e.target.value)}
                placeholder="답변 템플릿 내용을 입력하세요..."
                rows={4}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30 resize-none"
              />
              <div className="flex gap-3">
                <select value={tplTone} onChange={e => setTplTone(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="professional">전문적</option>
                  <option value="friendly">친근한</option>
                  <option value="apologetic">사과</option>
                </select>
                <select value={tplCategory} onChange={e => setTplCategory(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">카테고리 (선택)</option>
                  <option value="food">음식/맛</option>
                  <option value="service">서비스</option>
                  <option value="hygiene">위생</option>
                  <option value="price">가격</option>
                  <option value="positive">긍정 답변</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={saveTemplate} disabled={savingTemplate} className="px-5 py-2 bg-[#0064FF] text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {savingTemplate ? '저장 중...' : editingTemplate ? '수정 완료' : '저장'}
                </button>
                <button onClick={resetTemplateForm} className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                  취소
                </button>
              </div>
            </div>
          )}

          {/* 템플릿 목록 */}
          {templates.length === 0 && !showAddTemplate ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">저장된 템플릿이 없습니다</p>
              <p className="text-sm text-gray-400 mt-1">자주 사용하는 답변을 템플릿으로 저장하세요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(tpl => (
                <div key={tpl.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800 text-sm">{tpl.template_name}</h3>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded-full">
                        {toneLabel(tpl.tone)}
                      </span>
                      {tpl.category && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full">
                          {tpl.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyTemplate(tpl.template_text, tpl.id)}
                        className="p-1.5 text-gray-400 hover:text-[#0064FF]"
                      >
                        {copiedTpl === tpl.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => startEditTemplate(tpl)} className="p-1.5 text-gray-400 hover:text-[#0064FF]">
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteTemplate(tpl.id)} className="p-1.5 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{tpl.template_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
