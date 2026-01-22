import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 업적/뱃지 정의
export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  requiredXP: number
  unlockedAt?: string
}

// 보상 정의
export interface Reward {
  id: string
  name: string
  description: string
  icon: string
  cost: number
  type: 'analysis' | 'premium_trial' | 'badge'
  value: number // 분석 횟수 또는 체험 일수
}

// 등급 정의
export interface Rank {
  id: string
  name: string
  icon: string
  minXP: number
  maxXP: number
  color: string
  benefits: string[]
}

// 보상 목록
export const REWARDS: Reward[] = [
  {
    id: 'analysis_1',
    name: '추가 분석 1회',
    description: '키워드 분석을 1회 추가로 사용할 수 있습니다.',
    icon: '🔍',
    cost: 100,
    type: 'analysis',
    value: 1
  },
  {
    id: 'analysis_5',
    name: '추가 분석 5회',
    description: '키워드 분석을 5회 추가로 사용할 수 있습니다.',
    icon: '🔎',
    cost: 450,
    type: 'analysis',
    value: 5
  },
  {
    id: 'premium_1day',
    name: '프로 기능 1일 체험',
    description: '프로 플랜의 모든 기능을 1일간 무료로 체험합니다.',
    icon: '⭐',
    cost: 500,
    type: 'premium_trial',
    value: 1
  },
  {
    id: 'premium_3day',
    name: '프로 기능 3일 체험',
    description: '프로 플랜의 모든 기능을 3일간 무료로 체험합니다.',
    icon: '🌟',
    cost: 1200,
    type: 'premium_trial',
    value: 3
  },
  {
    id: 'premium_7day',
    name: '프로 기능 7일 체험',
    description: '프로 플랜의 모든 기능을 7일간 무료로 체험합니다.',
    icon: '💫',
    cost: 2500,
    type: 'premium_trial',
    value: 7
  }
]

// 등급 목록
export const RANKS: Rank[] = [
  {
    id: 'bronze',
    name: '브론즈',
    icon: '🥉',
    minXP: 0,
    maxXP: 299,
    color: 'from-amber-600 to-amber-800',
    benefits: ['기본 분석 기능']
  },
  {
    id: 'silver',
    name: '실버',
    icon: '🥈',
    minXP: 300,
    maxXP: 999,
    color: 'from-gray-400 to-gray-600',
    benefits: ['기본 분석 기능', '추가 분석 +2회/일']
  },
  {
    id: 'gold',
    name: '골드',
    icon: '🥇',
    minXP: 1000,
    maxXP: 2999,
    color: 'from-yellow-400 to-yellow-600',
    benefits: ['기본 분석 기능', '추가 분석 +5회/일', '우선 지원']
  },
  {
    id: 'platinum',
    name: '플래티넘',
    icon: '💎',
    minXP: 3000,
    maxXP: 9999,
    color: 'from-cyan-400 to-blue-600',
    benefits: ['기본 분석 기능', '추가 분석 +10회/일', '우선 지원', '베타 기능 접근']
  },
  {
    id: 'diamond',
    name: '다이아몬드',
    icon: '👑',
    minXP: 10000,
    maxXP: Infinity,
    color: 'from-purple-400 to-pink-600',
    benefits: ['모든 기능 무제한', '1:1 전문가 상담', 'VIP 전용 기능']
  }
]

// 업적 목록
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_tutorial',
    name: '첫 발걸음',
    description: '첫 번째 튜토리얼을 완료했습니다.',
    icon: '🎓',
    requiredXP: 50
  },
  {
    id: 'tutorial_master',
    name: '튜토리얼 마스터',
    description: '모든 튜토리얼을 완료했습니다.',
    icon: '📚',
    requiredXP: 300
  },
  {
    id: 'bronze_rank',
    name: '브론즈 달성',
    description: '브론즈 등급에 도달했습니다.',
    icon: '🥉',
    requiredXP: 100
  },
  {
    id: 'silver_rank',
    name: '실버 달성',
    description: '실버 등급에 도달했습니다.',
    icon: '🥈',
    requiredXP: 300
  },
  {
    id: 'gold_rank',
    name: '골드 달성',
    description: '골드 등급에 도달했습니다.',
    icon: '🥇',
    requiredXP: 1000
  },
  {
    id: 'platinum_rank',
    name: '플래티넘 달성',
    description: '플래티넘 등급에 도달했습니다.',
    icon: '💎',
    requiredXP: 3000
  },
  {
    id: 'diamond_rank',
    name: '다이아몬드 달성',
    description: '최고 등급에 도달했습니다!',
    icon: '👑',
    requiredXP: 10000
  },
  {
    id: 'first_analysis',
    name: '첫 분석',
    description: '첫 키워드 분석을 수행했습니다.',
    icon: '🔍',
    requiredXP: 10
  },
  {
    id: 'power_user',
    name: '파워 유저',
    description: '50회 이상 분석을 수행했습니다.',
    icon: '⚡',
    requiredXP: 500
  },
  {
    id: 'streak_7',
    name: '7일 연속 접속',
    description: '7일 연속으로 서비스를 이용했습니다.',
    icon: '🔥',
    requiredXP: 200
  }
]

