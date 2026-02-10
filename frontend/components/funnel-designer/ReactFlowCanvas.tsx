'use client'

import { useCallback, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  MarkerType,
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
  // 노드 데이터 변경 핸들러
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

  const onNodesChange = useCallback((changes: any) => {
    // position 등 변경사항 반영
    let updatedNodes = [...(funnelData.nodes || [])]
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        updatedNodes = updatedNodes.map(n =>
          n.id === change.id ? { ...n, position: change.position } : n
        )
      }
      if (change.type === 'remove') {
        updatedNodes = updatedNodes.filter(n => n.id !== change.id)
      }
    }
    onFunnelDataChange({ nodes: updatedNodes, edges: funnelData.edges })
  }, [funnelData, onFunnelDataChange])

  const onEdgesChange = useCallback((changes: any) => {
    let updatedEdges = [...(funnelData.edges || [])]
    for (const change of changes) {
      if (change.type === 'remove') {
        updatedEdges = updatedEdges.filter(e => e.id !== change.id)
      }
    }
    onFunnelDataChange({ nodes: funnelData.nodes, edges: updatedEdges })
  }, [funnelData, onFunnelDataChange])

  const onConnect = useCallback((params: Connection) => {
    const newEdge = {
      ...params,
      id: `e${params.source}-${params.target}`,
      animated: true,
    }
    onFunnelDataChange({
      nodes: funnelData.nodes,
      edges: [...(funnelData.edges || []), newEdge],
    })
  }, [funnelData, onFunnelDataChange])

  const onNodeDragStop = useCallback((_event: any, node: Node) => {
    const updatedNodes = funnelData.nodes.map((n: any) =>
      n.id === node.id ? { ...n, position: node.position } : n
    )
    onFunnelDataChange({ nodes: updatedNodes, edges: funnelData.edges })
  }, [funnelData, onFunnelDataChange])

  return (
    <ReactFlow
      nodes={nodesWithCallbacks}
      edges={funnelData.edges || []}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDragStop={onNodeDragStop}
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
