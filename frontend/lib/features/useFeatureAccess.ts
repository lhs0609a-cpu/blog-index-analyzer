'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/auth'
import {
  Plan,
  AccessLevel,
  FeatureAccessInfo,
  FEATURES,
  PLAN_INFO,
  getFeatureAccess,
  canAccessFeature,
  hasFullAccess,
  getRequiredPlanBadge,
  getAllFeaturesForPlan
} from './featureAccess'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev'

interface UseFeatureAccessReturn {
  // Current user's plan
  plan: Plan
  planInfo: typeof PLAN_INFO[Plan]

  // Check feature access
  canAccess: (featureName: string) => boolean
  hasFull: (featureName: string) => boolean
  getAccess: (featureName: string) => FeatureAccessInfo

  // UI helpers
  getFeatureBadge: (featureName: string) => { plan: Plan; label: string; color: string } | null
  isLoading: boolean

  // All features access info
  features: Record<string, FeatureAccessInfo>

  // Refresh from backend
  refresh: () => Promise<void>
}

export function useFeatureAccess(): UseFeatureAccessReturn {
  const { user, isAuthenticated } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const [backendPlan, setBackendPlan] = useState<Plan | null>(null)

  // Determine current plan
  // Admin users always have unlimited access
  // Users with premium granted also have their granted plan
  const effectivePlan: Plan = user?.is_admin
    ? 'unlimited'
    : user?.is_premium_granted
      ? ((user?.plan as Plan) || 'unlimited')
      : (backendPlan || (user?.plan as Plan) || (isAuthenticated ? 'free' : 'guest'))
  const plan = effectivePlan
  const planInfo = PLAN_INFO[plan]

  // Fetch user's plan from backend
  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setBackendPlan('guest')
      return
    }

    setIsLoading(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/api/system/features`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })

      if (response.ok) {
        const data = await response.json()
        setBackendPlan(data.plan as Plan)
      }
    } catch (error) {
      console.error('Failed to fetch feature access:', error)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  // Fetch on mount and when login status changes
  useEffect(() => {
    refresh()
  }, [refresh])

  // Access check functions
  const canAccess = useCallback(
    (featureName: string) => canAccessFeature(featureName, plan),
    [plan]
  )

  const hasFull = useCallback(
    (featureName: string) => hasFullAccess(featureName, plan),
    [plan]
  )

  const getAccess = useCallback(
    (featureName: string) => getFeatureAccess(featureName, plan),
    [plan]
  )

  const getFeatureBadge = useCallback(
    (featureName: string) => {
      // Only show badge if user can't access
      if (canAccessFeature(featureName, plan)) return null
      return getRequiredPlanBadge(featureName)
    },
    [plan]
  )

  // All features access info
  const features = getAllFeaturesForPlan(plan)

  return {
    plan,
    planInfo,
    canAccess,
    hasFull,
    getAccess,
    getFeatureBadge,
    isLoading,
    features,
    refresh
  }
}

/**
 * Hook for a specific feature - returns detailed access info
 */
export function useFeature(featureName: string) {
  const { plan, getAccess, canAccess, hasFull, getFeatureBadge, isLoading } = useFeatureAccess()

  const accessInfo = getAccess(featureName)
  const feature = FEATURES[featureName]

  return {
    // Feature info
    name: featureName,
    displayName: feature?.displayName || featureName,
    description: feature?.description || '',
    category: feature?.category || '',

    // Access info
    allowed: accessInfo.allowed,
    accessLevel: accessInfo.accessLevel,
    limits: accessInfo.limits,
    upgradeHint: accessInfo.upgradeHint,

    // Helpers
    isLimited: accessInfo.accessLevel === 'limited',
    isFull: accessInfo.accessLevel === 'full',
    isLocked: !accessInfo.allowed,
    badge: getFeatureBadge(featureName),
    plan,
    isLoading
  }
}

/**
 * Component props for feature-gated content
 */
export interface FeatureGateProps {
  feature: string
  children: React.ReactNode
  fallback?: React.ReactNode
  showUpgrade?: boolean
}
