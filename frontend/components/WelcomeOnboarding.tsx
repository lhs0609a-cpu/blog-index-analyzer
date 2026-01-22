'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, Search, BarChart3, Zap, ArrowRight, CheckCircle2, Award, TrendingUp } from 'lucide-react'
import Link from 'next/link'

interface WelcomeOnboardingProps {
  onComplete?: () => void
}

const ONBOARDING_KEY = 'blrank_onboarding_completed'

export default function WelcomeOnboarding({ onComplete }: WelcomeOnboardingProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    // 첫 방문 사용자에게만 표시
    const completed = localStorage.getItem(ONBOARDING_KEY)
    if (!completed) {
      setTimeout(() => setIsVisible(true), 1000)
    }
  }, [])

  const handleClose = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setIsVisible(false)
    onComplete?.()
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleClose()
    }
  }

  const steps = [
    {
      icon: <Sparkles className="w-12 h-12 text-white" />,
      iconBg: 'from-[#0064FF] to-[#3182F6]',
      title: '블랭크에 오신 것을 환영합니다! 👋',
      description: 'AI 기반 블로그 분석 플랫폼 블랭크입니다.\n40개 이상의 지표로 블로그를 분석하고 성장 전략을 세워보세요.',
      features: [
        '무료로 블로그 분석 시작',
        '상위 노출 키워드 분석',
        'AI 글쓰기 가이드'
      ]
    },
    {
      icon: <Award className="w-12 h-12 text-white" />,
      iconBg: 'from-purple-500 to-pink-500',
      title: '이런 분석 결과를 받아보세요',
      description: '블로그 ID 하나로 네이버가 당신의 블로그를 어떻게 평가하는지 알 수 있어요.',
      preview: true  // 미리보기 플래그
    },
    {
      icon: <Search className="w-12 h-12 text-white" />,
      iconBg: 'from-[#3182F6] to-sky-500',
      title: '블로그 분석하기',
      description: '네이버 블로그 ID만 입력하면 네이버 신뢰점수, 문서 품질점수 등\n40개 이상의 지표로 블로그 상태를 진단해드려요.',
      action: {
        label: '블로그 분석하러 가기',
        href: '/analyze'
      }
    },
    {
      icon: <BarChart3 className="w-12 h-12 text-white" />,
      iconBg: 'from-sky-500 to-cyan-500',
      title: '키워드 검색하기',
      description: '목표 키워드를 검색하면 상위 노출 블로그들의\n공통 패턴을 분석해 어떻게 써야 할지 알려드려요.',
      action: {
        label: '키워드 검색하러 가기',
        href: '/keyword-search'
      }
    },
    {
      icon: <Zap className="w-12 h-12 text-white" />,
      iconBg: 'from-orange-500 to-amber-500',
      title: 'AI 도구 활용하기',
      description: '블루오션 키워드 발굴, AI 글쓰기 가이드 등\n9가지 AI 도구로 효율적으로 블로그를 운영하세요.',
      action: {
        label: 'AI 도구 보러 가기',
        href: '/tools'
      }
    }
  ]

  const currentStepData = steps[currentStep]

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden"
        >
          {/* Header */}
          <div className="relative">
            <div className={`bg-gradient-to-r ${currentStepData.iconBg} px-8 pt-8 pb-16`}>
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>

              {/* Step indicator */}
              <div className="flex gap-2 mb-6">
                {steps.map((_, index) => (
                  <div
                    key={index}
                    className={`h-1.5 rounded-full transition-all ${
                      index === currentStep
                        ? 'w-8 bg-white'
                        : index < currentStep
                        ? 'w-4 bg-white/70'
                        : 'w-4 bg-white/30'
                    }`}
                  />
                ))}
              </div>

              {/* Icon */}
              <motion.div
                key={currentStep}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center"
              >
                {currentStepData.icon}
              </motion.div>
            </div>

            {/* Content card overlapping header */}
            <div className="mx-6 -mt-8 bg-white rounded-2xl shadow-xl p-6 relative z-10 border border-gray-100">
              <motion.div
                key={`content-${currentStep}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  {currentStepData.title}
                </h2>
                <p className="text-gray-600 whitespace-pre-line leading-relaxed">
                  {currentStepData.description}
                </p>

                {/* Features list for first step */}
                {currentStepData.features && (
                  <div className="mt-4 space-y-2">
                    {currentStepData.features.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <span className="text-gray-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 분석 결과 미리보기 (Preview step) */}
                {(currentStepData as any).preview && (
                  <div className="mt-4 space-y-3">
                    {/* 미니 결과 카드 */}
                    <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-4 border border-blue-100">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] flex items-center justify-center text-white text-sm font-bold">
                            예
                          </div>
                          <div>
                            <div className="font-bold text-sm">예시 블로그</div>
                            <div className="text-xs text-gray-500">@example_blog</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black bg-gradient-to-r from-[#0064FF] to-[#3182F6] bg-clip-text text-transparent">
                            Lv.7
                          </div>
                          <div className="text-xs text-gray-500">Gold</div>
                        </div>
                      </div>

                      {/* 점수 바 */}
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600">네이버 신뢰점수</span>
                            <span className="text-[#0064FF] font-semibold">72점</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-full" style={{ width: '72%' }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600">문서 품질점수</span>
                            <span className="text-[#3182F6] font-semibold">68점</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#3182F6] to-sky-400 rounded-full" style={{ width: '68%' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span>레벨별 맞춤 성장 전략도 함께 제공됩니다</span>
                    </div>
                  </div>
                )}

                {/* Action button for other steps */}
                {currentStepData.action && (
                  <Link
                    href={currentStepData.action.href}
                    onClick={handleClose}
                    className="mt-4 inline-flex items-center gap-2 text-[#0064FF] font-semibold hover:underline"
                  >
                    {currentStepData.action.label}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </motion.div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 flex items-center justify-between">
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-sm transition-colors"
            >
              건너뛰기
            </button>

            <div className="flex items-center gap-3">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  이전
                </button>
              )}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNext}
                className="px-6 py-2.5 bg-[#0064FF] text-white rounded-xl font-semibold hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all"
              >
                {currentStep === steps.length - 1 ? '시작하기' : '다음'}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