interface PurchasedReward {
  rewardId: string
  purchasedAt: string
  expiresAt?: string
  remaining?: number
}

// 일일 미션 정의
export interface DailyMission {
  id: string
  name: string
  description: string
  icon: string
  xpReward: number
  type: 'login' | 'analyze' | 'keyword' | 'post_read'
}

export const DAILY_MISSIONS: DailyMission[] = [
  { id: 'login', name: '오늘 접속하기', description: '서비스에 로그인하면 완료!', icon: '👋', xpReward: 10, type: 'login' },
  { id: 'analyze', name: '블로그 1회 분석', description: '블로그 분석을 1회 실행하세요', icon: '🔍', xpReward: 20, type: 'analyze' },
  { id: 'keyword', name: '키워드 검색 1회', description: '키워드 검색을 1회 실행하세요', icon: '🔑', xpReward: 15, type: 'keyword' },
]

interface DailyMissionState {
  date: string
  completedMissions: string[]
}

interface XPState {
  totalXP: number
  currentXP: number // 사용 가능한 XP
  level: number
  unlockedAchievements: Achievement[]
  purchasedRewards: PurchasedReward[]
  bonusAnalysis: number // 추가 분석 횟수
  premiumTrialUntil: string | null // 프리미엄 체험 만료일
  lastLoginDate: string | null
  loginStreak: number
  dailyMissionState: DailyMissionState // 일일 미션 상태

  // Actions
  earnXP: (amount: number, source?: string) => void
  spendXP: (amount: number) => boolean
  purchaseReward: (rewardId: string) => boolean
  checkAchievements: () => Achievement[]
  getCurrentRank: () => Rank
  getNextRank: () => Rank | null
  getRankProgress: () => number
  useBonusAnalysis: () => boolean
  isPremiumTrialActive: () => boolean
  recordLogin: () => void
  completeMission: (missionId: string) => boolean
  getCompletedMissions: () => string[]
  syncWithServer: (userId: string) => Promise<void>
}

