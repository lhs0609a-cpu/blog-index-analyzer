'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, Sparkles, Check, HelpCircle, Lightbulb, SkipForward } from 'lucide-react'

export interface TutorialStep {
  id: string
  title: string
  description: string
  targetId?: string // DOM element ID to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  tip?: string
  image?: string
}

interface TutorialProps {
  steps: TutorialStep[]
  tutorialKey: string // localStorage key to remember completion
  onComplete?: () => void
  onSkip?: () => void
  autoStart?: boolean
}

export default function Tutorial({ steps, tutorialKey, onComplete, onSkip, autoStart = true }: TutorialProps) {
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null)

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

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
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
    localStorage.setItem(`tutorial_${tutorialKey}`, 'true')
    setIsActive(false)
    onComplete?.()
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

  if (!isActive) {
    return (
      <button
        onClick={resetTutorial}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
      >
        <HelpCircle className="w-5 h-5" />
        <span className="font-medium">도움말</span>
      </button>
    )
  }

  const currentStepData = steps[currentStep]

  return (
    <AnimatePresence>
      {isActive && (
        <>
          {/* Overlay with spotlight effect */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] pointer-events-none"
            style={{
              background: highlightRect
                ? `radial-gradient(ellipse ${highlightRect.width + 40}px ${highlightRect.height + 40}px at ${highlightRect.left + highlightRect.width / 2}px ${highlightRect.top + highlightRect.height / 2}px, transparent 0%, rgba(0,0,0,0.7) 100%)`
                : 'rgba(0,0,0,0.7)'
            }}
          />

          {/* Highlight border */}
          {highlightRect && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="fixed z-[101] pointer-events-none"
              style={{
                top: highlightRect.top - 4,
                left: highlightRect.left - 4,
                width: highlightRect.width + 8,
                height: highlightRect.height + 8,
                border: '3px solid #8B5CF6',
                borderRadius: '12px',
                boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)'
              }}
            />
          )}

          {/* Clickable overlay to prevent interaction */}
          <div
            className="fixed inset-0 z-[102]"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Tutorial tooltip */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed z-[103] w-[400px] max-w-[90vw] bg-white rounded-2xl shadow-2xl overflow-hidden"
            style={getTooltipStyle()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-white" />
                  <span className="text-white/80 text-sm">
                    {currentStep + 1} / {steps.length}
                  </span>
                </div>
                <button
                  onClick={handleSkip}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <h3 className="text-xl font-bold text-white mt-2">{currentStepData.title}</h3>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-gray-700 leading-relaxed">
                {currentStepData.description}
              </p>

              {currentStepData.tip && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">{currentStepData.tip}</p>
                  </div>
                </div>
              )}

              {/* Progress dots */}
              <div className="flex justify-center gap-2 mt-6">
                {steps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentStep(index)}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${
                      index === currentStep
                        ? 'bg-purple-500 w-6'
                        : index < currentStep
                        ? 'bg-purple-300'
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 flex items-center justify-between">
              <button
                onClick={handleSkip}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors text-sm"
              >
                <SkipForward className="w-4 h-4" />
                건너뛰기
              </button>

              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={handlePrev}
                    className="flex items-center gap-1 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    이전
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
                >
                  {currentStep === steps.length - 1 ? (
                    <>
                      <Check className="w-4 h-4" />
                      완료
                    </>
                  ) : (
                    <>
                      다음
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
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
    position: 'center'
  },
  {
    id: 'content-creation',
    title: '콘텐츠 제작 도구',
    description: 'AI 제목 생성, 키워드 발굴, 글쓰기 가이드 등 콘텐츠 제작에 필요한 모든 도구가 여기 있습니다.',
    targetId: 'section-content',
    position: 'bottom',
    tip: 'AI 제목 생성 기능은 키워드만 입력하면 클릭률 높은 제목을 자동으로 만들어줍니다!'
  },
  {
    id: 'analysis',
    title: '분석 & 최적화 도구',
    description: '유튜브 스크립트 변환, 저품질 위험 감지, 순위 추적 등 블로그 분석에 필요한 도구들입니다.',
    targetId: 'section-analysis',
    position: 'bottom',
    tip: '저품질 위험 감지 기능으로 블로그가 저품질에 걸리기 전에 미리 예방하세요!'
  },
  {
    id: 'growth',
    title: '성장 전략 도구',
    description: '알고리즘 변화 감지, 멘토링, 트렌드 스나이퍼 등 블로그 성장을 위한 전략적 도구들입니다.',
    targetId: 'section-growth',
    position: 'bottom',
    tip: '트렌드 스나이퍼로 실시간 인기 키워드를 선점하면 방문자가 폭발적으로 늘어납니다!'
  },
  {
    id: 'naver-ecosystem',
    title: '네이버 생태계 도구',
    description: '네이버 데이터랩, 쇼핑, 플레이스, 뉴스 등 네이버 전체 생태계를 분석하는 프리미엄 도구입니다.',
    targetId: 'section-naver',
    position: 'top',
    tip: '네이버 데이터랩 분석으로 키워드의 연령/성별/지역 분포를 파악해 타겟 독자층을 정확히 겨냥하세요!'
  },
  {
    id: 'how-to-use',
    title: '사용 방법',
    description: '원하는 도구를 클릭하면 해당 기능이 활성화됩니다. 각 도구마다 상세한 안내가 제공되니 걱정하지 마세요!',
    position: 'center',
    tip: '자주 사용하는 도구는 즐겨찾기 기능을 이용해보세요!'
  }
]

// Tutorial for AI Title Generator
export const aiTitleTutorialSteps: TutorialStep[] = [
  {
    id: 'title-input',
    title: 'AI 제목 생성기',
    description: '클릭률 높은 블로그 제목을 AI가 자동으로 생성해드립니다. 키워드만 입력하면 됩니다!',
    targetId: 'title-input-field',
    position: 'bottom'
  },
  {
    id: 'title-generate',
    title: '제목 생성하기',
    description: '키워드를 입력하고 "생성하기" 버튼을 클릭하면 다양한 스타일의 제목이 생성됩니다.',
    targetId: 'title-generate-btn',
    position: 'left',
    tip: '감정형, 질문형, 숫자형 등 다양한 스타일의 제목이 생성됩니다.'
  },
  {
    id: 'title-result',
    title: '결과 확인 및 복사',
    description: '생성된 제목 중 마음에 드는 것을 클릭하면 자동으로 복사됩니다.',
    targetId: 'title-results',
    position: 'top',
    tip: 'CTR 점수가 높은 제목일수록 클릭률이 높을 가능성이 큽니다!'
  }
]

// Tutorial for Blue Ocean Keyword
export const blueOceanTutorialSteps: TutorialStep[] = [
  {
    id: 'blue-intro',
    title: '블루오션 키워드 발굴',
    description: '경쟁은 낮고 검색량은 높은 "블루오션" 키워드를 AI가 찾아드립니다.',
    position: 'center'
  },
  {
    id: 'blue-input',
    title: '시드 키워드 입력',
    description: '분석하고 싶은 주제나 키워드를 입력하세요. AI가 관련된 블루오션 키워드를 발굴합니다.',
    targetId: 'blueocean-input',
    position: 'bottom',
    tip: '구체적인 키워드보다는 넓은 주제를 입력하면 더 많은 키워드를 찾을 수 있어요!'
  },
  {
    id: 'blue-results',
    title: '기회 점수 확인',
    description: '기회 점수가 높을수록 상위 노출 가능성이 높은 키워드입니다. 트렌드 방향도 확인하세요!',
    targetId: 'blueocean-results',
    position: 'top',
    tip: '기회점수 70점 이상인 키워드는 꼭 공략해보세요!'
  }
]

// Tutorial for Keyword Analysis
export const keywordAnalysisTutorialSteps: TutorialStep[] = [
  {
    id: 'kw-intro',
    title: '키워드 분석 도구',
    description: '키워드의 검색량, 경쟁도, 상위노출 난이도를 종합적으로 분석합니다.',
    position: 'center'
  },
  {
    id: 'kw-input',
    title: '키워드 입력',
    description: '분석하고 싶은 키워드를 입력하세요. 여러 개의 키워드를 쉼표로 구분해서 입력할 수 있습니다.',
    targetId: 'keyword-analysis-input',
    position: 'bottom'
  },
  {
    id: 'kw-metrics',
    title: '지표 이해하기',
    description: '검색량(월간 검색 수), 경쟁도(광고 경쟁 정도), 블로그 포화도(기존 블로그 글 수)를 확인하세요.',
    targetId: 'keyword-analysis-results',
    position: 'bottom',
    tip: '검색량이 높고 블로그 포화도가 낮은 키워드가 공략하기 좋은 키워드입니다!'
  }
]

// Tutorial for Ad Optimizer
export const adOptimizerTutorialSteps: TutorialStep[] = [
  {
    id: 'ad-intro',
    title: '광고 최적화 시스템',
    description: '네이버 검색광고 입찰가를 AI가 실시간으로 자동 최적화합니다. 광고비를 절감하면서 효율을 높일 수 있습니다.',
    position: 'center'
  },
  {
    id: 'ad-connect',
    title: '계정 연동하기',
    description: '먼저 네이버 검색광고 API 자격 증명을 입력해 계정을 연동하세요. 고객 ID, API 키, 비밀 키가 필요합니다.',
    targetId: 'ad-connect-tab',
    position: 'bottom',
    tip: 'API 키는 네이버 검색광고 센터 > 도구 > API 관리에서 발급받을 수 있습니다.'
  },
  {
    id: 'ad-dashboard',
    title: '대시보드 확인',
    description: '연동 후 대시보드에서 현재 광고 성과와 입찰 변경 내역을 실시간으로 확인할 수 있습니다.',
    targetId: 'ad-dashboard-tab',
    position: 'bottom'
  },
  {
    id: 'ad-efficiency',
    title: '효율 추적',
    description: '최적화로 얼마나 비용을 절감했는지, ROAS가 얼마나 개선되었는지 한눈에 확인하세요.',
    targetId: 'ad-efficiency-tab',
    position: 'bottom',
    tip: '최적화 전후 비교 데이터로 실제 효과를 확인할 수 있습니다!'
  },
  {
    id: 'ad-trending',
    title: '트렌드 키워드',
    description: '검색량이 급상승하는 키워드를 자동으로 추천받고, 원클릭으로 캠페인에 추가할 수 있습니다.',
    targetId: 'ad-trending-tab',
    position: 'bottom',
    tip: '기회점수가 높은 키워드를 빠르게 선점하면 낮은 입찰가로 좋은 효과를 볼 수 있어요!'
  },
  {
    id: 'ad-auto',
    title: '자동 최적화 시작',
    description: '"시작" 버튼을 클릭하면 AI가 24시간 자동으로 입찰가를 조정합니다. 설정에서 전략과 목표를 조정할 수 있습니다.',
    targetId: 'ad-auto-btn',
    position: 'bottom',
    tip: '목표 ROAS나 목표 CPA를 설정하면 해당 목표에 맞춰 자동 최적화됩니다.'
  }
]
