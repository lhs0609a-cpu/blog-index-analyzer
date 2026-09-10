'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'

/**
 * 분석 진행 단계 표시.
 *
 * 왜 필요한가 — 신규 블로그 분석은 실측 24~42초가 걸린다(2026-09-10, 프로덕션
 * /api/blogs/analyze 실측: 41.9s / 40.2s / 37.3s / 24.2s). 그동안 화면이
 * "분석중입니다" 한 줄로 멈춰 있으면 체감 시간이 실제보다 훨씬 길고, 사용자는
 * 멈춘 줄 알고 이탈한다.
 *
 * ⚠️ 이 진행률은 **추정치**다. /api/blogs/analyze 는 진행 상황을 흘려보내는
 * 채널(SSE·웹소켓·job 테이블)이 없는 단일 블로킹 POST 라서, 서버가 지금 몇 %를
 * 했는지 알 방법이 없다. 그래서 두 가지를 지킨다.
 *   1) 단계 이름은 백엔드가 실제로 하는 일과 일치시킨다. 시간은 추정이어도
 *      "무엇을 하는 중인지"는 사실이어야 한다.
 *   2) 응답이 오기 전에는 절대 100% 를 찍지 않는다. 추정 시간을 넘기면 마지막
 *      단계에서 점근적으로 기어갈 뿐, 다 됐다고 거짓말하지 않는다.
 */

export interface ProgressStage {
  id: string
  /** 단계 이름. 완료된 뒤에도 목록에 남는다. */
  label: string
  /** 이 단계가 진행되는 동안 돌아가며 보여줄 문구. 한 줄짜리면 회전하지 않는다. */
  details: string[]
  /** 실측 기반 예상 소요(ms). 진행률 곡선의 눈금일 뿐 정확할 필요는 없다. */
  estimateMs: number
}

interface AnalysisProgressProps {
  stages: ProgressStage[]
  /** 분석이 진행 중인 동안 true. false 가 되면 타이머가 멈춘다. */
  running: boolean
  /** 예상 시간을 넘겼을 때 보여줄 안내. 없으면 표시하지 않는다. */
  longRunHint?: string
}

/** 화면 갱신 주기. 100ms 면 부드럽고, 40초 동안 400회라 부담도 없다. */
const TICK_MS = 100
/** 한 단계 안에서 세부 문구가 바뀌는 주기. 너무 빠르면 읽기 전에 사라진다. */
const DETAIL_ROTATE_MS = 2800
/** 추정 시간 안에서 도달할 최대 진행률. 나머지는 응답이 올 때까지 남겨둔다. */
const PROGRESS_CEILING = 90
/** 추정 시간을 넘긴 뒤 점근적으로 다가갈 상한. 100 은 응답이 와야만 찍힌다. */
const PROGRESS_ASYMPTOTE = 99

export default function AnalysisProgress({ stages, running, longRunHint }: AnalysisProgressProps) {
  const [elapsed, setElapsed] = useState(0)
  const startedAtRef = useRef<number | null>(null)

  // 단계별 누적 종료 시각. stages 가 상수라면 한 번만 계산된다.
  const { boundaries, totalEstimate } = useMemo(() => {
    let acc = 0
    const bounds = stages.map((stage) => {
      acc += stage.estimateMs
      return acc
    })
    return { boundaries: bounds, totalEstimate: acc }
  }, [stages])

  useEffect(() => {
    if (!running) {
      startedAtRef.current = null
      setElapsed(0)
      return
    }

    // Date.now 가 아니라 performance.now 를 쓴다 — 시스템 시계가 조정돼도
    // 경과 시간이 뒤로 가지 않는다.
    startedAtRef.current = performance.now()
    setElapsed(0)

    const id = setInterval(() => {
      if (startedAtRef.current === null) return
      setElapsed(performance.now() - startedAtRef.current)
    }, TICK_MS)

    return () => clearInterval(id)
  }, [running])

  // 현재 단계: 아직 끝나지 않은 첫 단계. 추정을 다 써버렸으면 마지막 단계에 머문다.
  const currentIndex = useMemo(() => {
    const found = boundaries.findIndex((end) => elapsed < end)
    return found === -1 ? stages.length - 1 : found
  }, [boundaries, elapsed, stages.length])

  const percent = useMemo(() => {
    if (totalEstimate <= 0) return 0
    if (elapsed < totalEstimate) {
      return (elapsed / totalEstimate) * PROGRESS_CEILING
    }
    // 추정을 넘긴 구간. 남은 9%를 지수적으로 갉아먹으며 99% 에 수렴한다.
    const over = elapsed - totalEstimate
    const remaining = PROGRESS_ASYMPTOTE - PROGRESS_CEILING
    return PROGRESS_CEILING + remaining * (1 - Math.exp(-over / totalEstimate))
  }, [elapsed, totalEstimate])

  const overEstimate = elapsed > totalEstimate

  const currentStage = stages[currentIndex]
  const details = currentStage?.details ?? []
  // 단계 안에서 몇 번째 문구인지. 단계가 바뀌면 그 단계의 첫 문구부터 다시 시작한다.
  const stageStartedAt = currentIndex === 0 ? 0 : boundaries[currentIndex - 1]
  const detailIndex =
    details.length > 1
      ? Math.floor(Math.max(0, elapsed - stageStartedAt) / DETAIL_ROTATE_MS) % details.length
      : 0
  const detailText = details[detailIndex] ?? ''

  return (
    <div className="mt-8 w-full max-w-md mx-auto text-left">
      {/* 진행 막대 */}
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-full"
          animate={{ width: `${percent}%` }}
          transition={{ ease: 'linear', duration: TICK_MS / 1000 }}
        />
      </div>

      <div className="flex items-center justify-between mt-2 text-sm text-gray-500 tabular-nums">
        <span>{Math.floor(percent)}%</span>
        <span>{Math.floor(elapsed / 1000)}초 경과</span>
      </div>

      {/* 단계 목록 */}
      <ul className="mt-6 space-y-3">
        {stages.map((stage, index) => {
          const done = index < currentIndex
          const active = index === currentIndex

          return (
            <li key={stage.id} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="h-4 w-4 text-[#0064FF]" aria-hidden />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#0064FF]" aria-hidden />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300" aria-hidden />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={
                    active
                      ? 'font-semibold text-gray-900'
                      : done
                        ? 'text-gray-500'
                        : 'text-gray-400'
                  }
                >
                  {stage.label}
                </p>

                {/* 세부 문구는 진행 중인 단계에만. 끝난 단계까지 남겨두면 화면이 시끄럽다. */}
                {active && detailText && (
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={detailText}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.25 }}
                      className="mt-0.5 text-sm text-gray-500"
                    >
                      {detailText}
                    </motion.p>
                  </AnimatePresence>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {/* 예상보다 오래 걸릴 때. 침묵보다 사정을 말해주는 편이 낫다. */}
      {overEstimate && longRunHint && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-5 text-sm text-gray-500"
        >
          {longRunHint}
        </motion.p>
      )}

      {/* 스크린리더에는 단계가 바뀔 때만 알린다. 진행률까지 읽으면 소음이 된다. */}
      <p className="sr-only" aria-live="polite">
        {currentStage?.label}
      </p>
    </div>
  )
}
