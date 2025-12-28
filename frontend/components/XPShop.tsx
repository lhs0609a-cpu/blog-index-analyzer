'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Star, Zap, Gift, Trophy, Crown, Medal,
  ChevronRight, Sparkles, Clock, Check, Lock,
  ShoppingCart, TrendingUp, Award
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { useXPStore, REWARDS, RANKS, ACHIEVEMENTS, type Reward, type Achievement } from '@/lib/stores/xp'

interface XPShopProps {
  isOpen: boolean
  onClose: () => void
}

export default function XPShop({ isOpen, onClose }: XPShopProps) {
  const [activeTab, setActiveTab] = useState<'shop' | 'achievements' | 'rank'>('shop')
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null)
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null)

  const {
    totalXP,
    currentXP,
    level,
    unlockedAchievements,
    bonusAnalysis,
    premiumTrialUntil,
    loginStreak,
    getCurrentRank,
    getNextRank,
    getRankProgress,
    purchaseReward,
    isPremiumTrialActive
  } = useXPStore()

  const currentRank = getCurrentRank()
  const nextRank = getNextRank()
  const rankProgress = getRankProgress()

  const handlePurchase = (reward: Reward) => {
    if (currentXP < reward.cost) return

    const success = purchaseReward(reward.id)
    if (success) {
      setPurchaseSuccess(reward.id)
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      })
      setTimeout(() => setPurchaseSuccess(null), 3000)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 p-6 relative overflow-hidden">
            <motion.div
              animate={{ x: ['0%', '100%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                  <span className="text-4xl">{currentRank.icon}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-white/80 text-sm">
                    <span>Lv.{level}</span>
                    <span>•</span>
                    <span>{currentRank.name}</span>
                  </div>
                  <div className="text-2xl font-bold text-white flex items-center gap-2">
                    <Star className="w-6 h-6 fill-yellow-300 text-yellow-300" />
                    {currentXP.toLocaleString()} XP
                  </div>
                  <div className="text-white/60 text-xs mt-1">
                    총 획득: {totalXP.toLocaleString()} XP
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white/70 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Rank Progress */}
            {nextRank && (
              <div className="mt-4 relative">
                <div className="flex justify-between text-xs text-white/70 mb-1">
                  <span>{currentRank.name}</span>
                  <span>{nextRank.name}까지 {nextRank.minXP - totalXP} XP</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${rankProgress}%` }}
                    className="h-full bg-white rounded-full"
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-b">
            <div className="flex items-center gap-4">
              {bonusAnalysis > 0 && (
                <div className="flex items-center gap-1 text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                  <Zap className="w-4 h-4" />
                  추가 분석 {bonusAnalysis}회
                </div>
              )}
              {isPremiumTrialActive() && (
                <div className="flex items-center gap-1 text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
                  <Crown className="w-4 h-4" />
                  프로 체험 중 (~{formatDate(premiumTrialUntil)})
                </div>
              )}
              {loginStreak > 0 && (
                <div className="flex items-center gap-1 text-sm bg-orange-100 text-orange-700 px-3 py-1 rounded-full">
                  <TrendingUp className="w-4 h-4" />
                  {loginStreak}일 연속 접속
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b">
            {[
              { id: 'shop', label: '상점', icon: ShoppingCart },
              { id: 'achievements', label: '업적', icon: Trophy },
              { id: 'rank', label: '등급', icon: Award }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-3 flex items-center justify-center gap-2 font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[50vh]">
            {/* Shop Tab */}
            {activeTab === 'shop' && (
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Gift className="w-5 h-5 text-purple-500" />
                  보상 교환
                </h3>
                <div className="grid gap-3">
                  {REWARDS.map((reward) => {
                    const canAfford = currentXP >= reward.cost
                    const isPurchased = purchaseSuccess === reward.id

                    return (
                      <motion.div
                        key={reward.id}
                        whileHover={{ scale: canAfford ? 1.01 : 1 }}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          isPurchased
                            ? 'border-green-500 bg-green-50'
                            : canAfford
                            ? 'border-purple-200 bg-white hover:border-purple-400 cursor-pointer'
                            : 'border-gray-200 bg-gray-50 opacity-60'
                        }`}
                        onClick={() => canAfford && !isPurchased && handlePurchase(reward)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                              reward.type === 'premium_trial'
                                ? 'bg-gradient-to-br from-purple-100 to-pink-100'
                                : 'bg-blue-100'
                            }`}>
                              {reward.icon}
                            </div>
                            <div>
                              <h4 className="font-bold text-gray-900">{reward.name}</h4>
                              <p className="text-sm text-gray-500">{reward.description}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {isPurchased ? (
                              <div className="flex items-center gap-1 text-green-600 font-bold">
                                <Check className="w-5 h-5" />
                                구매 완료!
                              </div>
                            ) : (
                              <>
                                <div className={`font-bold flex items-center gap-1 ${
                                  canAfford ? 'text-purple-600' : 'text-gray-400'
                                }`}>
                                  <Star className="w-4 h-4" />
                                  {reward.cost.toLocaleString()} XP
                                </div>
                                {!canAfford && (
                                  <div className="text-xs text-gray-400 flex items-center gap-1">
                                    <Lock className="w-3 h-3" />
                                    {(reward.cost - currentXP).toLocaleString()} XP 부족
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Achievements Tab */}
            {activeTab === 'achievements' && (
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  업적 ({unlockedAchievements.length}/{ACHIEVEMENTS.length})
                </h3>
                <div className="grid gap-3">
                  {ACHIEVEMENTS.map((achievement) => {
                    const unlocked = unlockedAchievements.some(a => a.id === achievement.id)
                    const progress = Math.min(100, (totalXP / achievement.requiredXP) * 100)

                    return (
                      <div
                        key={achievement.id}
                        className={`p-4 rounded-xl border-2 ${
                          unlocked
                            ? 'border-yellow-300 bg-yellow-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                            unlocked ? 'bg-yellow-100' : 'bg-gray-200 grayscale'
                          }`}>
                            {achievement.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className={`font-bold ${unlocked ? 'text-yellow-800' : 'text-gray-500'}`}>
                                {achievement.name}
                              </h4>
                              {unlocked && (
                                <Check className="w-5 h-5 text-yellow-600" />
                              )}
                            </div>
                            <p className={`text-sm ${unlocked ? 'text-yellow-700' : 'text-gray-400'}`}>
                              {achievement.description}
                            </p>
                            {!unlocked && (
                              <div className="mt-2">
                                <div className="flex justify-between text-xs text-gray-400 mb-1">
                                  <span>{totalXP} / {achievement.requiredXP} XP</span>
                                  <span>{Math.round(progress)}%</span>
                                </div>
                                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gray-400 rounded-full transition-all"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Rank Tab */}
            {activeTab === 'rank' && (
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-purple-500" />
                  등급 시스템
                </h3>
                <div className="space-y-3">
                  {RANKS.map((rank, index) => {
                    const isCurrentRank = rank.id === currentRank.id
                    const isUnlocked = totalXP >= rank.minXP

                    return (
                      <div
                        key={rank.id}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          isCurrentRank
                            ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                            : isUnlocked
                            ? 'border-green-200 bg-green-50'
                            : 'border-gray-200 bg-gray-50 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl bg-gradient-to-br ${rank.color}`}>
                            {rank.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-gray-900">{rank.name}</h4>
                              {isCurrentRank && (
                                <span className="px-2 py-0.5 bg-purple-500 text-white text-xs rounded-full">
                                  현재 등급
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">
                              {rank.minXP.toLocaleString()} XP 이상
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {rank.benefits.map((benefit, i) => (
                                <span
                                  key={i}
                                  className={`text-xs px-2 py-0.5 rounded-full ${
                                    isUnlocked
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-200 text-gray-500'
                                  }`}
                                >
                                  {benefit}
                                </span>
                              ))}
                            </div>
                          </div>
                          {!isUnlocked && (
                            <div className="text-right">
                              <Lock className="w-5 h-5 text-gray-400 mx-auto" />
                              <p className="text-xs text-gray-400 mt-1">
                                {(rank.minXP - totalXP).toLocaleString()} XP 필요
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t p-4 bg-gray-50">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                튜토리얼 완료, 분석 수행, 연속 접속으로 XP를 획득하세요!
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// XP 표시 버튼 (네비게이션용)
export function XPButton({ onClick }: { onClick: () => void }) {
  const { currentXP, getCurrentRank, loginStreak, recordLogin } = useXPStore()
  const currentRank = getCurrentRank()

  // 컴포넌트 마운트 시 로그인 기록
  useEffect(() => {
    recordLogin()
  }, [recordLogin])

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-sm font-medium shadow-lg hover:shadow-xl transition-shadow"
    >
      <span>{currentRank.icon}</span>
      <Star className="w-4 h-4 fill-yellow-300 text-yellow-300" />
      <span>{currentXP.toLocaleString()}</span>
      {loginStreak >= 3 && (
        <span className="flex items-center gap-0.5 text-orange-200">
          <TrendingUp className="w-3 h-3" />
          {loginStreak}
        </span>
      )}
    </motion.button>
  )
}
