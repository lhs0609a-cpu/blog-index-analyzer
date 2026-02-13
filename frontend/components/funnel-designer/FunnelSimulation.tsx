'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Play, Pause, Square, Zap, Users, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { useSimulationEngine } from './useSimulationEngine'
import SimulationOverlay from './SimulationOverlay'
import SimulationResults from './SimulationResults'

interface FunnelSimulationProps {
  funnelData: { nodes: any[]; edges: any[] }
}

type Phase = 'setup' | 'running' | 'complete'

const PARTICLE_OPTIONS = [50, 100, 200] as const
const SPEED_OPTIONS = [1, 2, 4] as const

export default function FunnelSimulation({ funnelData }: FunnelSimulationProps) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [totalParticles, setTotalParticles] = useState<number>(100)
  const [speed, setSpeed] = useState<number>(1)
  const [paused, setPaused] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 })

  const engine = useSimulationEngine(funnelData)

  const hasNodes = (funnelData.nodes?.length || 0) > 0
  const hasTrafficNode = funnelData.nodes?.some((n: any) => n.type === 'traffic')
  const hasEdges = (funnelData.edges?.length || 0) > 0

  // 컨테이너 크기 측정
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setCanvasSize({ width: rect.width, height: Math.max(400, rect.height) })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // 완료 감지
  useEffect(() => {
    if (phase === 'running' && engine.stats.isComplete) {
      engine.stop()
      setPhase('complete')
    }
  }, [phase, engine.stats.isComplete, engine])

  const handleStart = useCallback(() => {
    setPhase('running')
    setPaused(false)
    engine.start(
      { totalParticles, speed },
      canvasSize.width,
      canvasSize.height
    )
  }, [totalParticles, speed, canvasSize, engine])

  const handlePause = useCallback(() => {
    engine.togglePause()
    setPaused(p => !p)
  }, [engine])

  const handleStop = useCallback(() => {
    engine.stop()
    setPhase('complete')
  }, [engine])

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed)
    engine.setSpeed(newSpeed)
  }, [engine])

  const handleRestart = useCallback(() => {
    engine.stop()
    setPhase('setup')
    setPaused(false)
  }, [engine])

  // ── 설정 화면 ──
  if (phase === 'setup') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4">
              <Play className="w-8 h-8 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">퍼널 시뮬레이션</h2>
            <p className="text-gray-500 mt-2">
              가상 사용자를 퍼널에 흘려보내 병목현상과 이탈 지점을 시각화합니다
            </p>
          </div>

          {!hasNodes ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">퍼널 캔버스에서 먼저 노드를 추가해주세요</p>
              <p className="text-sm text-gray-400 mt-1">캔버스 탭에서 퍼널을 설계한 후 시뮬레이션을 실행할 수 있습니다</p>
            </div>
          ) : !hasTrafficNode ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-amber-300 mx-auto mb-3" />
              <p className="text-gray-500">유입(Traffic) 노드가 필요합니다</p>
              <p className="text-sm text-gray-400 mt-1">시뮬레이션은 유입 노드에서 파티클을 생성합니다</p>
            </div>
          ) : !hasEdges ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-amber-300 mx-auto mb-3" />
              <p className="text-gray-500">노드 간 연결(엣지)이 필요합니다</p>
              <p className="text-sm text-gray-400 mt-1">캔버스에서 노드를 연결한 후 시뮬레이션을 실행하세요</p>
            </div>
          ) : (
            <>
              {/* 총 유입 수 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Users className="w-4 h-4 inline mr-1" />
                  총 유입 수
                </label>
                <div className="flex gap-3">
                  {PARTICLE_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setTotalParticles(opt)}
                      className={`flex-1 py-3 rounded-lg border text-sm font-medium transition ${
                        totalParticles === opt
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      {opt}명
                    </button>
                  ))}
                </div>
              </div>

              {/* 속도 */}
              <div className="mb-8">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Zap className="w-4 h-4 inline mr-1" />
                  시뮬레이션 속도
                </label>
                <div className="flex gap-3">
                  {SPEED_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setSpeed(opt)}
                      className={`flex-1 py-3 rounded-lg border text-sm font-medium transition ${
                        speed === opt
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      {opt}x
                    </button>
                  ))}
                </div>
              </div>

              {/* 퍼널 요약 */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>노드 수: {funnelData.nodes.length}개</span>
                  <span>엣지 수: {funnelData.edges.length}개</span>
                  <span>유입 노드: {funnelData.nodes.filter((n: any) => n.type === 'traffic').length}개</span>
                </div>
              </div>

              {/* 시작 버튼 */}
              <button
                onClick={handleStart}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold text-lg hover:from-purple-700 hover:to-indigo-700 transition flex items-center justify-center gap-2"
              >
                <Play className="w-6 h-6" />
                시뮬레이션 시작
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── 실행 중 ──
  if (phase === 'running') {
    return (
      <div className="space-y-4">
        {/* HUD 상단 */}
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              시뮬레이션 진행 중
            </h3>
            <span className="text-sm text-gray-500">{engine.stats.progress}%</span>
          </div>
          {/* 진행률 바 */}
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${engine.stats.progress}%` }}
            />
          </div>
          {/* 실시간 카운터 */}
          <div className="flex gap-6 text-sm">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="text-gray-500">유입</span>
              <span className="font-bold text-gray-900">{engine.stats.totalSpawned}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-gray-500">매출 도달</span>
              <span className="font-bold text-green-600">{engine.stats.totalPassed}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-gray-500">이탈</span>
              <span className="font-bold text-red-500">{engine.stats.totalDropped}</span>
            </div>
          </div>
        </div>

        {/* Canvas 영역 */}
        <div
          ref={containerRef}
          className="relative bg-slate-900 rounded-xl overflow-hidden"
          style={{ height: '500px' }}
        >
          <SimulationOverlay
            getParticles={engine.getParticles}
            getNodeCoords={engine.getNodeCoords}
            getEdgeFlows={engine.getEdgeFlows}
            isRunning={engine.stats.isRunning}
            canvasWidth={canvasSize.width}
            canvasHeight={500}
          />
        </div>

        {/* 하단 컨트롤 */}
        <div className="bg-white rounded-xl border p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* 속도 조절 */}
            {SPEED_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => handleSpeedChange(opt)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  speed === opt
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt}x
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePause}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {paused ? '재개' : '일시정지'}
            </button>
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition text-sm"
            >
              <Square className="w-4 h-4" />
              중지
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── 완료 ──
  return (
    <SimulationResults
      stats={engine.stats}
      nodeCoords={engine.getNodeCoords()}
      onRestart={handleRestart}
    />
  )
}
