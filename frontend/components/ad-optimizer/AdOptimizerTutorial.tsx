'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ChevronRight, ChevronLeft, Check, HelpCircle, PlayCircle,
  RotateCcw, Zap, Link2, Settings, Target, DollarSign, Bell,
  BarChart3, Sparkles, Clock, Shield, BookOpen, Lightbulb,
  ArrowRight, CheckCircle, Circle, AlertCircle, Info, Video
} from 'lucide-react'

// 튜토리얼 단계 타입
interface TutorialStep {
  id: number
  title: string
  subtitle: string
  description: string
  tips: string[]
  videoUrl?: string
  action?: {
    type: 'link' | 'button' | 'none'
    label: string
    href?: string
    onClick?: () => void
  }
  helpContent?: string
  estimatedTime: string
  category: 'setup' | 'connect' | 'optimize' | 'monitor'
  icon: React.ReactNode
}

// 튜토리얼 진행 상태
interface TutorialProgress {
  currentStep: number
  completedSteps: number[]
  startedAt: string
  lastVisitedAt: string
}

// 튜토리얼 단계 데이터
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    title: '환영합니다! 🎉',
    subtitle: '광고 최적화 시작하기',
    description: '이 튜토리얼을 따라하면 5분 안에 광고 자동 최적화를 설정할 수 있어요. 어렵지 않으니 천천히 따라오세요!',
    tips: [
      '각 단계는 1-2분이면 충분해요',
      '언제든 이전 단계로 돌아갈 수 있어요',
      '모르는 부분은 ? 버튼을 눌러주세요'
    ],
    estimatedTime: '1분',
    category: 'setup',
    icon: <Sparkles className="w-6 h-6" />,
    action: {
      type: 'button',
      label: '시작하기'
    }
  },
  {
    id: 2,
    title: '1단계: 광고 플랫폼 선택',
    subtitle: '어떤 광고를 사용하시나요?',
    description: '현재 사용 중인 광고 플랫폼을 선택해주세요. 네이버, 구글, 메타(페이스북/인스타), 카카오 등을 연동할 수 있어요.',
    tips: [
      '가장 많이 사용하는 플랫폼부터 연동하세요',
      '나중에 다른 플랫폼도 추가할 수 있어요',
      '네이버 검색광고가 가장 쉬워요 (추천!)'
    ],
    helpContent: `
## 어떤 플랫폼을 선택해야 할까요?

### 네이버 검색광고 (추천 🌟)
- 국내 검색광고의 70% 이상 점유
- 연동이 가장 간단해요
- API 키만 있으면 바로 연동 가능

### 구글 애즈
- 유튜브, 디스플레이 광고 포함
- OAuth 인증 필요 (구글 계정으로 로그인)

### 메타 광고 (페이스북/인스타그램)
- SNS 광고 최적화에 효과적
- 비즈니스 관리자 계정 필요

### 카카오 모먼트
- 카카오톡 채널 광고
- 카카오 비즈니스 계정 필요
    `,
    estimatedTime: '1분',
    category: 'connect',
    icon: <Target className="w-6 h-6" />,
    action: {
      type: 'link',
      label: '플랫폼 연동하러 가기',
      href: '#platforms'
    }
  },
  {
    id: 3,
    title: '2단계: 네이버 광고 연동하기',
    subtitle: 'API 키 발급받고 연결하기',
    description: '네이버 검색광고 API 키를 발급받아 연동해주세요. 처음이라면 아래 가이드를 따라해주세요!',
    tips: [
      '네이버 검색광고 관리 시스템에서 발급받아요',
      'API 키, 시크릿 키, 고객 ID 3개가 필요해요',
      '발급받은 키는 안전하게 보관하세요'
    ],
    helpContent: `
## 네이버 검색광고 API 키 발급 방법

### Step 1: 네이버 검색광고 접속
1. [searchad.naver.com](https://searchad.naver.com) 접속
2. 네이버 아이디로 로그인
3. 광고 계정이 없다면 먼저 생성

### Step 2: API 키 발급
1. 우측 상단 **[도구]** 클릭
2. **[API 사용 관리]** 선택
3. **[API 라이선스 키 발급]** 클릭
4. API 키, 시크릿 키 복사

### Step 3: 고객 ID 확인
1. 상단에서 **광고 계정** 선택
2. 계정 이름 옆의 숫자가 **고객 ID**

### 입력할 정보
- **API Key**: 발급받은 API 키 (예: 0100000000...)
- **Secret Key**: 발급받은 시크릿 키
- **Customer ID**: 광고 계정 번호 (숫자만)

💡 모르겠으면 [네이버 광고 고객센터](https://saedu.naver.com)를 참고하세요!
    `,
    estimatedTime: '3분',
    category: 'connect',
    icon: <Link2 className="w-6 h-6" />,
    action: {
      type: 'button',
      label: '네이버 광고 연동하기'
    }
  },
  {
    id: 4,
    title: '3단계: 자동 최적화 설정',
    subtitle: 'AI가 광고를 관리하게 해주세요',
    description: '연동이 완료되면 자동 최적화를 켜주세요. AI가 24시간 광고 성과를 분석하고 최적화합니다.',
    tips: [
      '처음에는 "안전 모드"로 시작하세요',
      '입찰가 조정 범위를 작게 설정하면 안전해요',
      '1주일 후 결과를 보고 조정하세요'
    ],
    helpContent: `
## 자동 최적화 설정 가이드

### 최적화 모드 선택

#### 🛡️ 안전 모드 (추천!)
- 입찰가 변동: ±10% 이내
- 하루 최대 5회 조정
- 급격한 변화 없이 안정적
- **처음 사용하시는 분께 추천**

#### ⚡ 균형 모드
- 입찰가 변동: ±20% 이내
- 하루 최대 10회 조정
- 적당한 최적화 속도

#### 🚀 적극 모드
- 입찰가 변동: ±30% 이내
- 하루 최대 20회 조정
- 빠른 최적화, 변동성 높음

### 권장 설정
1. 처음 1-2주: **안전 모드**
2. 성과 확인 후: **균형 모드**로 변경
3. 익숙해지면: **적극 모드** 시도

💡 언제든 모드를 변경할 수 있어요!
    `,
    estimatedTime: '2분',
    category: 'optimize',
    icon: <Zap className="w-6 h-6" />,
    action: {
      type: 'button',
      label: '자동 최적화 켜기'
    }
  },
  {
    id: 5,
    title: '4단계: 알림 설정',
    subtitle: '중요한 변화를 놓치지 마세요',
    description: '성과가 크게 변하거나 이상 징후가 감지되면 알림을 받을 수 있어요.',
    tips: [
      '이메일 또는 카카오 알림톡 선택 가능',
      '너무 많은 알림은 피하세요',
      '중요한 알림만 받도록 설정하세요'
    ],
    helpContent: `
## 알림 설정 가이드

### 알림 종류

#### 🔴 긴급 알림 (필수 권장)
- 광고비 급증 (일일 예산 80% 초과)
- ROAS 급락 (30% 이상 감소)
- 광고 중지/오류 발생

#### 🟡 중요 알림 (권장)
- 입찰가 자동 조정 완료
- 일일 성과 리포트
- 새로운 기회 발견

#### 🟢 일반 알림 (선택)
- 시간대별 성과 변화
- AI 분석 완료
- 팁 및 추천

### 알림 채널
- **이메일**: 상세한 리포트 받기
- **카카오 알림톡**: 즉시 확인 필요한 알림
- **앱 내 알림**: 로그인 시 확인

💡 처음에는 긴급 알림만 받고, 필요에 따라 추가하세요!
    `,
    estimatedTime: '1분',
    category: 'monitor',
    icon: <Bell className="w-6 h-6" />,
    action: {
      type: 'button',
      label: '알림 설정하기'
    }
  },
  {
    id: 6,
    title: '5단계: 대시보드 확인',
    subtitle: '성과를 한눈에 보세요',
    description: '모든 설정이 완료되었어요! 이제 대시보드에서 실시간 성과를 확인할 수 있습니다.',
    tips: [
      '매일 아침 대시보드를 확인하세요',
      'ROAS가 가장 중요한 지표예요',
      'AI 인사이트를 참고하세요'
    ],
    helpContent: `
## 대시보드 사용법

### 핵심 지표 이해하기

#### 💰 총 광고비
- 연동된 모든 플랫폼의 광고비 합계
- 일일/주간/월간으로 확인 가능

#### 📈 ROAS (광고 수익률)
- 광고비 대비 매출 비율
- **200% 이상**이면 좋은 성과!
- 예: ROAS 300% = 1만원 투자 → 3만원 수익

#### 🎯 전환수
- 구매, 회원가입 등 목표 달성 횟수
- 전환당 비용(CPA)도 확인하세요

#### ⚡ 최적화 횟수
- AI가 자동으로 조정한 횟수
- 많을수록 활발하게 최적화 중

### 추천 루틴
1. **아침**: 전날 성과 확인
2. **점심**: AI 인사이트 확인
3. **저녁**: 이상 징후 알림 체크
    `,
    estimatedTime: '1분',
    category: 'monitor',
    icon: <BarChart3 className="w-6 h-6" />,
    action: {
      type: 'button',
      label: '대시보드 보기'
    }
  },
  {
    id: 7,
    title: '설정 완료! 🎊',
    subtitle: '이제 AI가 광고를 최적화합니다',
    description: '축하합니다! 모든 기본 설정이 완료되었어요. AI가 24시간 광고를 분석하고 최적화합니다.',
    tips: [
      '1주일 후 성과를 확인해보세요',
      '궁금한 점은 언제든 ? 버튼을 눌러주세요',
      '추가 기능도 하나씩 살펴보세요'
    ],
    estimatedTime: '완료!',
    category: 'setup',
    icon: <CheckCircle className="w-6 h-6" />,
    action: {
      type: 'button',
      label: '튜토리얼 종료'
    }
  }
]

