'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  GitBranch, Calculator, Palette, Activity, Stethoscope, Users,
  RefreshCw, Save, FolderOpen, Trash2, Plus, Play
} from 'lucide-react'
import toast from 'react-hot-toast'
import apiClient from '@/lib/api/client'
import ReverseCalculator from '@/components/funnel-designer/ReverseCalculator'
import FunnelCanvas from '@/components/funnel-designer/FunnelCanvas'
import FunnelHealthScore from '@/components/funnel-designer/FunnelHealthScore'
import AiFunnelDoctor from '@/components/funnel-designer/AiFunnelDoctor'
import PersonaWalkThrough from '@/components/funnel-designer/PersonaWalkThrough'
import FunnelSimulation from '@/components/funnel-designer/FunnelSimulation'

type TabId = 'calculator' | 'canvas' | 'health' | 'doctor' | 'persona' | 'simulation'

const TABS = [
  { id: 'calculator' as TabId, label: '역산 시뮬레이터', icon: Calculator },
  { id: 'canvas' as TabId, label: '퍼널 캔버스', icon: Palette },
  { id: 'health' as TabId, label: '헬스 스코어', icon: Activity },
  { id: 'doctor' as TabId, label: 'AI 닥터', icon: Stethoscope },
  { id: 'persona' as TabId, label: '페르소나', icon: Users },
  { id: 'simulation' as TabId, label: '시뮬레이션', icon: Play },
]

interface SavedFunnel {
  id: number
  name: string
  industry?: string
  description?: string
  health_score?: number
  created_at: string
  updated_at: string
}

