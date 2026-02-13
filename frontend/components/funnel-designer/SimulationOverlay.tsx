'use client'

import { useRef, useEffect, useCallback } from 'react'
import type { Particle, NodeCoord, EdgeInfo } from './useSimulationEngine'

interface SimulationOverlayProps {
  getParticles: () => Particle[]
  getNodeCoords: () => NodeCoord[]
  getEdgeFlows: () => EdgeInfo[]
  isRunning: boolean
  canvasWidth: number
  canvasHeight: number
}

// 노드 타입별 색상
const NODE_COLORS: Record<string, string> = {
  traffic: '#3b82f6',
  content: '#8b5cf6',
  conversion: '#f59e0b',
  revenue: '#22c55e',
}

export default function SimulationOverlay({
  getParticles,
  getNodeCoords,
  getEdgeFlows,
  isRunning,
  canvasWidth,
  canvasHeight,
}: SimulationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // HiDPI 대응
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasWidth * dpr
    canvas.height = canvasHeight * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    const nodes = getNodeCoords()
    const edges = getEdgeFlows()
    const particles = getParticles()

    // 노드 맵
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // ── 엣지 그리기 ──
    for (const edge of edges) {
      const src = nodeMap.get(edge.source)
      const tgt = nodeMap.get(edge.target)
      if (!src || !tgt) continue

      const lineWidth = Math.max(1, Math.min(6, edge.flow * 0.3))
      ctx.beginPath()
      ctx.moveTo(src.x, src.y)
      ctx.lineTo(tgt.x, tgt.y)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'
      ctx.lineWidth = lineWidth
      ctx.stroke()

      // 화살표
      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x)
      const midX = (src.x + tgt.x) / 2
      const midY = (src.y + tgt.y) / 2
      const arrowSize = 8
      ctx.beginPath()
      ctx.moveTo(
        midX + arrowSize * Math.cos(angle),
        midY + arrowSize * Math.sin(angle)
      )
      ctx.lineTo(
        midX + arrowSize * Math.cos(angle + 2.5),
        midY + arrowSize * Math.sin(angle + 2.5)
      )
      ctx.lineTo(
        midX + arrowSize * Math.cos(angle - 2.5),
        midY + arrowSize * Math.sin(angle - 2.5)
      )
      ctx.closePath()
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)'
      ctx.fill()
    }

    // ── 노드 그리기 ──
    // 노드별 대기 파티클 수 계산
    const nodeWaiting = new Map<string, number>()
    for (const p of particles) {
      if (p.state === 'arriving' || p.state === 'deciding' || p.state === 'spawning') {
        nodeWaiting.set(p.fromNodeId, (nodeWaiting.get(p.fromNodeId) || 0) + 1)
      }
    }

    // 노드별 이탈률 계산 (arrived > 0인 경우)
    const nodeDropRate = new Map<string, number>()
    const nodeArrivedCount = new Map<string, number>()
    const nodeDroppedCount = new Map<string, number>()
    for (const p of particles) {
      nodeArrivedCount.set(p.fromNodeId, (nodeArrivedCount.get(p.fromNodeId) || 0) + 1)
      if (p.state === 'dropped') {
        nodeDroppedCount.set(p.fromNodeId, (nodeDroppedCount.get(p.fromNodeId) || 0) + 1)
      }
    }
    for (const [nodeId, arrived] of nodeArrivedCount) {
      const dropped = nodeDroppedCount.get(nodeId) || 0
      if (arrived > 5) {
        nodeDropRate.set(nodeId, dropped / arrived)
      }
    }

    for (const node of nodes) {
      const color = NODE_COLORS[node.type] || '#64748b'
      const dropRate = nodeDropRate.get(node.id) || 0
      const isBottleneck = dropRate > 0.7

      // 병목 글로우
      if (isBottleneck) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, 35, 0, Math.PI * 2)
        const glow = ctx.createRadialGradient(node.x, node.y, 15, node.x, node.y, 35)
        glow.addColorStop(0, 'rgba(239, 68, 68, 0.4)')
        glow.addColorStop(1, 'rgba(239, 68, 68, 0)')
        ctx.fillStyle = glow
        ctx.fill()
      }

      // 노드 원
      ctx.beginPath()
      ctx.arc(node.x, node.y, 22, 0, Math.PI * 2)
      ctx.fillStyle = color + '20'
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()

      // 라벨
      ctx.fillStyle = '#1e293b'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(node.label, node.x, node.y + 26)

      // 대기 카운트
      const waiting = nodeWaiting.get(node.id) || 0
      if (waiting > 0) {
        ctx.fillStyle = color
        ctx.font = 'bold 10px sans-serif'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${waiting}`, node.x, node.y - 1)
      }

      // 병목 경고
      if (isBottleneck) {
        ctx.fillStyle = '#ef4444'
        ctx.font = 'bold 14px sans-serif'
        ctx.textBaseline = 'bottom'
        ctx.fillText('⚠', node.x + 22, node.y - 12)
      }

      // 전환율 표시
      ctx.fillStyle = '#64748b'
      ctx.font = '9px sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText(`${node.conversionRate}%`, node.x, node.y + 38)
    }

    // ── 파티클 그리기 ──
    for (const p of particles) {
      if (p.opacity <= 0) continue

      // 트레일 (moving 상태에서만)
      if (p.state === 'moving' && p.trail.length > 1) {
        for (let t = 0; t < p.trail.length - 1; t++) {
          const alpha = ((t + 1) / p.trail.length) * 0.3 * p.opacity
          ctx.beginPath()
          ctx.arc(p.trail[t].x, p.trail[t].y, 2, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`
          ctx.fill()
        }
      }

      // 파티클 본체
      let color: string
      let radius = 4

      switch (p.state) {
        case 'spawning':
          color = `rgba(59, 130, 246, ${p.opacity})`
          radius = 4 * p.opacity  // 팽창 효과
          break
        case 'moving':
          color = `rgba(59, 130, 246, ${p.opacity})`
          break
        case 'arriving':
          color = `rgba(234, 179, 8, ${p.opacity})`
          radius = 4 + Math.sin(p.stateTimer * 0.05) * 2  // 펄스
          break
        case 'deciding':
          color = `rgba(234, 179, 8, ${p.opacity * 0.8})`
          break
        case 'dropped':
          color = `rgba(239, 68, 68, ${p.opacity})`
          radius = 3
          break
        case 'passed':
          color = `rgba(34, 197, 94, ${p.opacity})`
          radius = 5
          break
        default:
          color = `rgba(148, 163, 184, ${p.opacity})`
      }

      ctx.beginPath()
      ctx.arc(p.x, p.y, Math.max(1, radius), 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }

    if (isRunning) {
      rafRef.current = requestAnimationFrame(draw)
    }
  }, [getParticles, getNodeCoords, getEdgeFlows, isRunning, canvasWidth, canvasHeight])

  useEffect(() => {
    if (isRunning) {
      rafRef.current = requestAnimationFrame(draw)
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [isRunning, draw])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none',
      }}
    />
  )
}
