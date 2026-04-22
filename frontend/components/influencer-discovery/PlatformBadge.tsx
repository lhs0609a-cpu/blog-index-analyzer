'use client'

const platformConfig: Record<string, { label: string; color: string; icon: string }> = {
  youtube: {
    label: 'YouTube',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: '▶',
  },
  instagram: {
    label: 'Instagram',
    color: 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 border-purple-200',
    icon: '📷',
  },
  tiktok: {
    label: 'TikTok',
    color: 'bg-gray-900 text-white border-gray-700',
    icon: '♪',
  },
  threads: {
    label: 'Threads',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: '@',
  },
  facebook: {
    label: 'Facebook',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: 'f',
  },
  x: {
    label: 'X',
    color: 'bg-gray-900 text-white border-gray-700',
    icon: '𝕏',
  },
}

interface PlatformBadgeProps {
  platform: string
  size?: 'sm' | 'md'
}

export default function PlatformBadge({ platform, size = 'sm' }: PlatformBadgeProps) {
  const config = platformConfig[platform] || {
    label: platform,
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    icon: '?',
  }

  return (
    <span
      className={`inline-flex items-center gap-1 border rounded-full font-semibold ${config.color} ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      }`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  )
}

export { platformConfig }
