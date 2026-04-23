'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, Crown, Star, TrendingUp, Database, Compass } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'

import SearchBar from '@/components/influencer-discovery/SearchBar'
import PlatformFilterBar, {
  FilterValues,
  defaultFilters,
} from '@/components/influencer-discovery/PlatformFilterBar'
import SearchResults from '@/components/influencer-discovery/SearchResults'
import ProfileDetailModal from '@/components/influencer-discovery/ProfileDetailModal'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr'

export default function InfluencerDiscoveryPage() {
  const { user, isAuthenticated } = useAuthStore()
  const userPlan = user?.plan || 'free'
  const userId = user?.id || 'demo_user'

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'search' | 'browse'>('search')

  // 검색 상태
  const [query, setQuery] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['youtube'])
  const [filters, setFilters] = useState<FilterValues>(defaultFilters)
  const [sortBy, setSortBy] = useState('score')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // 결과 상태
  const [profiles, setProfiles] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [cached, setCached] = useState(false)
  const [platformsFailed, setPlatformsFailed] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Browse 통계
  const [browseStats, setBrowseStats] = useState<{
    total_profiles: number
    by_platform: Record<string, number>
    by_category: Record<string, number>
  } | null>(null)

  // 즐겨찾기
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set())

  // 프로필 상세 모달
  const [selectedProfile, setSelectedProfile] = useState<any>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // 허용 플랫폼 (플랜별)
  const allowedPlatformsMap: Record<string, string[]> = {
    free: ['youtube'],
    basic: ['youtube', 'instagram'],
    pro: ['youtube', 'instagram', 'tiktok', 'threads', 'facebook'],
    business: ['youtube', 'instagram', 'tiktok', 'threads', 'facebook'],
  }
  const allowedPlatforms = allowedPlatformsMap[userPlan] || ['youtube']

  // Browse 통계 로드
  const fetchBrowseStats = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/influencer-discovery/browse/stats`)
      const data = await resp.json()
      if (data.success) {
        setBrowseStats({
          total_profiles: data.total_profiles,
          by_platform: data.by_platform,
          by_category: data.by_category,
        })
      }
    } catch (e) {
      console.error('Browse stats error:', e)
    }
  }, [])

  // 탭 전환 시 Browse 통계 로드 + 결과 초기화
  useEffect(() => {
    if (activeTab === 'browse') {
      fetchBrowseStats()
      setSortBy('followers')
      setPage(1)
      setHasSearched(false)
      setProfiles([])
      setTotal(0)
    } else {
      setSortBy('score')
      setPage(1)
      setHasSearched(false)
      setProfiles([])
      setTotal(0)
    }
  }, [activeTab, fetchBrowseStats])

  // Browse 조회
  const handleBrowse = useCallback(
    async (browsePage: number = 1) => {
      setPage(browsePage)
      setLoading(true)
      setHasSearched(true)

      try {
        const body = {
          platforms,
          min_followers: filters.min_followers,
          max_followers: filters.max_followers,
          min_engagement_rate: filters.min_engagement_rate,
          category: filters.category,
          region: filters.region,
          verified_only: filters.verified_only,
          sort_by: sortBy,
          page: browsePage,
          page_size: pageSize,
        }

        const resp = await fetch(
          `${API_BASE}/api/influencer-discovery/browse?plan=${userPlan}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        )

        if (resp.status === 403) {
          const err = await resp.json()
          toast.error(err.detail?.message || '접근 권한이 없습니다')
          return
        }

        const data = await resp.json()
        if (data.success) {
          setProfiles(data.profiles || [])
          setTotal(data.total || 0)
          setCached(false)
          setPlatformsFailed([])
        } else {
          toast.error('조회에 실패했습니다')
        }
      } catch (e) {
        console.error('Browse error:', e)
        toast.error('서버 연결에 실패했습니다')
      } finally {
        setLoading(false)
      }
    },
    [platforms, filters, sortBy, userPlan]
  )

  const handleSearch = useCallback(
    async (searchQuery: string) => {
      setQuery(searchQuery)
      setPage(1)
      setLoading(true)
      setHasSearched(true)

      try {
        const body = {
          query: searchQuery,
          platforms,
          filters: {
            min_followers: filters.min_followers,
            max_followers: filters.max_followers,
            min_engagement_rate: filters.min_engagement_rate,
            region: filters.region,
            category: filters.category,
            verified_only: filters.verified_only,
          },
          sort_by: sortBy,
          page: 1,
          page_size: pageSize,
        }

        const resp = await fetch(
          `${API_BASE}/api/influencer-discovery/search?user_id=${userId}&plan=${userPlan}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        )

        if (resp.status === 403) {
          const err = await resp.json()
          toast.error(err.detail?.message || '접근 권한이 없습니다')
          return
        }
        if (resp.status === 429) {
          const err = await resp.json()
          toast.error(err.detail?.message || '검색 횟수를 초과했습니다')
          return
        }

        const data = await resp.json()
        if (data.success) {
          setProfiles(data.profiles || [])
          setTotal(data.total || 0)
          setCached(data.cached || false)
          setPlatformsFailed(data.platforms_failed || [])
          if (data.cached) {
            toast.success('캐시된 결과를 불러왔습니다', { icon: '⚡' })
          }
        } else {
          toast.error('검색에 실패했습니다')
        }
      } catch (e) {
        console.error('Search error:', e)
        toast.error('서버 연결에 실패했습니다')
      } finally {
        setLoading(false)
      }
    },
    [platforms, filters, sortBy, userId, userPlan]
  )

  const handlePageChange = useCallback(
    async (newPage: number) => {
      if (activeTab === 'browse') {
        handleBrowse(newPage)
        return
      }
      if (!query) return
      setPage(newPage)
      setLoading(true)

      try {
        const body = {
          query,
          platforms,
          filters: {
            min_followers: filters.min_followers,
            max_followers: filters.max_followers,
            min_engagement_rate: filters.min_engagement_rate,
            region: filters.region,
            category: filters.category,
            verified_only: filters.verified_only,
          },
          sort_by: sortBy,
          page: newPage,
          page_size: pageSize,
        }

        const resp = await fetch(
          `${API_BASE}/api/influencer-discovery/search?user_id=${userId}&plan=${userPlan}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        )

        const data = await resp.json()
        if (data.success) {
          setProfiles(data.profiles || [])
          setTotal(data.total || 0)
          setCached(data.cached || false)
        }
      } catch (e) {
        console.error('Page change error:', e)
      } finally {
        setLoading(false)
      }
    },
    [activeTab, query, platforms, filters, sortBy, userId, userPlan, handleBrowse]
  )

  const handleToggleFavorite = useCallback(
    async (profileId: string) => {
      try {
        if (favoritedIds.has(profileId)) {
          setFavoritedIds((prev) => {
            const next = new Set(prev)
            next.delete(profileId)
            return next
          })
          toast.success('즐겨찾기에서 제거했습니다')
        } else {
          const resp = await fetch(
            `${API_BASE}/api/influencer-discovery/favorites?user_id=${userId}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profile_id: profileId }),
            }
          )
          if (resp.ok) {
            setFavoritedIds((prev) => new Set(prev).add(profileId))
            toast.success('즐겨찾기에 추가했습니다')
          }
        }
      } catch (e) {
        console.error('Favorite error:', e)
        toast.error('즐겨찾기 처리에 실패했습니다')
      }
    },
    [favoritedIds, userId]
  )

  const handleSelectProfile = useCallback((profile: any) => {
    setSelectedProfile(profile)
    setModalOpen(true)
  }, [])

  // Browse 정렬 옵션
  const browseSortOptions = [
    { value: 'followers', label: '팔로워', icon: Crown },
    { value: 'engagement', label: '참여율', icon: TrendingUp },
    { value: 'recent', label: '최신순', icon: Star },
  ]

  // Search 정렬 옵션
  const searchSortOptions = [
    { value: 'score', label: '관련성', icon: Star },
    { value: 'followers', label: '팔로워', icon: Crown },
    { value: 'engagement', label: '참여율', icon: TrendingUp },
  ]

  const currentSortOptions = activeTab === 'browse' ? browseSortOptions : searchSortOptions

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pt-24 pb-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-pink-50 text-pink-600 rounded-full text-sm font-semibold mb-4">
            <Search className="w-4 h-4" />
            인플루언서 발굴
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-2">
            멀티플랫폼 인플루언서 검색
          </h1>
          <p className="text-gray-500 text-sm md:text-base">
            YouTube, Instagram, TikTok, Threads, Facebook에서 키워드로 인플루언서를 찾아보세요
          </p>
        </motion.div>

        {/* 탭 UI */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center gap-2 mb-5"
        >
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'search'
                ? 'bg-[#0064FF] text-white shadow-lg shadow-blue-200'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-[#0064FF]/40'
            }`}
          >
            <Compass className="w-4 h-4" />
            검색
          </button>
          <button
            onClick={() => setActiveTab('browse')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'browse'
                ? 'bg-[#0064FF] text-white shadow-lg shadow-blue-200'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-[#0064FF]/40'
            }`}
          >
            <Database className="w-4 h-4" />
            DB 탐색
            {browseStats && browseStats.total_profiles > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 text-[10px] rounded-full ${
                activeTab === 'browse'
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {browseStats.total_profiles.toLocaleString()}
              </span>
            )}
          </button>
        </motion.div>

        {/* Browse 모드: DB 통계 */}
        {activeTab === 'browse' && browseStats && browseStats.total_profiles > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl"
          >
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className="text-gray-400">총 프로필</span>
                <span className="ml-1.5 font-bold text-gray-800">
                  {browseStats.total_profiles.toLocaleString()}명
                </span>
              </div>
              {Object.entries(browseStats.by_platform).slice(0, 5).map(([platform, count]) => (
                <div key={platform}>
                  <span className="text-gray-400 capitalize">{platform}</span>
                  <span className="ml-1 font-semibold text-gray-700">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* 검색바 — 검색 탭에서만 */}
        {activeTab === 'search' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-4"
          >
            <SearchBar onSearch={handleSearch} loading={loading} />
          </motion.div>
        )}

        {/* 플랫폼 필터 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <PlatformFilterBar
            selectedPlatforms={platforms}
            onPlatformsChange={setPlatforms}
            filters={filters}
            onFiltersChange={setFilters}
            allowedPlatforms={allowedPlatforms}
          />
        </motion.div>

        {/* Browse 모드: 조회하기 버튼 */}
        {activeTab === 'browse' && (
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => handleBrowse(1)}
              disabled={loading}
              className="px-6 py-2.5 bg-[#0064FF] text-white rounded-xl text-sm font-semibold hover:bg-[#0050CC] transition-colors disabled:opacity-50 shadow-md shadow-blue-200"
            >
              {loading ? '조회 중...' : '조회하기'}
            </button>
          </div>
        )}

        {/* 정렬 옵션 */}
        {hasSearched && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-400">정렬:</span>
            {currentSortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setSortBy(opt.value)
                  if (activeTab === 'browse') {
                    handleBrowse(1)
                  } else if (query) {
                    handleSearch(query)
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  sortBy === opt.value
                    ? 'bg-[#0064FF] text-white border-[#0064FF]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-[#0064FF]/50'
                }`}
              >
                <opt.icon className="w-3 h-3" />
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* 검색 결과 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <SearchResults
            profiles={profiles}
            loading={loading}
            total={total}
            page={page}
            pageSize={pageSize}
            cached={cached}
            platformsFailed={platformsFailed}
            onSelectProfile={handleSelectProfile}
            onToggleFavorite={handleToggleFavorite}
            onPageChange={handlePageChange}
            favoritedIds={favoritedIds}
            hasSearched={hasSearched}
          />
        </motion.div>

        {/* 프로필 상세 모달 */}
        <ProfileDetailModal
          profile={selectedProfile}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onToggleFavorite={handleToggleFavorite}
          isFavorited={selectedProfile ? favoritedIds.has(selectedProfile.id) : false}
        />
      </div>
    </div>
  )
}