export const useXPStore = create<XPState>()(
  persist(
    (set, get) => ({
      totalXP: 0,
      currentXP: 0,
      level: 1,
      unlockedAchievements: [],
      purchasedRewards: [],
      bonusAnalysis: 0,
      premiumTrialUntil: null,
      lastLoginDate: null,
      loginStreak: 0,
      dailyMissionState: { date: '', completedMissions: [] },

      earnXP: (amount: number, source?: string) => {
        set((state) => {
          const newTotal = state.totalXP + amount
          const newCurrent = state.currentXP + amount
          const newLevel = Math.floor(newTotal / 100) + 1

          console.log(`[XP] Earned ${amount} XP from ${source || 'unknown'}. Total: ${newTotal}`)

          return {
            totalXP: newTotal,
            currentXP: newCurrent,
            level: newLevel
          }
        })

        // 업적 체크
        get().checkAchievements()
      },

      spendXP: (amount: number) => {
        const { currentXP } = get()
        if (currentXP < amount) return false

        set((state) => ({
          currentXP: state.currentXP - amount
        }))
        return true
      },

      purchaseReward: (rewardId: string) => {
        const reward = REWARDS.find(r => r.id === rewardId)
        if (!reward) return false

        const { currentXP, spendXP } = get()
        if (currentXP < reward.cost) return false

        if (!spendXP(reward.cost)) return false

        const now = new Date()
        const purchasedReward: PurchasedReward = {
          rewardId,
          purchasedAt: now.toISOString()
        }

        if (reward.type === 'analysis') {
          set((state) => ({
            bonusAnalysis: state.bonusAnalysis + reward.value,
            purchasedRewards: [...state.purchasedRewards, purchasedReward]
          }))
        } else if (reward.type === 'premium_trial') {
          const expiresAt = new Date(now.getTime() + reward.value * 24 * 60 * 60 * 1000)

          set((state) => {
            // 기존 체험권이 있으면 연장
            const currentExpiry = state.premiumTrialUntil ? new Date(state.premiumTrialUntil) : now
            const baseDate = currentExpiry > now ? currentExpiry : now
            const newExpiry = new Date(baseDate.getTime() + reward.value * 24 * 60 * 60 * 1000)

            return {
              premiumTrialUntil: newExpiry.toISOString(),
              purchasedRewards: [...state.purchasedRewards, { ...purchasedReward, expiresAt: newExpiry.toISOString() }]
            }
          })
        }

        return true
      },

      checkAchievements: () => {
        const { totalXP, unlockedAchievements } = get()
        const newAchievements: Achievement[] = []

        ACHIEVEMENTS.forEach(achievement => {
          const alreadyUnlocked = unlockedAchievements.some(a => a.id === achievement.id)
          if (!alreadyUnlocked && totalXP >= achievement.requiredXP) {
            newAchievements.push({
              ...achievement,
              unlockedAt: new Date().toISOString()
            })
          }
        })

        if (newAchievements.length > 0) {
          set((state) => ({
            unlockedAchievements: [...state.unlockedAchievements, ...newAchievements]
          }))
        }

        return newAchievements
      },

      getCurrentRank: () => {
        const { totalXP } = get()
        return RANKS.find(r => totalXP >= r.minXP && totalXP <= r.maxXP) || RANKS[0]
      },

      getNextRank: () => {
        const currentRank = get().getCurrentRank()
        const currentIndex = RANKS.findIndex(r => r.id === currentRank.id)
        return currentIndex < RANKS.length - 1 ? RANKS[currentIndex + 1] : null
      },

      getRankProgress: () => {
        const { totalXP } = get()
        const currentRank = get().getCurrentRank()
        const nextRank = get().getNextRank()

        if (!nextRank) return 100

        const progressInRank = totalXP - currentRank.minXP
        const rankRange = nextRank.minXP - currentRank.minXP

        return Math.min(100, Math.round((progressInRank / rankRange) * 100))
      },

      useBonusAnalysis: () => {
        const { bonusAnalysis } = get()
        if (bonusAnalysis <= 0) return false

        set((state) => ({
          bonusAnalysis: state.bonusAnalysis - 1
        }))
        return true
      },

      isPremiumTrialActive: () => {
        const { premiumTrialUntil } = get()
        if (!premiumTrialUntil) return false
        return new Date(premiumTrialUntil) > new Date()
      },

      recordLogin: () => {
        const now = new Date()
        const today = now.toISOString().split('T')[0]
        const { lastLoginDate, loginStreak, earnXP, completeMission, dailyMissionState } = get()

        // 날짜가 바뀌면 일일 미션 초기화
        if (dailyMissionState.date !== today) {
          set({
            dailyMissionState: { date: today, completedMissions: [] }
          })
        }

        if (lastLoginDate === today) return // 이미 오늘 로그인함

        let newStreak = 1
        if (lastLoginDate) {
          const lastDate = new Date(lastLoginDate)
          const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
          if (diffDays === 1) {
            newStreak = loginStreak + 1
          }
        }

        set({
          lastLoginDate: today,
          loginStreak: newStreak
        })

        // 로그인 보너스 XP
        earnXP(5, 'daily_login')

        // 연속 로그인 보너스 (마일스톤)
        if (newStreak === 3) {
          earnXP(30, '3day_streak')
        } else if (newStreak === 7) {
          earnXP(100, '7day_streak')
        } else if (newStreak === 14) {
          earnXP(200, '14day_streak')
        } else if (newStreak === 30) {
          earnXP(500, '30day_streak')
        }

        // 로그인 미션 자동 완료
        completeMission('login')
      },

      completeMission: (missionId: string) => {
        const today = new Date().toISOString().split('T')[0]
        const { dailyMissionState, earnXP } = get()

        // 날짜 확인 및 초기화
        if (dailyMissionState.date !== today) {
          set({
            dailyMissionState: { date: today, completedMissions: [] }
          })
        }

        // 이미 완료한 미션인지 확인
        const currentState = get().dailyMissionState
        if (currentState.completedMissions.includes(missionId)) {
          return false
        }

        // 미션 찾기
        const mission = DAILY_MISSIONS.find(m => m.id === missionId)
        if (!mission) return false

        // 미션 완료 처리
        set({
          dailyMissionState: {
            date: today,
            completedMissions: [...currentState.completedMissions, missionId]
          }
        })

        // XP 지급
        earnXP(mission.xpReward, `mission_${missionId}`)

        return true
      },

      getCompletedMissions: () => {
        const today = new Date().toISOString().split('T')[0]
        const { dailyMissionState } = get()

        if (dailyMissionState.date !== today) {
          return []
        }

        return dailyMissionState.completedMissions
      },

      syncWithServer: async (userId: string) => {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr'
        const state = get()

        try {
          const response = await fetch(`${API_BASE}/api/user/xp/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({
              user_id: userId,
              total_xp: state.totalXP,
              current_xp: state.currentXP,
              bonus_analysis: state.bonusAnalysis,
              premium_trial_until: state.premiumTrialUntil,
              login_streak: state.loginStreak,
              unlocked_achievements: state.unlockedAchievements.map(a => a.id)
            })
          })

          if (response.ok) {
            const data = await response.json()
            // 서버 데이터가 더 최신이면 업데이트
            if (data.total_xp > state.totalXP) {
              set({
                totalXP: data.total_xp,
                currentXP: data.current_xp,
                bonusAnalysis: data.bonus_analysis,
                premiumTrialUntil: data.premium_trial_until
              })
            }
          }
        } catch (error) {
          console.error('Failed to sync XP with server:', error)
        }
      }
    }),
    {
      name: 'xp-storage',
      partialize: (state) => ({
        totalXP: state.totalXP,
        currentXP: state.currentXP,
        level: state.level,
        unlockedAchievements: state.unlockedAchievements,
        purchasedRewards: state.purchasedRewards,
        bonusAnalysis: state.bonusAnalysis,
        premiumTrialUntil: state.premiumTrialUntil,
        lastLoginDate: state.lastLoginDate,
        loginStreak: state.loginStreak,
        dailyMissionState: state.dailyMissionState
      })
    }
  )
)
