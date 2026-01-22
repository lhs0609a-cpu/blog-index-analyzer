'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, TrendingUp, Zap, MessageCircle, Star, Crown,
  Sparkles, Award, Target, Heart, BookOpen, Search,
  ThumbsUp, PartyPopper, Rocket, Trophy, Gift, Activity
} from 'lucide-react'
import { getApiUrl } from '@/lib/api/apiConfig'
import { useABTest, EXPERIMENTS, AB_EVENTS } from '@/lib/hooks/useABTest'

// ============ 아이콘 매핑 ============
const iconMap: { [key: string]: React.ReactNode } = {
  Search: <Search className="w-4 h-4" />,
  Target: <Target className="w-4 h-4" />,
  BookOpen: <BookOpen className="w-4 h-4" />,
  TrendingUp: <TrendingUp className="w-4 h-4" />,
  Trophy: <Trophy className="w-4 h-4" />,
  Crown: <Crown className="w-4 h-4" />,
  MessageCircle: <MessageCircle className="w-4 h-4" />,
  Star: <Star className="w-4 h-4" />,
  Sparkles: <Sparkles className="w-4 h-4" />,
  Award: <Award className="w-4 h-4" />,
  Zap: <Zap className="w-4 h-4" />,
  Rocket: <Rocket className="w-4 h-4" />,
  Activity: <Activity className="w-4 h-4" />,
}

// ============ 타입 정의 ============
interface Activity {
  id: number | string
  activity_type: string
  nickname: string
  blog_id?: string
  message: string
  detail?: string
  icon?: string
  color?: string
  bg_color?: string
  created_at: string
}

interface Stats {
  current_online: number
  daily_analyses: number
  total_users: number
  peak_online: number
}

// ============ API 호출 함수 ============
async function fetchActivities(limit: number = 20): Promise<Activity[]> {
  try {
    const response = await fetch(`${getApiUrl()}/api/social-proof/activities?limit=${limit}`)
    const data = await response.json()
    return data.success ? data.activities : []
  } catch (error) {
    console.error('Failed to fetch activities:', error)
    return []
  }
}

async function fetchStats(): Promise<Stats | null> {
  try {
    const response = await fetch(`${getApiUrl()}/api/social-proof/stats`)
    const data = await response.json()
    return data.success ? data.stats : null
  } catch (error) {
    console.error('Failed to fetch stats:', error)
    return null
  }
}

// ============ SSE 스트림 연결 ============
function useActivityStream(onActivity: (activity: Activity) => void) {
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const connectSSE = () => {
      try {
        const eventSource = new EventSource(`${getApiUrl()}/api/social-proof/stream`)

        eventSource.onmessage = (event) => {
          try {
            const activity = JSON.parse(event.data)
            onActivity(activity)
          } catch (e) {
            console.error('Failed to parse activity:', e)
          }
        }

        eventSource.onerror = () => {
          eventSource.close()
          // 5초 후 재연결
          setTimeout(connectSSE, 5000)
        }

        eventSourceRef.current = eventSource
      } catch (error) {
        console.error('Failed to connect SSE:', error)
        setTimeout(connectSSE, 5000)
      }
    }

    connectSSE()

    return () => {
      eventSourceRef.current?.close()
    }
  }, [onActivity])
}

// ============ 실시간 피드 컴포넌트 ============
interface LiveFeedProps {
  maxItems?: number
  className?: string
  useAPI?: boolean
}