// 카테고리 색상
const CATEGORY_COLORS = {
  setup: { bg: 'bg-purple-500', light: 'bg-purple-100', text: 'text-purple-700' },
  connect: { bg: 'bg-blue-500', light: 'bg-blue-100', text: 'text-blue-700' },
  optimize: { bg: 'bg-green-500', light: 'bg-green-100', text: 'text-green-700' },
  monitor: { bg: 'bg-orange-500', light: 'bg-orange-100', text: 'text-orange-700' }
}

// 카테고리 라벨
const CATEGORY_LABELS = {
  setup: '시작하기',
  connect: '연동하기',
  optimize: '최적화',
  monitor: '모니터링'
}

interface AdOptimizerTutorialProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  initialStep?: number
}

export default function AdOptimizerTutorial({
  isOpen,
  onClose,
  onComplete,
  initialStep = 1
}: AdOptimizerTutorialProps) {
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [showHelp, setShowHelp] = useState(false)
  const [animateStep, setAnimateStep] = useState(false)

  // 로컬 스토리지에서 진행 상태 로드
  useEffect(() => {
    const savedProgress = localStorage.getItem('ad_optimizer_tutorial_progress')
    if (savedProgress) {
      try {
        const progress: TutorialProgress = JSON.parse(savedProgress)
        setCurrentStep(progress.currentStep)
        setCompletedSteps(progress.completedSteps)
      } catch (e) {
        // 무시
      }
    }
  }, [])

  // 진행 상태 저장
  const saveProgress = useCallback((step: number, completed: number[]) => {
    const progress: TutorialProgress = {
      currentStep: step,
      completedSteps: completed,
      startedAt: new Date().toISOString(),
      lastVisitedAt: new Date().toISOString()
    }
    localStorage.setItem('ad_optimizer_tutorial_progress', JSON.stringify(progress))
  }, [])

  // 다음 단계로
  const goToNextStep = () => {
    const newCompleted = [...completedSteps]
    if (!newCompleted.includes(currentStep)) {
      newCompleted.push(currentStep)
    }
    setCompletedSteps(newCompleted)

    if (currentStep < TUTORIAL_STEPS.length) {
      const nextStep = currentStep + 1
      setCurrentStep(nextStep)
      saveProgress(nextStep, newCompleted)
      setAnimateStep(true)
      setTimeout(() => setAnimateStep(false), 300)
    } else {
      // 튜토리얼 완료
      localStorage.setItem('ad_optimizer_tutorial_completed', 'true')
      onComplete()
    }
  }

  // 이전 단계로
  const goToPrevStep = () => {
    if (currentStep > 1) {
      const prevStep = currentStep - 1
      setCurrentStep(prevStep)
      saveProgress(prevStep, completedSteps)
      setAnimateStep(true)
      setTimeout(() => setAnimateStep(false), 300)
    }
  }

  // 특정 단계로 이동
  const goToStep = (step: number) => {
    setCurrentStep(step)
    saveProgress(step, completedSteps)
    setAnimateStep(true)
    setTimeout(() => setAnimateStep(false), 300)
  }

  // 튜토리얼 다시 시작
  const restartTutorial = () => {
    setCurrentStep(1)
    setCompletedSteps([])
    localStorage.removeItem('ad_optimizer_tutorial_progress')
    localStorage.removeItem('ad_optimizer_tutorial_completed')
  }

  const currentStepData = TUTORIAL_STEPS[currentStep - 1]
  const progress = (completedSteps.length / TUTORIAL_STEPS.length) * 100

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* 헤더 */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">광고 최적화 설정 가이드</h2>
                  <p className="text-sm text-white/80">따라하기만 하면 5분 안에 완료!</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={restartTutorial}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  title="처음부터 다시 시작"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 진행 바 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>진행률: {Math.round(progress)}%</span>
                <span>{currentStep} / {TUTORIAL_STEPS.length} 단계</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-white rounded-full"
                />
              </div>
            </div>

            {/* 단계 인디케이터 */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {TUTORIAL_STEPS.map((step, idx) => (
                <button
                  key={step.id}
                  onClick={() => goToStep(step.id)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    completedSteps.includes(step.id)
                      ? 'bg-green-500 text-white'
                      : currentStep === step.id
                      ? 'bg-white text-indigo-600 scale-110'
                      : 'bg-white/20 text-white/60 hover:bg-white/30'
                  }`}
                >
                  {completedSteps.includes(step.id) ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    step.id
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 본문 */}
          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: animateStep ? 20 : 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {/* 카테고리 배지 */}
                <div className="flex items-center gap-2 mb-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS[currentStepData.category].light} ${CATEGORY_COLORS[currentStepData.category].text}`}>
                    {CATEGORY_LABELS[currentStepData.category]}
                  </span>
                  <span className="text-sm text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    예상 시간: {currentStepData.estimatedTime}
                  </span>
                </div>

                {/* 제목 */}
                <div className="flex items-start gap-4 mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${CATEGORY_COLORS[currentStepData.category].bg} text-white flex-shrink-0`}>
                    {currentStepData.icon}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-1">
                      {currentStepData.title}
                    </h3>
                    <p className="text-gray-500">{currentStepData.subtitle}</p>
                  </div>
                </div>

                {/* 설명 */}
                <div className="bg-gray-50 rounded-xl p-5 mb-6">
                  <p className="text-gray-700 leading-relaxed text-lg">
                    {currentStepData.description}
                  </p>
                </div>

                {/* 팁 */}
                <div className="space-y-3 mb-6">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-yellow-500" />
                    알아두면 좋은 팁
                  </h4>
                  <div className="space-y-2">
                    {currentStepData.tips.map((tip, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                        <span className="text-yellow-500 font-bold">{idx + 1}</span>
                        <p className="text-gray-700">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 도움말 버튼 */}
                {currentStepData.helpContent && (
                  <button
                    onClick={() => setShowHelp(true)}
                    className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-indigo-200 rounded-xl text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                  >
                    <HelpCircle className="w-5 h-5" />
                    <span className="font-medium">자세한 설정 방법 보기</span>
                  </button>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 하단 버튼 */}
          <div className="border-t bg-gray-50 p-4 flex items-center justify-between">
            <button
              onClick={goToPrevStep}
              disabled={currentStep === 1}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
              이전
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-500 hover:text-gray-700"
              >
                나중에 하기
              </button>
              <button
                onClick={goToNextStep}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
              >
                {currentStep === TUTORIAL_STEPS.length ? (
                  <>
                    완료하기
                    <Check className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    다음
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* 도움말 모달 */}
        <AnimatePresence>
          {showHelp && currentStepData.helpContent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4"
              onClick={() => setShowHelp(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-indigo-600 text-white p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-5 h-5" />
                    <span className="font-semibold">상세 가이드</span>
                  </div>
                  <button
                    onClick={() => setShowHelp(false)}
                    className="p-1 hover:bg-white/20 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[60vh] prose prose-indigo">
                  {/* 마크다운 형식의 도움말 렌더링 */}
                  <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                    {currentStepData.helpContent.split('\n').map((line, idx) => {
                      if (line.startsWith('## ')) {
                        return <h2 key={idx} className="text-xl font-bold text-gray-900 mt-4 mb-2">{line.replace('## ', '')}</h2>
                      }
                      if (line.startsWith('### ')) {
                        return <h3 key={idx} className="text-lg font-semibold text-gray-800 mt-3 mb-1">{line.replace('### ', '')}</h3>
                      }
                      if (line.startsWith('#### ')) {
                        return <h4 key={idx} className="text-base font-medium text-gray-700 mt-2">{line.replace('#### ', '')}</h4>
                      }
                      if (line.startsWith('- ')) {
                        return <li key={idx} className="ml-4 text-gray-600">{line.replace('- ', '')}</li>
                      }
                      if (line.startsWith('💡') || line.startsWith('🛡️') || line.startsWith('⚡') || line.startsWith('🚀')) {
                        return <p key={idx} className="bg-yellow-50 p-3 rounded-lg text-gray-700 my-2">{line}</p>
                      }
                      if (line.trim() === '') {
                        return <br key={idx} />
                      }
                      return <p key={idx} className="text-gray-600">{line}</p>
                    })}
                  </div>
                </div>
                <div className="border-t p-4 flex justify-end">
                  <button
                    onClick={() => setShowHelp(false)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                  >
                    확인했어요
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}

// 도움말 툴팁 컴포넌트
interface HelpTooltipProps {
  content: string
  title?: string
  children?: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function HelpTooltip({ content, title, children, position = 'top' }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="w-5 h-5 rounded-full bg-gray-200 hover:bg-indigo-100 flex items-center justify-center text-gray-500 hover:text-indigo-600 transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`absolute z-50 ${positionClasses[position]}`}
          >
            <div className="bg-gray-900 text-white rounded-lg shadow-xl p-3 min-w-[200px] max-w-[300px]">
              {title && (
                <div className="font-semibold mb-1 text-sm">{title}</div>
              )}
              <p className="text-sm text-gray-300 leading-relaxed">{content}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </div>
  )
}

// 튜토리얼 시작 버튼 컴포넌트
interface TutorialStartButtonProps {
  onClick: () => void
  variant?: 'default' | 'compact' | 'banner'
}

export function TutorialStartButton({ onClick, variant = 'default' }: TutorialStartButtonProps) {
  const [hasCompleted, setHasCompleted] = useState(false)
  const [hasProgress, setHasProgress] = useState(false)

  useEffect(() => {
    setHasCompleted(localStorage.getItem('ad_optimizer_tutorial_completed') === 'true')
    setHasProgress(!!localStorage.getItem('ad_optimizer_tutorial_progress'))
  }, [])

  if (variant === 'compact') {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-200 transition-colors"
      >
        <BookOpen className="w-4 h-4" />
        {hasCompleted ? '튜토리얼 다시 보기' : hasProgress ? '튜토리얼 이어하기' : '설정 가이드'}
      </button>
    )
  }

  if (variant === 'banner') {
    if (hasCompleted) return null

    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4 mb-6 text-white"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <PlayCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold">
                {hasProgress ? '설정을 이어서 진행하세요!' : '처음이신가요? 5분 만에 설정 완료!'}
              </h3>
              <p className="text-sm text-white/80">
                튜토리얼을 따라하면 쉽게 시작할 수 있어요
              </p>
            </div>
          </div>
          <button
            onClick={onClick}
            className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            {hasProgress ? '이어하기' : '시작하기'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    )
  }

  // default variant
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
    >
      <BookOpen className="w-5 h-5" />
      {hasCompleted ? '튜토리얼 다시 보기' : hasProgress ? '설정 이어하기' : '설정 가이드 시작'}
    </button>
  )
}
