'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, Heart, MessageCircle, Eye, Sparkles, Plus, Search, Brain, Target, RefreshCw, Trash2, Zap, BarChart3, Wallet, Globe, HelpCircle, MoreHorizontal, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { getUserBlogs, deleteBlogFromList } from '@/lib/api/blog'
import { refreshBlogAnalysis } from '@/lib/api/userBlogs'
import { useAuthStore } from '@/lib/stores/auth'
import type { BlogListItem } from '@/lib/types/api'
import toast from 'react-hot-toast'
import EmptyState from '@/components/EmptyState'
import TermTooltip from '@/components/TermTooltip'
import WinnerKeywordsWidget from '@/components/WinnerKeywordsWidget'
import OnboardingModal from '@/components/OnboardingModal'

// 레벨별 퍼센타일 매핑 (대략적인 추정치)
const LEVEL_PERCENTILE: Record<number, string> = {
  0: '하위',
  1: '하위 50%',
  2: '하위 40%',
  3: '상위 40%',
  4: '상위 35%',
  5: '상위 30%',
  6: '상위 25%',
  7: '상위 20%',
  8: '상위 15%',
  9: '상위 10%',
  10: '상위 5%',
  11: '상위 1%'
}

// 레벨별 설명 (짧은 버전)
const LEVEL_DESCRIPTION: Record<number, string> = {
  0: '시작 단계',
  1: '입문자',
  2: '초보',
  3: '성장 중',
  4: '활동적',
  5: '안정적',
  6: '우수',
  7: '상급',
  8: '전문가',
  9: '인플루언서급',
  10: '최상위',
  11: '레전드'
}

// 접을 수 있는 섹션 컴포넌트
interface CollapsibleSectionProps {
  title: string
  subtitle: string
  icon: React.ReactNode
  iconBgColor: string
  children: React.ReactNode
  actionButton?: React.ReactNode
  defaultOpen?: boolean
}

function CollapsibleSection({ title, subtitle, icon, iconBgColor, children, actionButton, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl mb-4 bg-white border border-gray-200 shadow-sm overflow-hidden"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${iconBgColor} flex items-center justify-center`}>
            {icon}
          </div>
          <div className="text-left">
            <h3 className="font-bold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {actionButton && !isOpen && (
            <div onClick={(e) => e.stopPropagation()}>
              {actionButton}
            </div>
          )}
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </div>
      </button>

      <motion.div
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div className="p-4 pt-0 border-t border-gray-100">
          {children}
        </div>
      </motion.div>
    </motion.div>
  )
}

// 드롭다운 메뉴 컴포넌트
interface DropdownMenuProps {
  user: { is_admin?: boolean } | null
}

