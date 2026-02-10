'use client'

import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Globe, FileText, ShoppingCart, DollarSign } from 'lucide-react'

const NODE_STYLES: Record<string, { bg: string; border: string; headerBg: string; icon: any; label: string }> = {
  traffic: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    headerBg: 'bg-blue-500',
    icon: Globe,
    label: '유입',
  },
  content: {
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    headerBg: 'bg-purple-500',
    icon: FileText,
    label: '콘텐츠',
  },
  conversion: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    headerBg: 'bg-amber-500',
    icon: ShoppingCart,
    label: '전환',
  },
  revenue: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    headerBg: 'bg-green-500',
    icon: DollarSign,
    label: '매출',
  },
}

interface FunnelNodeData {
  label: string
  traffic?: number
  conversionRate?: number
  onDataChange?: (id: string, data: Partial<FunnelNodeData>) => void
}

function FunnelNode({ id, data, type }: NodeProps<FunnelNodeData>) {
  const style = NODE_STYLES[type || 'traffic']
  const Icon = style.icon
  const [isEditing, setIsEditing] = useState(false)
  const [editLabel, setEditLabel] = useState(data.label || '')
  const [editTraffic, setEditTraffic] = useState(String(data.traffic || 0))
  const [editRate, setEditRate] = useState(String(data.conversionRate || 0))

  const rateColor = (data.conversionRate || 0) >= 5
    ? 'text-green-600'
    : (data.conversionRate || 0) >= 2
    ? 'text-amber-600'
    : 'text-red-600'

  const handleSave = () => {
    data.onDataChange?.(id, {
      label: editLabel,
      traffic: Number(editTraffic),
      conversionRate: Number(editRate),
    })
    setIsEditing(false)
  }

  return (
    <div className={`rounded-xl border-2 ${style.border} ${style.bg} shadow-md min-w-[180px] max-w-[220px]`}>
      {/* Header */}
      <div className={`${style.headerBg} text-white px-3 py-1.5 rounded-t-[10px] flex items-center gap-2`}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{style.label}</span>
      </div>

      {/* Body */}
      <div className="p-3" onDoubleClick={() => setIsEditing(true)}>
        {isEditing ? (
          <div className="space-y-2">
            <input
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="w-full px-2 py-1 border rounded text-xs"
              placeholder="이름"
              autoFocus
            />
            <div className="flex gap-2">
              <input
                type="number"
                value={editTraffic}
                onChange={(e) => setEditTraffic(e.target.value)}
                className="w-1/2 px-2 py-1 border rounded text-xs"
                placeholder="트래픽"
              />
              <input
                type="number"
                value={editRate}
                onChange={(e) => setEditRate(e.target.value)}
                className="w-1/2 px-2 py-1 border rounded text-xs"
                placeholder="전환율%"
                step="0.1"
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                className="flex-1 px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
              >
                확인
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="font-medium text-sm text-gray-900 mb-2">{data.label}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">트래픽</span>
              <span className="font-medium">{(data.traffic || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-500">전환율</span>
              <span className={`font-medium ${rateColor}`}>{data.conversionRate || 0}%</span>
            </div>
          </>
        )}
      </div>

      {/* Handles */}
      {type !== 'traffic' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
      />
    </div>
  )
}

export const TrafficNode = memo((props: NodeProps) => <FunnelNode {...props} type="traffic" />)
TrafficNode.displayName = 'TrafficNode'

export const ContentNode = memo((props: NodeProps) => <FunnelNode {...props} type="content" />)
ContentNode.displayName = 'ContentNode'

export const ConversionNode = memo((props: NodeProps) => <FunnelNode {...props} type="conversion" />)
ConversionNode.displayName = 'ConversionNode'

export const RevenueNode = memo((props: NodeProps) => <FunnelNode {...props} type="revenue" />)
RevenueNode.displayName = 'RevenueNode'

export const nodeTypes = {
  traffic: TrafficNode,
  content: ContentNode,
  conversion: ConversionNode,
  revenue: RevenueNode,
}