export default function FunnelDesignerPage() {
  const [activeTab, setActiveTab] = useState<TabId>('calculator')
  const [loading, setLoading] = useState(false)

  // 퍼널 상태
  const [currentFunnelId, setCurrentFunnelId] = useState<number | null>(null)
  const [currentFunnelName, setCurrentFunnelName] = useState('새 퍼널')
  const [currentIndustry, setCurrentIndustry] = useState<string>('')
  const [funnelData, setFunnelData] = useState<any>({ nodes: [], edges: [] })
  const [savedFunnels, setSavedFunnels] = useState<SavedFunnel[]>([])
  const [showFunnelList, setShowFunnelList] = useState(false)

  const funnelListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (funnelListRef.current && !funnelListRef.current.contains(e.target as Node)) {
        setShowFunnelList(false)
      }
    }
    if (showFunnelList) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFunnelList])

  const loadFunnelList = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/funnel-designer/funnels')
      setSavedFunnels(data.funnels || [])
    } catch {
      // apiClient handles error toasts
    }
  }, [])

  useEffect(() => {
    loadFunnelList()
  }, [loadFunnelList])

  const saveFunnel = async () => {
    if (!funnelData.nodes?.length) {
      toast.error('캔버스에 노드를 추가한 후 저장하세요')
      return
    }

    setLoading(true)
    try {
      const body = {
        name: currentFunnelName,
        industry: currentIndustry || null,
        funnel_data: funnelData,
      }
      if (currentFunnelId) {
        await apiClient.put(`/api/funnel-designer/funnels/${currentFunnelId}`, body)
        toast.success('퍼널이 저장되었습니다')
      } else {
        const { data } = await apiClient.post('/api/funnel-designer/funnels', body)
        setCurrentFunnelId(data.funnel_id)
        toast.success('새 퍼널이 생성되었습니다')
      }
      loadFunnelList()
    } catch {
      // apiClient handles error display
    } finally {
      setLoading(false)
    }
  }

  const loadFunnel = async (funnelId: number) => {
    setLoading(true)
    try {
      const { data } = await apiClient.get(`/api/funnel-designer/funnels/${funnelId}`)
      const funnel = data.funnel
      setCurrentFunnelId(funnel.id)
      setCurrentFunnelName(funnel.name)
      setCurrentIndustry(funnel.industry || '')
      setFunnelData(funnel.funnel_data)
      setShowFunnelList(false)
      toast.success(`"${funnel.name}" 불러오기 완료`)
    } catch {
      // apiClient handles error display
    } finally {
      setLoading(false)
    }
  }

  const deleteFunnel = async (funnelId: number) => {
    if (!confirm('정말로 이 퍼널을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
    try {
      await apiClient.delete(`/api/funnel-designer/funnels/${funnelId}`)
      if (currentFunnelId === funnelId) {
        setCurrentFunnelId(null)
        setCurrentFunnelName('새 퍼널')
        setFunnelData({ nodes: [], edges: [] })
      }
      toast.success('퍼널이 삭제되었습니다')
      loadFunnelList()
    } catch {
      // apiClient handles error display
    }
  }

  const newFunnel = () => {
    setCurrentFunnelId(null)
    setCurrentFunnelName('새 퍼널')
    setCurrentIndustry('')
    setFunnelData({ nodes: [], edges: [] })
    toast.success('새 퍼널이 생성되었습니다')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <GitBranch className="w-8 h-8" />
                <h1 className="text-3xl font-bold">퍼널 디자이너</h1>
              </div>
              <p className="text-purple-100">
                마케팅 퍼널을 시각적으로 설계하고, AI가 진단합니다
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* 퍼널 이름 */}
              <input
                type="text"
                value={currentFunnelName}
                onChange={(e) => setCurrentFunnelName(e.target.value)}
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 text-sm w-48"
                placeholder="퍼널 이름"
              />
              <button
                onClick={newFunnel}
                className="flex items-center gap-1 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition text-sm"
              >
                <Plus className="w-4 h-4" />
                새 퍼널
              </button>
              <div className="relative" ref={funnelListRef}>
                <button
                  onClick={() => setShowFunnelList(!showFunnelList)}
                  className="flex items-center gap-1 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition text-sm"
                >
                  <FolderOpen className="w-4 h-4" />
                  불러오기
                </button>
                {showFunnelList && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border z-50 max-h-80 overflow-y-auto">
                    {savedFunnels.length === 0 ? (
                      <p className="p-4 text-gray-500 text-sm text-center">저장된 퍼널이 없습니다</p>
                    ) : (
                      savedFunnels.map((f) => (
                        <div key={f.id} className="flex items-center justify-between p-3 hover:bg-gray-50 border-b last:border-b-0">
                          <button
                            onClick={() => loadFunnel(f.id)}
                            className="flex-1 text-left"
                          >
                            <p className="font-medium text-gray-900 text-sm">{f.name}</p>
                            <p className="text-xs text-gray-500">
                              {f.industry && `${f.industry} · `}
                              {f.health_score != null && `점수: ${f.health_score} · `}
                              {new Date(f.updated_at).toLocaleDateString('ko-KR')}
                            </p>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteFunnel(f.id) }}
                            className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={saveFunnel}
                disabled={loading}
                className="flex items-center gap-1 px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-purple-50 transition text-sm font-medium disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                저장
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition text-sm ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'calculator' && (
          <ReverseCalculator />
        )}
        {activeTab === 'canvas' && (
          <FunnelCanvas
            funnelData={funnelData}
            onFunnelDataChange={setFunnelData}
            currentIndustry={currentIndustry}
            onIndustryChange={setCurrentIndustry}
          />
        )}
        {activeTab === 'health' && (
          <FunnelHealthScore
            funnelId={currentFunnelId}
            funnelData={funnelData}
          />
        )}
        {activeTab === 'doctor' && (
          <AiFunnelDoctor
            funnelId={currentFunnelId}
            funnelData={funnelData}
          />
        )}
        {activeTab === 'persona' && (
          <PersonaWalkThrough
            funnelId={currentFunnelId}
            funnelData={funnelData}
          />
        )}
        {activeTab === 'simulation' && (
          <FunnelSimulation
            funnelData={funnelData}
          />
        )}
      </div>
    </div>
  )
}
