'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, Sparkles, Check, HelpCircle, Lightbulb, SkipForward, Trophy, Star, Zap, Gift, Target, Flame , BarChart3, BookOpen, FileText, Gem, GraduationCap, Rocket, Search, TrendingUp, Wallet, Waves, ScanSearch, Link2, Bot} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import confetti from 'canvas-confetti'
import { useXPStore } from '@/lib/stores/xp'

export interface TutorialStep {
  id: string
  title: string
  description: string
  targetId?: string // DOM element ID to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  tip?: string
  image?: string
  xp?: number // XP points for completing this step
  badge?: LucideIcon
}

interface TutorialProps {
  steps: TutorialStep[]
  tutorialKey: string // localStorage key to remember completion
  onComplete?: () => void
  onSkip?: () => void
  autoStart?: boolean
  showGameElements?: boolean // Enable game-like features
}

export default function Tutorial({ steps, tutorialKey, onComplete, onSkip, autoStart = true, showGameElements = true }: TutorialProps) {
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)
  const [sessionXP, setSessionXP] = useState(0) // 이번 튜토리얼에서 획득한 XP
  const [showXPGain, setShowXPGain] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [showCelebration, setShowCelebration] = useState(false)

  // XP 스토어 연동
  const { earnXP, totalXP, getCurrentRank } = useXPStore()
  const currentRank = getCurrentRank()

  // Check if tutorial was already completed
  useEffect(() => {
    if (typeof window === 'undefined') return
    const completed = localStorage.getItem(`tutorial_${tutorialKey}`)
    if (!completed && autoStart) {
      // Small delay to ensure DOM is ready
      setTimeout(() => setIsActive(true), 500)
    }
  }, [tutorialKey, autoStart])

  // Update highlight position when step changes
  useEffect(() => {
    if (!isActive) return

    const step = steps[currentStep]
    if (step?.targetId) {
      const element = document.getElementById(step.targetId)
      if (element) {
        const rect = element.getBoundingClientRect()
        setHighlightRect(rect)
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        setHighlightRect(null)
      }
    } else {
      setHighlightRect(null)
    }
  }, [isActive, currentStep, steps])

  // Fire confetti celebration
  const fireConfetti = useCallback(() => {
    if (typeof window === 'undefined') return

    const count = 200
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999
    }

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio)
      })
    }

    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2, { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1, { spread: 120, startVelocity: 45 })
  }, [])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      // Mark current step as completed
      const newCompleted = new Set(completedSteps)
      newCompleted.add(currentStep)
      setCompletedSteps(newCompleted)

      // Add XP for completing step - 스토어에 저장
      if (showGameElements) {
        const stepXP = steps[currentStep].xp || 10
        earnXP(stepXP, `tutorial_${tutorialKey}_step_${currentStep}`)
        setSessionXP(prev => prev + stepXP)
        setShowXPGain(true)
        setTimeout(() => setShowXPGain(false), 1500)
      }

      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = () => {
    // Mark all steps completed
    const allCompleted = new Set(Array.from({ length: steps.length }, (_, i) => i))
    setCompletedSteps(allCompleted)

    // Final XP bonus - 스토어에 저장
    if (showGameElements) {
      const finalXP = steps[currentStep].xp || 10
      const bonusXP = 50 // Completion bonus
      const totalEarned = sessionXP + finalXP + bonusXP

      // XP 스토어에 저장
      earnXP(finalXP + bonusXP, `tutorial_${tutorialKey}_complete`)
      setSessionXP(totalEarned)

      // Show celebration
      setShowCelebration(true)
      fireConfetti()

      setTimeout(() => {
        setShowCelebration(false)
        localStorage.setItem(`tutorial_${tutorialKey}`, 'true')
        setIsActive(false)
        onComplete?.()
      }, 3000)
    } else {
      localStorage.setItem(`tutorial_${tutorialKey}`, 'true')
      setIsActive(false)
      onComplete?.()
    }
  }

  const handleSkip = () => {
    localStorage.setItem(`tutorial_${tutorialKey}`, 'true')
    setIsActive(false)
    onSkip?.()
  }

  const startTutorial = () => {
    setCurrentStep(0)
    setIsActive(true)
  }

  const resetTutorial = () => {
    localStorage.removeItem(`tutorial_${tutorialKey}`)
    setCurrentStep(0)
    setIsActive(true)
  }

  // Calculate tooltip position based on highlight
  const getTooltipStyle = () => {
    const step = steps[currentStep]
    if (!highlightRect || !step?.position) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }

    const padding = 20
    const tooltipWidth = 400
    const tooltipHeight = 250

    switch (step.position) {
      case 'top':
        return {
          bottom: `${window.innerHeight - highlightRect.top + padding}px`,
          left: `${highlightRect.left + highlightRect.width / 2}px`,
          transform: 'translateX(-50%)'
        }
      case 'bottom':
        return {
          top: `${highlightRect.bottom + padding}px`,
          left: `${highlightRect.left + highlightRect.width / 2}px`,
          transform: 'translateX(-50%)'
        }
      case 'left':
        return {
          top: `${highlightRect.top + highlightRect.height / 2}px`,
          right: `${window.innerWidth - highlightRect.left + padding}px`,
          transform: 'translateY(-50%)'
        }
      case 'right':
        return {
          top: `${highlightRect.top + highlightRect.height / 2}px`,
          left: `${highlightRect.right + padding}px`,
          transform: 'translateY(-50%)'
        }
      default:
        return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }
  }

  // Calculate total XP possible
  const totalPossibleXP = steps.reduce((acc, step) => acc + (step.xp || 10), 0) + 50 // +50 completion bonus
  const progressPercentage = ((currentStep + 1) / steps.length) * 100

  if (!isActive) {
    return (
      <motion.button
        onClick={resetTutorial}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all"
      >
        <HelpCircle className="w-5 h-5 gi3d" />
        <span className="font-medium">튜토리얼</span>
        {showGameElements && (
          <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">시작하기</span>
        )}
      </motion.button>
    )
  }

  const currentStepData = steps[currentStep]

  return (
    <AnimatePresence>
      {isActive && (
        <>
          {/* Celebration Modal */}
          {showCelebration && showGameElements && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80"
            >
              <motion.div
                initial={{ y: 50 }}
                animate={{ y: 0 }}
                className="bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-500 p-1 rounded-3xl"
              >
                <div className="bg-white rounded-3xl p-8 text-center max-w-md">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.5, repeat: 2 }}
                    className="text-6xl mb-4"
                  >

                  </motion.div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">축하합니다!</h2>
                  <p className="text-gray-600 mb-4">튜토리얼을 완료했습니다!</p>

                  <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl p-4 mb-4">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Star className="w-6 h-6 text-yellow-500 fill-yellow-500 gi3d" />
                      <span className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                        +{sessionXP} XP
                      </span>
                      <Star className="w-6 h-6 text-yellow-500 fill-yellow-500 gi3d" />
                    </div>
                    <p className="text-sm text-gray-500">획득한 경험치</p>
                    <p className="text-xs text-purple-600 mt-1">
                      <currentRank.icon className="w-4 h-4 inline-block mr-1 align-text-bottom" strokeWidth={1.75} /> 총 {totalXP.toLocaleString()} XP ({currentRank.name})
                    </p>
                  </div>

                  <div className="flex justify-center gap-2">
                    <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm flex items-center gap-1">
                      <Trophy className="w-4 h-4 gi3d" />
                      튜토리얼 완료
                    </div>
                    <div className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm flex items-center gap-1">
                      <Target className="w-4 h-4 gi3d" />
                      전문가 도전
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* XP Gain Animation */}
          <AnimatePresence>
            {showXPGain && showGameElements && (
              <motion.div
                initial={{ opacity: 0, y: 0, x: '-50%' }}
                animate={{ opacity: 1, y: -30 }}
                exit={{ opacity: 0, y: -60 }}
                className="fixed top-20 left-1/2 z-[150] bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-2 rounded-full font-bold shadow-lg"
              >
                +{steps[currentStep - 1]?.xp || 10} XP
              </motion.div>
            )}
          </AnimatePresence>

          {/* Top Progress Bar */}
          {showGameElements && (
            <motion.div
              initial={{ y: -100 }}
              animate={{ y: 0 }}
              className="fixed top-0 left-0 right-0 z-[105] bg-white/95 backdrop-blur-sm shadow-md px-4 py-3"
            >
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                      <currentRank.icon className="w-4 h-4" strokeWidth={1.75} />
                      {currentRank.name}
                    </div>
                    <div className="flex items-center gap-1 text-yellow-600 font-medium">
                      <Star className="w-4 h-4 fill-yellow-500 gi3d" />
                      {totalXP.toLocaleString()} XP
                      {sessionXP > 0 && (
                        <span className="text-green-500 text-sm">(+{sessionXP})</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {currentStep + 1} / {steps.length} 단계
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercentage}%` }}
                    className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"
                    transition={{ duration: 0.3 }}
                  />
                </div>

                {/* Step indicators */}
                <div className="flex justify-between mt-2">
                  {steps.map((step, index) => (
                    <div
                      key={index}
                      className={`flex flex-col items-center ${index <= currentStep ? 'opacity-100' : 'opacity-40'}`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        completedSteps.has(index)
                          ? 'bg-green-500 text-white'
                          : index === currentStep
                          ? 'bg-purple-500 text-white ring-4 ring-purple-200'
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                        {completedSteps.has(index) ? <Check className="w-3 h-3 gi3d" /> : index + 1}
                      </div>
                      {step.badge && completedSteps.has(index) && (
                        <step.badge className="w-3 h-3 mt-0.5" strokeWidth={2} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Overlay with spotlight effect */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] pointer-events-none"
            style={{
              background: highlightRect
                ? `radial-gradient(ellipse ${highlightRect.width + 60}px ${highlightRect.height + 60}px at ${highlightRect.left + highlightRect.width / 2}px ${highlightRect.top + highlightRect.height / 2}px, transparent 0%, rgba(0,0,0,0.75) 100%)`
                : 'rgba(0,0,0,0.75)'
            }}
          />

          {/* Highlight border with pulsing animation */}
          {highlightRect && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="fixed z-[101] pointer-events-none"
              style={{
                top: highlightRect.top - 6,
                left: highlightRect.left - 6,
                width: highlightRect.width + 12,
                height: highlightRect.height + 12,
              }}
            >
              <motion.div
                animate={{
                  boxShadow: ['0 0 20px rgba(139, 92, 246, 0.5)', '0 0 40px rgba(139, 92, 246, 0.8)', '0 0 20px rgba(139, 92, 246, 0.5)']
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-full h-full border-3 border-purple-500 rounded-xl"
                style={{ borderWidth: '3px' }}
              />
            </motion.div>
          )}

          {/* Clickable overlay to prevent interaction */}
          <div
            className="fixed inset-0 z-[102]"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Tutorial tooltip */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed z-[103] w-[420px] max-w-[90vw] bg-white rounded-2xl shadow-2xl overflow-hidden"
            style={getTooltipStyle()}
          >
            {/* Header with gradient and step badge */}
            <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 px-6 py-4 relative overflow-hidden">
              {/* Animated background pattern */}
              <motion.div
                animate={{ x: ['0%', '100%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {showGameElements && (
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
                      className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"
                    >
                      {currentStepData.badge ? <currentStepData.badge className="w-5 h-5" strokeWidth={1.75} /> : <BookOpen className="w-5 h-5 gi3d" strokeWidth={1.75} />}
                    </motion.div>
                  )}
                  <div>
                    <span className="text-white/80 text-xs font-medium">
                      STEP {currentStep + 1}
                    </span>
                    <h3 className="text-lg font-bold text-white">{currentStepData.title}</h3>
                  </div>
                </div>
                <button
                  onClick={handleSkip}
                  className="text-white/70 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-lg"
                >
                  <X className="w-5 h-5 gi3d" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-gray-700 leading-relaxed text-[15px]">
                {currentStepData.description}
              </p>

              {currentStepData.tip && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-4 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Lightbulb className="w-4 h-4 text-amber-600 gi3d" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-amber-700 mb-1">Pro Tip</p>
                      <p className="text-sm text-amber-800">{currentStepData.tip}</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* XP reward preview */}
              {showGameElements && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Zap className="w-4 h-4 text-yellow-500 gi3d" />
                  이 단계 완료 시 <span className="font-bold text-yellow-600">+{currentStepData.xp || 10} XP</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-t border-gray-100">
              <button
                onClick={handleSkip}
                className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors text-sm"
              >
                <SkipForward className="w-4 h-4 gi3d" />
                건너뛰기
              </button>

              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePrev}
                    className="flex items-center gap-1 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 gi3d" />
                    이전
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNext}
                  className="flex items-center gap-1 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
                >
                  {currentStep === steps.length - 1 ? (
                    <>
                      <Gift className="w-4 h-4 gi3d" />
                      완료하고 보상받기
                    </>
                  ) : (
                    <>
                      다음 단계
                      <ChevronRight className="w-4 h-4 gi3d" />
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Predefined tutorials for each tool
export const toolsTutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: '블로그 성장 도구에 오신 것을 환영합니다!',
    description: 'AI 기반 분석 도구로 블로그를 효과적으로 성장시킬 수 있습니다. 각 기능을 하나씩 알아볼까요?',
    position: 'center',
    xp: 10,
    badge: Rocket
  },
  {
    id: 'content-creation',
    title: '콘텐츠 제작 도구',
    description: 'AI 제목 생성, 키워드 발굴, 글쓰기 가이드 등 콘텐츠 제작에 필요한 모든 도구가 여기 있습니다.',
    targetId: 'section-content',
    position: 'bottom',
    tip: 'AI 제목 생성 기능은 키워드만 입력하면 클릭률 높은 제목을 자동으로 만들어줍니다!',
    xp: 15,
    badge: '✍️'
  },
  {
    id: 'analysis',
    title: '분석 & 최적화 도구',
    description: '유튜브 스크립트 변환, 저품질 위험 감지, 순위 추적 등 블로그 분석에 필요한 도구들입니다.',
    targetId: 'section-analysis',
    position: 'bottom',
    tip: '저품질 위험 감지 기능으로 블로그가 저품질에 걸리기 전에 미리 예방하세요!',
    xp: 15,
    badge: BarChart3
  },
  {
    id: 'growth',
    title: '성장 전략 도구',
    description: '알고리즘 변화 감지, 멘토링, 트렌드 스나이퍼 등 블로그 성장을 위한 전략적 도구들입니다.',
    targetId: 'section-growth',
    position: 'bottom',
    tip: '트렌드 스나이퍼로 실시간 인기 키워드를 선점하면 방문자가 폭발적으로 늘어납니다!',
    xp: 20,
    badge: TrendingUp
  },
  {
    id: 'naver-ecosystem',
    title: '네이버 생태계 도구',
    description: '네이버 데이터랩, 쇼핑, 플레이스, 뉴스 등 네이버 전체 생태계를 분석하는 프리미엄 도구입니다.',
    targetId: 'section-naver',
    position: 'top',
    tip: '네이버 데이터랩 분석으로 키워드의 연령/성별/지역 분포를 파악해 타겟 독자층을 정확히 겨냥하세요!',
    xp: 25,
    badge: Gem
  },
  {
    id: 'how-to-use',
    title: '사용 방법',
    description: '원하는 도구를 클릭하면 해당 기능이 활성화됩니다. 각 도구마다 상세한 안내가 제공되니 걱정하지 마세요!',
    position: 'center',
    tip: '자주 사용하는 도구는 즐겨찾기 기능을 이용해보세요!',
    xp: 15,
    badge: GraduationCap
  }
]

// Tutorial for AI Title Generator
export const aiTitleTutorialSteps: TutorialStep[] = [
  {
    id: 'title-input',
    title: 'AI 제목 생성기',
    description: '클릭률 높은 블로그 제목을 AI가 자동으로 생성해드립니다. 키워드만 입력하면 됩니다!',
    targetId: 'title-input-field',
    position: 'bottom',
    xp: 10,
    badge: Target
  },
  {
    id: 'title-generate',
    title: '제목 생성하기',
    description: '키워드를 입력하고 "생성하기" 버튼을 클릭하면 다양한 스타일의 제목이 생성됩니다.',
    targetId: 'title-generate-btn',
    position: 'left',
    tip: '감정형, 질문형, 숫자형 등 다양한 스타일의 제목이 생성됩니다.',
    xp: 15,
    badge: Zap
  },
  {
    id: 'title-result',
    title: '결과 확인 및 복사',
    description: '생성된 제목 중 마음에 드는 것을 클릭하면 자동으로 복사됩니다.',
    targetId: 'title-results',
    position: 'top',
    tip: 'CTR 점수가 높은 제목일수록 클릭률이 높을 가능성이 큽니다!',
    xp: 20,
    badge: FileText
  }
]

// Tutorial for Blue Ocean Keyword
export const blueOceanTutorialSteps: TutorialStep[] = [
  {
    id: 'blue-intro',
    title: '블루오션 키워드 발굴',
    description: '경쟁은 낮고 검색량은 높은 "블루오션" 키워드를 AI가 찾아드립니다.',
    position: 'center',
    xp: 10,
    badge: Waves
  },
  {
    id: 'blue-input',
    title: '시드 키워드 입력',
    description: '분석하고 싶은 주제나 키워드를 입력하세요. AI가 관련된 블루오션 키워드를 발굴합니다.',
    targetId: 'blueocean-input',
    position: 'bottom',
    tip: '구체적인 키워드보다는 넓은 주제를 입력하면 더 많은 키워드를 찾을 수 있어요!',
    xp: 15,
    badge: Search
  },
  {
    id: 'blue-results',
    title: '기회 점수 확인',
    description: '기회 점수가 높을수록 상위 노출 가능성이 높은 키워드입니다. 트렌드 방향도 확인하세요!',
    targetId: 'blueocean-results',
    position: 'top',
    tip: '기회점수 70점 이상인 키워드는 꼭 공략해보세요!',
    xp: 25,
    badge: Gem
  }
]

// Tutorial for Keyword Analysis
export const keywordAnalysisTutorialSteps: TutorialStep[] = [
  {
    id: 'kw-intro',
    title: '키워드 분석 도구',
    description: '키워드의 검색량, 경쟁도, 상위노출 난이도를 종합적으로 분석합니다.',
    position: 'center',
    xp: 10,
    badge: ScanSearch
  },
  {
    id: 'kw-input',
    title: '키워드 입력',
    description: '분석하고 싶은 키워드를 입력하세요. 여러 개의 키워드를 쉼표로 구분해서 입력할 수 있습니다.',
    targetId: 'keyword-analysis-input',
    position: 'bottom',
    xp: 15,
    badge: '⌨️'
  },
  {
    id: 'kw-metrics',
    title: '지표 이해하기',
    description: '검색량(월간 검색 수), 경쟁도(광고 경쟁 정도), 블로그 포화도(기존 블로그 글 수)를 확인하세요.',
    targetId: 'keyword-analysis-results',
    position: 'bottom',
    tip: '검색량이 높고 블로그 포화도가 낮은 키워드가 공략하기 좋은 키워드입니다!',
    xp: 25,
    badge: BarChart3
  }
]

// Tutorial for Ad Optimizer
export const adOptimizerTutorialSteps: TutorialStep[] = [
  {
    id: 'ad-intro',
    title: '광고 최적화 시스템',
    description: '네이버 검색광고 입찰가를 AI가 실시간으로 자동 최적화합니다. 광고비를 절감하면서 효율을 높일 수 있습니다.',
    position: 'center',
    xp: 10,
    badge: Target
  },
  {
    id: 'ad-connect',
    title: '계정 연동하기',
    description: '먼저 네이버 검색광고 API 자격 증명을 입력해 계정을 연동하세요. 고객 ID, API 키, 비밀 키가 필요합니다.',
    targetId: 'ad-connect-tab',
    position: 'bottom',
    tip: 'API 키는 네이버 검색광고 센터 > 도구 > API 관리에서 발급받을 수 있습니다.',
    xp: 20,
    badge: Link2
  },
  {
    id: 'ad-dashboard',
    title: '대시보드 확인',
    description: '연동 후 대시보드에서 현재 광고 성과와 입찰 변경 내역을 실시간으로 확인할 수 있습니다.',
    targetId: 'ad-dashboard-tab',
    position: 'bottom',
    xp: 15,
    badge: BarChart3
  },
  {
    id: 'ad-efficiency',
    title: '효율 추적',
    description: '최적화로 얼마나 비용을 절감했는지, ROAS가 얼마나 개선되었는지 한눈에 확인하세요.',
    targetId: 'ad-efficiency-tab',
    position: 'bottom',
    tip: '최적화 전후 비교 데이터로 실제 효과를 확인할 수 있습니다!',
    xp: 20,
    badge: Wallet
  },
  {
    id: 'ad-trending',
    title: '트렌드 키워드',
    description: '검색량이 급상승하는 키워드를 자동으로 추천받고, 원클릭으로 캠페인에 추가할 수 있습니다.',
    targetId: 'ad-trending-tab',
    position: 'bottom',
    tip: '기회점수가 높은 키워드를 빠르게 선점하면 낮은 입찰가로 좋은 효과를 볼 수 있어요!',
    xp: 25,
    badge: Flame
  },
  {
    id: 'ad-auto',
    title: '자동 최적화 시작',
    description: '"시작" 버튼을 클릭하면 AI가 24시간 자동으로 입찰가를 조정합니다. 설정에서 전략과 목표를 조정할 수 있습니다.',
    targetId: 'ad-auto-btn',
    position: 'bottom',
    tip: '목표 ROAS나 목표 CPA를 설정하면 해당 목표에 맞춰 자동 최적화됩니다.',
    xp: 30,
    badge: Bot
  }
]