export function LiveActivityFeed({ maxItems = 8, className = '', useAPI = true }: LiveFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [isConnected, setIsConnected] = useState(false)

  // 초기 데이터 로드
  useEffect(() => {
    if (useAPI) {
      fetchActivities(maxItems).then(data => {
        setActivities(data)
        setIsConnected(true)
      })
    }
  }, [maxItems, useAPI])

  // SSE 스트림 연결 (API 모드일 때만)
  const handleNewActivity = useCallback((activity: Activity) => {
    setActivities(prev => [activity, ...prev.slice(0, maxItems - 1)])
  }, [maxItems])

  useActivityStream(useAPI ? handleNewActivity : () => {})

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400'} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
        </span>
        <span className="text-sm font-medium text-gray-700">
          {isConnected ? '실시간 활동' : '연결 중...'}
        </span>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-hidden">
        <AnimatePresence mode="popLayout">
          {activities.map((activity) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0, x: 20, height: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-center gap-3 p-3 rounded-xl ${activity.bg_color || 'bg-blue-50'} border border-gray-100`}
            >
              <div className={`p-2 rounded-lg bg-white ${activity.color || 'text-blue-600'}`}>
                {iconMap[activity.icon || 'Activity'] || <Activity className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{activity.message}</p>
                {activity.detail && (
                  <p className={`text-xs ${activity.color || 'text-blue-600'} font-medium`}>{activity.detail}</p>
                )}
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">방금</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ============ 실시간 카운터 ============
interface LiveCounterProps {
  className?: string
  useAPI?: boolean
}

export function LiveCounter({ className = '', useAPI = true }: LiveCounterProps) {
  const [stats, setStats] = useState<Stats>({
    current_online: 1247,
    daily_analyses: 4892,
    total_users: 52341,
    peak_online: 1247
  })

  useEffect(() => {
    // 초기 로드
    if (useAPI) {
      fetchStats().then(data => {
        if (data) setStats(data)
      })
    }

    // 주기적 업데이트
    const interval = setInterval(() => {
      if (useAPI) {
        fetchStats().then(data => {
          if (data) setStats(data)
        })
      } else {
        // 로컬 시뮬레이션
        setStats(prev => ({
          ...prev,
          current_online: Math.max(800, prev.current_online + Math.floor(Math.random() * 30) - 12),
          daily_analyses: prev.daily_analyses + Math.floor(Math.random() * 5) + 1,
          total_users: prev.total_users + (Math.random() > 0.7 ? 1 : 0)
        }))
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [useAPI])

  return (
    <div className={`grid grid-cols-3 gap-4 ${className}`}>
      <div className="text-center p-4 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-xs text-green-600 font-medium">LIVE</span>
        </div>
        <div className="text-2xl font-bold text-green-700">{stats.current_online.toLocaleString()}</div>
        <div className="text-xs text-green-600">명 접속 중</div>
      </div>

      <div className="text-center p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200">
        <div className="text-xs text-blue-600 font-medium mb-1">오늘</div>
        <div className="text-2xl font-bold text-blue-700">{stats.daily_analyses.toLocaleString()}</div>
        <div className="text-xs text-blue-600">회 분석</div>
      </div>

      <div className="text-center p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200">
        <div className="text-xs text-purple-600 font-medium mb-1">누적</div>
        <div className="text-2xl font-bold text-purple-700">{stats.total_users.toLocaleString()}</div>
        <div className="text-xs text-purple-600">명 사용</div>
      </div>
    </div>
  )
}

// ============ 실시간 토스트 알림 ============
interface LiveToastProps {
  useAPI?: boolean
}

export function LiveToastNotifications({ useAPI = true }: LiveToastProps) {
  const [toast, setToast] = useState<Activity | null>(null)
  const activitiesRef = useRef<Activity[]>([])

  // API 모드: 최근 활동에서 랜덤 표시
  useEffect(() => {
    if (useAPI) {
      fetchActivities(30).then(data => {
        activitiesRef.current = data
      })
    }

    const showToast = () => {
      if (activitiesRef.current.length > 0) {
        const randomActivity = activitiesRef.current[Math.floor(Math.random() * activitiesRef.current.length)]
        setToast(randomActivity)
        setTimeout(() => setToast(null), 4000)
      }
    }

    // 첫 토스트 5초 후
    const firstTimeout = setTimeout(showToast, 5000)

    // 이후 10-20초 간격
    const interval = setInterval(() => {
      showToast()
    }, Math.random() * 10000 + 10000)

    return () => {
      clearTimeout(firstTimeout)
      clearInterval(interval)
    }
  }, [useAPI])

  // SSE로 새 활동 받으면 활동 리스트 업데이트
  const handleNewActivity = useCallback((activity: Activity) => {
    activitiesRef.current = [activity, ...activitiesRef.current.slice(0, 29)]
  }, [])

  useActivityStream(useAPI ? handleNewActivity : () => {})

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, x: 100, y: 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 100 }}
          className="fixed bottom-24 right-4 z-50 max-w-sm"
        >
          <div className={`flex items-center gap-3 p-4 rounded-2xl ${toast.bg_color || 'bg-blue-50'} border border-gray-200 shadow-lg`}>
            <div className={`p-2 rounded-xl bg-white ${toast.color || 'text-blue-600'} shadow-sm`}>
              {iconMap[toast.icon || 'Activity'] || <Activity className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">{toast.message}</p>
              {toast.detail && (
                <p className={`text-xs ${toast.color || 'text-blue-600'}`}>{toast.detail}</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ============ 상단 배너 (실시간 통계) ============
export function LiveStatsBanner({ className = '', useAPI = true }: { className?: string; useAPI?: boolean }) {
  const [stats, setStats] = useState({
    online: 1247,
    recentUser: '',
    recentAction: ''
  })
  const activitiesRef = useRef<Activity[]>([])

  useEffect(() => {
    // API에서 초기 데이터 로드
    if (useAPI) {
      Promise.all([fetchStats(), fetchActivities(10)]).then(([statsData, activities]) => {
        if (statsData) {
          setStats(prev => ({ ...prev, online: statsData.current_online }))
        }
        if (activities.length > 0) {
          activitiesRef.current = activities
          const recent = activities[0]
          setStats(prev => ({
            ...prev,
            recentUser: recent.nickname,
            recentAction: getActionText(recent.activity_type)
          }))
        }
      })
    }

    // 주기적 업데이트
    const interval = setInterval(() => {
      if (useAPI) {
        fetchStats().then(data => {
          if (data) {
            setStats(prev => ({ ...prev, online: data.current_online }))
          }
        })
      }

      // 최근 활동 표시 업데이트
      if (activitiesRef.current.length > 0) {
        const recent = activitiesRef.current[Math.floor(Math.random() * Math.min(5, activitiesRef.current.length))]
        setStats(prev => ({
          ...prev,
          recentUser: recent.nickname,
          recentAction: getActionText(recent.activity_type)
        }))
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [useAPI])

  // SSE로 새 활동 받으면 업데이트
  const handleNewActivity = useCallback((activity: Activity) => {
    activitiesRef.current = [activity, ...activitiesRef.current.slice(0, 9)]
    setStats(prev => ({
      ...prev,
      recentUser: activity.nickname,
      recentAction: getActionText(activity.activity_type)
    }))
  }, [])

  useActivityStream(useAPI ? handleNewActivity : () => {})

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white px-4 py-2.5 ${className}`}
    >
      <div className="container mx-auto flex items-center justify-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <Users className="w-4 h-4" />
          <span><strong>{stats.online.toLocaleString()}명</strong>이 지금 활동 중</span>
        </div>

        {stats.recentUser && (
          <div className="hidden md:flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-300" />
            <span>방금 <strong>{stats.recentUser}</strong>님이 {stats.recentAction}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// 활동 유형 텍스트 변환
function getActionText(type: string): string {
  const actionMap: { [key: string]: string } = {
    analysis_complete: '블로그 분석 완료',
    analysis_check: '블로그 지수 확인',
    keyword_search: '키워드 분석',
    level_up: '레벨업 달성',
    tier_up: '티어 승급',
    pro_upgrade: 'Pro 업그레이드',
    comment: '후기 작성',
    review: '리뷰 등록',
    new_user: '새로 가입',
    achievement: '업적 달성',
    daily_streak: '연속 접속',
    top_ranking: '랭킹 진입'
  }
  return actionMap[type] || '활동'
}

// ============ 사이드바 위젯 ============
export function LiveActivityWidget({ className = '', useAPI = true }: { className?: string; useAPI?: boolean }) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [stats, setStats] = useState({ online: 1247, today: 4892 })

  useEffect(() => {
    // 초기 로드
    if (useAPI) {
      Promise.all([fetchActivities(5), fetchStats()]).then(([acts, statsData]) => {
        setActivities(acts)
        if (statsData) {
          setStats({ online: statsData.current_online, today: statsData.daily_analyses })
        }
      })
    }

    // 주기적 업데이트
    const interval = setInterval(() => {
      if (useAPI) {
        Promise.all([fetchActivities(5), fetchStats()]).then(([acts, statsData]) => {
          setActivities(acts)
          if (statsData) {
            setStats({ online: statsData.current_online, today: statsData.daily_analyses })
          }
        })
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [useAPI])

  // SSE로 새 활동 받으면 업데이트
  const handleNewActivity = useCallback((activity: Activity) => {
    setActivities(prev => [activity, ...prev.slice(0, 4)])
  }, [])

  useActivityStream(useAPI ? handleNewActivity : () => {})

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden ${className}`}>
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span className="font-bold">실시간 커뮤니티</span>
          </div>
          <span className="text-sm bg-white/20 px-2 py-0.5 rounded-full">
            {stats.online.toLocaleString()}명 활동 중
          </span>
        </div>
      </div>

      {/* 활동 피드 */}
      <div className="p-3 space-y-2 max-h-[300px] overflow-hidden">
        <AnimatePresence mode="popLayout">
          {activities.map((activity) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={`flex items-center gap-2 p-2 rounded-lg ${activity.bg_color || 'bg-blue-50'}`}
            >
              <div className={`p-1.5 rounded-md bg-white ${activity.color || 'text-blue-600'}`}>
                {iconMap[activity.icon || 'Activity'] || <Activity className="w-4 h-4" />}
              </div>
              <p className="text-xs text-gray-700 flex-1 truncate">{activity.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 푸터 */}
      <div className="border-t border-gray-100 p-3 bg-gray-50 text-center">
        <p className="text-xs text-gray-500">
          오늘 <span className="font-bold text-[#0064FF]">{stats.today.toLocaleString()}회</span> 분석 완료
        </p>
      </div>
    </div>
  )
}

// ============ 통합 컴포넌트 ============
interface SocialProofSystemProps {
  showBanner?: boolean
  showWidget?: boolean
  showToasts?: boolean
  showFeed?: boolean
  showCounter?: boolean
  useAPI?: boolean
  useABTest?: boolean  // A/B 테스트 사용 여부
}

export default function SocialProofSystem({
  showBanner = true,
  showWidget = false,
  showToasts = true,
  showFeed = false,
  showCounter = false,
  useAPI = true,
  useABTest: enableABTest = true
}: SocialProofSystemProps) {
  // A/B 테스트로 소셜 프루프 표시 방식 결정
  const { config, isLoading, trackEvent } = useABTest(EXPERIMENTS.SOCIAL_PROOF_DISPLAY)

  // A/B 테스트 설정에 따른 표시 여부 결정
  const shouldShowBanner = enableABTest && !isLoading
    ? (config.show_banner ?? showBanner)
    : showBanner

  const shouldShowToasts = enableABTest && !isLoading
    ? (config.show_toast ?? showToasts)
    : showToasts

  const shouldShowCounter = enableABTest && !isLoading
    ? (config.show_counter ?? showCounter)
    : showCounter

  // 컴포넌트 마운트 시 view 이벤트 추적
  useEffect(() => {
    if (enableABTest && !isLoading) {
      trackEvent(AB_EVENTS.VIEW, {
        banner: shouldShowBanner,
        toasts: shouldShowToasts,
        counter: shouldShowCounter
      })
    }
  }, [enableABTest, isLoading, shouldShowBanner, shouldShowToasts, shouldShowCounter, trackEvent])

  return (
    <>
      {shouldShowBanner && <LiveStatsBanner useAPI={useAPI} />}
      {shouldShowToasts && <LiveToastNotifications useAPI={useAPI} />}
      {showWidget && <LiveActivityWidget className="fixed right-4 bottom-24 w-80 z-40" useAPI={useAPI} />}
      {showFeed && <LiveActivityFeed useAPI={useAPI} />}
      {shouldShowCounter && <LiveCounter useAPI={useAPI} />}
    </>
  )
}
