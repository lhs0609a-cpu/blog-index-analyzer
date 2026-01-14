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

// Feature Categories
export const CATEGORIES: Record<string, string> = {
  content: '콘텐츠 제작',
  analysis: '분석 도구',
  keyword: '키워드 분석',
  platform: '플랫폼 분석',
  premium: '프리미엄 전용'
}

// Plan Info
export const PLAN_INFO: Record<Plan, { name: string; price: number; dailyLimit: number; badge: string }> = {
  guest: { name: '비회원', price: 0, dailyLimit: 5, badge: '' },
  free: { name: '무료', price: 0, dailyLimit: 10, badge: '' },
  basic: { name: '베이직', price: 9900, dailyLimit: 50, badge: 'Basic' },
  pro: { name: '프로', price: 29900, dailyLimit: 200, badge: 'Pro' },
  business: { name: '비즈니스', price: 99900, dailyLimit: -1, badge: 'Business' }
}

// All 34 Features
export const FEATURES: Record<string, FeatureConfig> = {
  // Content Creation
  title: {
    name: 'title',
    displayName: 'AI 제목 생성',
    description: 'AI가 클릭률 높은 제목을 생성합니다',
    category: 'content',
    access: { guest: 'limited', free: 'limited', basic: 'limited', pro: 'full', business: 'full' },
    limits: { guest: { maxTitles: 3 }, free: { maxTitles: 3 }, basic: { maxTitles: 10 }, pro: { maxTitles: -1 }, business: { maxTitles: -1 } }
  },
  blueocean: {
    name: 'blueocean',
    displayName: '블루오션 키워드',
    description: '경쟁이 낮은 블루오션 키워드를 발굴합니다',
    category: 'content',
    access: { guest: 'limited', free: 'limited', basic: 'limited', pro: 'full', business: 'full' },
    limits: { guest: { maxKeywords: 5 }, free: { maxKeywords: 5 }, basic: { maxKeywords: 20 }, pro: { maxKeywords: -1 }, business: { maxKeywords: -1 } }
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
  timing: {
    name: 'timing',
    displayName: '최적 발행 시간',
    description: '가장 효과적인 발행 시간을 분석합니다',
    category: 'content',
    access: { guest: 'full', free: 'full', basic: 'full', pro: 'full', business: 'full' }
  },
  youtube: {
    name: 'youtube',
    displayName: '유튜브 스크립트 변환',
    description: '블로그 글을 유튜브 스크립트로 변환합니다',
    category: 'content',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  comment: {
    name: 'comment',
    displayName: 'AI 댓글 답변',
    description: 'AI가 댓글 답변을 생성합니다',
    category: 'content',
    access: { guest: 'none', free: 'none', basic: 'full', pro: 'full', business: 'full' }
  },

  // Analysis Tools
  insight: {
    name: 'insight',
    displayName: '성과 인사이트',
    description: '블로그 성과를 분석하고 인사이트를 제공합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'full', pro: 'full', business: 'full' }
  },
  prediction: {
    name: 'prediction',
    displayName: '상위 노출 예측',
    description: '키워드별 상위 노출 확률을 예측합니다',
    category: 'analysis',
    access: { guest: 'limited', free: 'limited', basic: 'full', pro: 'full', business: 'full' }
  },
  report: {
    name: 'report',
    displayName: '상세 리포트',
    description: '종합 분석 리포트를 생성합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'limited', pro: 'full', business: 'full' },
    limits: { basic: { monthlyLimit: 2 }, pro: { monthlyLimit: -1 }, business: { monthlyLimit: -1 } }
  },
  lowquality: {
    name: 'lowquality',
    displayName: '저품질 위험 감지',
    description: '저품질 판정 위험을 분석합니다',
    category: 'analysis',
    access: { guest: 'limited', free: 'limited', basic: 'full', pro: 'full', business: 'full' }
  },
  backup: {
    name: 'backup',
    displayName: '블로그 백업',
    description: '블로그 글을 백업합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'limited', pro: 'full', business: 'full' },
    limits: { basic: { monthlyLimit: 1 }, pro: { monthlyLimit: -1 }, business: { monthlyLimit: -1 } }
  },
  campaign: {
    name: 'campaign',
    displayName: '체험단 매칭',
    description: '체험단 캠페인을 매칭합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'full', pro: 'full', business: 'full' }
  },
  ranktrack: {
    name: 'ranktrack',
    displayName: '키워드 순위 추적',
    description: '키워드별 순위 변화를 추적합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'limited', pro: 'limited', business: 'full' },
    limits: { basic: { maxKeywords: 5 }, pro: { maxKeywords: 50 }, business: { maxKeywords: -1 } }
  },
  clone: {
    name: 'clone',
    displayName: '경쟁 블로그 분석',
    description: '경쟁 블로그의 전략을 분석합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  algorithm: {
    name: 'algorithm',
    displayName: '알고리즘 변화 감지',
    description: '네이버 알고리즘 변화를 감지합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  lifespan: {
    name: 'lifespan',
    displayName: '콘텐츠 수명 분석',
    description: '글별 유효 수명을 분석합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'full', pro: 'full', business: 'full' }
  },
  refresh: {
    name: 'refresh',
    displayName: '오래된 글 리프레시',
    description: '업데이트가 필요한 글을 찾습니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'full', pro: 'full', business: 'full' }
  },
  related: {
    name: 'related',
    displayName: '연관 글 분석',
    description: '연관 글 링크를 분석합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'full', pro: 'full', business: 'full' }
  },
  roadmap: {
    name: 'roadmap',
    displayName: '성장 로드맵',
    description: '블로그 성장 로드맵을 제공합니다',
    category: 'analysis',
    access: { guest: 'none', free: 'none', basic: 'full', pro: 'full', business: 'full' }
  },

  // Keyword Analysis
  mentor: {
    name: 'mentor',
    displayName: '멘토링 매칭',
    description: '블로그 멘토를 매칭합니다',
    category: 'keyword',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  trend: {
    name: 'trend',
    displayName: '트렌드 예측',
    description: '키워드 트렌드를 예측합니다',
    category: 'keyword',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  revenue: {
    name: 'revenue',
    displayName: '수익 최적화',
    description: '블로그 수익을 최적화합니다',
    category: 'keyword',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  secretkw: {
    name: 'secretkw',
    displayName: '비밀 키워드',
    description: '숨겨진 고수익 키워드를 발굴합니다',
    category: 'premium',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'none', business: 'full' }
  },
  datalab: {
    name: 'datalab',
    displayName: '네이버 데이터랩',
    description: '네이버 데이터랩 연동 분석',
    category: 'keyword',
    access: { guest: 'none', free: 'none', basic: 'full', pro: 'full', business: 'full' }
  },
  keywordSearch: {
    name: 'keywordSearch',
    displayName: '키워드 검색',
    description: '키워드별 블로그 상위 노출 분석',
    category: 'keyword',
    access: { guest: 'limited', free: 'limited', basic: 'limited', pro: 'limited', business: 'full' },
    limits: {
      guest: { maxKeywords: 5, treeExpansion: false },
      free: { maxKeywords: 10, treeExpansion: false },
      basic: { maxKeywords: 30, treeExpansion: true },
      pro: { maxKeywords: 50, treeExpansion: true },
      business: { maxKeywords: 100, treeExpansion: true }
    }
  },

  // Platform Analysis
  shopping: {
    name: 'shopping',
    displayName: '쇼핑 키워드',
    description: '네이버 쇼핑 키워드를 분석합니다',
    category: 'platform',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  place: {
    name: 'place',
    displayName: '플레이스 분석',
    description: '네이버 플레이스를 분석합니다',
    category: 'platform',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  news: {
    name: 'news',
    displayName: '뉴스 분석',
    description: '뉴스 키워드를 분석합니다',
    category: 'platform',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  cafe: {
    name: 'cafe',
    displayName: '카페 분석',
    description: '네이버 카페를 분석합니다',
    category: 'platform',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  naverView: {
    name: 'naverView',
    displayName: '네이버뷰 분석',
    description: '네이버뷰(영상)를 분석합니다',
    category: 'platform',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  searchAnalysis: {
    name: 'searchAnalysis',
    displayName: '검색 결과 분석',
    description: '검색 결과 구성을 분석합니다',
    category: 'platform',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },
  kin: {
    name: 'kin',
    displayName: '지식인 분석',
    description: '네이버 지식인을 분석합니다',
    category: 'platform',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'full', business: 'full' }
  },

  // Premium Only
  influencer: {
    name: 'influencer',
    displayName: '인플루언서 분석',
    description: '인플루언서 벤치마킹 분석',
    category: 'premium',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'none', business: 'full' }
  },
  smartstore: {
    name: 'smartstore',
    displayName: '스마트스토어 연동',
    description: '스마트스토어와 연동 분석',
    category: 'premium',
    access: { guest: 'none', free: 'none', basic: 'none', pro: 'none', business: 'full' }
  },

  // Challenge System (Free for all logged-in users)
  challenge: {
    name: 'challenge',
    displayName: '30일 챌린지',
    description: '블로그 습관을 기르는 30일 성장 프로그램',
    category: 'content',
    access: { guest: 'none', free: 'full', basic: 'full', pro: 'full', business: 'full' }
  },

  // Ad Optimization (Pro and above)
  adOptimizer: {
    name: 'adOptimizer',
    displayName: '네이버 광고 자동 최적화',
    description: '네이버 검색광고 입찰가를 AI가 자동으로 최적화합니다',
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
