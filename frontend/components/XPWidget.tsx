'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Trophy, Gift, ChevronUp } from 'lucide-react'
import { useXPStore } from '@/lib/stores/xp'
import XPShop from './XPShop'

export default function XPWidget() {
  const [isShopOpen, setIsShopOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showNewAchievement, setShowNewAchievement] = useState(false)

  const {
    totalXP,
    currentXP,
    bonusAnalysis,
    loginStreak,
    unlockedAchievements,
    getCurrentRank,
    getNextRank,
    getRankProgress,
    recordLogin,
    isPremiumTrialActive
  } = useXPStore()

  // SSR 방지
  useEffect(() => {
    setMounted(true)
    // 로그인 기록
    recordLogin()
  }, [recordLogin])

  if (!mounted) return null

  const currentRank = getCurrentRank()
  const nextRank = getNextRank()
  const rankProgress = getRankProgress()

  return (
    <>
      {/* 플로팅 XP 위젯 - 모바일에서는 하단 네비 위에 배치 */}
      <div className="fixed bottom-6 left-6 z-50 md:bottom-6 max-md:bottom-24">
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="mb-3 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-64"
            >
              {/* 현재 등급 */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br ${currentRank.color}`}>
                  {currentRank.icon}
                </div>
                <div>
                  <div className="font-bold text-gray-900">{currentRank.name}</div>
                  <div className="text-sm text-gray-500">
                    {totalXP.toLocaleString()} XP
                  </div>
                </div>
              </div>

              {/* 다음 등급까지 진행률 */}
              {nextRank && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>다음 등급</span>
                    <span>{nextRank.icon} {nextRank.name}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${rankProgress}%` }}
                      className={`h-full bg-gradient-to-r ${currentRank.color}`}
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1 text-right">
                    {nextRank.minXP - totalXP} XP 남음
                  </div>
                </div>
              )}

              {/* 연속 접속 스트릭 강조 */}
              {loginStreak > 0 && (
                <div className="mb-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-3 border border-orange-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🔥</span>
                      <div>
                        <div className="font-bold text-orange-700">{loginStreak}일 연속 접속!</div>
                        <div className="text-xs text-orange-500">
                          {loginStreak >= 7 ? '1주일 달성! 대단해요!' :
                           loginStreak >= 3 ? '잘하고 있어요!' :
                           '연속 접속 보너스 XP 획득 중'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-orange-600">+{loginStreak * 10} XP</div>
                      <div className="text-xs text-orange-400">매일 보너스</div>
                    </div>
                  </div>
                  {/* 7일 스트릭 프로그레스 */}
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                      <div
                        key={day}
                        className={`flex-1 h-2 rounded-full ${
                          day <= loginStreak
                            ? 'bg-gradient-to-r from-orange-400 to-amber-400'
                            : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-orange-400 text-right">
                    {loginStreak < 7 ? `7일 달성시 특별 보상!` : '🎉 특별 보상 획득!'}
                  </div>
                </div>
              )}

              {/* 보유 보상 */}
              <div className="flex gap-2 mb-3">
                {bonusAnalysis > 0 && (
                  <div className="flex-1 bg-blue-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-blue-600">{bonusAnalysis}</div>
                    <div className="text-xs text-blue-500">추가 분석</div>
                  </div>
                )}
                {isPremiumTrialActive() && (
                  <div className="flex-1 bg-purple-50 rounded-lg p-2 text-center">
                    <div className="text-lg">👑</div>
                    <div className="text-xs text-purple-500">프로 체험 중</div>
                  </div>
                )}
              </div>

              {/* 상점 버튼 */}
              <button
                onClick={() => {
                  setIsShopOpen(true)
                  setIsExpanded(false)
                }}
                className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:shadow-lg transition-shadow"
              >
                <Gift className="w-4 h-4" />
                XP 상점 열기
              </button>

              {/* 업적 미리보기 */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>획득 업적</span>
                  <span>{unlockedAchievements.length}개</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {unlockedAchievements.slice(-5).map((achievement) => (
                    <span key={achievement.id} className="text-lg" title={achievement.name}>
                      {achievement.icon}
                    </span>
                  ))}
                  {unlockedAchievements.length === 0 && (
                    <span className="text-gray-400 text-xs">튜토리얼을 완료해서 업적을 획득하세요!</span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 메인 버튼 */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsExpanded(!isExpanded)}
          className={`relative flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r ${currentRank.color} text-white rounded-full shadow-lg hover:shadow-xl transition-shadow`}
        >
          <span className="text-xl">{currentRank.icon}</span>
          <div className="flex items-center gap-1">
            <Star className="w-4 h-4 fill-yellow-300 text-yellow-300" />
            <span className="font-bold">{currentXP.toLocaleString()}</span>
          </div>
          {loginStreak >= 3 && (
            <span className="text-orange-200 text-sm font-medium">
              🔥{loginStreak}
            </span>
          )}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="ml-1"
          >
            <ChevronUp className="w-4 h-4" />
          </motion.div>

          {/* 새 업적 알림 */}
          {showNewAchievement && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold"
            >
              !
            </motion.div>
          )}
        </motion.button>
      </div>

      {/* XP 상점 모달 */}
      <XPShop isOpen={isShopOpen} onClose={() => setIsShopOpen(false)} />
    </>
  )
}
