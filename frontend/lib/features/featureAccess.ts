/**
 * Feature Access Configuration
 * Mirrors the backend feature_access.py configuration
 */

export type Plan = 'guest' | 'free' | 'basic' | 'pro' | 'business'
export type AccessLevel = 'none' | 'limited' | 'full'

export interface FeatureConfig {
  name: string
  displayName: string
  description: string
  category: string
  access: Record<Plan, AccessLevel>
  limits?: Record<Plan, Record<string, any>>
}

export interface FeatureAccessInfo {
  allowed: boolean
  accessLevel: AccessLevel
  limits?: Record<string, any>
  upgradeHint?: string
}

// Feature Categories (Simplified)
export const CATEGORIES: Record<string, string> = {
  content: '콘텐츠 제작',
  analysis: '분석 & 추적',
  premium: '프리미엄 전용'
}

// Plan Info
export const PLAN_INFO: Record<Plan, { name: string; price: number; dailyLimit: number; badge: string }> = {
  guest: { name: '비회원', price: 0, dailyLimit: 5, badge: '' },
  free: { name: '무료', price: 0, dailyLimit: 10, badge: '' },
  basic: { name: '베이직', price: 9900, dailyLimit: 50, badge: 'Basic' },
  pro: { name: '프로', price: 19900, dailyLimit: 200, badge: 'Pro' },
  business: { name: '비즈니스', price: 49900, dailyLimit: -1, badge: 'Business' }
}

// Core Features (8 + extras)
export const FEATURES: Record<string, FeatureConfig> = {
  // Content Creation (4)
  title: {
    name: 'title',
    displayName: 'AI 제목 생성',
    description: 'AI가 클릭률 높은 제목을 생성합니다',
    category: 'content',
    access: { guest: 'limited', free: 'limited', basic: 'full', pro: 'full', business: 'full' },
    limits: { guest: { maxTitles: 3 }, free: { maxTitles: 5 }, basic: { maxTitles: -1 }, pro: { maxTitles: -1 }, business: { maxTitles: -1 } }
  },
  blueocean: {
    name: 'blueocean',
    displayName: '키워드 발굴',
    description: '경쟁이 낮은 블루오션 키워드를 발굴합니다',
    category: 'content',
    access: { guest: 'limited', free: 'limited', basic: 'full', pro: 'full', business: 'full' },
    limits: { guest: { maxKeywords: 5 }, free: { maxKeywords: 10 }, basic: { maxKeywords: -1 }, pro: { maxKeywords: -1 }, business: { maxKeywords: -1 } }
  },
  writing: {
    name: 'writing',
    displayName: '글쓰기 가이드',
    description: 'SEO 최적화 글쓰기 가이드를 제공합니다',
    category: 'content',
    access: { guest: 'limited', free: 'limited', basic: 'full', pro: 'full', business: 'full' }
  },
  hashtag: {
    name: 'hashtag',
    displayName: '해시태그 추천',
    description: '최적의 해시태그를 추천합니다',
    category: 'content',
    access: { guest: 'full', free: 'full', basic: 'full', pro: 'full', business: 'full' }
  },

  // Analysis & Tracking (4)
  clone: {
    name: 'clone',
    displayName: '블로그 분석',
    description: '블로그 지수와 전략을 분석합니다',
    category: 'analysis',
    access: { guest: 'limited', free: 'limited', basic: 'full', pro: 'full', business: 'full' }
  },
  keywordAnalysis: {
    name: 'keywordAnalysis',
    displayName: '키워드 분석',
    description: '키워드별 상위 노출 블로그를 분석합니다',
    category: 'analysis',
    access: { guest: 'limited', free: 'limited', basic: 'full', pro: 'full', business: 'full' },
    limits: {
      guest: { maxKeywords: 5, treeExpansion: false },
      free: { maxKeywords: 10, treeExpansion: false },
      basic: { maxKeywords: -1, treeExpansion: true },
      pro: { maxKeywords: -1, treeExpansion: true },
      business: { maxKeywords: -1, treeExpansion: true }
    }
  },
  ranktrack: {
    name: 'ranktrack',
    displayName: '순위 추적',
    description: '키워드별 순위 변화를 추적합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'limited', pro: 'full', business: 'full' },
    limits: { basic: { maxKeywords: 10 }, pro: { maxKeywords: -1 }, business: { maxKeywords: -1 } }
  },
  trend: {
    name: 'trend',
    displayName: '트렌드 분석',
    description: '키워드 트렌드를 분석합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'full', pro: 'full', business: 'full' }
  },

  // Premium Features
  adOptimizer: {
    name: 'adOptimizer',
    displayName: '광고 최적화',
    description: '네이버 검색광고를 AI가 자동으로 최적화합니다',
    category: 'premium',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  }
}

