'use client'

import { useState, useCallback, ClipboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, CheckCircle, Rocket, Lock,
  ChevronRight, ChevronLeft, ChevronDown,
  Loader2, AlertTriangle, HelpCircle,
  ExternalLink, Eye, EyeOff, Zap, Star, Trophy, Target,
  Search, Settings, Copy, Shield
} from 'lucide-react'
import confetti from 'canvas-confetti'
import toast from 'react-hot-toast'
import { useXPStore } from '@/lib/stores/xp'
import { adPost } from '@/lib/api/adFetch'

// ============================================================
// 8단계 미션 정의
// ============================================================

interface Step {
  id: number
  title: string
  icon: string
  xp: number
  description: string
  estimatedTime: string
  phaseIndex: number
}

interface Phase {
  id: string
  icon: string
  label: string
}

const PHASES: Phase[] = [
  { id: 'login', icon: '🌐', label: '로그인' },
  { id: 'find', icon: '🔍', label: '메뉴 찾기' },
  { id: 'api', icon: '🔑', label: 'API 발급' },
  { id: 'connect', icon: '✅', label: '연동' },
  { id: 'complete', icon: '🚀', label: '완료' },
]

const STEPS: Step[] = [
  { id: 1, title: '네이버 광고 사이트 접속', icon: '🌐', xp: 10, description: 'searchad.naver.com에 접속하세요', estimatedTime: '~1분', phaseIndex: 0 },
  { id: 2, title: '광고 계정 확인하기', icon: '👤', xp: 10, description: '광고 계정이 있는지 확인하세요', estimatedTime: '~2분', phaseIndex: 0 },
  { id: 3, title: '"광고시스템" 버튼 클릭', icon: '🖱️', xp: 10, description: '광고시스템 버튼을 찾아 클릭하세요', estimatedTime: '~30초', phaseIndex: 1 },
  { id: 4, title: '"도구 > API 사용 관리" 클릭', icon: '📋', xp: 15, description: '도구 메뉴에서 API 관리를 찾으세요', estimatedTime: '~30초', phaseIndex: 1 },
  { id: 5, title: 'API 서비스 신청하기', icon: '📝', xp: 20, description: 'API 라이선스를 신청하세요', estimatedTime: '~1분', phaseIndex: 2 },
  { id: 6, title: '3가지 키 복사하기', icon: '🔑', xp: 30, description: '고객ID, API키, 비밀키를 복사하세요', estimatedTime: '~2분', phaseIndex: 2 },
  { id: 7, title: '키 입력하고 연동하기', icon: '✅', xp: 40, description: 'API 키를 입력하고 연동하세요', estimatedTime: '~1분', phaseIndex: 3 },
  { id: 8, title: '자동 최적화 시작', icon: '🚀', xp: 50, description: '자동 최적화를 시작하세요', estimatedTime: '~30초', phaseIndex: 4 },
]

const COMPLETION_BONUS = 100

// ============================================================
// 트러블슈팅 데이터
// ============================================================

interface TroubleshootItem {
  symptom: string
  solution: string
  severity: 'info' | 'warning' | 'critical'
}

const TROUBLESHOOT_DATA: Record<number, TroubleshootItem[]> = {
  1: [
    { symptom: '네이버 아이디가 없어요', solution: 'nid.naver.com에서 네이버 아이디를 먼저 만드세요. 이메일 또는 휴대폰으로 간편 가입할 수 있습니다.', severity: 'info' },
    { symptom: '로그인이 안 돼요', solution: '네이버 아이디/비밀번호를 확인하세요. 2단계 인증이 설정되어 있다면 인증 앱에서 확인 코드를 입력해야 합니다.', severity: 'warning' },
    { symptom: '사이트가 안 열려요', solution: '인터넷 연결을 확인하거나, 다른 브라우저(크롬 권장)로 시도해보세요.', severity: 'warning' },
  ],
  2: [
    { symptom: '광고 계정이 없어요', solution: 'searchad.naver.com 에서 "광고주 가입" 버튼을 클릭하세요. 개인 유형으로 가입하면 사업자등록번호 없이도 가능합니다.', severity: 'info' },
    { symptom: '가입 시 사업자등록번호를 요구해요', solution: '"개인" 유형을 선택하면 사업자등록번호 없이 가입할 수 있습니다. 비즈머니 충전도 불필요합니다.', severity: 'info' },
    { symptom: '이미 계정이 있는 것 같아요', solution: '로그인 후 메인 화면에서 계정 정보가 보이면 이미 계정이 있는 것입니다. "이미 계정 있어요" 버튼을 클릭하세요.', severity: 'info' },
  ],
  3: [
    { symptom: '"광고시스템" 버튼이 안 보여요', solution: '로그인 후 메인 화면 중앙에 초록색 "광고시스템" 버튼이 있습니다. 화면을 아래로 스크롤해보세요.', severity: 'warning' },
    { symptom: '팝업이 차단돼요', solution: '브라우저 주소창 오른쪽의 팝업 차단 아이콘을 클릭하여 searchad.naver.com의 팝업을 허용하세요.', severity: 'warning' },
    { symptom: '다른 화면이 나와요', solution: '메인 페이지(searchad.naver.com)로 다시 이동한 후, 초록색 "광고시스템" 버튼을 찾아보세요.', severity: 'info' },
  ],
  4: [
    { symptom: '"도구" 메뉴가 안 보여요', solution: '광고시스템 상단 메뉴바 맨 오른쪽에 "도구"가 있습니다. 화면 너비가 좁으면 "더보기(≡)" 안에 숨어있을 수 있습니다.', severity: 'warning' },
    { symptom: '"API 사용 관리"가 없어요', solution: '마스터 권한이 필요합니다. 계정 소유자(마스터)로 로그인했는지 확인하세요. 서브 계정은 API 메뉴가 보이지 않습니다.', severity: 'critical' },
    { symptom: '메뉴 클릭이 안 돼요', solution: '브라우저를 새로고침(F5)하거나, 크롬 브라우저로 다시 시도해보세요.', severity: 'info' },
  ],
  5: [
    { symptom: '이미 API가 발급된 상태예요', solution: '이미 발급되어 있다면 기존 키를 사용하세요. 비밀키를 분실했다면 기존 라이선스를 삭제하고 재발급하세요.', severity: 'info' },
    { symptom: '약관 동의 화면이 안 나와요', solution: '"네이버 검색광고 API 서비스 신청" 버튼을 클릭하면 약관 동의 화면이 나타납니다. 팝업 차단을 해제하세요.', severity: 'warning' },
    { symptom: '신청 버튼이 비활성화 돼요', solution: '약관에 모두 동의(체크)해야 저장 버튼이 활성화됩니다. 체크박스를 모두 체크했는지 확인하세요.', severity: 'warning' },
  ],
  6: [
    { symptom: '비밀키를 못 복사했어요', solution: '비밀키는 발급 시 1회만 표시됩니다. 기존 API 라이선스를 삭제하고 재발급하면 새로운 비밀키를 받을 수 있습니다.', severity: 'critical' },
    { symptom: '고객 ID를 모르겠어요', solution: '광고시스템 화면 좌상단의 계정 이름 옆에 있는 숫자(예: 1234567)가 고객 ID입니다.', severity: 'info' },
    { symptom: '복사 버튼이 안 돼요', solution: '텍스트를 마우스로 드래그하여 선택한 후 Ctrl+C로 직접 복사하세요.', severity: 'info' },
  ],
  7: [
    { symptom: '"인증 실패" 오류가 나와요', solution: 'API 키와 비밀키가 같은 라이선스에서 발급된 것인지 확인하세요. 앞뒤 공백 없이 정확히 입력해야 합니다.', severity: 'critical' },
    { symptom: '고객 ID 오류가 나와요', solution: '고객 ID는 정확히 숫자 7자리입니다. 광고시스템 좌상단에서 확인하세요.', severity: 'warning' },
    { symptom: '서버 연결 오류가 나와요', solution: '인터넷 연결을 확인하고, 잠시 후 다시 시도해보세요.', severity: 'warning' },
  ],
  8: [],
}

