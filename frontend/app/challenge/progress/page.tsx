'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Flame, Trophy, Award, Star,
  CheckCircle, Circle, Lock, Zap, Target, BookOpen,
  ChevronLeft, ChevronRight, Clock
} from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth'
import toast from 'react-hot-toast'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr'

interface CalendarDay {
  day: number
  date: string
  status: 'completed' | 'partial' | 'missed' | 'future' | 'today'
  missions_completed: number
  total_missions: number
  xp_earned: number
}

interface Profile {
  level: number
  level_name: string
  total_xp: number
  current_streak: number
  longest_streak: number
  badges: string[]
  total_posts_written: number
  next_level_xp: number
  xp_to_next: number
}

interface ChallengeStatus {
  current_day: number
  progress_percent: number
  started_at: string
  status: string
  completed_missions: number
}

interface Badge {
  id: string
  name: string
  description: string
  icon: string
  category: string
  xp_reward: number
  earned: boolean
}

export default function ProgressPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [status, setStatus] = useState<ChallengeStatus | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [calendar, setCalendar] = useState<CalendarDay[]>([])
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'calendar' | 'badges'>('calendar')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('auth_token')

      // 토큰이 없으면 바로 리다이렉트
      if (!token) {
        toast.error('로그인이 필요합니다')
        router.push('/login?redirect=/challenge/progress')
        return
      }

      const headers = { Authorization: `Bearer ${token}` }

      // 진행률 조회
      const progressRes = await fetch(`${API_BASE}/api/challenge/progress`, { headers })

      // 401 에러 처리
      if (!progressRes.ok) {
        if (progressRes.status === 401) {
          localStorage.removeItem('auth_token')
          toast.error('로그인이 만료되었습니다. 다시 로그인해주세요.')
          router.push('/login?redirect=/challenge/progress')
        }
        return
      }

      const progressJson = await progressRes.json()

      if (progressJson.success) {
        setStatus(progressJson.status)
        setProfile(progressJson.profile)
        setCalendar(progressJson.calendar || [])
      }

      // 배지 조회
      const badgesRes = await fetch(`${API_BASE}/api/challenge/gamification/badges`, { headers })
      const badgesJson = await badgesRes.json()

      if (badgesJson.success) {
        setBadges(badgesJson.badges || [])
      }
    } catch (error) {
      console.error('Failed to fetch progress:', error)
      toast.error('데이터를 불러오는데 실패했습니다')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (!isAuthenticated) {
      toast('로그인이 필요한 기능입니다', {
        icon: '🔐',
        duration: 3000,
      })
      router.push('/login?redirect=/challenge/progress')
      return
    }
    fetchData()
  }, [isAuthenticated, router, fetchData])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">진행 현황을 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-6xl mb-4">📊</div>
          <h2 className="text-xl font-bold mb-2">아직 진행 중인 챌린지가 없어요</h2>
          <p className="text-gray-600 mb-6">먼저 챌린지를 시작해주세요!</p>
          <Link href="/challenge">
            <button className="px-6 py-3 bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white rounded-xl font-bold">
              챌린지 시작하기
            </button>
          </Link>
        </div>
      </div>
    )
  }

  const levelProgress = profile ? ((profile.total_xp % 500) / 500) * 100 : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/challenge" className="p-2 -ml-2 hover:bg-gray-100 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="text-center">
              <div className="font-bold">진행 현황</div>
              <div className="text-xs text-gray-500">30일 블로그 챌린지</div>
            </div>
            <Link href="/challenge/today" className="p-2 -mr-2 hover:bg-gray-100 rounded-xl transition-colors">
              <Target className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* 프로필 카드 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm p-5 mb-6"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0064FF] to-[#3182F6] flex items-center justify-center">
                <span className="text-2xl text-white font-bold">{profile?.level || 1}</span>
              </div>
              {/* 레벨 테두리 진행률 */}
              <svg className="absolute -inset-1 w-[72px] h-[72px]" viewBox="0 0 72 72">
                <circle
                  cx="36"
                  cy="36"
                  r="34"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="4"
                />
                <circle
                  cx="36"
                  cy="36"
                  r="34"
                  fill="none"
                  stroke="url(#levelGradient)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${levelProgress * 2.136} 213.6`}
                  transform="rotate(-90 36 36)"
                />
                <defs>
                  <linearGradient id="levelGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#0064FF" />
                    <stop offset="100%" stopColor="#3182F6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-lg font-bold">{profile?.level_name || '새싹 블로거'}</div>
              <div className="text-sm text-gray-500">Lv.{profile?.level || 1}</div>
              <div className="flex items-center gap-1 text-yellow-500 mt-1">
                <Zap className="w-4 h-4" />
                <span className="font-bold">{profile?.total_xp || 0}</span>
                <span className="text-gray-400 text-sm">XP</span>
              </div>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-1 text-orange-500">
                <Flame className="w-6 h-6" />
                <span className="text-2xl font-bold">{profile?.current_streak || 0}</span>
              </div>
              <div className="text-xs text-gray-500">연속 기록</div>
            </div>
          </div>

          {/* XP 진행바 */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">다음 레벨까지</span>
              <span className="font-medium">{profile?.xp_to_next || 0} XP</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${levelProgress}%` }}
                transition={{ duration: 1 }}
                className="h-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-full"
              />
            </div>
          </div>

          {/* 통계 */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center p-3 bg-blue-50 rounded-xl">
              <Calendar className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-[#0064FF]">{status.current_day}</div>
              <div className="text-xs text-gray-500">현재 일차</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-xl">
              <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-green-600">{status.completed_missions}</div>
              <div className="text-xs text-gray-500">완료 미션</div>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-xl">
              <Flame className="w-5 h-5 text-orange-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-orange-600">{profile?.longest_streak || 0}</div>
              <div className="text-xs text-gray-500">최장 연속</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-xl">
              <Trophy className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <div className="text-lg font-bold text-blue-600">{profile?.badges?.length || 0}</div>
              <div className="text-xs text-gray-500">획득 배지</div>
            </div>
          </div>
        </motion.div>

        {/* 전체 진행률 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm p-5 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">전체 진행률</h3>
            <span className="text-2xl font-bold text-[#0064FF]">{status.progress_percent}%</span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden mb-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${status.progress_percent}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-[#0064FF] via-[#3182F6] to-blue-400 rounded-full"
            />
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>Day 1</span>
            <span>Day {status.current_day} / 30</span>
            <span>Day 30</span>
          </div>
        </motion.div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 py-3 rounded-xl font-bold transition-colors ${
              activeTab === 'calendar'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Calendar className="inline w-4 h-4 mr-2" />
            캘린더
          </button>
          <button
            onClick={() => setActiveTab('badges')}
            className={`flex-1 py-3 rounded-xl font-bold transition-colors ${
              activeTab === 'badges'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Award className="inline w-4 h-4 mr-2" />
            배지
          </button>
        </div>

        {/* 캘린더 탭 */}
        {activeTab === 'calendar' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-2xl shadow-sm p-5"
          >
            <h3 className="font-bold mb-4">30일 기록</h3>
            <div className="grid grid-cols-7 gap-2">
              {/* 요일 헤더 */}
              {['월', '화', '수', '목', '금', '토', '일'].map((day) => (
                <div key={day} className="text-center text-xs text-gray-400 py-2">
                  {day}
                </div>
              ))}

              {/* 날짜 */}
              {Array.from({ length: 30 }, (_, i) => {
                const day = i + 1
                const dayData = calendar.find(c => c.day === day)
                const isToday = day === status.current_day
                const isPast = day < status.current_day
                const isFuture = day > status.current_day

                let bgColor = 'bg-gray-50'
                let textColor = 'text-gray-400'
                let icon = null

                if (isToday) {
                  bgColor = 'bg-blue-500'
                  textColor = 'text-white'
                } else if (dayData?.status === 'completed') {
                  bgColor = 'bg-green-100'
                  textColor = 'text-green-700'
                  icon = <CheckCircle className="w-3 h-3 text-green-500" />
                } else if (dayData?.status === 'partial') {
                  bgColor = 'bg-yellow-100'
                  textColor = 'text-yellow-700'
                } else if (dayData?.status === 'missed' || (isPast && !dayData)) {
                  bgColor = 'bg-red-50'
                  textColor = 'text-red-400'
                } else if (isFuture) {
                  bgColor = 'bg-gray-50'
                  textColor = 'text-gray-300'
                  icon = <Lock className="w-3 h-3 text-gray-300" />
                }

                return (
                  <div
                    key={day}
                    className={`aspect-square rounded-xl ${bgColor} flex flex-col items-center justify-center relative`}
                  >
                    <span className={`text-sm font-bold ${textColor}`}>{day}</span>
                    {icon && <div className="absolute bottom-1">{icon}</div>}
                    {isToday && (
                      <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-blue-500"></div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 범례 */}
            <div className="flex flex-wrap gap-4 mt-6 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-blue-500"></div>
                <span>오늘</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-green-100"></div>
                <span>완료</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-yellow-100"></div>
                <span>부분완료</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-red-50"></div>
                <span>미완료</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-gray-50"></div>
                <span>예정</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* 배지 탭 */}
        {activeTab === 'badges' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* 획득한 배지 */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold mb-4">
                획득한 배지 ({badges.filter(b => b.earned).length}/{badges.length})
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {badges.filter(b => b.earned).map((badge) => (
                  <motion.div
                    key={badge.id}
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="aspect-square bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl flex flex-col items-center justify-center p-2 border-2 border-yellow-200"
                  >
                    <span className="text-2xl">{badge.icon}</span>
                    <span className="text-xs text-center mt-1 font-medium text-gray-700 line-clamp-2">
                      {badge.name}
                    </span>
                  </motion.div>
                ))}
                {badges.filter(b => b.earned).length === 0 && (
                  <div className="col-span-4 text-center py-8 text-gray-400">
                    아직 획득한 배지가 없어요
                  </div>
                )}
              </div>
            </div>

            {/* 미획득 배지 */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold mb-4 text-gray-400">
                미획득 배지
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {badges.filter(b => !b.earned).map((badge) => (
                  <div
                    key={badge.id}
                    className="aspect-square bg-gray-50 rounded-2xl flex flex-col items-center justify-center p-2 opacity-50"
                  >
                    <span className="text-2xl grayscale">{badge.icon}</span>
                    <span className="text-xs text-center mt-1 text-gray-400 line-clamp-2">
                      {badge.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 배지 카테고리별 설명 */}
            <div className="bg-gradient-to-br from-blue-50 to-sky-50 rounded-2xl p-5">
              <h3 className="font-bold mb-3">배지 획득 방법</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                    <Flame className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <div className="font-medium">연속 기록 배지</div>
                    <div className="text-gray-500">매일 미션을 완료해 연속 기록을 쌓아보세요</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="font-medium">학습 배지</div>
                    <div className="text-gray-500">학습 콘텐츠를 완료하면 획득할 수 있어요</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <Star className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="font-medium">마일스톤 배지</div>
                    <div className="text-gray-500">글쓰기 횟수에 따라 자동으로 획득됩니다</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
