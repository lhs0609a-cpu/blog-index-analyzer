'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, RefreshCw, Wrench, Clock, Server, WifiOff } from 'lucide-react'
import { getApiUrl, checkHealth, isServerDown as checkIsServerDown, subscribeToServerStatus, notifyServerDown } from '@/lib/api/apiConfig'

// ============ 전역 상태 컨텍스트 ============
interface MaintenanceContextType {
  isServerDown: boolean
  setServerDown: (down: boolean) => void
  lastError: string | null
  setLastError: (error: string | null) => void
  checkServerStatus: () => Promise<boolean>
}

const MaintenanceContext = createContext<MaintenanceContextType | null>(null)

export function useMaintenanceContext() {
  const context = useContext(MaintenanceContext)
  if (!context) {
    throw new Error('useMaintenanceContext must be used within MaintenanceProvider')
  }
  return context
}

// ============ Provider 컴포넌트 ============
export function MaintenanceProvider({ children }: { children: React.ReactNode }) {
  const [isServerDown, setIsServerDown] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  // 전역 리스너 등록 (apiConfig 사용)
  useEffect(() => {
    const unsubscribe = subscribeToServerStatus((down) => {
      setIsServerDown(down)
    })
    // 초기 상태 동기화
    setIsServerDown(checkIsServerDown())
    return unsubscribe
  }, [])

  // 서버 상태 체크
  const checkServerStatus = useCallback(async (): Promise<boolean> => {
    const apiUrl = getApiUrl()
    const isHealthy = await checkHealth(apiUrl, 10000)
    notifyServerDown(!isHealthy)
    return isHealthy
  }, [])

  // 초기 서버 상태 체크
  useEffect(() => {
    checkServerStatus()
  }, [checkServerStatus])

  // 서버 다운 시 주기적으로 상태 체크
  useEffect(() => {
    if (!isServerDown) return

    const interval = setInterval(() => {
      checkServerStatus()
    }, 30000) // 30초마다 체크

    return () => clearInterval(interval)
  }, [isServerDown, checkServerStatus])

  const contextValue: MaintenanceContextType = {
    isServerDown,
    setServerDown: (down: boolean) => {
      notifyServerDown(down)
    },
    lastError,
    setLastError,
    checkServerStatus
  }

  return (
    <MaintenanceContext.Provider value={contextValue}>
      {children}
    </MaintenanceContext.Provider>
  )
}

// ============ 서버 점검 모달 컴포넌트 ============
export default function ServerMaintenanceModal() {
  const [isServerDown, setIsServerDown] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [checkCount, setCheckCount] = useState(0)

  // 전역 리스너 등록 (apiConfig 사용)
  useEffect(() => {
    const unsubscribe = subscribeToServerStatus((down) => {
      setIsServerDown(down)
    })
    // 초기 상태 동기화
    setIsServerDown(checkIsServerDown())
    return unsubscribe
  }, [])

  // 서버 상태 체크
  const checkServer = useCallback(async () => {
    setIsChecking(true)
    try {
      const apiUrl = getApiUrl()
      const isHealthy = await checkHealth(apiUrl, 10000)

      if (isHealthy) {
        notifyServerDown(false)
        setCheckCount(0)
      } else {
        setCheckCount(prev => prev + 1)
      }
    } catch {
      setCheckCount(prev => prev + 1)
    } finally {
      setIsChecking(false)
    }
  }, [])

  // 자동 재시도 (서버 다운 시 30초마다)
  useEffect(() => {
    if (!isServerDown) return

    const interval = setInterval(() => {
      checkServer()
    }, 30000)

    return () => clearInterval(interval)
  }, [isServerDown, checkServer])

  return (
    <AnimatePresence>
      {isServerDown && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="mx-4 w-full max-w-md"
          >
            <div className="relative overflow-hidden rounded-3xl bg-white shadow-2xl">
              {/* 상단 배경 그라데이션 */}
              <div className="relative h-32 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 overflow-hidden">
                {/* 배경 패턴 */}
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute top-4 left-4 w-16 h-16 border-4 border-white/30 rounded-full" />
                  <div className="absolute top-8 right-8 w-8 h-8 border-2 border-white/30 rounded-full" />
                  <div className="absolute bottom-4 left-1/3 w-12 h-12 border-3 border-white/20 rounded-full" />
                </div>

                {/* 아이콘 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <motion.div
                      animate={{
                        rotate: [0, -10, 10, -10, 0],
                        scale: [1, 1.05, 1]
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        repeatDelay: 1
                      }}
                    >
                      <Wrench className="w-16 h-16 text-white drop-shadow-lg" />
                    </motion.div>
                    <motion.div
                      className="absolute -right-2 -bottom-2"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.8, 1, 0.8]
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity
                      }}
                    >
                      <Server className="w-8 h-8 text-white/80" />
                    </motion.div>
                  </div>
                </div>

                {/* LIVE 배지 */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                  <span className="text-xs font-bold text-white">점검 중</span>
                </div>
              </div>

              {/* 본문 */}
              <div className="p-6 text-center">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  서버 점검 중입니다
                </h2>
                <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                  더 나은 서비스를 위해 시스템을 점검하고 있어요.<br />
                  최대한 빠르게 복구하겠습니다. 잠시만 기다려 주세요!
                </p>

                {/* 상태 표시 */}
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl">
                    <WifiOff className="w-4 h-4" />
                    <span className="text-sm font-medium">연결 끊김</span>
                  </div>
                  <div className="flex items-center gap-2 bg-amber-50 text-amber-600 px-4 py-2 rounded-xl">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium">복구 진행 중</span>
                  </div>
                </div>

                {/* 재시도 버튼 */}
                <button
                  onClick={checkServer}
                  disabled={isChecking}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#0064FF] to-[#3182F6] hover:from-[#0057E0] hover:to-[#2970E0] text-white font-semibold py-3.5 px-6 rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25"
                >
                  {isChecking ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>연결 확인 중...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      <span>다시 연결 시도</span>
                    </>
                  )}
                </button>

                {/* 재시도 횟수 표시 */}
                {checkCount > 0 && (
                  <p className="mt-3 text-xs text-gray-400">
                    자동 재연결 시도: {checkCount}회 (30초마다 자동 확인)
                  </p>
                )}

                {/* 안내 메시지 */}
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <div className="flex items-start gap-3 text-left">
                    <div className="flex-shrink-0 p-2 bg-blue-50 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        점검이 길어지면 <span className="font-medium text-gray-700">새로고침</span>하거나
                        나중에 다시 방문해 주세요. 불편을 드려 죄송합니다.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
