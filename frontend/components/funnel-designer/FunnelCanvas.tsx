'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import {
  Plus, RotateCcw, Layout, ChevronDown
} from 'lucide-react'
import toast from 'react-hot-toast'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr'

// ReactFlow는 브라우저 API(window, document)를 사용하므로 SSR 비활성화
const ReactFlowWrapper = dynamic(() => import('./ReactFlowCanvas'), { ssr: false })

interface FunnelCanvasProps {
  funnelData: { nodes: any[]; edges: any[] }
  onFunnelDataChange: (data: { nodes: any[]; edges: any[] }) => void
  currentIndustry: string
  onIndustryChange: (industry: string) => void
}

interface TemplateInfo {
  id: string
  name: string
  description: string
}

export default function FunnelCanvas({
  funnelData,
  onFunnelDataChange,
  currentIndustry,
  onIndustryChange,
}: FunnelCanvasProps) {
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)
  const [templateList, setTemplateList] = useState<Record<string, TemplateInfo[]>>({})

  useEffect(() => {
    loadTemplateList()
  }, [])

  const loadTemplateList = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/funnel-designer/templates`)
      if (res.ok) {
        const data = await res.json()
        setTemplateList(data.templates || {})
      }
    } catch (error) {
      console.error('Failed to load templates:', error)
    }
  }

  const applyTemplate = async (industry: string, templateId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/funnel-designer/templates/${encodeURIComponent(industry)}`)
      if (res.ok) {
        const data = await res.json()
        const template = data.templates?.find((t: any) => t.id === templateId)
        if (template) {
          onFunnelDataChange({
            nodes: template.nodes,
            edges: template.edges,
          })
          onIndustryChange(industry)
          toast.success(`"${template.name}" 템플릿이 적용되었습니다`)
        }
      }
    } catch (error) {
      toast.error('템플릿 불러오기 실패')
    }
    setShowTemplateMenu(false)
  }

  const addNode = (type: string) => {
    const labels: Record<string, string> = {
      traffic: '새 유입 채널',
      content: '새 콘텐츠',
      conversion: '새 전환 포인트',
      revenue: '새 매출',
    }
    const newNode = {
      id: `n${Date.now()}`,
      type,
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { label: labels[type] || '새 노드', traffic: 0, conversionRate: 0 },
    }
    onFunnelDataChange({
      nodes: [...funnelData.nodes, newNode],
      edges: funnelData.edges,
    })
    setShowAddMenu(false)
  }

  const clearCanvas = () => {
    onFunnelDataChange({ nodes: [], edges: [] })
    toast.success('캔버스가 초기화되었습니다')
  }

  return (
    <div className="space-y-4">
      {/* 툴바 */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 flex-wrap">
        {/* 노드 추가 */}
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition text-sm"
          >
            <Plus className="w-4 h-4" />
            노드 추가
            <ChevronDown className="w-3 h-3" />
          </button>
          {showAddMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border z-50 min-w-[160px]">
              {[
                { type: 'traffic', label: '유입 채널', color: 'text-blue-600' },
                { type: 'content', label: '콘텐츠', color: 'text-purple-600' },
                { type: 'conversion', label: '전환 포인트', color: 'text-amber-600' },
                { type: 'revenue', label: '매출', color: 'text-green-600' },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => addNode(item.type)}
                  className={`w-full text-left px-4 py-2 hover:bg-gray-50 text-sm ${item.color} first:rounded-t-lg last:rounded-b-lg`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 템플릿 적용 */}
        <div className="relative">
          <button
            onClick={() => setShowTemplateMenu(!showTemplateMenu)}
            className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
          >
            <Layout className="w-4 h-4" />
            템플릿
            <ChevronDown className="w-3 h-3" />
          </button>
          {showTemplateMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border z-50 min-w-[280px] max-h-80 overflow-y-auto">
              {Object.entries(templateList).map(([industry, templates]) => (
                <div key={industry}>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-400 bg-gray-50">{industry}</p>
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(industry, t.id)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0"
                    >
                      <p className="font-medium text-gray-900">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.description}</p>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 초기화 */}
        <button
          onClick={clearCanvas}
          className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          초기화
        </button>

        <div className="flex-1" />

        <span className="text-xs text-gray-400">
          노드 {funnelData.nodes?.length || 0}개 · 연결 {funnelData.edges?.length || 0}개
          {currentIndustry && ` · ${currentIndustry}`}
        </span>
      </div>

      {/* ReactFlow 캔버스 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ height: '600px' }}>
        <ReactFlowWrapper
          funnelData={funnelData}
          onFunnelDataChange={onFunnelDataChange}
        />
      </div>

      <p className="text-xs text-gray-400 text-center">
        더블클릭으로 노드 데이터 편집 · 노드끼리 드래그하여 연결 · 마우스 휠로 줌
      </p>
    </div>
  )
}
