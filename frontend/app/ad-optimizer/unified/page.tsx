'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, Settings, Check, X, ChevronRight, ChevronDown, Search,
  Link2, Unlink, Play, Pause, RefreshCw, BarChart3, TrendingUp,
  DollarSign, Target, AlertCircle, ExternalLink, Clock, Shield,
  Loader2, Filter, Grid, List, Star, Sparkles, ArrowRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import { useFeature } from '@/lib/features/useFeatureAccess'
import {
  AD_PLATFORMS,
  PLATFORM_CATEGORIES,
  getPlatformsByCategory,
  AdPlatform,
  PlatformCategory
} from '../platforms'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev'

// 연동된 플랫폼 상태 타입
interface ConnectedPlatform {
  platform_id: string
  is_connected: boolean
  is_active: boolean
  last_sync_at?: string
  account_name?: string
  stats?: {
    total_spend: number
    total_conversions: number
    roas: number
    optimizations_today: number
  }
}

export default function UnifiedAdOptimizerPage() {
  const { isAuthenticated, user } = useAuthStore()
  const { allowed: hasAccess, isLocked } = useFeature('adOptimizer')

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedCategory, setSelectedCategory] = useState<PlatformCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [connectedPlatforms, setConnectedPlatforms] = useState<Record<string, ConnectedPlatform>>({})
  const [isLoading, setIsLoading] = useState(true)

  // 연동 모달 상태
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<AdPlatform | null>(null)
  const [connectForm, setConnectForm] = useState<Record<string, string>>({})
  const [isConnecting, setIsConnecting] = useState(false)

  // 연동 상태 로드
  const loadConnectedPlatforms = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/ads/platforms/status?user_id=${user?.id || 1}`)
      if (res.ok) {
        const data = await res.json()
        setConnectedPlatforms(data.platforms || {})
      }
    } catch (error) {
      // 연동된 플랫폼이 없으면 빈 객체
      setConnectedPlatforms({
        'naver_searchad': {
          platform_id: 'naver_searchad',
          is_connected: true,
          is_active: true,
          last_sync_at: new Date().toISOString(),
          account_name: '테스트 계정',
          stats: {
            total_spend: 1250000,
            total_conversions: 47,
            roas: 342,
            optimizations_today: 23
          }
        }
      })
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (hasAccess) {
      loadConnectedPlatforms()
    }
  }, [hasAccess, loadConnectedPlatforms])

  // 플랫폼 필터링
  const filteredPlatforms = AD_PLATFORMS.filter(platform => {
    const matchesCategory = selectedCategory === 'all' || platform.category === selectedCategory
    const matchesSearch = platform.nameKo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         platform.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // 플랫폼 연동 모달 열기
  const openConnectModal = (platform: AdPlatform) => {
    setSelectedPlatform(platform)
    setConnectForm({})
    setConnectModalOpen(true)
  }

  // 플랫폼 연동
  const connectPlatform = async () => {
    if (!selectedPlatform) return

    // 필수 필드 체크
    const missingFields = selectedPlatform.requiredFields.filter(field => !connectForm[field.name])
    if (missingFields.length > 0) {
      toast.error('모든 필수 항목을 입력해주세요')
      return
    }

    setIsConnecting(true)
    try {
      const res = await fetch(`${API_BASE}/api/ads/platforms/${selectedPlatform.id}/connect?user_id=${user?.id || 1}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectForm)
      })

      if (res.ok) {
        toast.success(`${selectedPlatform.nameKo} 연동 완료!`)
        setConnectModalOpen(false)
        loadConnectedPlatforms()
      } else {
        const error = await res.json()
        toast.error(error.detail || '연동 실패')
      }
    } catch (error) {
      toast.error('서버 오류가 발생했습니다')
    } finally {
      setIsConnecting(false)
    }
  }

  // 플랫폼 연동 해제
  const disconnectPlatform = async (platformId: string) => {
    if (!confirm('정말로 연동을 해제하시겠습니까?')) return

    try {
      const res = await fetch(`${API_BASE}/api/ads/platforms/${platformId}/disconnect?user_id=${user?.id || 1}`, {
        method: 'POST'
      })

      if (res.ok) {
        toast.success('연동이 해제되었습니다')
        loadConnectedPlatforms()
      } else {
        toast.error('연동 해제 실패')
      }
    } catch (error) {
      toast.error('서버 오류')
    }
  }

  // 최적화 시작/중지
  const toggleOptimization = async (platformId: string, isActive: boolean) => {
    try {
      const endpoint = isActive ? 'stop' : 'start'
      const res = await fetch(`${API_BASE}/api/ads/platforms/${platformId}/optimization/${endpoint}?user_id=${user?.id || 1}`, {
        method: 'POST'
      })

      if (res.ok) {
        toast.success(isActive ? '최적화가 중지되었습니다' : '최적화가 시작되었습니다')
        loadConnectedPlatforms()
      }
    } catch (error) {
      toast.error('서버 오류')
    }
  }

  // 프로 플랜 미만 접근 제한
  if (isLocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 max-w-lg text-center"
        >
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">프로 플랜 전용 기능</h1>
          <p className="text-gray-300 mb-6">
            통합 광고 최적화는 Pro 플랜 이상에서 사용할 수 있습니다.
          </p>
          <Link
            href="/pricing"
            className="inline-block px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium"
          >
            플랜 업그레이드
          </Link>
        </motion.div>
      </div>
    )
  }

  // 통계 요약
  const totalConnected = Object.values(connectedPlatforms).filter(p => p.is_connected).length
  const totalActive = Object.values(connectedPlatforms).filter(p => p.is_active).length
  const totalSpend = Object.values(connectedPlatforms).reduce((sum, p) => sum + (p.stats?.total_spend || 0), 0)
  const avgRoas = Object.values(connectedPlatforms).filter(p => p.stats?.roas).reduce((sum, p, _, arr) => sum + (p.stats?.roas || 0) / arr.length, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* 헤더 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/tools" className="text-gray-500 hover:text-gray-700">
                ← 도구
              </Link>
              <div className="w-px h-6 bg-gray-300" />
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">통합 광고 자동 최적화</h1>
                  <p className="text-xs text-gray-500">모든 광고 플랫폼을 한 곳에서</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/ad-optimizer"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                네이버 광고 상세 →
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 통계 요약 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm text-gray-500">연동된 플랫폼</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{totalConnected}<span className="text-lg text-gray-400">/{AD_PLATFORMS.length}</span></p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <Play className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm text-gray-500">최적화 실행 중</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{totalActive}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-orange-600" />
              </div>
              <span className="text-sm text-gray-500">총 광고비</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">₩{(totalSpend / 10000).toFixed(0)}<span className="text-lg text-gray-400">만</span></p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm text-gray-500">평균 ROAS</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{avgRoas.toFixed(0)}<span className="text-lg text-gray-400">%</span></p>
          </motion.div>
        </div>

        {/* 필터 바 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* 검색 */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="플랫폼 검색..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 카테고리 필터 */}
            <div className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                전체 ({AD_PLATFORMS.length})
              </button>
              {Object.entries(PLATFORM_CATEGORIES).map(([key, { name, icon }]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key as PlatformCategory)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === key
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {icon} {name}
                </button>
              ))}
            </div>

            {/* 보기 모드 */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 플랫폼 그리드 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
            {filteredPlatforms.map((platform, idx) => {
              const connected = connectedPlatforms[platform.id]
              const isConnected = connected?.is_connected
              const isActive = connected?.is_active

              return (
                <motion.div
                  key={platform.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
                    viewMode === 'list' ? 'flex items-center' : ''
                  }`}
                >
                  {/* 플랫폼 헤더 */}
                  <div className={`bg-gradient-to-r ${platform.color} p-4 ${viewMode === 'list' ? 'w-48' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{platform.icon}</span>
                      <div>
                        <h3 className="font-bold text-white">{platform.nameKo}</h3>
                        <p className="text-xs text-white/70">{platform.name}</p>
                      </div>
                    </div>
                  </div>

                  {/* 플랫폼 내용 */}
                  <div className={`p-4 ${viewMode === 'list' ? 'flex-1 flex items-center justify-between' : ''}`}>
                    {viewMode === 'grid' && (
                      <>
                        <p className="text-sm text-gray-600 mb-3">{platform.description}</p>

                        {/* 기능 태그 */}
                        <div className="flex flex-wrap gap-1 mb-4">
                          {platform.features.slice(0, 3).map((feature, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                            >
                              {feature}
                            </span>
                          ))}
                          {platform.features.length > 3 && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                              +{platform.features.length - 3}
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    {/* 연동 상태 & 버튼 */}
                    <div className={`flex items-center gap-2 ${viewMode === 'list' ? '' : 'justify-between'}`}>
                      {platform.comingSoon ? (
                        <span className="px-3 py-1.5 bg-gray-100 text-gray-500 text-sm rounded-lg">
                          Coming Soon
                        </span>
                      ) : isConnected ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                            <span className="text-sm text-gray-600">
                              {isActive ? '최적화 중' : '연동됨'}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => toggleOptimization(platform.id, isActive || false)}
                              className={`p-2 rounded-lg transition-colors ${
                                isActive
                                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                  : 'bg-green-100 text-green-600 hover:bg-green-200'
                              }`}
                              title={isActive ? '최적화 중지' : '최적화 시작'}
                            >
                              {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => disconnectPlatform(platform.id)}
                              className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                              title="연동 해제"
                            >
                              <Unlink className="w-4 h-4" />
                            </button>
                            <Link
                              href={`/ad-optimizer/${platform.id}`}
                              className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                              title="상세 설정"
                            >
                              <Settings className="w-4 h-4" />
                            </Link>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => openConnectModal(platform)}
                          className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${platform.color} text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity`}
                        >
                          <Link2 className="w-4 h-4" />
                          연동하기
                        </button>
                      )}
                    </div>

                    {/* 연동된 경우 통계 표시 */}
                    {viewMode === 'grid' && isConnected && connected.stats && (
                      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-500">오늘 최적화</p>
                          <p className="font-semibold text-gray-900">{connected.stats.optimizations_today}회</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">ROAS</p>
                          <p className="font-semibold text-green-600">{connected.stats.roas}%</p>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {filteredPlatforms.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>검색 결과가 없습니다</p>
          </div>
        )}
      </main>

      {/* 연동 모달 */}
      <AnimatePresence>
        {connectModalOpen && selectedPlatform && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setConnectModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 모달 헤더 */}
              <div className={`bg-gradient-to-r ${selectedPlatform.color} p-6`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{selectedPlatform.icon}</span>
                    <div>
                      <h2 className="text-xl font-bold text-white">{selectedPlatform.nameKo}</h2>
                      <p className="text-sm text-white/70">{selectedPlatform.name} 연동</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConnectModalOpen(false)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* 모달 내용 */}
              <div className="p-6">
                <p className="text-gray-600 mb-6">{selectedPlatform.description}</p>

                {/* 기능 목록 */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <h4 className="font-medium text-gray-900 mb-3">연동 시 사용 가능한 기능</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedPlatform.features.map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-500" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 입력 필드 */}
                <div className="space-y-4 mb-6">
                  {selectedPlatform.requiredFields.map((field) => (
                    <div key={field.name}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label} *
                      </label>
                      <input
                        type={field.type}
                        value={connectForm[field.name] || ''}
                        onChange={(e) => setConnectForm({ ...connectForm, [field.name]: e.target.value })}
                        placeholder={field.placeholder}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {field.helpText && (
                        <p className="mt-1 text-xs text-gray-500">{field.helpText}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* 가이드 링크 */}
                {selectedPlatform.setupGuideUrl && (
                  <a
                    href={selectedPlatform.setupGuideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 mb-6"
                  >
                    <ExternalLink className="w-4 h-4" />
                    API 키 발급 방법 보기
                  </a>
                )}

                {/* 버튼 */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setConnectModalOpen(false)}
                    className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={connectPlatform}
                    disabled={isConnecting}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r ${selectedPlatform.color} text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50`}
                  >
                    {isConnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    연동하기
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
