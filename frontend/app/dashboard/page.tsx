'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Heart, MessageCircle, Eye, Sparkles, Plus, Search, Brain, ArrowLeft, Target, RefreshCw, Trash2, Zap, BarChart3, Wallet, Globe } from 'lucide-react'
import Link from 'next/link'
import { getUserBlogs, deleteBlogFromList } from '@/lib/api/blog'
import { refreshBlogAnalysis } from '@/lib/api/userBlogs'
import { useAuthStore } from '@/lib/stores/auth'
import type { BlogListItem } from '@/lib/types/api'
import toast from 'react-hot-toast'
import EmptyState from '@/components/EmptyState'

export default function Dashboard() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const [myBlogs, setMyBlogs] = useState<BlogListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshingBlogId, setRefreshingBlogId] = useState<string | null>(null)

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
    <div className="min-h-screen bg-[#fafafa] pt-24">
      <div className="container mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              <span className="gradient-text">대시보드</span>
            </h1>
            <p className="text-gray-600">블랭크에서 내 블로그를 한눈에 확인하세요</p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <Link
              href="/dashboard/rank-tracker"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white font-semibold hover:shadow-lg transition-all duration-300"
            >
              <Target className="w-5 h-5" />
              순위 추적
            </Link>
            {user?.is_admin && (
              <Link
                href="/dashboard/batch-learning"
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white font-semibold hover:shadow-lg transition-all duration-300"
              >
                <Sparkles className="w-5 h-5" />
                대량 학습
              </Link>
            )}
            {user?.is_admin && (
              <Link
                href="/dashboard/learning"
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-white border-2 border-green-500 text-green-600 font-semibold hover:shadow-lg transition-all duration-300"
              >
                <Brain className="w-5 h-5" />
                AI 학습 엔진
              </Link>
            )}
            <Link
              href="/keyword-search"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-white border-2 border-[#0064FF] text-[#0064FF] font-semibold hover:shadow-lg transition-all duration-300"
            >
              <Search className="w-5 h-5" />
              키워드 검색
            </Link>
            <Link
              href="/analyze"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#0064FF] text-white font-semibold hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all duration-300"
            >
              <Plus className="w-5 h-5" />
              블로그 추가
            </Link>
          </div>
        </div>

        {/* 키워드 지수분석 섹션 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-8 mb-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] flex items-center justify-center shadow-lg shadow-[#0064FF]/15">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold gradient-text">키워드 지수분석</h2>
                <p className="text-sm text-gray-600">경쟁 키워드의 상위 블로그들을 분석하세요</p>
              </div>
            </div>
            <Link
              href="/keyword-search"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#0064FF] text-white font-semibold hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all duration-300"
            >
              <Search className="w-5 h-5" />
              분석 시작
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Eye className="w-4 h-4 text-[#0064FF]" />
                </div>
                <span className="font-semibold text-gray-700">상위 노출 분석</span>
              </div>
              <p className="text-sm text-gray-500">
                키워드 검색 시 상위에 노출되는 블로그들의 지수를 파악합니다
              </p>
            </div>

            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-[#3182F6]" />
                </div>
                <span className="font-semibold text-gray-700">경쟁 인사이트</span>
              </div>
              <p className="text-sm text-gray-500">
                평균 점수, 포스트 수, 이웃 수 등 상위 블로그의 공통 패턴을 확인합니다
              </p>
            </div>

            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-orange-600" />
                </div>
                <span className="font-semibold text-gray-700">노출 로직 파악</span>
              </div>
              <p className="text-sm text-gray-500">
                어떤 블로그들이 상위에 노출되는지 분석하여 전략을 수립합니다
              </p>
            </div>
          </div>
        </motion.div>

        {/* 순위 추적 섹션 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl p-8 mb-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#0064FF]">순위 추적</h2>
                <p className="text-sm text-gray-600">내 블로그 포스팅의 검색 순위를 실시간 추적하세요</p>
              </div>
            </div>
            <Link
              href="/dashboard/rank-tracker"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white font-semibold hover:shadow-lg transition-all duration-300"
            >
              <Target className="w-5 h-5" />
              순위 추적 시작
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Search className="w-4 h-4 text-[#0064FF]" />
                </div>
                <span className="font-semibold text-gray-700">키워드 자동 추출</span>
              </div>
              <p className="text-sm text-gray-500">
                포스트 제목에서 핵심 키워드를 자동으로 추출합니다
              </p>
            </div>

            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-[#3182F6]" />
                </div>
                <span className="font-semibold text-gray-700">블로그탭 & VIEW탭</span>
              </div>
              <p className="text-sm text-gray-500">
                블로그탭과 VIEW탭에서의 순위를 모두 확인합니다
              </p>
            </div>

            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Eye className="w-4 h-4 text-orange-600" />
                </div>
                <span className="font-semibold text-gray-700">히스토리 분석</span>
              </div>
              <p className="text-sm text-gray-500">
                순위 변동 추이를 그래프로 확인하고 분석합니다
              </p>
            </div>
          </div>
        </motion.div>

        {/* 학습 대시보드 섹션 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-3xl p-8 mb-8 bg-gradient-to-br from-green-50 to-white border border-green-100/50 shadow-xl shadow-green-100/50"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-green-700">학습 대시보드</h2>
                <p className="text-sm text-gray-600">순위 학습 현황을 실시간으로 모니터링하세요</p>
              </div>
            </div>
            <Link
              href="/dashboard/learning"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold hover:shadow-lg transition-all duration-300"
            >
              <Brain className="w-5 h-5" />
              학습 엔진 보기
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                </div>
                <span className="font-semibold text-gray-700">실시간 학습</span>
              </div>
              <p className="text-sm text-gray-500">
                검색할 때마다 자동으로 순위 데이터를 학습합니다
              </p>
            </div>

            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Eye className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="font-semibold text-gray-700">가중치 모니터링</span>
              </div>
              <p className="text-sm text-gray-500">
                C-Rank, D.I.A. 가중치가 어떻게 변하는지 확인합니다
              </p>
            </div>

            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                </div>
                <span className="font-semibold text-gray-700">예측 정확도</span>
              </div>
              <p className="text-sm text-gray-500">
                학습이 진행될수록 순위 예측 정확도가 향상됩니다
              </p>
            </div>
          </div>
        </motion.div>

        {/* 통합광고 최적화 섹션 - BETA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-3xl p-8 mb-8 bg-gradient-to-br from-orange-50 to-white border border-orange-100/50 shadow-xl shadow-orange-100/50 relative overflow-hidden"
        >
          {/* BETA 배너 */}
          <div className="absolute top-4 right-4">
            <span className="px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-full">
              BETA - 개발 중
            </span>
          </div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-orange-400 to-orange-500 flex items-center justify-center shadow-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">통합 광고 최적화</h2>
                </div>
                <p className="text-sm text-gray-600">모든 광고 플랫폼을 AI가 자동으로 최적화합니다 (준비 중)</p>
              </div>
            </div>
            <Link
              href="/ad-optimizer/unified"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-orange-400 to-orange-500 text-white font-semibold hover:shadow-lg hover:scale-105 transition-all duration-300"
            >
              <Zap className="w-5 h-5" />
              미리보기
            </Link>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-white/50 hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-gray-700">멀티 플랫폼</span>
              </div>
              <p className="text-sm text-gray-500">
                네이버, 구글, 메타, 카카오 등 모든 광고를 한 곳에서
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-white/50 hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182F6] to-[#0064FF] flex items-center justify-center">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-gray-700">AI 자동 최적화</span>
              </div>
              <p className="text-sm text-gray-500">
                입찰가, 예산, 타겟팅을 AI가 실시간 조정
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-white/50 hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-gray-700">예산 최적화</span>
              </div>
              <p className="text-sm text-gray-500">
                성과 기반 자동 예산 배분으로 ROAS 극대화
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-white/50 hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0064FF] to-[#3182F6] flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-gray-700">통합 리포트</span>
              </div>
              <p className="text-sm text-gray-500">
                모든 플랫폼 성과를 한눈에 비교 분석
              </p>
            </div>
          </div>
        </motion.div>

        {/* Search */}
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

              {/* Level Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 to-sky-100 mb-4">
                <span className="text-2xl font-bold gradient-text">
                  Level {blog.level}
                </span>
                <span className="text-sm text-gray-600">{blog.grade}</span>
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
          className="mt-12 grid md:grid-cols-4 gap-6"
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
              {
                label: '총 블로그',
                value: totalBlogs,
                icon: '📚',
                color: 'blue'
              },
              {
                label: '평균 레벨',
                value: avgLevel,
                icon: '⭐',
                color: 'sky'
              },
              {
                label: '총 방문자',
                value: formattedVisitors,
                icon: '👥',
                color: 'orange'
              },
              {
                label: '이번 주 분석',
                value: recentAnalyses,
                icon: '📊',
                color: 'yellow'
              },
            ]
          })().map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + index * 0.1 }}
              className="rounded-2xl p-6 text-center bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50 hover:shadow-2xl transition-all duration-300"
            >
              <div className="text-4xl mb-3">{stat.icon}</div>
              <div className="text-3xl font-bold gradient-text">{stat.value}</div>
              <div className="text-sm text-gray-600 mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
        )}
      </div>
    </div>
  )
}