/**
 * Get feature access info for a specific plan
 */
export function getFeatureAccess(featureName: string, plan: Plan): FeatureAccessInfo {
  const feature = FEATURES[featureName]
  if (!feature) {
    return {
      allowed: false,
      accessLevel: 'none',
      upgradeHint: '존재하지 않는 기능입니다'
    }
  }

  const accessLevel = feature.access[plan] || 'none'
  const result: FeatureAccessInfo = {
    allowed: accessLevel !== 'none',
    accessLevel,
    limits: feature.limits?.[plan]
  }

  // Add upgrade hints
  if (accessLevel === 'none') {
    const plans: Plan[] = ['free', 'basic', 'pro', 'business']
    for (const p of plans) {
      if (feature.access[p] !== 'none') {
        result.upgradeHint = `${PLAN_INFO[p].name} 플랜 이상에서 사용 가능합니다`
        break
      }
    }
  } else if (accessLevel === 'limited') {
    const plans: Plan[] = ['basic', 'pro', 'business']
    for (const p of plans) {
      if (feature.access[p] === 'full') {
        result.upgradeHint = `${PLAN_INFO[p].name} 플랜으로 업그레이드하면 제한 없이 사용할 수 있습니다`
        break
      }
    }
  }

  return result
}

/**
 * Get minimum required plan for a feature
 */
export function getMinimumPlan(featureName: string): Plan | null {
  const feature = FEATURES[featureName]
  if (!feature) return null

  const plans: Plan[] = ['guest', 'free', 'basic', 'pro', 'business']
  for (const plan of plans) {
    if (feature.access[plan] !== 'none') {
      return plan
    }
  }
  return null
}

/**
 * Get minimum plan for full access
 */
export function getMinimumFullAccessPlan(featureName: string): Plan | null {
  const feature = FEATURES[featureName]
  if (!feature) return null

  const plans: Plan[] = ['guest', 'free', 'basic', 'pro', 'business']
  for (const plan of plans) {
    if (feature.access[plan] === 'full') {
      return plan
    }
  }
  return null
}

/**
 * Check if a plan can access a feature (any level)
 */
export function canAccessFeature(featureName: string, plan: Plan): boolean {
  return getFeatureAccess(featureName, plan).allowed
}

/**
 * Check if a plan has full access to a feature
 */
export function hasFullAccess(featureName: string, plan: Plan): boolean {
  return getFeatureAccess(featureName, plan).accessLevel === 'full'
}

/**
 * Get all features for a plan
 */
export function getAllFeaturesForPlan(plan: Plan): Record<string, FeatureAccessInfo> {
  const result: Record<string, FeatureAccessInfo> = {}
  for (const featureName of Object.keys(FEATURES)) {
    result[featureName] = getFeatureAccess(featureName, plan)
  }
  return result
}

/**
 * Get features grouped by category
 */
export function getFeaturesByCategory(): Record<string, Array<{ name: string; displayName: string; description: string }>> {
  const result: Record<string, Array<{ name: string; displayName: string; description: string }>> = {}

  for (const [category] of Object.entries(CATEGORIES)) {
    result[category] = []
  }

  for (const [name, feature] of Object.entries(FEATURES)) {
    result[feature.category].push({
      name,
      displayName: feature.displayName,
      description: feature.description
    })
  }

  return result
}

/**
 * Get badge color for a plan
 */
export function getPlanBadgeColor(plan: Plan): string {
  switch (plan) {
    case 'basic':
      return 'bg-blue-100 text-blue-700'
    case 'pro':
      return 'bg-purple-100 text-purple-700'
    case 'business':
      return 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

/**
 * Get lock badge for inaccessible features
 */
export function getRequiredPlanBadge(featureName: string): { plan: Plan; label: string; color: string } | null {
  const minPlan = getMinimumPlan(featureName)
  if (!minPlan || minPlan === 'guest' || minPlan === 'free') return null

  return {
    plan: minPlan,
    label: PLAN_INFO[minPlan].badge,
    color: getPlanBadgeColor(minPlan)
  }
}