// ============================================================
// 공용 서브컴포넌트
// ============================================================

/** 브라우저 모형 프레임 */
function NaverScreenMockup({
  url,
  children,
}: {
  url: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden shadow-md bg-white">
      {/* Browser chrome bar */}
      <div className="bg-gray-100 border-b border-gray-200 px-3 py-2 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 ml-2">
          <div className="bg-white border border-gray-200 rounded-md px-3 py-1 text-xs text-gray-500 flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-green-500" />
            {url}
          </div>
        </div>
      </div>
      {/* Content area */}
      <div className="p-4 min-h-[180px]">
        {children}
      </div>
    </div>
  )
}

/** 클릭 유도 인디케이터 */
function ClickIndicator({
  children,
  label = '여기를 클릭!',
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label?: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <div className="relative inline-block">
      <div
        onClick={disabled ? undefined : onClick}
        className={`relative z-10 ${disabled ? '' : 'cursor-pointer'}`}
      >
        <div className={`${disabled ? '' : 'animate-pulse ring-2 ring-red-400 ring-offset-2'} rounded-lg`}>
          {children}
        </div>
      </div>
      {!disabled && (
        <motion.div
          animate={{ x: [0, 4, -4, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs font-bold text-red-500 whitespace-nowrap flex items-center gap-1"
        >
          <span className="text-sm">👆</span> {label}
        </motion.div>
      )}
    </div>
  )
}

/** 트러블슈팅 패널 - "막혔어요" */
function TroubleshootingPanel({ stepId }: { stepId: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const [openItem, setOpenItem] = useState<number | null>(null)
  const items = TROUBLESHOOT_DATA[stepId] || []

  if (items.length === 0) return null

  const severityColor = {
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    critical: 'border-red-200 bg-red-50 text-red-800',
  }

  const severityIcon = {
    info: 'text-blue-500',
    warning: 'text-amber-500',
    critical: 'text-red-500',
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-500 transition-colors group"
      >
        <HelpCircle className="w-4 h-4 group-hover:text-red-500" />
        {isOpen ? '도움말 닫기' : '막혔어요 😢'}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`border rounded-xl overflow-hidden ${severityColor[item.severity]}`}
                >
                  <button
                    onClick={() => setOpenItem(openItem === idx ? null : idx)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${severityIcon[item.severity]}`} />
                      {item.symptom}
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${openItem === idx ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {openItem === idx && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 text-sm opacity-90">
                          {item.solution}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** 5개 페이즈 진행 표시 */
function PhaseProgressBar({
  currentStep,
  completedSteps,
}: {
  currentStep: number
  completedSteps: Set<number>
}) {
  const getPhaseStatus = (phaseIndex: number) => {
    const phaseSteps = STEPS.filter(s => s.phaseIndex === phaseIndex)
    const allCompleted = phaseSteps.every(s => completedSteps.has(s.id - 1))
    const anyCurrent = phaseSteps.some(s => s.id - 1 === currentStep)
    const anyCompleted = phaseSteps.some(s => completedSteps.has(s.id - 1))

    if (allCompleted) return 'completed'
    if (anyCurrent || anyCompleted) return 'current'
    return 'locked'
  }

  return (
    <div className="flex items-center justify-between px-2">
      {PHASES.map((phase, idx) => {
        const status = getPhaseStatus(idx)
        return (
          <div key={phase.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
                status === 'completed'
                  ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                  : status === 'current'
                  ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30 ring-2 ring-purple-200'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {status === 'completed' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <span>{phase.icon}</span>
                )}
              </div>
              <span className={`text-[10px] font-medium ${
                status === 'completed' ? 'text-green-600'
                  : status === 'current' ? 'text-purple-600'
                  : 'text-gray-400'
              }`}>
                {phase.label}
              </span>
            </div>
            {idx < PHASES.length - 1 && (
              <div className={`w-6 sm:w-10 h-0.5 mx-1 mt-[-14px] ${
                getPhaseStatus(idx) === 'completed' ? 'bg-green-400' : 'bg-gray-200'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// 미션 카드 래퍼
// ============================================================

function StepCard({
  stepIndex,
  children,
  completed,
  onBack,
}: {
  stepIndex: number
  children: React.ReactNode
  completed: boolean
  onBack?: () => void
}) {
  const step = STEPS[stepIndex]
  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden transition-all ${
      completed ? 'ring-2 ring-green-400' : ''
    }`}>
      {/* Step Header */}
      <div className={`px-6 py-4 ${
        completed
          ? 'bg-gradient-to-r from-green-500 to-emerald-600'
          : 'bg-gradient-to-r from-purple-600 to-indigo-600'
      } text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && !completed && (
              <button
                onClick={onBack}
                className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">
              {completed ? <CheckCircle className="w-6 h-6" /> : step.icon}
            </div>
            <div>
              <div className="text-white/80 text-xs font-medium flex items-center gap-2">
                STEP {stepIndex + 1}/{STEPS.length}
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{step.estimatedTime}</span>
              </div>
              <h3 className="text-lg font-bold">{step.title}</h3>
            </div>
          </div>
          {completed ? (
            <div className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
              완료!
            </div>
          ) : (
            <div className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              +{step.xp} XP
            </div>
          )}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-6">
        {children}
      </div>

      {/* XP Preview */}
      {!completed && (
        <div className="px-6 py-3 bg-gray-50 border-t flex items-center justify-center gap-2 text-sm text-gray-500">
          <Zap className="w-4 h-4 text-yellow-500" />
          이 미션 완료 시 <span className="font-bold text-yellow-600">+{step.xp} XP</span>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Props 인터페이스 (기존과 동일)
// ============================================================

interface AccountSetupWizardProps {
  userId: number
  onComplete: (account: { customer_id: string; name: string }) => void
  onStartAutoOptimization: () => void
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function AccountSetupWizard({ userId, onComplete, onStartAutoOptimization }: AccountSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [sessionXP, setSessionXP] = useState(0)
  const [showXPGain, setShowXPGain] = useState(false)
  const [lastXPGain, setLastXPGain] = useState(0)
  const [showCelebration, setShowCelebration] = useState(false)

  // Step 7 form state
  const [connectForm, setConnectForm] = useState({
    customer_id: '',
    api_key: '',
    secret_key: '',
    name: ''
  })
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [connectedAccount, setConnectedAccount] = useState<{ customer_id: string; name: string } | null>(null)

  // Step 5 interactive state
  const [apiSubStep, setApiSubStep] = useState(0) // 0: 신청 클릭, 1: 약관 동의, 2: 저장 완료

  const { earnXP, totalXP, getCurrentRank } = useXPStore()
  const currentRank = getCurrentRank()

  const fireConfetti = useCallback(() => {
    if (typeof window === 'undefined') return
    const count = 200
    const defaults = { origin: { y: 0.7 }, zIndex: 9999 }
    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({ ...defaults, ...opts, particleCount: Math.floor(count * particleRatio) })
    }
    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2, { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1, { spread: 120, startVelocity: 45 })
  }, [])

  const completeStep = useCallback((stepIndex: number) => {
    if (completedSteps.has(stepIndex)) return

    const step = STEPS[stepIndex]
    const newCompleted = new Set(completedSteps)
    newCompleted.add(stepIndex)
    setCompletedSteps(newCompleted)

    earnXP(step.xp, `account_wizard_step_${step.id}`)
    setSessionXP(prev => prev + step.xp)
    setLastXPGain(step.xp)
    setShowXPGain(true)
    setTimeout(() => setShowXPGain(false), 1500)

    if (stepIndex < STEPS.length - 1) {
      setTimeout(() => setCurrentStep(stepIndex + 1), 600)
    }
  }, [completedSteps, earnXP])

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }, [currentStep])

  const handleFinalComplete = useCallback(() => {
    completeStep(7)
    setTimeout(() => {
      earnXP(COMPLETION_BONUS, 'account_wizard_complete')
      setSessionXP(prev => prev + COMPLETION_BONUS)
      setShowCelebration(true)
      fireConfetti()
    }, 800)
  }, [completeStep, earnXP, fireConfetti])

  // Step 7: Connect account
  const connectAccount = async () => {
    if (!connectForm.customer_id || !connectForm.api_key || !connectForm.secret_key) {
      toast.error('모든 필수 항목을 입력해주세요')
      return
    }
    setIsConnecting(true)
    setConnectError(null)
    try {
      // 백엔드 connect 는 연결테스트(get_campaigns) 실패 시에도 HTTP 200 + {success:false}
      // 로 응답한다 (네이버 일시 ConnectTimeout 등). adFetch 는 2xx 라 throw 안 하므로
      // body.success 를 직접 확인해 거짓 성공("연동되었습니다!") 표시를 막는다.
      const res = await adPost<{ success?: boolean; message?: string }>(
        '/api/naver-ad/account/connect', connectForm, { userId }
      )
      if (res && res.success === false) {
        setConnectError(
          res.message || 'API 연결 확인에 실패했습니다. 고객 ID·API 키·비밀키를 확인하거나 잠시 후 다시 시도하세요.'
        )
        return
      }
      toast.success('계정이 연동되었습니다!')
      setConnectedAccount({
        customer_id: connectForm.customer_id,
        name: connectForm.name || `계정 ${connectForm.customer_id}`
      })
      fireConfetti()
      completeStep(6)
      onComplete({
        customer_id: connectForm.customer_id,
        name: connectForm.name
      })
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : '계정 연동에 실패했습니다.'
      // Pattern-match error messages
      if (detail.includes('고객') || detail.includes('customer')) {
        setConnectError('고객 ID가 올바르지 않습니다. 광고시스템 좌상단에서 정확한 번호를 확인하세요.')
      } else if (detail.includes('인증') || detail.includes('auth') || detail.includes('401')) {
        setConnectError('API 키 또는 비밀키가 올바르지 않습니다. 키 정보를 다시 확인하세요.')
      } else if (detail.includes('네트워크') || detail.includes('network') || detail.includes('연결')) {
        setConnectError('서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도하세요.')
      } else {
        setConnectError(detail)
      }
    } finally {
      setIsConnecting(false)
    }
  }

  // 붙여넣기 핸들러 - 공백 자동 제거
  const handlePaste = (
    field: 'customer_id' | 'api_key' | 'secret_key',
    e: ClipboardEvent<HTMLInputElement>
  ) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\s/g, '')
    const value = field === 'customer_id' ? pasted.replace(/\D/g, '').slice(0, 7) : pasted
    setConnectForm(prev => ({ ...prev, [field]: value }))
    toast.success('붙여넣기 완료! (공백 자동 제거됨)', { duration: 2000, icon: '📋' })
  }

  const progressPercentage = (completedSteps.size / STEPS.length) * 100

  return (
    <div className="space-y-6">
      {/* XP Gain Animation */}
      <AnimatePresence>
        {showXPGain && (
          <motion.div
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -30 }}
            exit={{ opacity: 0, y: -60 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-6 py-3 rounded-full font-bold shadow-lg text-lg"
          >
            +{lastXPGain} XP ⚡
          </motion.div>
        )}
      </AnimatePresence>

      {/* Celebration Modal */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-500 p-1 rounded-3xl mx-4"
            >
              <div className="bg-white rounded-3xl p-8 text-center max-w-md">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5, repeat: 2 }}
                  className="text-6xl mb-4"
                >
                  🎉
                </motion.div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">미션 올클리어!</h2>
                <p className="text-gray-600 mb-4">네이버 광고 연동이 완료되었습니다!</p>

                <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-2xl p-4 mb-4">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                    <span className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                      +{sessionXP} XP
                    </span>
                    <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                  </div>
                  <p className="text-sm text-gray-500">총 획득 경험치</p>
                  <p className="text-xs text-purple-600 mt-1">
                    {currentRank.icon} 총 {totalXP.toLocaleString()} XP ({currentRank.name})
                  </p>
                </div>

                <div className="flex justify-center gap-2 mb-6 flex-wrap">
                  <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm flex items-center gap-1">
                    <Trophy className="w-4 h-4" />
                    계정 연동 완료
                  </div>
                  <div className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm flex items-center gap-1">
                    <Target className="w-4 h-4" />
                    광고 전문가
                  </div>
                </div>

                <button
                  onClick={() => setShowCelebration(false)}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
                >
                  대시보드로 가기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Section */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded-full text-sm font-medium">
              <span className="text-base">{currentRank.icon}</span>
              {currentRank.name}
            </div>
            <div className="flex items-center gap-1 text-yellow-600 font-medium text-sm">
              <Star className="w-4 h-4 fill-yellow-500" />
              {totalXP.toLocaleString()} XP
              {sessionXP > 0 && (
                <span className="text-green-500 text-xs">(+{sessionXP})</span>
              )}
            </div>
          </div>
          <div className="text-sm text-gray-500">
            {completedSteps.size} / {STEPS.length} 완료
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Phase Progress */}
        <PhaseProgressBar currentStep={currentStep} completedSteps={completedSteps} />
      </motion.div>

      {/* Current Step Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3 }}
        >
          {currentStep === 0 && (
            <Step1
              completed={completedSteps.has(0)}
              onComplete={() => completeStep(0)}
            />
          )}
          {currentStep === 1 && (
            <Step2
              completed={completedSteps.has(1)}
              onComplete={() => completeStep(1)}
              onBack={goBack}
            />
          )}
          {currentStep === 2 && (
            <Step3
              completed={completedSteps.has(2)}
              onComplete={() => completeStep(2)}
              onBack={goBack}
            />
          )}
          {currentStep === 3 && (
            <Step4
              completed={completedSteps.has(3)}
              onComplete={() => completeStep(3)}
              onBack={goBack}
            />
          )}
          {currentStep === 4 && (
            <Step5
              completed={completedSteps.has(4)}
              onComplete={() => completeStep(4)}
              onBack={goBack}
              subStep={apiSubStep}
              setSubStep={setApiSubStep}
            />
          )}
          {currentStep === 5 && (
            <Step6
              completed={completedSteps.has(5)}
              onComplete={() => completeStep(5)}
              onBack={goBack}
            />
          )}
          {currentStep === 6 && (
            <Step7
              completed={completedSteps.has(6)}
              connectForm={connectForm}
              setConnectForm={setConnectForm}
              isConnecting={isConnecting}
              connectError={connectError}
              showSecretKey={showSecretKey}
              setShowSecretKey={setShowSecretKey}
              onConnect={connectAccount}
              onBack={goBack}
              handlePaste={handlePaste}
            />
          )}
          {currentStep === 7 && (
            <Step8
              completed={completedSteps.has(7)}
              connectedAccount={connectedAccount}
              onStartOptimization={() => {
                handleFinalComplete()
                onStartAutoOptimization()
              }}
              onSkip={handleFinalComplete}
              onBack={goBack}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ============================================================
// Step 1: 네이버 광고 사이트 접속
// ============================================================

function Step1({
  completed,
  onComplete,
}: {
  completed: boolean
  onComplete: () => void
}) {
  return (
    <StepCard stepIndex={0} completed={completed}>
      <div className="space-y-5">
        <p className="text-gray-700 leading-relaxed">
          네이버 검색광고 센터에 로그인해야 API 키를 발급받을 수 있습니다.
          아래 버튼을 클릭하여 새 탭에서 광고센터에 접속하세요.
        </p>

        {/* CSS 모형: 네이버 로그인 페이지 */}
        <NaverScreenMockup url="searchad.naver.com">
          <div className="flex flex-col items-center justify-center py-4 space-y-4">
            <div className="text-2xl font-bold text-green-500">NAVER</div>
            <div className="text-sm text-gray-600">네이버 검색광고</div>
            <div className="w-48 h-8 bg-gray-100 border border-gray-200 rounded flex items-center px-3">
              <span className="text-xs text-gray-400">아이디</span>
            </div>
            <div className="w-48 h-8 bg-gray-100 border border-gray-200 rounded flex items-center px-3">
              <span className="text-xs text-gray-400">비밀번호</span>
            </div>
            <div className="w-48 h-9 bg-green-500 rounded flex items-center justify-center">
              <span className="text-white text-sm font-medium">로그인</span>
            </div>
          </div>
        </NaverScreenMockup>

        <a
          href="https://searchad.naver.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 w-full px-6 py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium text-lg transition-colors"
        >
          <Globe className="w-6 h-6" />
          네이버 광고센터 열기
          <ExternalLink className="w-5 h-5" />
        </a>

        <TroubleshootingPanel stepId={1} />

        {!completed && (
          <button
            onClick={onComplete}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            <CheckCircle className="w-5 h-5" />
            로그인 완료!
          </button>
        )}
      </div>
    </StepCard>
  )
}

// ============================================================
// Step 2: 광고 계정 확인하기
// ============================================================

function Step2({
  completed,
  onComplete,
  onBack,
}: {
  completed: boolean
  onComplete: () => void
  onBack: () => void
}) {
  return (
    <StepCard stepIndex={1} completed={completed} onBack={onBack}>
      <div className="space-y-5">
        <p className="text-gray-700 leading-relaxed">
          로그인 후, 광고 계정이 있는지 확인하세요. 계정이 없으면 무료로 만들 수 있습니다.
        </p>

        {/* CSS 모형: 로그인 후 화면 */}
        <NaverScreenMockup url="searchad.naver.com">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm font-bold text-green-600">NAVER 검색광고</span>
              <span className="text-xs text-gray-500">사용자님 ▾</span>
            </div>
            <div className="flex flex-col items-center py-3 space-y-3">
              <div className="text-sm text-gray-700">광고 계정 목록</div>
              <div className="w-full max-w-xs bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">계정이 있으면 여기에 표시됩니다</div>
                <div className="text-xs text-gray-400 mt-1">없으면 &quot;광고주 가입&quot; 진행</div>
              </div>
            </div>
          </div>
        </NaverScreenMockup>

        {/* 중요 안내 */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-800 space-y-1">
              <p className="font-semibold">안심하세요! 완전 무료입니다</p>
              <p>• 사업자등록번호 <strong>불필요</strong> (개인 유형 선택)</p>
              <p>• 비즈머니 충전 <strong>불필요</strong></p>
              <p>• API 키 발급만 하면 됩니다</p>
            </div>
          </div>
        </div>

        <TroubleshootingPanel stepId={2} />

        {!completed && (
          <div className="space-y-2">
            <button
              onClick={onComplete}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
            >
              <CheckCircle className="w-5 h-5" />
              계정 확인 완료!
            </button>
            <button
              onClick={onComplete}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-xl transition-colors"
            >
              이미 계정 있어요 (건너뛰기)
            </button>
          </div>
        )}
      </div>
    </StepCard>
  )
}

// ============================================================
// Step 3: "광고시스템" 버튼 클릭 (가장 자주 놓치는 단계)
// ============================================================

function Step3({
  completed,
  onComplete,
  onBack,
}: {
  completed: boolean
  onComplete: () => void
  onBack: () => void
}) {
  const [mockClicked, setMockClicked] = useState(false)

  return (
    <StepCard stepIndex={2} completed={completed} onBack={onBack}>
      <div className="space-y-5">
        <p className="text-gray-700 leading-relaxed">
          로그인 후 메인 화면 중앙에 있는 <strong className="text-green-600">&quot;광고시스템&quot;</strong> 버튼을 클릭하세요.
          이 버튼을 놓치는 분이 많습니다!
        </p>

        {/* CSS 모형: 메인 화면 + 광고시스템 버튼 */}
        <NaverScreenMockup url="searchad.naver.com">
          <div className="space-y-3">
            {/* 상단 바 */}
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-green-600">NAVER</span>
                <span className="text-xs text-gray-500">검색광고</span>
              </div>
              <span className="text-xs text-gray-500">사용자님</span>
            </div>

            {/* 중앙 콘텐츠 */}
            <div className="flex flex-col items-center py-4 space-y-4">
              <p className="text-sm text-gray-600">광고 관리를 시작하시겠습니까?</p>

              <ClickIndicator
                onClick={() => setMockClicked(true)}
                disabled={mockClicked}
                label="이 버튼을 클릭!"
              >
                <div className={`px-8 py-3 rounded-lg font-bold text-white text-base transition-all ${
                  mockClicked
                    ? 'bg-green-400'
                    : 'bg-green-500 hover:bg-green-600'
                }`}>
                  {mockClicked ? '✓ 클릭 완료!' : '광고시스템'}
                </div>
              </ClickIndicator>

              {mockClicked && (
                <motion.p
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-green-600 font-medium mt-2"
                >
                  잘 찾으셨어요! 실제 화면에서도 이 버튼을 클릭하세요.
                </motion.p>
              )}
            </div>
          </div>
        </NaverScreenMockup>

        <TroubleshootingPanel stepId={3} />

        {!completed && (
          <button
            onClick={onComplete}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            <CheckCircle className="w-5 h-5" />
            광고시스템에 들어갔어요!
          </button>
        )}
      </div>
    </StepCard>
  )
}

// ============================================================
// Step 4: "도구 > API 사용 관리" 클릭
// ============================================================

function Step4({
  completed,
  onComplete,
  onBack,
}: {
  completed: boolean
  onComplete: () => void
  onBack: () => void
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [apiClicked, setApiClicked] = useState(false)

  return (
    <StepCard stepIndex={3} completed={completed} onBack={onBack}>
      <div className="space-y-5">
        <p className="text-gray-700 leading-relaxed">
          광고시스템 상단 메뉴에서 <strong>&quot;도구&quot;</strong>를 클릭한 후,
          드롭다운에서 <strong className="text-indigo-600">&quot;API 사용 관리&quot;</strong>를 클릭하세요.
        </p>

        {/* CSS 모형: 광고 관리 네비게이션 바 */}
        <NaverScreenMockup url="searchad.naver.com/dashboard">
          <div className="space-y-3">
            {/* 네비게이션 바 */}
            <div className="bg-gray-800 rounded-lg px-4 py-2 flex items-center gap-4 text-xs text-gray-300 overflow-x-auto">
              <span className="text-green-400 font-bold whitespace-nowrap">NAVER 광고</span>
              <span className="hover:text-white cursor-default whitespace-nowrap">캠페인</span>
              <span className="hover:text-white cursor-default whitespace-nowrap">광고그룹</span>
              <span className="hover:text-white cursor-default whitespace-nowrap">키워드</span>
              <span className="hover:text-white cursor-default whitespace-nowrap">소재</span>
              <span className="hover:text-white cursor-default whitespace-nowrap">보고서</span>
              <div className="relative">
                <ClickIndicator
                  onClick={() => setShowDropdown(!showDropdown)}
                  disabled={apiClicked}
                  label={showDropdown ? '' : '도구를 클릭!'}
                >
                  <span className={`whitespace-nowrap px-2 py-1 rounded ${
                    showDropdown || apiClicked ? 'bg-white/20 text-white' : 'text-gray-300'
                  }`}>
                    도구 ▾
                  </span>
                </ClickIndicator>

                {/* 드롭다운 */}
                <AnimatePresence>
                  {showDropdown && !apiClicked && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="absolute top-8 right-0 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-20 min-w-[160px]"
                    >
                      <div className="px-3 py-2 text-gray-600 hover:bg-gray-50 cursor-default text-xs">대량관리</div>
                      <div className="px-3 py-2 text-gray-600 hover:bg-gray-50 cursor-default text-xs">비즈채널 관리</div>
                      <ClickIndicator
                        onClick={() => {
                          setApiClicked(true)
                          setShowDropdown(false)
                        }}
                        label="여기를 클릭!"
                      >
                        <div className="px-3 py-2 text-indigo-600 font-bold hover:bg-indigo-50 cursor-pointer text-xs">
                          API 사용 관리
                        </div>
                      </ClickIndicator>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 본문 영역 */}
            <div className="flex items-center justify-center py-6 text-sm text-gray-400">
              {apiClicked ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center space-y-1"
                >
                  <CheckCircle className="w-8 h-8 text-green-500 mx-auto" />
                  <p className="text-green-600 font-medium text-xs">정확해요! 실제 화면에서도 같은 순서로 진행하세요.</p>
                </motion.div>
              ) : (
                <p className="text-xs">{showDropdown ? '드롭다운에서 "API 사용 관리"를 클릭하세요' : '위 메뉴바에서 "도구"를 클릭해보세요'}</p>
              )}
            </div>
          </div>
        </NaverScreenMockup>

        <TroubleshootingPanel stepId={4} />

        {!completed && (
          <button
            onClick={onComplete}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            <CheckCircle className="w-5 h-5" />
            API 관리 메뉴 찾았어요!
          </button>
        )}
      </div>
    </StepCard>
  )
}

// ============================================================
// Step 5: API 서비스 신청하기 (인터랙티브 모형)
// ============================================================

function Step5({
  completed,
  onComplete,
  onBack,
  subStep,
  setSubStep,
}: {
  completed: boolean
  onComplete: () => void
  onBack: () => void
  subStep: number
  setSubStep: (v: number) => void
}) {
  const [termsChecked, setTermsChecked] = useState(false)

  return (
    <StepCard stepIndex={4} completed={completed} onBack={onBack}>
      <div className="space-y-5">
        <p className="text-gray-700 leading-relaxed">
          API 관리 화면에서 서비스를 신청하세요. 아래 모형에서 연습해볼 수 있습니다.
        </p>

        {/* SubStep Tracker */}
        <div className="flex items-center justify-center gap-2 text-xs">
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full ${
            subStep >= 0 ? 'bg-purple-100 text-purple-700 font-medium' : 'bg-gray-100 text-gray-400'
          }`}>
            {subStep > 0 ? <CheckCircle className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-current inline-block" />}
            신청 클릭
          </div>
          <ChevronRight className="w-3 h-3 text-gray-300" />
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full ${
            subStep >= 1 ? 'bg-purple-100 text-purple-700 font-medium' : 'bg-gray-100 text-gray-400'
          }`}>
            {subStep > 1 ? <CheckCircle className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-current inline-block" />}
            약관 동의
          </div>
          <ChevronRight className="w-3 h-3 text-gray-300" />
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full ${
            subStep >= 2 ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-100 text-gray-400'
          }`}>
            {subStep >= 2 ? <CheckCircle className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-current inline-block" />}
            저장
          </div>
        </div>

        {/* CSS 모형: 인터랙티브 API 신청 */}
        <NaverScreenMockup url="searchad.naver.com/dashboard/api-manager">
          {subStep === 0 && (
            <div className="flex flex-col items-center py-6 space-y-4">
              <Settings className="w-10 h-10 text-gray-400" />
              <p className="text-sm text-gray-600">API 라이선스 관리</p>
              <p className="text-xs text-gray-400">등록된 API 라이선스가 없습니다.</p>
              <ClickIndicator
                onClick={() => setSubStep(1)}
                label="이 버튼을 클릭!"
              >
                <div className="px-6 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">
                  네이버 검색광고 API 서비스 신청
                </div>
              </ClickIndicator>
            </div>
          )}

          {subStep === 1 && (
            <div className="py-3 space-y-4">
              <p className="text-sm font-semibold text-gray-700">API 서비스 이용 약관</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 h-24 overflow-y-auto text-[10px] text-gray-500 leading-relaxed">
                제1조 (목적) 이 약관은 네이버 검색광고 API 서비스 이용에 관한 사항을 규정함을 목적으로 합니다.
                제2조 (정의) API 라이선스란 검색광고 시스템에 프로그래밍 방식으로 접근하기 위한 인증 수단을 말합니다.
                제3조 (서비스 이용) API를 통한 데이터 조회 및 광고 관리가 가능합니다...
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsChecked}
                  onChange={(e) => setTermsChecked(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">위 약관에 동의합니다</span>
              </label>
              <ClickIndicator
                onClick={() => {
                  if (termsChecked) setSubStep(2)
                  else toast.error('약관에 동의해주세요')
                }}
                disabled={!termsChecked}
                label={termsChecked ? '저장을 클릭!' : ''}
              >
                <button
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                    termsChecked
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  저장 후 닫기
                </button>
              </ClickIndicator>
            </div>
          )}

          {subStep === 2 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center py-6 space-y-3"
            >
              <CheckCircle className="w-10 h-10 text-green-500" />
              <p className="text-sm font-semibold text-green-700">API 서비스 신청 완료!</p>
              <p className="text-xs text-gray-500">실제 화면에서도 같은 순서로 진행하세요.</p>
            </motion.div>
          )}
        </NaverScreenMockup>

        <TroubleshootingPanel stepId={5} />

        {!completed && (
          <button
            onClick={onComplete}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            <CheckCircle className="w-5 h-5" />
            API 신청 완료했어요!
          </button>
        )}
      </div>
    </StepCard>
  )
}

// ============================================================
// Step 6: 3가지 키 복사하기
// ============================================================

function Step6({
  completed,
  onComplete,
  onBack,
}: {
  completed: boolean
  onComplete: () => void
  onBack: () => void
}) {
  return (
    <StepCard stepIndex={5} completed={completed} onBack={onBack}>
      <div className="space-y-5">
        <p className="text-gray-700 leading-relaxed">
          API 라이선스 발급이 완료되면 <strong>3가지 키</strong>가 표시됩니다.
          모두 복사하여 안전한 곳에 저장하세요.
        </p>

        {/* 빨간 경고 배너 */}
        <motion.div
          animate={{ scale: [1, 1.01, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="bg-red-50 border-2 border-red-400 rounded-xl p-4 flex items-start gap-3"
        >
          <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-800">비밀키는 이 순간만 표시됩니다!</p>
            <p className="text-sm text-red-700 mt-1">
              창을 닫으면 다시 볼 수 없습니다. <strong>반드시 지금 복사</strong>하세요!
            </p>
          </div>
        </motion.div>

        {/* CSS 모형: API 라이선스 정보 */}
        <NaverScreenMockup url="searchad.naver.com/dashboard/api-manager">
          <div className="space-y-3 py-2">
            <p className="text-sm font-semibold text-gray-700 mb-3">API 라이선스 정보</p>

            {/* 고객ID 카드 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-500 font-medium">고객 ID (Customer ID)</p>
                <p className="text-sm font-mono font-bold text-blue-800 mt-0.5">1234567</p>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 rounded text-blue-600 text-xs">
                <Copy className="w-3 h-3" />
                복사
              </div>
            </div>

            {/* 액세스 라이선스 카드 */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-indigo-500 font-medium">API 키 (Access License)</p>
                <p className="text-sm font-mono font-bold text-indigo-800 mt-0.5 truncate max-w-[200px]">010000000012ab3c4d...</p>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-indigo-100 rounded text-indigo-600 text-xs">
                <Copy className="w-3 h-3" />
                복사
              </div>
            </div>

            {/* 비밀키 카드 (빨간 강조) */}
            <motion.div
              animate={{ scale: [1, 1.01, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="bg-red-50 border-2 border-red-400 rounded-lg p-3 flex items-center justify-between"
            >
              <div>
                <p className="text-xs text-red-500 font-bold">비밀 키 (Secret Key)</p>
                <p className="text-sm font-mono font-bold text-red-800 mt-0.5 truncate max-w-[200px]">a1B2c3D4e5F6g7H8i9...</p>
              </div>
              <div className="flex items-center gap-1 px-3 py-1.5 bg-red-500 rounded text-white text-xs font-bold animate-pulse">
                <Copy className="w-3 h-3" />
                지금 복사!
              </div>
            </motion.div>
          </div>
        </NaverScreenMockup>

        <TroubleshootingPanel stepId={6} />

        {!completed && (
          <button
            onClick={onComplete}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            <CheckCircle className="w-5 h-5" />
            3가지 키 모두 복사했어요!
          </button>
        )}
      </div>
    </StepCard>
  )
}

// ============================================================
// Step 7: 키 입력하고 연동하기
// ============================================================

function Step7({
  completed,
  connectForm,
  setConnectForm,
  isConnecting,
  connectError,
  showSecretKey,
  setShowSecretKey,
  onConnect,
  onBack,
  handlePaste,
}: {
  completed: boolean
  connectForm: { customer_id: string; api_key: string; secret_key: string; name: string }
  setConnectForm: (form: { customer_id: string; api_key: string; secret_key: string; name: string }) => void
  isConnecting: boolean
  connectError: string | null
  showSecretKey: boolean
  setShowSecretKey: (v: boolean) => void
  onConnect: () => void
  onBack: () => void
  handlePaste: (field: 'customer_id' | 'api_key' | 'secret_key', e: ClipboardEvent<HTMLInputElement>) => void
}) {
  const customerIdValid = /^\d{7}$/.test(connectForm.customer_id)
  const apiKeyValid = connectForm.api_key.length > 0 && connectForm.api_key.startsWith('0100')
  const apiKeyFilled = connectForm.api_key.length > 0
  const secretKeyFilled = connectForm.secret_key.length >= 20

  return (
    <StepCard stepIndex={6} completed={completed} onBack={onBack}>
      <div className="space-y-5">
        {/* KeyLocationReference 미니 요약 */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
            <Search className="w-3 h-3" />
            키 위치 요약
          </p>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <p className="text-blue-500 font-medium">고객ID</p>
              <p className="text-blue-700">광고시스템 좌상단</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-2 text-center">
              <p className="text-indigo-500 font-medium">API 키</p>
              <p className="text-indigo-700">API 라이선스 정보</p>
            </div>
            <div className="bg-red-50 rounded-lg p-2 text-center">
              <p className="text-red-500 font-medium">비밀키</p>
              <p className="text-red-700">발급 시 1회 표시</p>
            </div>
          </div>
        </div>

        {!completed && (
          <div className="space-y-4">
            {/* Customer ID */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded flex items-center justify-center text-xs font-bold">1</span>
                고객 ID (Customer ID) *
                <span className="text-xs text-gray-400 ml-auto">정확히 7자리 숫자</span>
              </label>
              <input
                type="text"
                value={connectForm.customer_id}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 7)
                  setConnectForm({ ...connectForm, customer_id: val })
                }}
                onPaste={(e) => handlePaste('customer_id', e)}
                placeholder="예: 1234567"
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent transition-all ${
                  connectForm.customer_id
                    ? customerIdValid
                      ? 'border-green-300 focus:ring-green-500 bg-green-50'
                      : 'border-red-300 focus:ring-red-500 bg-red-50'
                    : 'border-gray-200 focus:ring-blue-500'
                }`}
              />
              {connectForm.customer_id && !customerIdValid && (
                <p className="text-xs text-red-500 mt-1">정확히 7자리 숫자를 입력하세요</p>
              )}
              {customerIdValid && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> 올바른 형식입니다
                </p>
              )}
            </div>

            {/* API Key */}
            <div className={`transition-opacity ${customerIdValid ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <span className="w-5 h-5 bg-indigo-100 text-indigo-700 rounded flex items-center justify-center text-xs font-bold">2</span>
                API 키 (Access License) *
                <span className="text-xs text-gray-400 ml-auto">0100으로 시작</span>
              </label>
              <input
                type="text"
                value={connectForm.api_key}
                onChange={(e) => setConnectForm({ ...connectForm, api_key: e.target.value.trim() })}
                onPaste={(e) => handlePaste('api_key', e)}
                placeholder="예: 01000000001a2b3c..."
                disabled={!customerIdValid}
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent transition-all ${
                  connectForm.api_key
                    ? apiKeyValid
                      ? 'border-green-300 focus:ring-green-500 bg-green-50'
                      : apiKeyFilled
                      ? 'border-amber-300 focus:ring-amber-500 bg-amber-50'
                      : 'border-gray-200 focus:ring-blue-500'
                    : 'border-gray-200 focus:ring-blue-500'
                } disabled:bg-gray-100 disabled:cursor-not-allowed`}
              />
              {apiKeyFilled && !apiKeyValid && (
                <p className="text-xs text-amber-500 mt-1">0100으로 시작하는지 확인하세요</p>
              )}
              {apiKeyValid && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> 올바른 형식입니다
                </p>
              )}
            </div>

            {/* Secret Key */}
            <div className={`transition-opacity ${apiKeyFilled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <span className="w-5 h-5 bg-red-100 text-red-700 rounded flex items-center justify-center text-xs font-bold">3</span>
                비밀 키 (Secret Key) *
                <span className="text-xs text-gray-400 ml-auto">20자 이상</span>
              </label>
              <div className="relative">
                <input
                  type={showSecretKey ? 'text' : 'password'}
                  value={connectForm.secret_key}
                  onChange={(e) => setConnectForm({ ...connectForm, secret_key: e.target.value.trim() })}
                  onPaste={(e) => handlePaste('secret_key', e)}
                  placeholder="비밀 키를 입력하세요"
                  disabled={!apiKeyFilled}
                  className={`w-full px-4 py-3 pr-12 border rounded-xl focus:ring-2 focus:border-transparent transition-all ${
                    connectForm.secret_key
                      ? secretKeyFilled
                        ? 'border-green-300 focus:ring-green-500 bg-green-50'
                        : 'border-amber-300 focus:ring-amber-500 bg-amber-50'
                      : 'border-gray-200 focus:ring-blue-500'
                  } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecretKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {connectForm.secret_key && !secretKeyFilled && (
                <p className="text-xs text-amber-500 mt-1">20자 이상이어야 합니다 (현재: {connectForm.secret_key.length}자)</p>
              )}
              {secretKeyFilled && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> 입력 완료
                </p>
              )}
            </div>

            {/* Account Name */}
            <div className={`transition-opacity ${secretKeyFilled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                계정 이름 (선택사항)
              </label>
              <input
                type="text"
                value={connectForm.name}
                onChange={(e) => setConnectForm({ ...connectForm, name: e.target.value })}
                placeholder="식별을 위한 계정 이름"
                disabled={!secretKeyFilled}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>

            {/* Error */}
            {connectError && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-800 font-medium">{connectError}</p>
                </div>
              </motion.div>
            )}

            {/* Connect Button */}
            <button
              onClick={onConnect}
              disabled={isConnecting || !customerIdValid || !apiKeyFilled || !secretKeyFilled}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium text-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  연동 중...
                </>
              ) : (
                <>
                  <Rocket className="w-5 h-5" />
                  연동하기
                </>
              )}
            </button>
          </div>
        )}

        {completed && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-500" />
            <div>
              <p className="font-semibold text-green-800">연동 완료!</p>
              <p className="text-sm text-green-700">계정이 성공적으로 연동되었습니다.</p>
            </div>
          </div>
        )}

        <TroubleshootingPanel stepId={7} />
      </div>
    </StepCard>
  )
}

// ============================================================
// Step 8: 자동 최적화 시작
// ============================================================

function Step8({
  completed,
  connectedAccount,
  onStartOptimization,
  onSkip,
  onBack,
}: {
  completed: boolean
  connectedAccount: { customer_id: string; name: string } | null
  onStartOptimization: () => void
  onSkip: () => void
  onBack: () => void
}) {
  return (
    <StepCard stepIndex={7} completed={completed} onBack={onBack}>
      <div className="space-y-5">
        {/* 연동 성공 카드 */}
        {connectedAccount && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-green-800">연동 성공!</p>
                <p className="text-sm text-green-700">고객 ID: {connectedAccount.customer_id}</p>
                {connectedAccount.name && (
                  <p className="text-sm text-green-600">{connectedAccount.name}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="text-gray-700 leading-relaxed">
          축하합니다! 계정 연동이 완료되었습니다. 이제 AI 자동 최적화를 시작하여
          24시간 광고 효율을 극대화하세요.
        </p>

        {/* 안전 모드 추천 */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h4 className="font-semibold text-indigo-900">자동 최적화 추천: 안전 모드</h4>
              <p className="text-sm text-indigo-700 mt-1">
                입찰가 변동 ±10% 이내, 하루 최대 5회 조정으로 안정적으로 시작합니다.
              </p>
            </div>
          </div>
        </div>

        {!completed && (
          <div className="space-y-3">
            <button
              onClick={onStartOptimization}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-lg hover:shadow-lg transition-all"
            >
              <Rocket className="w-5 h-5" />
              자동 최적화 켜기 (안전 모드)
            </button>
            <button
              onClick={onSkip}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl font-medium transition-colors"
            >
              나중에 할게요
            </button>
          </div>
        )}

        {completed && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center gap-3">
            <Rocket className="w-6 h-6 text-purple-500" />
            <div>
              <p className="font-semibold text-purple-800">미션 완료!</p>
              <p className="text-sm text-purple-700">모든 설정이 완료되었습니다.</p>
            </div>
          </div>
        )}
      </div>
    </StepCard>
  )
}
