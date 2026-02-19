'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

// ── 타입 정의 ──

export interface Particle {
  id: number
  x: number
  y: number
  fromNodeId: string
  toNodeId: string | null
  progress: number          // 0~1 엣지 위 진행도
  state: 'spawning' | 'moving' | 'arriving' | 'deciding' | 'passed' | 'dropped'
  opacity: number
  trail: { x: number; y: number }[]
  stateTimer: number        // 상태 전환용 타이머 (ms)
  velocityY: number         // dropped 상태의 낙하 속도
}

export interface SimStats {
  totalSpawned: number
  totalPassed: number       // revenue 노드 도달
  totalDropped: number
  nodeStats: Map<string, { arrived: number; passed: number; dropped: number }>
  isRunning: boolean
  isComplete: boolean
  progress: number          // 0~100
}

export interface NodeCoord {
  id: string
  x: number
  y: number
  type: string
  label: string
  conversionRate: number
}

export interface EdgeInfo {
  source: string
  target: string
  flow: number
}

interface SimulationConfig {
  totalParticles: number    // 50 / 100 / 200
  speed: number             // 1 / 2 / 4
}

// ── 좌표 변환 유틸 ──

function computeNodeCoords(
  nodes: any[],
  canvasWidth: number,
  canvasHeight: number,
  padding: number = 80
): NodeCoord[] {
  if (!nodes.length) return []

  const positions = nodes.map(n => ({
    x: n.position?.x ?? 0,
    y: n.position?.y ?? 0,
  }))

  const minX = Math.min(...positions.map(p => p.x))
  const maxX = Math.max(...positions.map(p => p.x))
  const minY = Math.min(...positions.map(p => p.y))
  const maxY = Math.max(...positions.map(p => p.y))

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1

  const scaleX = (canvasWidth - padding * 2) / rangeX
  const scaleY = (canvasHeight - padding * 2) / rangeY
  const scale = Math.min(scaleX, scaleY, 2) // cap scale

  const offsetX = (canvasWidth - rangeX * scale) / 2
  const offsetY = (canvasHeight - rangeY * scale) / 2

  return nodes.map(n => ({
    id: n.id,
    x: ((n.position?.x ?? 0) - minX) * scale + offsetX,
    y: ((n.position?.y ?? 0) - minY) * scale + offsetY,
    type: n.type || 'content',
    label: n.data?.label || n.id,
    conversionRate: n.data?.conversionRate ?? 80,
  }))
}

// ── 훅 본체 ──

