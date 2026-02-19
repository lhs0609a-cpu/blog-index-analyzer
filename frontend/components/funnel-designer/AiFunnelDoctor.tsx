'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Stethoscope, RefreshCw, AlertTriangle, AlertCircle, Info,
  Lightbulb, TrendingUp, Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api/client'

interface AiFunnelDoctorProps {
  funnelId: number | null
  funnelData: { nodes: any[]; edges: any[] }
}

interface DiagnosisIssue {
  issue: string
  severity: string
  description: string
  suggestion: string
  estimated_impact: string
}

interface DiagnosisResult {
  diagnosis: DiagnosisIssue[]
  summary: string
  overall_rating?: string
}

interface DiagnosisHistory {
  id: number
  diagnosis_type: string
  result_data: DiagnosisResult
  created_at: string
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; icon: any; badge: string }> = {
  high: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: AlertTriangle, badge: 'bg-red-100 text-red-700' },
  medium: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: AlertCircle, badge: 'bg-amber-100 text-amber-700' },
  low: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: Info, badge: 'bg-blue-100 text-blue-700' },
}

export default function AiFunnelDoctor({ funnelId, funnelData }: AiFunnelDoctorProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DiagnosisResult | null>(null)
  const [history, setHistory] = useState<DiagnosisHistory[]>([])
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (funnelId) loadHistory()
  }, [funnelId])

  const loadHistory = async () => {
    if (!funnelId) return
    try {
      const { data } = await apiClient.get(`/api/funnel-designer/funnels/${funnelId}/diagnoses?diagnosis_type=doctor`)
      setHistory(data.diagnoses || [])
    } catch {
      // apiClient handles error display
    }
  }

  const [showSaveGuide, setShowSaveGuide] = useState(false)

  const runDiagnosis = async () => {
    if (!funnelId) {
      setShowSaveGuide(true)
      return
    }
    setShowSaveGuide(false)
    if (!funnelData.nodes?.length) {
      toast.error('퍼널에 노드가 없습니다')
      return
    }

    setLoading(true)
    try {
      const { data } = await apiClient.post(`/api/funnel-designer/funnels/${funnelId}/ai-doctor`)
      if (data.success) {
        setResult(data.result)
        toast.success('AI 진단 완료!')
        loadHistory()
      } else {
        toast.error(data.message || '진단 실패')
      }
    } catch {
      // apiClient handles error display
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 진단 시작 */}
      <div className="bg-white rounded-xl p-6 shadow-sm text-center">
        <Stethoscope className="w-12 h-12 text-purple-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold mb-2">AI 퍼널 닥터</h3>
        <p className="text-sm text-gray-500 mb-4">
          GPT가 퍼널 구조의 논리적 허점을 진단하고 개선안을 제시합니다
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={runDiagnosis}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50 font-medium"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Stethoscope className="w-5 h-5" />}
            {loading ? '진단 중...' : '진단 시작'}
          </button>
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="inline-flex items-center gap-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
            >
              <Clock className="w-4 h-4" />
              이력 ({history.length})
            </button>
          )}
        </div>
        {showSaveGuide && (
          <p className="mt-3 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            상단의 <strong>'저장'</strong> 버튼을 눌러 퍼널을 먼저 저장해주세요.
          </p>
        )}
      </div>

      {/* 진단 이력 */}
      {showHistory && history.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h4 className="font-semibold mb-3">진단 이력</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => { setResult(h.result_data); setShowHistory(false) }}
                className="w-full text-left p-3 rounded-lg hover:bg-gray-50 border text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {h.result_data.overall_rating && `[${h.result_data.overall_rating}] `}
                    이슈 {h.result_data.diagnosis?.length || 0}건
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(h.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{h.result_data.summary}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 진단 결과 */}
      {result && (
        <>
          {/* 요약 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl p-6 text-white"
          >
            <div className="flex items-start gap-3">
              <Lightbulb className="w-6 h-6 mt-0.5 flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold">진단 요약</h4>
                  {result.overall_rating && (
                    <span className="px-2 py-0.5 bg-white/20 rounded text-sm font-medium">
                      {result.overall_rating}등급
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/90">{result.summary}</p>
              </div>
            </div>
          </motion.div>

          {/* 이슈 카드 */}
          <div className="space-y-4">
            {(result.diagnosis || []).map((issue, i) => {
              const style = SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.low
              const Icon = style.icon
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`rounded-xl border ${style.border} ${style.bg} overflow-hidden`}
                >
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 mt-0.5 ${style.text} flex-shrink-0`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h5 className="font-semibold text-gray-900">{issue.issue}</h5>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.badge}`}>
                            {issue.severity === 'high' ? '심각' : issue.severity === 'medium' ? '주의' : '참고'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{issue.description}</p>

                        <div className="bg-white/60 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">개선 방안</p>
                          <p className="text-sm text-gray-800">{issue.suggestion}</p>
                        </div>

                        {issue.estimated_impact && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                            <TrendingUp className="w-3 h-3" />
                            예상 효과: {issue.estimated_impact}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </>
      )}

      {/* 빈 상태 */}
      {!result && !loading && (
        <div className="text-center py-12 text-gray-400">
          <Stethoscope className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>퍼널 캔버스에서 퍼널을 설계한 후 AI 진단을 받아보세요</p>
        </div>
      )}
    </div>
  )
}
