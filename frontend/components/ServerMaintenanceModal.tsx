'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
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
// 점검 모달 UI 는 사용 중지. Provider/헬스체크 로직은 위에서 그대로 동작 —
// isServerDown 상태가 필요한 다른 컴포넌트는 useMaintenanceContext 로 직접 구독 가능.
export default function ServerMaintenanceModal() {
  return null
}