export function useSimulationEngine(
  funnelData: { nodes: any[]; edges: any[] }
) {
  const particlesRef = useRef<Particle[]>([])
  const animFrameRef = useRef<number | null>(null)
  const spawnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTimeRef = useRef<number>(0)
  const spawnedCountRef = useRef(0)
  const configRef = useRef<SimulationConfig>({ totalParticles: 100, speed: 1 })
  const pausedRef = useRef(false)
  const nodeCoordsCacheRef = useRef<NodeCoord[]>([])
  const edgeFlowRef = useRef<Map<string, number>>(new Map())
  const nextIdRef = useRef(0)
  const hudIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [stats, setStats] = useState<SimStats>({
    totalSpawned: 0,
    totalPassed: 0,
    totalDropped: 0,
    nodeStats: new Map(),
    isRunning: false,
    isComplete: false,
    progress: 0,
  })

  // 노드 좌표 가져오기
  const getNodeCoords = useCallback(() => nodeCoordsCacheRef.current, [])

  // 엣지 흐름 가져오기
  const getEdgeFlows = useCallback((): EdgeInfo[] => {
    return (funnelData.edges || []).map((e: any) => ({
      source: e.source,
      target: e.target,
      flow: edgeFlowRef.current.get(`${e.source}-${e.target}`) || 0,
    }))
  }, [funnelData.edges])

  // 파티클 배열 가져오기
  const getParticles = useCallback(() => particlesRef.current, [])

  // 트래픽 노드(시작) 찾기
  const findTrafficNodes = useCallback(() => {
    return nodeCoordsCacheRef.current.filter(n => n.type === 'traffic')
  }, [])

  // 다음 노드 찾기 (엣지 기반)
  const findNextNodes = useCallback((nodeId: string): string[] => {
    return (funnelData.edges || [])
      .filter((e: any) => e.source === nodeId)
      .map((e: any) => e.target)
  }, [funnelData.edges])

  // 노드 좌표 조회
  const getNodeById = useCallback((nodeId: string): NodeCoord | undefined => {
    return nodeCoordsCacheRef.current.find(n => n.id === nodeId)
  }, [])

  // 파티클 스폰
  const spawnBatch = useCallback(() => {
    const config = configRef.current
    const trafficNodes = findTrafficNodes()
    if (!trafficNodes.length) return

    const remaining = config.totalParticles - spawnedCountRef.current
    const batchSize = Math.min(10, remaining)
    if (batchSize <= 0) return

    for (let i = 0; i < batchSize; i++) {
      const sourceNode = trafficNodes[Math.floor(Math.random() * trafficNodes.length)]
      const nextNodeIds = findNextNodes(sourceNode.id)
      const toNodeId = nextNodeIds.length > 0
        ? nextNodeIds[Math.floor(Math.random() * nextNodeIds.length)]
        : null

      const particle: Particle = {
        id: nextIdRef.current++,
        x: sourceNode.x + (Math.random() - 0.5) * 10,
        y: sourceNode.y + (Math.random() - 0.5) * 10,
        fromNodeId: sourceNode.id,
        toNodeId,
        progress: 0,
        state: 'spawning',
        opacity: 0,
        trail: [],
        stateTimer: 0,
        velocityY: 0,
      }
      particlesRef.current.push(particle)
      spawnedCountRef.current++
    }
  }, [findTrafficNodes, findNextNodes])

  // 통계 갱신 (HUD용, 10fps)
  const syncStats = useCallback(() => {
    const particles = particlesRef.current
    const config = configRef.current

    const nodeStatsMap = new Map<string, { arrived: number; passed: number; dropped: number }>()
    let totalPassed = 0
    let totalDropped = 0

    for (const p of particles) {
      // 현재 노드 통계
      if (p.state === 'arriving' || p.state === 'deciding') {
        const entry = nodeStatsMap.get(p.fromNodeId) || { arrived: 0, passed: 0, dropped: 0 }
        entry.arrived++
        nodeStatsMap.set(p.fromNodeId, entry)
      }
      if (p.state === 'passed') {
        totalPassed++
      }
      if (p.state === 'dropped') {
        totalDropped++
      }
    }

    // 완료된 파티클 수 (passed or dropped or 화면 밖)
    const finalized = particles.filter(p =>
      p.state === 'passed' || (p.state === 'dropped' && p.opacity <= 0)
    ).length

    const isComplete = spawnedCountRef.current >= config.totalParticles && finalized >= spawnedCountRef.current

    // revenue 노드에 도달한 수 계산
    const revenueNodeIds = new Set(
      nodeCoordsCacheRef.current.filter(n => n.type === 'revenue').map(n => n.id)
    )
    let revenueReached = 0
    for (const p of particles) {
      if (p.state === 'passed' && revenueNodeIds.has(p.fromNodeId)) {
        revenueReached++
      }
    }

    // 노드별 통과/이탈 집계
    for (const p of particles) {
      if (!nodeStatsMap.has(p.fromNodeId)) {
        nodeStatsMap.set(p.fromNodeId, { arrived: 0, passed: 0, dropped: 0 })
      }
    }

    // 누적 통계 업데이트
    const cumulativeNodeStats = new Map<string, { arrived: number; passed: number; dropped: number }>()
    for (const p of particles) {
      const key = p.fromNodeId
      if (!cumulativeNodeStats.has(key)) {
        cumulativeNodeStats.set(key, { arrived: 0, passed: 0, dropped: 0 })
      }
      const entry = cumulativeNodeStats.get(key)!
      entry.arrived++
      if (p.state === 'passed' || (p.state === 'moving' && p.fromNodeId !== key)) {
        entry.passed++
      }
      if (p.state === 'dropped') {
        entry.dropped++
      }
    }

    setStats({
      totalSpawned: spawnedCountRef.current,
      totalPassed: revenueReached,
      totalDropped: particles.filter(p => p.state === 'dropped').length,
      nodeStats: cumulativeNodeStats,
      isRunning: !isComplete,
      isComplete,
      progress: config.totalParticles > 0
        ? Math.min(100, Math.round((finalized / config.totalParticles) * 100))
        : 0,
    })
  }, [])

  // 게임 루프 (매 프레임)
  const tick = useCallback((timestamp: number) => {
    if (pausedRef.current) {
      animFrameRef.current = requestAnimationFrame(tick)
      return
    }

    const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) : 16
    lastTimeRef.current = timestamp
    const speed = configRef.current.speed
    const effectiveDt = dt * speed

    const particles = particlesRef.current

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.stateTimer += effectiveDt

      switch (p.state) {
        case 'spawning': {
          // 0.3초 팽창 + 페이드인
          const spawnDuration = 300
          const t = Math.min(p.stateTimer / spawnDuration, 1)
          p.opacity = t
          if (t >= 1) {
            p.state = p.toNodeId ? 'moving' : 'passed'
            p.stateTimer = 0
            p.progress = 0
          }
          break
        }
        case 'moving': {
          // 엣지 따라 이동
          const targetNode = p.toNodeId ? getNodeById(p.toNodeId) : null
          const sourceNode = getNodeById(p.fromNodeId)

          if (!targetNode || !sourceNode) {
            p.state = 'passed'
            break
          }

          // 속도: 약 2초에 엣지 하나 통과 (1x 기준)
          const moveDuration = 2000
          p.progress = Math.min(p.progress + (effectiveDt / moveDuration), 1)

          // lerp 보간
          p.x = sourceNode.x + (targetNode.x - sourceNode.x) * p.progress
          p.y = sourceNode.y + (targetNode.y - sourceNode.y) * p.progress

          // 트레일 업데이트
          p.trail.push({ x: p.x, y: p.y })
          if (p.trail.length > 5) p.trail.shift()

          p.opacity = 1

          if (p.progress >= 1) {
            // 도착
            p.state = 'arriving'
            p.stateTimer = 0
            p.fromNodeId = p.toNodeId!
            p.toNodeId = null
            p.x = targetNode.x
            p.y = targetNode.y
            // 엣지 흐름 기록
            const edgeKey = `${sourceNode.id}-${targetNode.id}`
            edgeFlowRef.current.set(edgeKey, (edgeFlowRef.current.get(edgeKey) || 0) + 1)
          }
          break
        }
        case 'arriving': {
          // 0.2초 깜빡임
          const arriveDuration = 200
          const t = p.stateTimer / arriveDuration
          p.opacity = 0.5 + Math.sin(t * Math.PI * 4) * 0.5

          if (p.stateTimer >= arriveDuration) {
            p.state = 'deciding'
            p.stateTimer = 0
            p.opacity = 1
          }
          break
        }
        case 'deciding': {
          // 확률 판정
          const node = getNodeById(p.fromNodeId)
          const rate = node?.conversionRate ?? 80

          // revenue 노드면 항상 통과(완료)
          if (node?.type === 'revenue') {
            p.state = 'passed'
            p.stateTimer = 0
            break
          }

          const roll = Math.random() * 100
          if (roll < rate) {
            // 통과 → 다음 노드로
            const nextNodeIds = findNextNodes(p.fromNodeId)
            if (nextNodeIds.length > 0) {
              p.toNodeId = nextNodeIds[Math.floor(Math.random() * nextNodeIds.length)]
              p.state = 'moving'
              p.progress = 0
              p.stateTimer = 0
              p.trail = []
            } else {
              // 더 이상 엣지 없음 → 완료
              p.state = 'passed'
              p.stateTimer = 0
            }
          } else {
            // 이탈
            p.state = 'dropped'
            p.stateTimer = 0
            p.velocityY = 0
          }
          break
        }
        case 'dropped': {
          // 아래로 떨어지며 페이드
          p.velocityY += effectiveDt * 0.005
          p.y += p.velocityY
          p.opacity = Math.max(0, p.opacity - effectiveDt * 0.002)
          if (p.opacity <= 0) {
            p.opacity = 0
          }
          break
        }
        case 'passed': {
          // 완료 → 살짝 커지며 페이드
          p.opacity = Math.max(0, p.opacity - effectiveDt * 0.003)
          if (p.opacity <= 0) {
            p.opacity = 0
          }
          break
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(tick)
  }, [getNodeById, findNextNodes])

  // 시뮬레이션 시작
  const start = useCallback((config: SimulationConfig, canvasWidth: number, canvasHeight: number) => {
    // 초기화
    particlesRef.current = []
    spawnedCountRef.current = 0
    nextIdRef.current = 0
    edgeFlowRef.current.clear()
    lastTimeRef.current = 0
    pausedRef.current = false
    configRef.current = config

    // 노드 좌표 계산
    nodeCoordsCacheRef.current = computeNodeCoords(
      funnelData.nodes || [],
      canvasWidth,
      canvasHeight
    )

    setStats({
      totalSpawned: 0,
      totalPassed: 0,
      totalDropped: 0,
      nodeStats: new Map(),
      isRunning: true,
      isComplete: false,
      progress: 0,
    })

    // 배치 스폰: 0.3초 간격
    const spawnInterval = 300 / config.speed
    spawnTimerRef.current = setInterval(() => {
      if (!pausedRef.current) {
        spawnBatch()
        if (spawnedCountRef.current >= config.totalParticles && spawnTimerRef.current) {
          clearInterval(spawnTimerRef.current)
          spawnTimerRef.current = null
        }
      }
    }, spawnInterval)

    // HUD 동기화 (10fps)
    hudIntervalRef.current = setInterval(syncStats, 100)

    // 애니메이션 시작
    animFrameRef.current = requestAnimationFrame(tick)
  }, [funnelData.nodes, spawnBatch, syncStats, tick])

  // 일시정지/재개
  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current
  }, [])

  const isPaused = useCallback(() => pausedRef.current, [])

  // 속도 변경
  const setSpeed = useCallback((speed: number) => {
    configRef.current = { ...configRef.current, speed }
  }, [])

  // 중지
  const stop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (spawnTimerRef.current) {
      clearInterval(spawnTimerRef.current)
      spawnTimerRef.current = null
    }
    if (hudIntervalRef.current) {
      clearInterval(hudIntervalRef.current)
      hudIntervalRef.current = null
    }
    pausedRef.current = false

    // 최종 통계 동기화
    syncStats()
  }, [syncStats])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (spawnTimerRef.current) clearInterval(spawnTimerRef.current)
      if (hudIntervalRef.current) clearInterval(hudIntervalRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  return {
    stats,
    start,
    stop,
    togglePause,
    isPaused,
    setSpeed,
    getParticles,
    getNodeCoords,
    getEdgeFlows,
  }
}