function DropdownMenu({ user }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const menuItems = [
    { href: '/keyword-search', icon: Search, label: '키워드 검색', color: 'text-[#0064FF]' },
    { href: '/dashboard/rank-tracker', icon: Target, label: '순위 추적', color: 'text-[#0064FF]' },
    { href: '/tools', icon: Sparkles, label: 'AI 도구', color: 'text-purple-600' },
    ...(user?.is_admin ? [
      { href: '/dashboard/learning', icon: Brain, label: 'AI 학습 엔진', color: 'text-green-600' },
      { href: '/dashboard/batch-learning', icon: Zap, label: '대량 학습', color: 'text-orange-600' },
    ] : []),
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-4 py-2.5 rounded-full bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-all text-sm"
      >
        <MoreHorizontal className="w-4 h-4" />
        <span className="hidden sm:inline">더보기</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* 배경 클릭 시 닫기 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* 드롭다운 메뉴 */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50"
            >
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                  <span className="text-sm text-gray-700">{item.label}</span>
                </Link>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const [myBlogs, setMyBlogs] = useState<BlogListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshingBlogId, setRefreshingBlogId] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // 첫 방문 사용자 온보딩 모달 표시
  useEffect(() => {
    if (user?.id) {
      const visited = localStorage.getItem('hasVisitedDashboard')
      if (!visited) {
        setShowOnboarding(true)
        localStorage.setItem('hasVisitedDashboard', 'true')
      }
    }
  }, [user?.id])

  const loadBlogs = useCallback(async () => {
    setIsLoading(true)
    try {
      // 로그인한 사용자는 user.id 전달, 비로그인은 undefined
      const blogs = await getUserBlogs(user?.id)
      setMyBlogs(blogs)
    } catch {
      toast.error('블로그 목록을 불러오는데 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadBlogs()
  }, [loadBlogs])

  const handleRefreshBlog = async (blogId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!user?.id) {
      toast.error('로그인이 필요합니다')
      return
    }

    setRefreshingBlogId(blogId)
    try {
      await refreshBlogAnalysis(user.id, blogId)
      toast.success('블로그 재분석이 완료되었습니다')
      loadBlogs()
    } catch {
      toast.error('블로그 재분석에 실패했습니다')
    } finally {
      setRefreshingBlogId(null)
    }
  }

  const handleDeleteBlog = async (blogId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!confirm('이 블로그를 목록에서 삭제하시겠습니까?')) {
      return
    }

    try {
      await deleteBlogFromList(blogId, user?.id)
      toast.success('블로그가 삭제되었습니다')
      loadBlogs()
    } catch {
      toast.error('블로그 삭제에 실패했습니다')
    }
  }

  const filteredBlogs = myBlogs.filter(blog =>
    blog.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    blog.blog_id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 실제 블로그만 표시 (데모 데이터 제거)
  const displayBlogs = filteredBlogs

  return (
    <>
      {/* P1: 첫 방문 사용자 온보딩 모달 */}
      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />

      <div className="min-h-screen bg-[#fafafa] pt-24">
      <div className="container mx-auto px-4 py-8">

        {/* Header - 개선된 버전 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-1">
              <span className="gradient-text">대시보드</span>
            </h1>
            <p className="text-sm md:text-base text-gray-600">블랭크에서 내 블로그를 한눈에 확인하세요</p>
          </div>

          {/* 액션 버튼 - 모바일 최적화 */}
          <div className="flex items-center gap-2">
            {/* 주요 액션: 블로그 추가 */}
            <Link
              href="/analyze"
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0064FF] text-white font-semibold hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all text-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">블로그 추가</span>
              <span className="sm:hidden">추가</span>
            </Link>

            {/* 드롭다운 메뉴 */}
            <DropdownMenu user={user} />
          </div>
        </div>

        {/* 블로그 검색 - 최상단으로 이동 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 mb-8 bg-white border border-gray-200 shadow-lg shadow-gray-100/50"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="블로그 검색..."
              maxLength={100}
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-transparent focus:border-[#0064FF] focus:outline-none transition-all"
            />
          </div>
        </motion.div>

        {/* 1위 보장 키워드 위젯 - 킬러 기능 */}
        {!isLoading && displayBlogs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <WinnerKeywordsWidget
              blogId={displayBlogs[0]?.blog_id}
              className="shadow-xl shadow-yellow-100/50"
            />
          </motion.div>
        )}

        {/* Blog Grid */}
        {isLoading ? (
          <div className="space-y-4">
            {/* P3-1: 스켈레톤 로딩 UI */}
            <div className="text-center mb-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="inline-flex p-4 rounded-full bg-[#0064FF] mb-3 shadow-lg shadow-[#0064FF]/15"
              >
                <Sparkles className="w-6 h-6 text-white" />
              </motion.div>
              <p className="text-gray-600 text-sm">블로그 목록을 불러오는 중...</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-2/3" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="text-center p-2 bg-gray-50 rounded-lg">
                        <div className="h-5 bg-gray-200 rounded w-12 mx-auto mb-1" />
                        <div className="h-3 bg-gray-200 rounded w-10 mx-auto" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : displayBlogs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-blue-50 to-white rounded-3xl border border-blue-100/50 shadow-xl shadow-blue-100/50 p-12"
          >
            {searchQuery ? (
              <EmptyState
                type="no-results"
                title={`'${searchQuery}'에 대한 결과가 없어요`}
                description="다른 키워드로 검색하거나, 새 블로그를 분석해보세요."
                actionLabel="블로그 분석하기"
                actionHref="/analyze"
              />
            ) : (
              <>
                <div className="text-center mb-10">
                  <div className="w-24 h-24 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#0064FF]/20">
                    <Sparkles className="w-12 h-12 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold mb-3">블랭크에 오신 것을 환영합니다! 👋</h3>
                  <p className="text-gray-600 text-lg">
                    3단계만 따라하면 블로그 성장 전략을 세울 수 있어요
                  </p>
                </div>

                {/* 시작 가이드 */}
                <div className="grid md:grid-cols-3 gap-6 mb-10">
                  <div className="bg-white rounded-2xl p-6 border border-blue-100 hover:shadow-lg transition-all">
                    <div className="w-12 h-12 rounded-full bg-[#0064FF] text-white flex items-center justify-center text-xl font-bold mb-4">1</div>
                    <h4 className="font-bold text-lg mb-2">블로그 분석하기</h4>
                    <p className="text-gray-600 text-sm mb-4">
                      내 블로그 ID를 입력하면 40개 이상의 지표로 현재 상태를 진단해드려요
                    </p>
                    <Link href="/analyze" className="text-[#0064FF] font-semibold text-sm hover:underline">
                      분석 시작하기 →
                    </Link>
                  </div>

                  <div className="bg-white rounded-2xl p-6 border border-blue-100 hover:shadow-lg transition-all">
                    <div className="w-12 h-12 rounded-full bg-[#3182F6] text-white flex items-center justify-center text-xl font-bold mb-4">2</div>
                    <h4 className="font-bold text-lg mb-2">키워드 검색하기</h4>
                    <p className="text-gray-600 text-sm mb-4">
                      목표 키워드를 검색하면 상위 노출 블로그들의 공통 패턴을 알려드려요
                    </p>
                    <Link href="/keyword-search" className="text-[#0064FF] font-semibold text-sm hover:underline">
                      키워드 검색하기 →
                    </Link>
                  </div>

                  <div className="bg-white rounded-2xl p-6 border border-blue-100 hover:shadow-lg transition-all">
                    <div className="w-12 h-12 rounded-full bg-sky-500 text-white flex items-center justify-center text-xl font-bold mb-4">3</div>
                    <h4 className="font-bold text-lg mb-2">AI 도구 활용하기</h4>
                    <p className="text-gray-600 text-sm mb-4">
                      블루오션 키워드 발굴, AI 글쓰기 가이드 등 9가지 도구를 활용하세요
                    </p>
                    <Link href="/tools" className="text-[#0064FF] font-semibold text-sm hover:underline">
                      AI 도구 보기 →
                    </Link>
                  </div>
                </div>

                {/* CTA */}
                <div className="text-center">
                  <Link
                    href="/analyze"
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#0064FF] text-white font-semibold hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all text-lg"
                  >
                    <Plus className="w-5 h-5" />
                    첫 번째 블로그 분석하기
                  </Link>
                  <p className="text-gray-500 text-sm mt-4">무료로 바로 시작할 수 있어요</p>
                </div>
              </>
            )}
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayBlogs.map((blog, index) => (
            <Link key={blog.id} href={`/blog/${blog.blog_id}`}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className="rounded-3xl p-6 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50 hover:shadow-2xl transition-all duration-300 cursor-pointer"
              >
              {/* Blog Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] flex items-center justify-center text-3xl shadow-lg shadow-[#0064FF]/15">
                  {blog.avatar}
                </div>

                <div className="flex-1">
                  <h3 className="font-bold text-lg">{blog.name}</h3>
                  <p className="text-sm text-gray-500">@{blog.blog_id}</p>
                </div>

                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center cursor-pointer"
                >
                  <Sparkles className="w-5 h-5 text-[#0064FF]" />
                </motion.div>
              </div>

              {/* Level Badge - 개선된 버전 */}
              <div className="mb-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-sky-100">
                  <TermTooltip term="level">
                    <span className="text-2xl font-bold gradient-text">
                      Lv.{blog.level}
                    </span>
                  </TermTooltip>
                  <span className="text-sm text-gray-600">/11</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white text-gray-700 font-medium">
                    {blog.grade}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                  <span className="font-medium text-[#0064FF]">
                    {LEVEL_PERCENTILE[blog.level] || '측정 중'}
                  </span>
                  <span>·</span>
                  <span>{LEVEL_DESCRIPTION[blog.level] || ''}</span>
                </div>
              </div>

              {/* Score */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-3xl font-bold">{blog.score}</div>
                  <div className="text-sm text-gray-500">Total Score</div>
                </div>

                <div className={`flex items-center gap-1 ${blog.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {blog.change > 0 ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : (
                    <TrendingDown className="w-5 h-5" />
                  )}
                  <span className="font-semibold">
                    {blog.change > 0 ? '+' : ''}{blog.change}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 py-4 border-t border-gray-200">
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    <Eye className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="font-bold">{blog.stats.visitors.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">방문자</div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    <MessageCircle className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="font-bold">{blog.stats.posts}</div>
                  <div className="text-xs text-gray-500">포스트</div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    <Heart className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="font-bold">{blog.stats.engagement}</div>
                  <div className="text-xs text-gray-500">참여도</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  onClick={(e) => handleRefreshBlog(blog.blog_id, e)}
                  disabled={refreshingBlogId === blog.blog_id}
                  className="py-2 px-3 rounded-xl bg-[#0064FF] text-white font-semibold hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all text-sm flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {refreshingBlogId === blog.blog_id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      재분석
                    </>
                  )}
                </button>
                <button
                  onClick={(e) => handleDeleteBlog(blog.blog_id, e)}
                  className="py-2 px-3 rounded-xl bg-red-100 text-red-600 font-semibold hover:bg-red-200 transition-colors text-sm flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  삭제
                </button>
              </div>
            </motion.div>
            </Link>
          ))}

          {/* Add New Card */}
          <Link href="/analyze">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: myBlogs.length * 0.1 }}
              whileHover={{ y: -5 }}
              className="rounded-3xl p-6 flex flex-col items-center justify-center bg-white hover:shadow-2xl transition-all duration-300 cursor-pointer border-2 border-dashed border-blue-300"
            >
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 text-[#0064FF]" />
              </div>
              <h3 className="font-bold text-lg mb-2">새 블로그 추가</h3>
              <p className="text-sm text-gray-500 text-center">
                블로그를 추가하고
                <br />
                지수를 확인하세요
              </p>
            </motion.div>
          </Link>
        </div>
        )}

        {/* Quick Stats */}
        {!isLoading && displayBlogs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {(() => {
            const totalBlogs = displayBlogs.length
            const avgLevel = displayBlogs.length > 0
              ? Math.round(displayBlogs.reduce((sum, b) => sum + b.level, 0) / displayBlogs.length)
              : 0
            const totalVisitors = displayBlogs.reduce((sum, b) => sum + b.stats.visitors, 0)
            const formattedVisitors = totalVisitors >= 1000
              ? `${(totalVisitors / 1000).toFixed(1)}K`
              : totalVisitors.toString()
            const recentAnalyses = displayBlogs.filter(b =>
              b.last_analyzed &&
              new Date(b.last_analyzed) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            ).length

            return [
              { label: '총 블로그', value: totalBlogs, icon: '📚' },
              { label: '평균 레벨', value: avgLevel, icon: '⭐' },
              { label: '총 방문자', value: formattedVisitors, icon: '👥' },
              { label: '이번 주 분석', value: recentAnalyses, icon: '📊' },
            ]
          })().map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + index * 0.1 }}
              className="rounded-xl p-4 text-center bg-white border border-gray-200 shadow-sm"
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
        )}

        {/* 더 많은 기능 - 접을 수 있는 섹션들 */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-700 mb-4">더 많은 기능</h2>

          {/* 키워드 지수분석 */}
          <CollapsibleSection
            title="키워드 지수분석"
            subtitle="경쟁 키워드의 상위 블로그들을 분석"
            icon={<TrendingUp className="w-5 h-5 text-white" />}
            iconBgColor="bg-gradient-to-r from-[#0064FF] to-[#3182F6]"
            actionButton={
              <Link href="/keyword-search" className="px-4 py-1.5 rounded-full bg-[#0064FF] text-white text-sm font-medium hover:bg-[#0050CC] transition-colors">
                시작
              </Link>
            }
          >
            <div className="grid md:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-4 h-4 text-[#0064FF]" />
                  <span className="font-medium text-sm">상위 노출 분석</span>
                </div>
                <p className="text-xs text-gray-500">상위 블로그들의 지수를 파악</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-[#3182F6]" />
                  <span className="font-medium text-sm">경쟁 인사이트</span>
                </div>
                <p className="text-xs text-gray-500">상위 블로그의 공통 패턴 확인</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-orange-600" />
                  <span className="font-medium text-sm">노출 로직 파악</span>
                </div>
                <p className="text-xs text-gray-500">전략 수립을 위한 분석</p>
              </div>
            </div>
          </CollapsibleSection>

          {/* 순위 추적 */}
          <CollapsibleSection
            title="순위 추적"
            subtitle="내 블로그 포스팅의 검색 순위 실시간 추적"
            icon={<Target className="w-5 h-5 text-white" />}
            iconBgColor="bg-gradient-to-r from-[#0064FF] to-[#3182F6]"
            actionButton={
              <Link href="/dashboard/rank-tracker" className="px-4 py-1.5 rounded-full bg-[#0064FF] text-white text-sm font-medium hover:bg-[#0050CC] transition-colors">
                시작
              </Link>
            }
          >
            <div className="grid md:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Search className="w-4 h-4 text-[#0064FF]" />
                  <span className="font-medium text-sm">키워드 자동 추출</span>
                </div>
                <p className="text-xs text-gray-500">포스트 제목에서 핵심 키워드 추출</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-[#3182F6]" />
                  <span className="font-medium text-sm">블로그탭 & VIEW탭</span>
                </div>
                <p className="text-xs text-gray-500">두 탭 모두 순위 확인</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-4 h-4 text-orange-600" />
                  <span className="font-medium text-sm">히스토리 분석</span>
                </div>
                <p className="text-xs text-gray-500">순위 변동 추이 그래프</p>
              </div>
            </div>
          </CollapsibleSection>

          {/* AI 학습 엔진 - 관리자 전용 */}
          {user?.is_admin && (
            <CollapsibleSection
              title="AI 학습 엔진"
              subtitle="순위 학습 현황 실시간 모니터링"
              icon={<Brain className="w-5 h-5 text-white" />}
              iconBgColor="bg-gradient-to-r from-green-500 to-emerald-500"
              actionButton={
                <Link href="/dashboard/learning" className="px-4 py-1.5 rounded-full bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors">
                  보기
                </Link>
              }
            >
              <div className="grid md:grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span className="font-medium text-sm">실시간 학습</span>
                  </div>
                  <p className="text-xs text-gray-500">검색 시 자동 순위 데이터 학습</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Eye className="w-4 h-4 text-emerald-600" />
                    <span className="font-medium text-sm">가중치 모니터링</span>
                  </div>
                  <p className="text-xs text-gray-500">C-Rank, D.I.A. 가중치 변화 확인</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    <span className="font-medium text-sm">예측 정확도</span>
                  </div>
                  <p className="text-xs text-gray-500">학습에 따른 정확도 향상</p>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* 통합 광고 최적화 - BETA */}
          <CollapsibleSection
            title="통합 광고 최적화"
            subtitle="모든 광고 플랫폼 AI 자동 최적화 (BETA)"
            icon={<Zap className="w-5 h-5 text-white" />}
            iconBgColor="bg-gradient-to-r from-orange-400 to-orange-500"
            actionButton={
              <Link href="/ad-optimizer/unified" className="px-4 py-1.5 rounded-full bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors">
                미리보기
              </Link>
            }
          >
            <div className="grid md:grid-cols-4 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-sm">멀티 플랫폼</span>
                </div>
                <p className="text-xs text-gray-500">네이버, 구글, 메타, 카카오</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-4 h-4 text-[#0064FF]" />
                  <span className="font-medium text-sm">AI 자동 최적화</span>
                </div>
                <p className="text-xs text-gray-500">입찰가, 예산 실시간 조정</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="w-4 h-4 text-orange-600" />
                  <span className="font-medium text-sm">예산 최적화</span>
                </div>
                <p className="text-xs text-gray-500">성과 기반 자동 배분</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-4 h-4 text-[#0064FF]" />
                  <span className="font-medium text-sm">통합 리포트</span>
                </div>
                <p className="text-xs text-gray-500">모든 플랫폼 성과 비교</p>
              </div>
            </div>
          </CollapsibleSection>

          {/* 플라톤마케팅 프로모션 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm">플라톤마케팅</h4>
                  <p className="text-slate-400 text-xs">병원마케팅 전문</p>
                </div>
              </div>
              <a
                href="https://www.brandplaton.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-gradient-to-r from-violet-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                상담 신청
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
    </>
  )
}
