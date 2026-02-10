'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Users, RefreshCw, User, ChevronRight, CheckCircle, XCircle,
  Lightbulb, MessageCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr'

interface PersonaWalkThroughProps {
  funnelId: number | null
  funnelData: { nodes: any[]; edges: any[] }
}

interface Persona {
  id: string
  name: string
  age: number
  gender: string
  occupation: string
  spending_habit: string
  decision_style: string
  digital_literacy: string
  preferred_channels: string[]
  pain_points: string[]
  description: string
}

interface WalkStep {
  node_id: string
  node_label: string
  reaction: string
  pass_probability: number
  drop_reason?: string | null
}

interface WalkResult {
  steps: WalkStep[]
  overall_pass_rate: number
  final_reaction?: string
  improvement_suggestions: string[]
}

export default function PersonaWalkThrough({ funnelId, funnelData }: PersonaWalkThroughProps) {
  const [personas, setPersonas] = useState<Record<string, Persona>>({})
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WalkResult | null>(null)

  useEffect(() => {
    loadPersonas()
  }, [])

  const loadPersonas = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/funnel-designer/personas`)
      if (res.ok) {
        const data = await res.json()
        setPersonas(data.personas || {})
      }
    } catch (error) {
      console.error('Failed to load personas:', error)
    }
  }

  const runSimulation = async () => {
    if (!funnelId) {
      toast.error('먼저 퍼널을 저장해주세요')
      return
    }
    if (!selectedPersona) {
      toast.error('페르소나를 선택해주세요')
      return
    }
    if (!funnelData.nodes?.length) {
      toast.error('퍼널에 노드가 없습니다')
      return
    }

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/funnel-designer/funnels/${funnelId}/persona-walkthrough?user_id=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: selectedPersona.id }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setResult(data.result)
          toast.success('시뮬레이션 완료!')
        } else {
          toast.error(data.message || '시뮬레이션 실패')
        }
      } else {
        toast.error('서버 오류')
      }
    } catch (error) {
      toast.error('시뮬레이션 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 페르소나 선택 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-500" />
          페르소나 선택
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.values(personas).map((persona) => (
            <button
              key={persona.id}
              onClick={() => { setSelectedPersona(persona); setResult(null) }}
              className={`p-3 rounded-lg border-2 text-left transition ${
                selectedPersona?.id === persona.id
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-400 flex items-center justify-center text-white text-xs font-bold">
                  {persona.name.charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-sm">{persona.name}</p>
                  <p className="text-xs text-gray-500">{persona.age}세 {persona.gender}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">{persona.occupation}</p>
              <p className="text-xs text-purple-600 mt-1">{persona.spending_habit}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 선택된 페르소나 상세 + 시뮬레이션 버튼 */}
      {selectedPersona && (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-indigo-400 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                {selectedPersona.name.charAt(0)}
              </div>
              <div>
                <h4 className="font-semibold text-lg">{selectedPersona.name}</h4>
                <p className="text-sm text-gray-500">
                  {selectedPersona.age}세 {selectedPersona.gender} · {selectedPersona.occupation}
                </p>
                <p className="text-sm text-gray-600 mt-2">{selectedPersona.description}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">{selectedPersona.spending_habit}</span>
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">{selectedPersona.decision_style}</span>
                  <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">디지털: {selectedPersona.digital_literacy}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedPersona.preferred_channels.map((ch) => (
                    <span key={ch} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">{ch}</span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={runSimulation}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50 font-medium flex-shrink-0"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5" />}
              {loading ? '시뮬레이션 중...' : '시뮬레이션 시작'}
            </button>
          </div>
        </div>
      )}

      {/* 시뮬레이션 결과 */}
      {result && (
        <>
          {/* 전체 통과율 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl p-6 text-white"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/80 mb-1">전체 통과율</p>
                <p className="text-4xl font-bold">
                  {((result.overall_pass_rate || 0) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="w-20 h-20 rounded-full border-4 border-white/30 flex items-center justify-center">
                <span className="text-2xl font-bold">
                  {(result.overall_pass_rate || 0) >= 0.3 ? '!' : (result.overall_pass_rate || 0) >= 0.1 ? '?' : 'X'}
                </span>
              </div>
            </div>
            {result.final_reaction && (
              <p className="mt-4 text-sm text-white/80 italic">"{result.final_reaction}"</p>
            )}
          </motion.div>

          {/* 단계별 여정 */}
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-purple-500" />
              단계별 여정
            </h4>
            {(result.steps || []).map((step, i) => {
              const passed = step.pass_probability >= 0.5
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`rounded-xl border p-4 ${
                    passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      passed ? 'bg-green-500' : 'bg-red-500'
                    } text-white`}>
                      {passed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{step.node_label || step.node_id}</span>
                        {i < (result.steps || []).length - 1 && (
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        )}
                      </div>

                      {/* 1인칭 반응 */}
                      <div className="bg-white/60 rounded-lg p-3 mb-2">
                        <p className="text-sm text-gray-700 italic">"{step.reaction}"</p>
                      </div>

                      {/* 통과 확률 바 */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              step.pass_probability >= 0.7 ? 'bg-green-500' :
                              step.pass_probability >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${step.pass_probability * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-12 text-right">
                          {(step.pass_probability * 100).toFixed(0)}%
                        </span>
                      </div>

                      {/* 이탈 사유 */}
                      {step.drop_reason && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          이탈 사유: {step.drop_reason}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* 개선 제안 */}
          {result.improvement_suggestions && result.improvement_suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl p-6 shadow-sm"
            >
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                개선 제안
              </h4>
              <ul className="space-y-2">
                {result.improvement_suggestions.map((sug, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span className="text-gray-700">{sug}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </>
      )}

      {/* 빈 상태 */}
      {!selectedPersona && !loading && (
        <div className="text-center py-12 text-gray-400">
          <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>위에서 페르소나를 선택하고 퍼널 시뮬레이션을 시작하세요</p>
        </div>
      )}
    </div>
  )
}
