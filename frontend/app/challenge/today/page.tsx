'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Target, CheckCircle, Circle, Flame, Star,
  ArrowLeft, Calendar, Zap, Trophy, Award, Lightbulb,
  ChevronRight, Play, Clock, ArrowRight, Sparkles,
  Camera, Upload, X, Image as ImageIcon
} from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth'
import toast from 'react-hot-toast'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev'

interface Mission {
  day_number: number
  mission_id: string
  mission_type: 'learn' | 'mission'
  title: string
  description: string
  content?: string
  checklist?: string[]
  tip?: string
  xp: number
  completed: boolean
  completed_at?: string
}

interface TodayData {
  success: boolean
  missions: Mission[]
  motivation: {
    quote: string
    author: string
    tip: string
  }
  status: {
    current_day: number
    progress_percent: number
    started_at: string
    status: string
  }
}

interface Profile {
  level: number
  level_name: string
  total_xp: number
  current_streak: number
  longest_streak: number
  badges: string[]
  next_level_xp: number
  xp_to_next: number
}

export default function TodayMissionPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [todayData, setTodayData] = useState<TodayData | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [completingMission, setCompletingMission] = useState<string | null>(null)
  const [showLearnContent, setShowLearnContent] = useState(false)
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null)
  const [showProofModal, setShowProofModal] = useState(false)
  const [proofImage, setProofImage] = useState<string | null>(null)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [missionNotes, setMissionNotes] = useState('')

  const fetchTodayData = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('auth_token')

      // 토큰이 없으면 바로 리다이렉트
      if (!token) {
        toast.error('로그인이 필요합니다')
        router.push('/login?redirect=/challenge/today')
        return
      }

      const headers = { Authorization: `Bearer ${token}` }

      // 오늘의 미션 조회
      const todayRes = await fetch(`${API_BASE}/api/challenge/today`, { headers })
      // API 응답 상태 체크
      if (!todayRes.ok) {
        if (todayRes.status === 401) {
          // 토큰 만료 - 로컬스토리지 정리
          localStorage.removeItem('auth_token')
          toast.error('로그인이 만료되었습니다. 다시 로그인해주세요.')
          router.push('/login?redirect=/challenge/today')
        }
        return
      }

      const todayJson = await todayRes.json()

      if (!todayJson.success) {
        if (todayJson.redirect === 'start') {
          // 챌린지를 시작하지 않은 상태 - 조용히 리다이렉트
          router.push('/challenge')
        }
        return
      }

      // missions가 배열인지 확인
      if (!todayJson.missions || !Array.isArray(todayJson.missions)) {
        // 디버그용 로그만 남기고 토스트는 표시하지 않음 (리다이렉트 케이스 처리됨)
        console.warn('Missions data not available:', todayJson)
        return
      }

      setTodayData(todayJson)

      // 프로필 조회
      const profileRes = await fetch(`${API_BASE}/api/challenge/gamification/profile`, { headers })
      const profileJson = await profileRes.json()
      if (profileJson.success) {
        setProfile(profileJson.profile)
      }
    } catch (error) {
      console.error('Failed to fetch today data:', error)
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
      router.push('/login?redirect=/challenge/today')
      return
    }
    fetchTodayData()
  }, [isAuthenticated, router, fetchTodayData])

  // 사진 선택 핸들러
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 파일 크기 체크 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('이미지 크기는 5MB 이하여야 합니다')
      return
    }

    // 미리보기 생성
    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result as string
      setProofPreview(result)
      setProofImage(result)
    }
    reader.readAsDataURL(file)
  }

  // 미션 완료 모달 열기
  const openProofModal = (mission: Mission) => {
    setSelectedMission(mission)
    setShowProofModal(true)
    setProofImage(null)
    setProofPreview(null)
    setMissionNotes('')
  }

  // 미션 완료 제출
  const handleCompleteMission = async (mission: Mission, requireProof: boolean = false) => {
    if (mission.completed) return

    // 실습 미션의 경우 사진 필수
    if (requireProof && !proofImage) {
      toast.error('인증 사진을 첨부해주세요')
      return
    }

    setCompletingMission(mission.mission_id)
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${API_BASE}/api/challenge/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          day_number: mission.day_number,
          mission_id: mission.mission_id,
          mission_type: mission.mission_type,
          notes: missionNotes || null,
          proof_image: proofImage || null
        })
      })

      const data = await res.json()

      if (data.success) {
        toast.success(`+${data.xp_earned || mission.xp} XP 획득!`)

        // 배지 획득 알림
        if (data.new_badges && data.new_badges.length > 0) {
          data.new_badges.forEach((badge: any) => {
            toast.success(`🏆 새 배지 획득: ${badge.name}!`, { duration: 5000 })
          })
        }

        // 레벨업 알림
        if (data.profile && profile && data.profile.level > profile.level) {
          toast.success(`🎉 레벨 업! Lv.${data.profile.level} ${data.profile.level_name}`, { duration: 5000 })
        }

        // 프로필 업데이트
        if (data.profile) {
          setProfile(data.profile)
        }

        // 미션 상태 업데이트
        await fetchTodayData()
        setSelectedMission(null)
        setShowLearnContent(false)
        setShowProofModal(false)
        setProofImage(null)
        setProofPreview(null)
        setMissionNotes('')
      } else {
        toast.error(data.message || '미션 완료에 실패했습니다')
      }
    } catch (error) {
      toast.error('오류가 발생했습니다')
    } finally {
      setCompletingMission(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">오늘의 미션을 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (!todayData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-6xl mb-4">🚀</div>
          <h2 className="text-xl font-bold mb-2">챌린지를 시작해보세요!</h2>
          <p className="text-gray-600 mb-6">30일 동안 블로그 전문가로 성장하는 여정을 시작하세요.</p>
          <Link href="/challenge">
            <button className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold">
              챌린지 시작하기
            </button>
          </Link>
        </div>
      </div>
    )
  }

  const { missions, motivation, status } = todayData
  const learnMission = missions.find(m => m.mission_type === 'learn')
  const practicalMission = missions.find(m => m.mission_type === 'mission')
  const allCompleted = missions.every(m => m.completed)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/challenge" className="p-2 -ml-2 hover:bg-gray-100 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="text-center">
              <div className="font-bold">Day {status.current_day}</div>
              <div className="text-xs text-gray-500">30일 블로그 챌린지</div>
            </div>
            <Link href="/challenge/progress" className="p-2 -mr-2 hover:bg-gray-100 rounded-xl transition-colors">
              <Calendar className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* 상단 스탯 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm p-4 mb-6"
        >
          <div className="flex items-center justify-between">
            {/* 레벨 & XP */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <span className="text-white font-bold">{profile?.level || 1}</span>
              </div>
              <div>
                <div className="font-bold">{profile?.level_name || '새싹 블로거'}</div>
                <div className="text-sm text-gray-500">
                  <Zap className="inline w-3 h-3 text-yellow-500 mr-1" />
                  {profile?.total_xp || 0} XP
                </div>
              </div>
            </div>

            {/* 스트릭 */}
            <div className="text-center">
              <div className="flex items-center gap-1 text-orange-500">
                <Flame className="w-5 h-5" />
                <span className="font-bold text-lg">{profile?.current_streak || 0}</span>
              </div>
              <div className="text-xs text-gray-500">연속</div>
            </div>

            {/* 진행률 */}
            <div className="text-center">
              <div className="text-lg font-bold text-purple-600">{status.progress_percent}%</div>
              <div className="text-xs text-gray-500">진행률</div>
            </div>
          </div>

          {/* XP 진행바 */}
          {profile && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>다음 레벨까지</span>
                <span>{profile.xp_to_next} XP 남음</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((profile.total_xp % 500) / 500) * 100}%` }}
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                />
              </div>
            </div>
          )}
        </motion.div>

        {/* 모든 미션 완료 */}
        {allCompleted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-6 text-white text-center mb-6"
          >
            <div className="text-4xl mb-3">🎉</div>
            <h3 className="text-xl font-bold mb-2">오늘의 미션 완료!</h3>
            <p className="opacity-90 mb-4">대단해요! 내일도 함께해요.</p>
            <Link href="/challenge/progress">
              <button className="px-6 py-2 bg-white text-green-600 rounded-xl font-bold">
                전체 진행 현황 보기
              </button>
            </Link>
          </motion.div>
        )}

        {/* 학습 미션 */}
        {learnMission && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4"
          >
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    learnMission.completed ? 'bg-green-100' : 'bg-blue-100'
                  }`}>
                    {learnMission.completed ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <BookOpen className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">학습</span>
                      {learnMission.completed && (
                        <span className="text-xs text-green-500 font-medium">완료!</span>
                      )}
                    </div>
                    <h3 className="font-bold">{learnMission.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{learnMission.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-yellow-500">
                  <Zap className="w-4 h-4" />
                  <span className="font-bold">{learnMission.xp}</span>
                </div>
              </div>

              {!learnMission.completed && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedMission(learnMission)
                    setShowLearnContent(true)
                  }}
                  className="mt-4 w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  학습하기
                </motion.button>
              )}
            </div>
          </motion.div>
        )}

        {/* 실습 미션 */}
        {practicalMission && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4"
          >
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    practicalMission.completed ? 'bg-green-100' : 'bg-purple-100'
                  }`}>
                    {practicalMission.completed ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <Target className="w-5 h-5 text-purple-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full">미션</span>
                      {practicalMission.completed && (
                        <span className="text-xs text-green-500 font-medium">완료!</span>
                      )}
                    </div>
                    <h3 className="font-bold">{practicalMission.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{practicalMission.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-yellow-500">
                  <Zap className="w-4 h-4" />
                  <span className="font-bold">{practicalMission.xp}</span>
                </div>
              </div>

              {/* 체크리스트 */}
              {practicalMission.checklist && practicalMission.checklist.length > 0 && !practicalMission.completed && (
                <div className="mt-4 p-3 bg-gray-50 rounded-xl">
                  <div className="text-sm font-medium text-gray-600 mb-2">체크리스트</div>
                  {practicalMission.checklist.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 py-1 text-sm text-gray-600">
                      <Circle className="w-3 h-3 text-gray-400" />
                      {item}
                    </div>
                  ))}
                </div>
              )}

              {!practicalMission.completed && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => openProofModal(practicalMission)}
                  disabled={!!completingMission}
                  className="mt-4 w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  인증하고 완료하기
                </motion.button>
              )}
            </div>
          </motion.div>
        )}

        {/* 오늘의 동기부여 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 mb-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <span className="font-bold text-amber-700">오늘의 동기부여</span>
          </div>
          <blockquote className="text-gray-700 italic mb-2">
            "{motivation.quote}"
          </blockquote>
          <div className="text-sm text-gray-500 mb-4">- {motivation.author}</div>
          <div className="p-3 bg-white/60 rounded-xl">
            <div className="text-xs font-medium text-amber-600 mb-1">💡 오늘의 팁</div>
            <div className="text-sm text-gray-600">{motivation.tip}</div>
          </div>
        </motion.div>

        {/* 도구 바로가기 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-2 gap-3"
        >
          <Link href="/tools">
            <div className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <div className="font-bold text-sm">AI 도구</div>
                  <div className="text-xs text-gray-500">글쓰기에 활용</div>
                </div>
              </div>
            </div>
          </Link>
          <Link href="/keyword-search">
            <div className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <Target className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div className="font-bold text-sm">키워드 검색</div>
                  <div className="text-xs text-gray-500">글감 찾기</div>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      </div>

      {/* 학습 콘텐츠 모달 */}
      <AnimatePresence>
        {showLearnContent && selectedMission && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={() => setShowLearnContent(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-hidden"
            >
              {/* 모달 헤더 */}
              <div className="p-5 border-b sticky top-0 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Day {selectedMission.day_number} 학습</div>
                      <div className="font-bold">{selectedMission.title}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowLearnContent(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 모달 콘텐츠 */}
              <div className="p-5 overflow-y-auto max-h-[60vh]">
                <p className="text-gray-600 mb-4">{selectedMission.description}</p>

                {selectedMission.content && (
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-gray-700">
                      {selectedMission.content}
                    </div>
                  </div>
                )}

                {selectedMission.tip && (
                  <div className="mt-4 p-4 bg-amber-50 rounded-xl">
                    <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
                      <Lightbulb className="w-4 h-4" />
                      핵심 포인트
                    </div>
                    <p className="text-sm text-amber-800">{selectedMission.tip}</p>
                  </div>
                )}
              </div>

              {/* 모달 푸터 */}
              <div className="p-5 border-t bg-gray-50">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleCompleteMission(selectedMission, false)}
                  disabled={!!completingMission}
                  className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {completingMission === selectedMission.mission_id ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      처리 중...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      학습 완료 (+{selectedMission.xp} XP)
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 미션 인증 사진 업로드 모달 */}
      <AnimatePresence>
        {showProofModal && selectedMission && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={() => setShowProofModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-hidden"
            >
              {/* 모달 헤더 */}
              <div className="p-5 border-b sticky top-0 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                      <Camera className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">미션 인증</div>
                      <div className="font-bold">{selectedMission.title}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowProofModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* 모달 콘텐츠 */}
              <div className="p-5 overflow-y-auto max-h-[60vh]">
                <p className="text-gray-600 mb-4">{selectedMission.description}</p>

                {/* 체크리스트 */}
                {selectedMission.checklist && selectedMission.checklist.length > 0 && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-xl">
                    <div className="text-sm font-medium text-gray-600 mb-2">체크리스트</div>
                    {selectedMission.checklist.map((item, index) => (
                      <div key={index} className="flex items-center gap-2 py-1 text-sm text-gray-600">
                        <Circle className="w-3 h-3 text-gray-400" />
                        {item}
                      </div>
                    ))}
                  </div>
                )}

                {/* 사진 업로드 영역 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📸 인증 사진 (필수)
                  </label>

                  {proofPreview ? (
                    <div className="relative">
                      <img
                        src={proofPreview}
                        alt="인증 사진 미리보기"
                        className="w-full h-48 object-cover rounded-xl"
                      />
                      <button
                        onClick={() => {
                          setProofImage(null)
                          setProofPreview(null)
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-10 h-10 text-gray-400 mb-3" />
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold text-purple-500">클릭하여 업로드</span>
                        </p>
                        <p className="text-xs text-gray-400">PNG, JPG (최대 5MB)</p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleImageSelect}
                      />
                    </label>
                  )}
                </div>

                {/* 메모 입력 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ✏️ 소감 한마디 (선택)
                  </label>
                  <textarea
                    value={missionNotes}
                    onChange={(e) => setMissionNotes(e.target.value)}
                    placeholder="오늘 미션을 수행하면서 느낀 점을 적어보세요..."
                    className="w-full p-3 border rounded-xl resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={3}
                  />
                </div>
              </div>

              {/* 모달 푸터 */}
              <div className="p-5 border-t bg-gray-50">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleCompleteMission(selectedMission, true)}
                  disabled={!!completingMission || !proofImage}
                  className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {completingMission === selectedMission.mission_id ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      처리 중...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      {proofImage ? `미션 완료! (+${selectedMission.xp} XP)` : '사진을 첨부해주세요'}
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
