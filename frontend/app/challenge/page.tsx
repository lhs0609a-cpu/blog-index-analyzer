'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Rocket, Calendar, Trophy, Flame, Target, BookOpen,
  ChevronRight, CheckCircle, Lock, Star, Users, Clock,
  Award, Sparkles, ArrowRight, ArrowLeft, Play, Zap
} from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth'
import toast from 'react-hot-toast'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr'

interface ChallengeStatus {
  has_challenge: boolean
  status?: {
    current_day: number
    status: string
    started_at: string
    progress_percent: number
    completed_missions: number
  }
}

interface Overview {
  title: string
  description: string
  total_days: number
  total_xp: number
  weeks: {
    week: number
    theme: string
    days: { day: number; learn_title: string; mission_title: string; xp: number }[]
  }[]
  levels: { level: number; name: string; min_xp: number }[]
}

export default function ChallengePage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const [status, setStatus] = useState<ChallengeStatus | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // 개요 조회 (로그인 불필요)
      const overviewRes = await fetch(`${API_BASE}/api/challenge/overview`)
      if (overviewRes.ok) {
        const data = await overviewRes.json()
        // 데이터 유효성 검사
        if (data.success && Array.isArray(data.weeks) && Array.isArray(data.levels)) {
          setOverview(data)
        }
      }

      // 상태 조회 (로그인 필요)
      if (isAuthenticated) {
        const token = localStorage.getItem('auth_token')
        if (token) {
          const statusRes = await fetch(`${API_BASE}/api/challenge/status`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (statusRes.ok) {
            const data = await statusRes.json()
            if (data.success) {
              setStatus(data)
            }
          } else if (statusRes.status === 401) {
            // 토큰 만료 - 로컬 스토리지 정리 (로그인 페이지로 리다이렉트하지 않고 비로그인 상태로 전환)
            console.log('Challenge status: Authentication failed - clearing token')
            localStorage.removeItem('auth_token')
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch challenge data:', error)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleStartChallenge = async () => {
    if (!isAuthenticated) {
      toast('로그인이 필요한 기능입니다', {
        icon: '🔐',
        duration: 3000,
      })
      setTimeout(() => {
        router.push('/login?redirect=/challenge')
      }, 1000)
      return
    }

    setStarting(true)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${API_BASE}/api/challenge/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ challenge_type: '30day' })
      })

      if (res.status === 401) {
        localStorage.removeItem('auth_token')
        toast.error('로그인이 만료되었습니다. 다시 로그인해주세요.')
        router.push('/login?redirect=/challenge')
        return
      }

      const data = await res.json()

      if (data.success) {
        toast.success('챌린지가 시작되었습니다! 화이팅!')
        router.push('/challenge/today')
      } else {
        toast.error(data.message || '챌린지 시작에 실패했습니다')
      }
    } catch (error) {
      toast.error('오류가 발생했습니다')
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 pt-24 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    )
  }

  // 진행 중인 챌린지가 있으면
  if (status?.has_challenge && status.status?.status === 'active') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 pt-24 pb-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* 진행 중인 챌린지 카드 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-xl p-8 mb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0064FF] to-[#3182F6] flex items-center justify-center">
                  <Rocket className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">30일 블로그 챌린지</h1>
                  <p className="text-gray-500">Day {status.status.current_day} / 30</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 rounded-full">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-green-700 font-medium">진행 중</span>
              </div>
            </div>

            {/* 진행률 바 */}
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">진행률</span>
                <span className="font-bold text-[#0064FF]">{status.status.progress_percent}%</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${status.status.progress_percent}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-full"
                />
              </div>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-blue-50 rounded-2xl">
                <Calendar className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-[#0064FF]">{status.status.current_day}</div>
                <div className="text-sm text-gray-500">현재 일차</div>
              </div>
              <div className="text-center p-4 bg-sky-50 rounded-2xl">
                <CheckCircle className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-blue-500">{status.status.completed_missions}</div>
                <div className="text-sm text-gray-500">완료 미션</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-2xl">
                <Target className="w-6 h-6 text-orange-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-orange-600">{30 - status.status.current_day + 1}</div>
                <div className="text-sm text-gray-500">남은 일수</div>
              </div>
            </div>

            {/* CTA 버튼 */}
            <div className="flex gap-4">
              <Link href="/challenge/today" className="flex-1">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-4 bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  오늘의 미션 하러가기
                </motion.button>
              </Link>
              <Link href="/challenge/progress">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="py-4 px-6 bg-gray-100 text-gray-700 rounded-2xl font-medium flex items-center gap-2"
                >
                  <Calendar className="w-5 h-5" />
                  전체 현황
                </motion.button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  // 챌린지 시작 전 - 소개 페이지
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 pt-24">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0064FF]/10 to-[#3182F6]/10"></div>
        <div className="max-w-5xl mx-auto px-4 py-16 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full text-sm font-medium text-[#0064FF] mb-6">
              <Sparkles className="w-4 h-4" />
              무료 회원도 참여 가능
            </div>

            <h1 className="text-4xl md:text-5xl font-black mb-4">
              <span className="bg-gradient-to-r from-[#0064FF] to-[#3182F6] bg-clip-text text-transparent">
                30일 블로그 챌린지
              </span>
            </h1>

            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              블로그, 혼자하면 어렵지만<br />
              <span className="font-bold text-[#0064FF]">함께하면 쉬워집니다</span>
            </p>

            {/* 핵심 혜택 */}
            <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto mb-8">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 text-center">
                <div className="text-3xl mb-2">📅</div>
                <div className="font-bold">30일</div>
                <div className="text-sm text-gray-500">체계적인 커리큘럼</div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 text-center">
                <div className="text-3xl mb-2">⏱️</div>
                <div className="font-bold">하루 10분</div>
                <div className="text-sm text-gray-500">부담 없는 학습량</div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 text-center">
                <div className="text-3xl mb-2">🎯</div>
                <div className="font-bold">{overview?.total_xp || 2500}+ XP</div>
                <div className="text-sm text-gray-500">획득 가능 경험치</div>
              </div>
            </div>

            {/* CTA 버튼 */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStartChallenge}
              disabled={starting}
              className="px-10 py-5 bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white rounded-2xl font-bold text-xl shadow-lg shadow-[#0064FF]/20 flex items-center gap-3 mx-auto disabled:opacity-50"
            >
              {starting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  시작하는 중...
                </>
              ) : !isAuthenticated ? (
                <>
                  <Lock className="w-6 h-6" />
                  로그인 후 시작하기
                  <ArrowRight className="w-5 h-5" />
                </>
              ) : (
                <>
                  <Rocket className="w-6 h-6" />
                  지금 시작하기
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </motion.button>

            {!isAuthenticated && (
              <p className="text-sm text-[#0064FF] mt-4 font-medium">
                🔐 무료 회원 가입 후 참여할 수 있습니다
              </p>
            )}
          </motion.div>
        </div>
      </div>

      {/* 레벨 시스템 */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-center mb-8">
          <Trophy className="inline w-7 h-7 text-yellow-500 mr-2" />
          레벨 시스템
        </h2>

        <div className="grid grid-cols-5 gap-2 md:gap-4">
          {overview?.levels.map((level, index) => (
            <motion.div
              key={level.level}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`text-center p-3 md:p-4 rounded-2xl ${
                index === 0 ? 'bg-green-50 border-2 border-green-200' :
                index === 1 ? 'bg-blue-50 border-2 border-blue-200' :
                index === 2 ? 'bg-blue-50 border-2 border-blue-200' :
                index === 3 ? 'bg-sky-50 border-2 border-sky-200' :
                'bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300'
              }`}
            >
              <div className="text-2xl md:text-3xl mb-2">
                {index === 0 ? '🌱' : index === 1 ? '🌿' : index === 2 ? '🌳' : index === 3 ? '⭐' : '👑'}
              </div>
              <div className="font-bold text-xs md:text-sm">Lv.{level.level}</div>
              <div className="text-xs text-gray-600 truncate">{level.name}</div>
              <div className="text-xs text-gray-400 mt-1">{level.min_xp} XP</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 주차별 커리큘럼 */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-center mb-8">
          <BookOpen className="inline w-7 h-7 text-blue-500 mr-2" />
          30일 커리큘럼
        </h2>

        <div className="space-y-4">
          {overview?.weeks.map((week) => (
            <motion.div
              key={week.week}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setExpandedWeek(expandedWeek === week.week ? null : week.week)}
                className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold ${
                    week.week === 1 ? 'bg-green-500' :
                    week.week === 2 ? 'bg-blue-500' :
                    week.week === 3 ? 'bg-blue-500' :
                    week.week === 4 ? 'bg-sky-500' :
                    'bg-orange-500'
                  }`}>
                    W{week.week}
                  </div>
                  <div className="text-left">
                    <div className="font-bold">Week {week.week}: {week.theme}</div>
                    <div className="text-sm text-gray-500">
                      Day {week.days[0]?.day} - {week.days[week.days.length - 1]?.day}
                    </div>
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedWeek === week.week ? 'rotate-90' : ''
                }`} />
              </button>

              {expandedWeek === week.week && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="border-t"
                >
                  {week.days.map((day) => (
                    <div key={day.day} className="p-4 border-b last:border-b-0 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">
                            {day.day}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{day.learn_title}</div>
                            <div className="text-xs text-gray-500">{day.mission_title}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-500">
                          <Zap className="w-4 h-4" />
                          <span className="text-sm font-bold">{day.xp}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* 배지 미리보기 */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-center mb-8">
          <Award className="inline w-7 h-7 text-blue-500 mr-2" />
          획득 가능한 배지
        </h2>

        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {['🔥', '🔥🔥', '🔥🔥🔥', '💪', '✍️', '📝', '📚', '🏆', '📖', '🎓', '🧠', '🌅', '🌙', '⚡', '🎯', '👑'].map((badge, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="aspect-square bg-white rounded-2xl shadow-sm flex items-center justify-center text-2xl hover:scale-110 transition-transform cursor-pointer"
            >
              {badge}
            </motion.div>
          ))}
        </div>
      </div>

      {/* 하단 CTA */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-3xl p-8 text-center text-white"
        >
          <h3 className="text-2xl font-bold mb-4">준비되셨나요?</h3>
          <p className="mb-6 opacity-90">
            지금 시작하면 30일 후에는 블로그 전문가가 되어 있을 거예요!
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleStartChallenge}
            disabled={starting}
            className="px-8 py-4 bg-white text-[#0064FF] rounded-2xl font-bold text-lg shadow-lg"
          >
            {starting ? '시작하는 중...' : '챌린지 시작하기'}
          </motion.button>
        </motion.div>
      </div>
    </div>
  )
}
