'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HelpCircle, X, ChevronRight, Lightbulb, CheckCircle,
  AlertCircle, Info, PlayCircle, BookOpen, ArrowRight,
  Clock, Target, Zap, Shield, Settings, BarChart3
} from 'lucide-react'

// 기능별 도움말 데이터
export interface FeatureHelp {
  id: string
  title: string
  subtitle: string
  description: string
  benefits: string[]
  howToUse: {
    step: number
    title: string
    description: string
  }[]
  tips: string[]
  faqs?: {
    question: string
    answer: string
  }[]
  videoUrl?: string
  estimatedTime?: string
}

// 각 기능의 도움말 정보
export const FEATURE_HELPS: Record<string, FeatureHelp> = {
  'hourly-bidding': {
    id: 'hourly-bidding',
    title: '시간대별 입찰 최적화',
    subtitle: '전환율 높은 시간대에 자동으로 입찰가 조정',
    description: '하루 24시간 중 전환율이 높은 시간대에는 입찰가를 올리고, 낮은 시간대에는 낮춰서 광고비를 15-25% 절감합니다.',
    benefits: [
      '광고비 15-25% 절감 효과',
      '전환율 높은 시간대 집중 노출',
      '새벽/심야 시간 불필요한 지출 방지',
      '자동으로 최적 시간대 학습'
    ],
    howToUse: [
      { step: 1, title: '플랫폼 선택', description: '최적화할 광고 플랫폼을 선택하세요' },
      { step: 2, title: '입찰 범위 설정', description: '입찰가 조정 범위를 설정하세요 (추천: ±20%)' },
      { step: 3, title: '자동 최적화 켜기', description: '스위치를 켜면 AI가 자동으로 조정합니다' },
      { step: 4, title: '1주일 후 확인', description: '성과 리포트에서 절감액을 확인하세요' }
    ],
    tips: [
      '처음에는 ±10% 범위로 시작하세요',
      '최소 1주일의 데이터가 필요해요',
      'B2B는 평일 오전, B2C는 저녁 시간대가 효과적이에요'
    ],
    faqs: [
      {
        question: '얼마나 기다려야 효과를 볼 수 있나요?',
        answer: '보통 1-2주 후부터 효과가 나타나기 시작해요. AI가 데이터를 학습하는 시간이 필요합니다.'
      },
      {
        question: '갑자기 입찰가가 많이 바뀌면 어떡하죠?',
        answer: '설정한 범위 내에서만 조정되니 안심하세요. 처음에는 ±10%로 시작하면 안전해요.'
      }
    ],
    estimatedTime: '설정 5분'
  },
  'anomaly-detection': {
    id: 'anomaly-detection',
    title: '이상 징후 감지',
    subtitle: 'CPC 급등, CTR 급락 등 이상을 실시간 감지',
    description: '광고 성과에 급격한 변화가 생기면 즉시 알려드려요. 문제가 커지기 전에 빠르게 대응할 수 있습니다.',
    benefits: [
      '이상 징후 실시간 알림',
      '문제 원인 자동 분석',
      '대응 방법 즉시 추천',
      '광고비 손실 최소화'
    ],
    howToUse: [
      { step: 1, title: '알림 설정', description: '어떤 이상을 알림받을지 선택하세요' },
      { step: 2, title: '임계값 설정', description: '몇 % 변동 시 알림받을지 설정하세요 (추천: 30%)' },
      { step: 3, title: '알림 채널 선택', description: '이메일, 카카오톡 중 선택하세요' },
      { step: 4, title: '알림 확인', description: '알림을 받으면 권장 조치를 확인하세요' }
    ],
    tips: [
      '임계값은 30%부터 시작하세요',
      '긴급 알림만 먼저 켜두세요',
      '알림이 너무 많으면 임계값을 높이세요'
    ],
    faqs: [
      {
        question: '어떤 이상을 감지하나요?',
        answer: 'CPC 급등, CTR 급락, 노출수 급감, 전환율 급감, 예산 초과 소진 등을 감지해요.'
      },
      {
        question: '오탐지가 많으면 어떡하죠?',
        answer: '임계값을 높이거나 특정 시간대 알림을 끄면 줄일 수 있어요.'
      }
    ],
    estimatedTime: '설정 3분'
  },
  'budget-reallocation': {
    id: 'budget-reallocation',
    title: '크로스 플랫폼 예산 재분배',
    subtitle: 'ROAS 높은 플랫폼에 예산 집중',
    description: '여러 광고 플랫폼의 성과를 비교해서 ROAS가 높은 곳에 더 많은 예산을 자동 배분합니다.',
    benefits: [
      '전체 ROAS 10-20% 개선',
      '효율 낮은 플랫폼 예산 절감',
      '성과 좋은 플랫폼 자동 확대',
      '통합 성과 한눈에 확인'
    ],
    howToUse: [
      { step: 1, title: '플랫폼 연동', description: '최소 2개 이상 플랫폼을 연동하세요' },
      { step: 2, title: '총 예산 설정', description: '전체 광고 예산을 입력하세요' },
      { step: 3, title: '재분배 기준 선택', description: 'ROAS, CPA 등 기준을 선택하세요' },
      { step: 4, title: '자동 재분배 켜기', description: 'AI가 주기적으로 예산을 재분배합니다' }
    ],
    tips: [
      '최소 2개 플랫폼 연동 필요',
      '급격한 변화 방지를 위해 한도 설정하세요',
      '주 1회 재분배가 적당해요'
    ],
    faqs: [
      {
        question: '한 플랫폼으로 예산이 몰리면요?',
        answer: '최소 예산 비율을 설정해서 특정 플랫폼이 0이 되지 않게 할 수 있어요.'
      }
    ],
    estimatedTime: '설정 5분'
  },
  'creative-fatigue': {
    id: 'creative-fatigue',
    title: '크리에이티브 피로도 감지',
    subtitle: '광고 소재 교체 시점 자동 알림',
    description: '같은 광고 소재를 오래 쓰면 효과가 떨어져요. AI가 피로도를 측정해서 교체 시점을 알려드립니다.',
    benefits: [
      '소재 피로도 자동 측정',
      '교체 시점 알림',
      '성과 하락 전 선제 대응',
      'CTR 유지율 향상'
    ],
    howToUse: [
      { step: 1, title: '메타 광고 연동', description: '메타(페이스북/인스타) 광고를 연동하세요' },
      { step: 2, title: '모니터링 시작', description: '자동으로 소재별 성과를 추적합니다' },
      { step: 3, title: '알림 받기', description: '피로도가 높아지면 알림을 받습니다' },
      { step: 4, title: '소재 교체', description: '새 소재로 교체하세요' }
    ],
    tips: [
      '메타 광고에서 가장 효과적',
      '빈도가 3 이상이면 교체 시점',
      '미리 다음 소재를 준비해두세요'
    ],
    estimatedTime: '설정 3분'
  },
  'funnel-bidding': {
    id: 'funnel-bidding',
    title: '퍼널 기반 입찰',
    subtitle: 'TOFU/MOFU/BOFU 단계별 입찰 전략',
    description: '고객 구매 여정 단계별로 다른 입찰 전략을 적용합니다. 인지 단계는 낮게, 구매 단계는 높게 입찰해요.',
    benefits: [
      '구매 단계별 맞춤 입찰',
      '전환 확률 높은 고객 우선',
      'CPA 최적화',
      '마케팅 효율 극대화'
    ],
    howToUse: [
      { step: 1, title: '캠페인 분류', description: '캠페인을 TOFU/MOFU/BOFU로 분류하세요' },
      { step: 2, title: '단계별 목표 설정', description: '각 단계의 KPI를 설정하세요' },
      { step: 3, title: '입찰 배율 설정', description: '단계별 입찰 배율을 설정하세요' },
      { step: 4, title: '자동 최적화', description: 'AI가 단계별로 자동 입찰합니다' }
    ],
    tips: [
      'TOFU: 인지 (낮은 입찰)',
      'MOFU: 고려 (중간 입찰)',
      'BOFU: 구매 (높은 입찰)'
    ],
    estimatedTime: '설정 10분'
  },
  'naver-quality': {
    id: 'naver-quality',
    title: '네이버 품질지수 최적화',
    subtitle: '품질지수 분석 및 CPC 절감 전략',
    description: '네이버 검색광고의 품질지수를 분석하고 개선 방법을 알려드려요. 품질지수가 높으면 CPC가 낮아집니다.',
    benefits: [
      '품질지수 상세 분석',
      'CPC 절감 포인트 발견',
      '키워드별 개선 방법 제시',
      '클릭률/관련성 향상 가이드'
    ],
    howToUse: [
      { step: 1, title: '네이버 광고 연동', description: '네이버 검색광고를 연동하세요' },
      { step: 2, title: '키워드 분석', description: '품질지수가 낮은 키워드를 확인하세요' },
      { step: 3, title: '개선 방법 확인', description: '각 키워드별 개선 팁을 확인하세요' },
      { step: 4, title: '적용 및 확인', description: '개선 후 품질지수 변화를 추적하세요' }
    ],
    tips: [
      '품질지수 7 이상을 목표로 하세요',
      '광고 문구와 키워드 일치도가 중요해요',
      '랜딩 페이지 품질도 영향을 줘요'
    ],
    estimatedTime: '설정 5분'
  },
  'budget-pacing': {
    id: 'budget-pacing',
    title: '예산 페이싱',
    subtitle: '시간대별 예산 분배 최적화',
    description: '하루 예산이 너무 빨리 소진되거나 남지 않도록 시간대별로 균등하게 분배합니다.',
    benefits: [
      '예산 조기 소진 방지',
      '시간대별 균등 노출',
      '저녁 시간대 예산 확보',
      '일일 성과 안정화'
    ],
    howToUse: [
      { step: 1, title: '일일 예산 설정', description: '하루 사용할 총 예산을 설정하세요' },
      { step: 2, title: '페이싱 모드 선택', description: '균등 분배 또는 성과 기반 분배를 선택하세요' },
      { step: 3, title: '시간대 설정', description: '광고 노출 시간대를 설정하세요' },
      { step: 4, title: '모니터링', description: '예산 소진 속도를 실시간 확인하세요' }
    ],
    tips: [
      '처음엔 균등 분배로 시작하세요',
      '오전에 50% 이상 소진되면 조정 필요',
      '주말과 평일 패턴이 다를 수 있어요'
    ],
    estimatedTime: '설정 3분'
  }
}

