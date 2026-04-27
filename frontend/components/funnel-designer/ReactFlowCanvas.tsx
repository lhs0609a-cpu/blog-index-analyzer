'use client'

import { useCallback, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Connection,
  NodeChange,
  EdgeChange,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { nodeTypes } from './FunnelCanvasNodes'

interface ReactFlowCanvasProps {
  funnelData: { nodes: any[]; edges: any[] }
  onFunnelDataChange: (data: { nodes: any[]; edges: any[] }) => void
}

const defaultEdgeOptions = {
  animated: true,
  style: { strokeWidth: 2, stroke: '#94a3b8' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
}

export default function ReactFlowCanvas({ funnelData, onFunnelDataChange }: ReactFlowCanvasProps) {
  // 노드 데이터 변경 핸들러 (더블클릭 편집용)
  const handleNodeDataChange = useCallback((nodeId: string, newData: any) => {
    const updatedNodes = funnelData.nodes.map((n: any) =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n
    )
    onFunnelDataChange({ nodes: updatedNodes, edges: funnelData.edges })
  }, [funnelData, onFunnelDataChange])

  // 노드에 onDataChange 콜백 주입
  const nodesWithCallbacks = useMemo(() =>
    (funnelData.nodes || []).map((n: any) => ({
      ...n,
      data: { ...n.data, onDataChange: handleNodeDataChange },
    })),
    [funnelData.nodes, handleNodeDataChange]
  )

  // React Flow의 모든 노드 변경 처리 (position, dimensions, select, remove 등)
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const currentNodes = funnelData.nodes || []
    const updatedNodes = applyNodeChanges(changes, currentNodes)
    onFunnelDataChange({ nodes: updatedNodes, edges: funnelData.edges })
  }, [funnelData, onFunnelDataChange])

  // React Flow의 모든 엣지 변경 처리
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const currentEdges = funnelData.edges || []
    const updatedEdges = applyEdgeChanges(changes, currentEdges)
    onFunnelDataChange({ nodes: funnelData.nodes, edges: updatedEdges })
  }, [funnelData, onFunnelDataChange])

  const onConnect = useCallback((params: Connection) => {
    // 중복 엣지 방지 (같은 source→target 이미 존재하면 무시)
    const existing = (funnelData.edges || []).find(
      (e: any) => e.source === params.source && e.target === params.target
    )
    if (existing) return

    const newEdge = {
      ...params,
      id: `e${params.source}-${params.target}-${Date.now()}`,
      animated: true,
    }
    onFunnelDataChange({
      nodes: funnelData.nodes,
      edges: [...(funnelData.edges || []), newEdge],
    })
  }, [funnelData, onFunnelDataChange])

  return (
    <ReactFlow
      nodes={nodesWithCallbacks}
      edges={funnelData.edges || []}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      deleteKeyCode={['Backspace', 'Delete']}
      className="bg-gray-50"
    >
      <Background gap={20} size={1} color="#e5e7eb" />
      <Controls position="bottom-right" />
      <MiniMap
        nodeStrokeWidth={3}
        nodeColor={(n) => {
          switch (n.type) {
            case 'traffic': return '#3b82f6'
            case 'content': return '#8b5cf6'
            case 'conversion': return '#f59e0b'
            case 'revenue': return '#22c55e'
            default: return '#94a3b8'
          }
        }}
        position="bottom-left"
      />
    </ReactFlow>
  )
}
