'use client'

import { useFeature } from '@/lib/features/useFeatureAccess'
import { PLAN_INFO, Plan } from '@/lib/features/featureAccess'
import { Lock, Crown, Sparkles, Zap } from 'lucide-react'
import Link from 'next/link'

interface FeatureGateProps {
  feature: string
  children: React.ReactNode
  fallback?: React.ReactNode
  showUpgrade?: boolean
  showLimitedWarning?: boolean
  className?: string
}

/**
 * FeatureGate Component
 * Wraps content that requires feature access
 * Shows upgrade prompt if user doesn't have access
 */
export function FeatureGate({
  feature,
  children,
  fallback,
  showUpgrade = true,
  showLimitedWarning = false,
  className = ''
}: FeatureGateProps) {
  const {
    allowed,
    isLimited,
    displayName,
    upgradeHint,
    badge,
    isLoading
  } = useFeature(feature)

  // Loading state
  if (isLoading) {
    return (
      <div className={`animate-pulse bg-gray-100 rounded-xl h-32 ${className}`} />
    )
  }

  // No access - show upgrade prompt
  if (!allowed) {
    if (fallback) return <>{fallback}</>

    if (!showUpgrade) return null

    return (
      <div className={`relative ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl" />
        <div className="relative flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">{displayName}</h3>
          <p className="text-gray-500 mb-4">{upgradeHint}</p>
          {badge && (
            <Link
              href="/pricing"
              className={`px-4 py-2 rounded-full text-sm font-bold ${badge.color} flex items-center gap-2 hover:scale-105 transition-transform`}
            >
              <Crown className="w-4 h-4" />
              {badge.label} 플랜으로 업그레이드
            </Link>
          )}
        </div>
      </div>
    )
  }

  // Limited access - show warning banner if requested
  if (isLimited && showLimitedWarning) {
    return (
      <div className={className}>
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-amber-700">{upgradeHint}</p>
          </div>
          <Link
            href="/pricing"
            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
          >
            업그레이드
          </Link>
        </div>
        {children}
      </div>
    )
  }

  // Full access
  return <>{children}</>
}

/**
 * FeatureBadge Component
 * Shows a badge indicating required plan for a feature
 */
export function FeatureBadge({ feature }: { feature: string }) {
  const { badge, allowed, isLimited } = useFeature(feature)

  // No badge needed if user has full access
  if (allowed && !isLimited) return null

  // Limited access badge
  if (isLimited) {
    return (
      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
        제한
      </span>
    )
  }

  // Locked badge
  if (badge) {
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
        {badge.label}
      </span>
    )
  }

  return (
    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-medium flex items-center gap-1">
      <Lock className="w-3 h-3" />
    </span>
  )
}

/**
 * FeatureLockOverlay Component
 * Shows a lock overlay on top of content
 */
export function FeatureLockOverlay({
  feature,
  children,
  className = ''
}: {
  feature: string
  children: React.ReactNode
  className?: string
}) {
  const { allowed, displayName, upgradeHint, badge, isLoading } = useFeature(feature)

  if (isLoading || allowed) {
    return <>{children}</>
  }

  return (
    <div className={`relative ${className}`}>
      {/* Blurred content */}
      <div className="blur-sm pointer-events-none select-none opacity-50">
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-xl">
        <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-3">
          <Lock className="w-6 h-6 text-gray-500" />
        </div>
        <p className="text-sm text-gray-600 mb-3">{upgradeHint}</p>
        {badge && (
          <Link
            href="/pricing"
            className={`px-4 py-2 rounded-full text-sm font-bold ${badge.color} flex items-center gap-2 hover:scale-105 transition-transform`}
          >
            <Zap className="w-4 h-4" />
            {badge.label}
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * PlanBadge Component
 * Shows user's current plan badge
 */
export function PlanBadge({ plan }: { plan: Plan }) {
  const info = PLAN_INFO[plan]
  if (!info.badge) return null

  const colors: Record<Plan, string> = {
    guest: '',
    free: '',
    basic: 'bg-blue-100 text-blue-700 border-blue-200',
    pro: 'bg-purple-100 text-purple-700 border-purple-200',
    unlimited: 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-yellow-400'
  }

  const icons: Record<Plan, React.ReactNode> = {
    guest: null,
    free: null,
    basic: <Sparkles className="w-3 h-3" />,
    pro: <Zap className="w-3 h-3" />,
    unlimited: <Crown className="w-3 h-3" />
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${colors[plan]}`}>
      {icons[plan]}
      {info.badge}
    </span>
  )
}