interface FeatureHelpCardProps {
  featureId: string
  variant?: 'button' | 'inline' | 'floating'
  className?: string
}

export function FeatureHelpCard({ featureId, variant = 'button', className = '' }: FeatureHelpCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const help = FEATURE_HELPS[featureId]

  if (!help) return null

  if (variant === 'button') {
    return (
      <>
        <button
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-700 rounded-lg text-sm font-medium transition-colors ${className}`}
        >
          <HelpCircle className="w-4 h-4" />
          도움말
        </button>

        <FeatureHelpModal
          help={help}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      </>
    )
  }

  if (variant === 'floating') {
    return (
      <>
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all z-40 ${className}`}
        >
          <HelpCircle className="w-6 h-6" />
        </button>

        <FeatureHelpModal
          help={help}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      </>
    )
  }

  // inline variant
  return (
    <div className={`bg-indigo-50 border border-indigo-100 rounded-xl p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 mb-1">{help.title}</h4>
          <p className="text-sm text-gray-600 mb-2">{help.subtitle}</p>
          <button
            onClick={() => setIsOpen(true)}
            className="text-sm text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-800"
          >
            자세히 보기
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <FeatureHelpModal
        help={help}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  )
}

interface FeatureHelpModalProps {
  help: FeatureHelp
  isOpen: boolean
  onClose: () => void
}

function FeatureHelpModal({ help, isOpen, onClose }: FeatureHelpModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'howto' | 'faq'>('overview')

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">{help.title}</h2>
                  <p className="text-sm text-white/80">{help.subtitle}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {help.estimatedTime && (
              <div className="flex items-center gap-2 text-sm text-white/80">
                <Clock className="w-4 h-4" />
                {help.estimatedTime}
              </div>
            )}
          </div>

          {/* 탭 */}
          <div className="flex border-b">
            {[
              { id: 'overview', label: '개요', icon: Info },
              { id: 'howto', label: '사용법', icon: PlayCircle },
              { id: 'faq', label: 'FAQ', icon: HelpCircle }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* 컨텐츠 */}
          <div className="p-5 overflow-y-auto max-h-[50vh]">
            {activeTab === 'overview' && (
              <div className="space-y-5">
                <div>
                  <p className="text-gray-700 leading-relaxed">{help.description}</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    이런 효과가 있어요
                  </h4>
                  <div className="grid gap-2">
                    {help.benefits.map((benefit, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-green-50 rounded-lg"
                      >
                        <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-medium text-sm">
                          {idx + 1}
                        </div>
                        <span className="text-gray-700">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-yellow-500" />
                    꿀팁
                  </h4>
                  <div className="space-y-2">
                    {help.tips.map((tip, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg"
                      >
                        <span className="text-yellow-600">💡</span>
                        <span className="text-gray-700">{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'howto' && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 mb-4">
                  따라하기만 하면 끝!
                </h4>
                <div className="space-y-3">
                  {help.howToUse.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl"
                    >
                      <div className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                        {step.step}
                      </div>
                      <div>
                        <h5 className="font-semibold text-gray-900 mb-1">
                          {step.title}
                        </h5>
                        <p className="text-gray-600 text-sm">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'faq' && help.faqs && (
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 mb-4">
                  자주 묻는 질문
                </h4>
                <div className="space-y-3">
                  {help.faqs.map((faq, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-gray-50 rounded-xl"
                    >
                      <h5 className="font-semibold text-gray-900 mb-2 flex items-start gap-2">
                        <span className="text-indigo-600">Q.</span>
                        {faq.question}
                      </h5>
                      <p className="text-gray-600 text-sm pl-5">
                        <span className="text-green-600 font-medium">A.</span> {faq.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'faq' && !help.faqs && (
              <div className="text-center py-8 text-gray-500">
                <HelpCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>아직 FAQ가 없어요</p>
              </div>
            )}
          </div>

          {/* 하단 버튼 */}
          <div className="border-t p-4 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              닫기
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
            >
              이해했어요!
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// 퀵 스타트 가이드 컴포넌트
interface QuickStartGuideProps {
  className?: string
}

export function QuickStartGuide({ className = '' }: QuickStartGuideProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const quickSteps = [
    { icon: <Link2 className="w-5 h-5" />, title: '1. 플랫폼 연동', desc: '네이버 광고부터 시작하세요', done: false },
    { icon: <Settings className="w-5 h-5" />, title: '2. 최적화 설정', desc: '안전 모드로 시작하세요', done: false },
    { icon: <Shield className="w-5 h-5" />, title: '3. 알림 설정', desc: '긴급 알림만 켜두세요', done: false },
    { icon: <BarChart3 className="w-5 h-5" />, title: '4. 성과 확인', desc: '매일 대시보드를 확인하세요', done: false }
  ]

  return (
    <div className={`bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl overflow-hidden ${className}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-gray-900">퀵 스타트 가이드</h3>
            <p className="text-sm text-gray-500">5분 만에 설정 완료하기</p>
          </div>
        </div>
        <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              {quickSteps.map((step, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    step.done ? 'bg-green-100' : 'bg-white'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    step.done ? 'bg-green-500 text-white' : 'bg-indigo-100 text-indigo-600'
                  }`}>
                    {step.done ? <CheckCircle className="w-4 h-4" /> : step.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 text-sm">{step.title}</div>
                    <div className="text-xs text-gray-500">{step.desc}</div>
                  </div>
                  {!step.done && (
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
