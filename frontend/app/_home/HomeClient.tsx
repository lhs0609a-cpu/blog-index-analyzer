'use client'

import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion'
import { Sparkles, TrendingUp, Zap, Award, BarChart3, Search, BookOpen, ArrowRight, Building2, Mic, X, PenTool, Target, Star, Flame, Crown, ChevronRight, Play, Rocket, Heart, MousePointer, ArrowUpRight, Layers, Globe, Check, Users } from 'lucide-react'
import GlassIcon from '@/components/GlassIcon'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import TrialExpiryBanner from '@/components/TrialExpiryBanner'
// Social proof disabled (P0: fake data removal)
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'

// 3D 틸트 카드 컴포넌트
function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const rotateX = useTransform(y, [-100, 100], [10, -10])
  const rotateY = useTransform(x, [-100, 100], [-10, 10])

  const springConfig = { stiffness: 300, damping: 30 }
  const rotateXSpring = useSpring(rotateX, springConfig)
  const rotateYSpring = useSpring(rotateY, springConfig)

  const handleMouse = (e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    x.set(e.clientX - centerX)
    y.set(e.clientY - centerY)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX: rotateXSpring,
        rotateY: rotateYSpring,
        transformStyle: "preserve-3d",
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Marquee 컴포넌트 - CSS 기반 무한 스크롤
function Marquee({ children, speed = 30, direction = "left" }: { children: React.ReactNode; speed?: number; direction?: "left" | "right" }) {
  return (
    <div className="relative overflow-hidden whitespace-nowrap">
      <div
        className="inline-flex gap-8"
        style={{
          animation: `marquee-${direction} ${speed}s linear infinite`,
        }}
      >
        {children}
        {children}
        {children}
        {children}
      </div>
      <style jsx>{`
        @keyframes marquee-left {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        @keyframes marquee-right {
          0% {
            transform: translateX(-50%);
          }
          100% {
            transform: translateX(0%);
          }
        }
      `}</style>
    </div>
  )
}

export default function Home() {
  const { isAuthenticated } = useAuthStore()
  const router = useRouter()
  const [keyword, setKeyword] = useState('')
  const [blogId, setBlogId] = useState('')  // P1-3: 블로그 ID 입력
  const [isSearching, setIsSearching] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)  // P1-3: 블로그 분석 상태
  const [showAdPopup, setShowAdPopup] = useState(false)
  const [searchMode, setSearchMode] = useState<'blog' | 'keyword'>('blog')  // 검색 모드 전환

  // P2: 프로모 팝업 3초 지연
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowAdPopup(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // P1-3: 블로그 분석 핸들러 (즉시 체험)
  const handleBlogAnalyze = (e: React.FormEvent) => {
    e.preventDefault()
    if (!blogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }
    // blog.naver.com/ 형식에서 ID만 추출
    let cleanBlogId = blogId.trim()
    if (cleanBlogId.includes('blog.naver.com/')) {
      cleanBlogId = cleanBlogId.split('blog.naver.com/')[1].split('/')[0].split('?')[0]
    }
    setIsAnalyzing(true)
    router.push(`/analyze?blogId=${encodeURIComponent(cleanBlogId)}`)
  }

  const handleKeywordSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyword.trim()) {
      toast.error('검색할 키워드를 입력해주세요')
      return
    }
    setIsSearching(true)
    router.push(`/keyword-search?keyword=${encodeURIComponent(keyword.trim())}`)
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-gray-900 overflow-hidden">
      {/* Social proof disabled - P0 blocker: fake data */}

      {/* Cursor glow effect - Toss style (subtle) */}
      <div
        className="fixed pointer-events-none z-50 w-[600px] h-[600px] rounded-full opacity-20 blur-[120px] transition-all duration-150"
        style={{
          background: 'radial-gradient(circle, rgba(0, 100, 255, 0.15) 0%, rgba(49, 130, 246, 0.08) 50%, transparent 70%)',
          left: mousePosition.x - 300,
          top: mousePosition.y - 300,
        }}
      />

      {/* Animated background grid - Toss style */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(0,100,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,100,255,0.02)_1px,transparent_1px)] bg-[size:100px_100px]" />

      {/* Floating orbs - Toss blue */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-20 left-[10%] w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0, 100, 255, 0.08) 0%, transparent 70%)' }}
          animate={{
            y: [0, -30, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[40%] right-[5%] w-[300px] h-[300px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(49, 130, 246, 0.08) 0%, transparent 70%)' }}
          animate={{
            y: [0, 30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[10%] left-[30%] w-[350px] h-[350px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0, 100, 255, 0.06) 0%, transparent 70%)' }}
          animate={{
            x: [0, 20, 0],
            y: [0, -20, 0],
          }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* P1-4: 체험 만료 알림 배너 */}
      <TrialExpiryBanner compact />

      {/* Hero Section */}
      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            {/* Main Content */}
            <div className="text-center mb-16">
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 mb-8"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3182F6] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0064FF]"></span>
                </span>
                <span className="text-sm font-medium text-[#0064FF]">AI 블로그 분석 플랫폼</span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-gradient-to-r from-violet-500 to-pink-500 text-white rounded-full">v2.0</span>
              </motion.div>

              {/* Main Title - P1-3: 더 직관적인 메시지 */}
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-5xl md:text-7xl lg:text-8xl font-black mb-6 tracking-tight leading-[0.9]"
              >
                <span className="block mb-2 text-gray-900">내 블로그</span>
                <span className="relative inline-block">
                  <span className="text-[#0064FF]">상위 노출</span>
                  <motion.span
                    className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.8, duration: 0.6 }}
                  />
                </span>
                <span className="block mt-2 text-gray-900">될 수 있을까?</span>
              </motion.h1>

              {/* Subtitle - P1-3: 즉시 가치 전달 */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg md:text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed"
              >
                <span className="text-[#0064FF] font-semibold">3초</span> 만에 블로그 점수 확인
                <br className="hidden md:block" />
                <span className="text-gray-900 font-semibold">11단계 레벨</span>로 성장 전략 수립
              </motion.p>

              {/* Live counter disabled - P0 blocker: fake data */}

              {/* 검색 모드 전환 탭 + 입력 영역 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="max-w-2xl mx-auto mb-10"
              >
                {/* 탭 전환 버튼 */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <button
                    onClick={() => setSearchMode('blog')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                      searchMode === 'blog'
                        ? 'bg-[#0064FF] text-white shadow-lg shadow-[#0064FF]/25'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 gi3d" />
                    블로그 분석
                  </button>
                  <button
                    onClick={() => setSearchMode('keyword')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                      searchMode === 'keyword'
                        ? 'bg-[#0064FF] text-white shadow-lg shadow-[#0064FF]/25'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Search className="w-4 h-4 gi3d" />
                    키워드 검색
                  </button>
                </div>

                {/* 블로그 분석 입력 */}
                {searchMode === 'blog' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <form onSubmit={handleBlogAnalyze} className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                      <div className="relative flex items-center bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl shadow-gray-200/50">
                        <div className="absolute left-5 text-gray-400">
                          <Sparkles className="w-5 h-5 gi3d" />
                        </div>
                        <input
                          type="text"
                          value={blogId}
                          onChange={(e) => setBlogId(e.target.value)}
                          placeholder="블로그 ID 입력 (예: myblog123)"
                          maxLength={100}
                          className="w-full px-5 py-5 pl-14 pr-36 bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none"
                          disabled={isAnalyzing}
                        />
                        <button
                          type="submit"
                          disabled={isAnalyzing}
                          className="absolute right-2 px-6 py-3 rounded-xl bg-[#0064FF] text-white font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-[#0064FF]/15"
                        >
                          {isAnalyzing ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              분석중
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4 gi3d" />
                              무료 분석
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      블로그 URL 또는 ID를 입력하면 11단계 레벨과 42개 지표를 분석합니다
                    </p>
                  </motion.div>
                )}

                {/* 키워드 검색 입력 */}
                {searchMode === 'keyword' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <form onSubmit={handleKeywordSearch} className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-[#0064FF] to-purple-500 rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                      <div className="relative flex items-center bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl shadow-gray-200/50">
                        <div className="absolute left-5 text-gray-400">
                          <Search className="w-5 h-5 gi3d" />
                        </div>
                        <input
                          type="text"
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          placeholder="키워드 입력 (예: 서울맛집, 다이어트)"
                          maxLength={100}
                          className="w-full px-5 py-5 pl-14 pr-36 bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none"
                          disabled={isSearching}
                        />
                        <button
                          type="submit"
                          disabled={isSearching}
                          className="absolute right-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#0064FF] to-purple-500 text-white font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-purple-500/15"
                        >
                          {isSearching ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              검색중
                            </>
                          ) : (
                            <>
                              <Search className="w-4 h-4 gi3d" />
                              검색하기
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      키워드를 입력하면 상위 10개 블로그와 경쟁력을 분석합니다
                    </p>
                  </motion.div>
                )}

                {/* 추가 기능 바로가기 */}
                <div className="mt-6 flex items-center justify-center gap-6 text-sm">
                  <Link
                    href="/blue-ocean"
                    className="text-gray-500 hover:text-amber-500 transition-colors inline-flex items-center gap-1"
                  >
                    <Crown className="w-4 h-4 gi3d" />
                    블루오션 키워드 발굴
                    <ArrowRight className="w-3 h-3 gi3d" />
                  </Link>
                </div>
              </motion.div>

              {/* Stats Row */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="flex flex-wrap items-center justify-center gap-8 md:gap-16"
              >
                {[
                  { value: '상위 10개', label: '블로그 분석', color: 'from-[#0064FF] to-[#3182F6]' },
                  { value: '경쟁력', label: '진입 가능성', color: 'from-[#3182F6] to-[#5CA3FF]' },
                  { value: '실시간', label: '검색량 조회', color: 'from-[#0064FF] to-[#0050CC]' },
                ].map((stat, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className={`w-1 h-10 rounded-full bg-gradient-to-b ${stat.color}`} />
                    <div className="text-left">
                      <div className="text-2xl font-black text-gray-900">{stat.value}</div>
                      <div className="text-xs text-gray-500">{stat.label}</div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee Section */}
      <section className="py-8 border-y border-gray-200 bg-white/50">
        <Marquee speed={40}>
          <div className="flex items-center gap-8 text-gray-500">
            {['키워드 리서치', '블로그 분석', 'AI 글쓰기', '광고 최적화', '성장 가이드', '레벨 측정', 'VIEW 탭 분석', '경쟁 분석'].map((item, i) => (
              <span key={i} className="flex items-center gap-3 text-lg font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0064FF]" />
                {item}
              </span>
            ))}
          </div>
        </Marquee>
      </section>

      {/* Core Features Section - 핵심 기능 */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          {/* 섹션 헤더 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-sm font-medium text-[#0064FF] mb-4">
              <Sparkles className="w-4 h-4 gi3d" />
              시작하기
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">무엇을 도와드릴까요?</h2>
            <p className="text-gray-500">가장 많이 사용하는 핵심 기능</p>
          </motion.div>

          {/* 핵심 카드 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto"
          >
            {/* 1. 키워드 분석 */}
            <Link href="/keyword-search" className="group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.02, y: -5 }}
                  className="relative h-full p-8 glass-3d overflow-hidden shadow-xl shadow-blue-100/50"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/30 rounded-full blur-[60px]" />
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-[#0064FF] flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg shadow-[#0064FF]/25">
                      <Search className="w-8 h-8 text-white gi3d" />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-1 text-xs font-bold bg-[#0064FF] text-white rounded-full">무료 (일 8회)</span>
                      <span className="px-2 py-1 text-xs font-medium bg-white text-gray-600 rounded-full border border-gray-200">상위 10개 분석</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">키워드 분석</h3>
                    <p className="text-gray-600 mb-4">상위 노출 블로그를 분석하고 진입 가능성을 확인합니다</p>
                    <div className="flex items-center gap-2 text-[#0064FF] font-medium group-hover:gap-3 transition-all">
                      <span>키워드 검색하기</span>
                      <ArrowRight className="w-4 h-4 gi3d" />
                    </div>
                  </div>
                </motion.div>
              </TiltCard>
            </Link>

            {/* 2. 블로그 분석 */}
            <Link href="/analyze" className="group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.02, y: -5 }}
                  className="relative h-full p-8 rounded-3xl bg-gradient-to-br from-purple-50 to-white border border-purple-100/50 overflow-hidden shadow-xl shadow-purple-100/50"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100/30 rounded-full blur-[60px]" />
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-purple-500 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg shadow-purple-500/25">
                      <Zap className="w-8 h-8 text-white gi3d" />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-1 text-xs font-bold bg-purple-500 text-white rounded-full">무료 (일 2회)</span>
                      <span className="px-2 py-1 text-xs font-medium bg-white text-gray-600 rounded-full border border-gray-200">11단계 레벨</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">블로그 분석</h3>
                    <p className="text-gray-600 mb-4">블로그 ID만 입력하면 42개 지표를 즉시 분석합니다</p>
                    <div className="flex items-center gap-2 text-purple-600 font-medium group-hover:gap-3 transition-all">
                      <span>분석하러 가기</span>
                      <ArrowRight className="w-4 h-4 gi3d" />
                    </div>
                  </div>
                </motion.div>
              </TiltCard>
            </Link>

          </motion.div>

          {/* 더 많은 기능 링크 */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mt-10"
          >
            <div className="inline-flex items-center gap-4 flex-wrap justify-center">
              <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-[#0064FF] transition-colors">
                <BarChart3 className="w-4 h-4 gi3d" />
                대시보드
              </Link>
              <Link href="/ad-optimizer" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-[#0064FF] transition-colors">
                <Target className="w-4 h-4 gi3d" />
                광고 최적화
              </Link>
              <Link href="/analyze" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-[#0064FF] transition-colors">
                <Zap className="w-4 h-4 gi3d" />
                블로그 분석
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200 text-sm font-medium text-gray-600 mb-6">
              <Layers className="w-4 h-4 gi3d" />
              FEATURES
            </span>
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              <span className="text-gray-900">강력한 기능</span>
            </h2>
            <p className="text-gray-500 text-lg">블로그 성장에 필요한 모든 것</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {[
              {
                icon: TrendingUp,
                title: '실시간 지수 측정',
                description: '11단계 레벨 시스템으로 블로그 등급을 정확하게 평가',
                gradient: 'from-blue-50 to-white',
                iconBg: 'bg-[#0064FF]',
                borderColor: 'border-blue-100/50'
              },
              {
                icon: BarChart3,
                title: '상세한 분석',
                description: '신뢰도, 콘텐츠, 참여도, SEO, 트래픽을 종합 분석',
                gradient: 'from-pink-100 to-rose-50',
                iconBg: 'bg-pink-500',
                borderColor: 'border-pink-200/50'
              },
              {
                icon: Award,
                title: '맞춤 개선안',
                description: 'AI가 분석한 맞춤형 권장사항으로 블로그 성장',
                gradient: 'from-orange-100 to-amber-50',
                iconBg: 'bg-orange-500',
                borderColor: 'border-orange-200/50'
              },
              {
                icon: BookOpen,
                title: '글쓰기 가이드',
                description: '상위 글 분석 데이터 기반 실시간 최적화 가이드',
                gradient: 'from-emerald-100 to-teal-50',
                iconBg: 'bg-emerald-500',
                borderColor: 'border-emerald-200/50',
                isNew: true
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -8 }}
                className={`relative p-6 rounded-3xl bg-gradient-to-br ${feature.gradient} border ${feature.borderColor} cursor-pointer group shadow-xl`}
              >
                {feature.isNew && (
                  <span className="absolute top-4 right-4 px-2 py-0.5 text-[10px] font-bold bg-gradient-to-r from-violet-500 to-pink-500 text-white rounded-full">NEW</span>
                )}
                <div className={`inline-flex p-3 rounded-xl ${feature.iconBg} text-white mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-gray-900">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* P1: Killer Feature - 1위 가능 키워드 */}
      <section className="py-20 relative bg-gradient-to-b from-yellow-50 to-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto"
          >
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-100 border border-yellow-200 text-sm font-bold text-yellow-700 mb-4">
                <Crown className="w-4 h-4 gi3d" />
                Pro 전용 킬러 기능
              </span>
              <h2 className="text-4xl md:text-5xl font-black mb-4">
                <span className="text-yellow-600">1위 가능 키워드</span>를 찾아보세요
              </h2>
              <p className="text-gray-600 text-lg max-w-2xl mx-auto">
                내 블로그 레벨로 지금 당장 1위가 가능한 키워드를 AI가 찾아드립니다
              </p>
            </div>

            {/* 데모 카드 */}
            <div className="grid md:grid-cols-3 gap-6 mb-10">
              {[
                { keyword: '홈트레이닝 루틴', volume: 8400, probability: 94, reason: '현재 1위 Lv.3 → 내 레벨 Lv.5' },
                { keyword: '자취 요리 레시피', volume: 12300, probability: 87, reason: '경쟁 블로그 3개월 미활동' },
                { keyword: '노트북 추천 2026', volume: 18500, probability: 78, reason: '상위권 평균보다 높은 D.I.A.' }
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="p-6 bg-white rounded-2xl border-2 border-yellow-200 shadow-xl shadow-yellow-100/50"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white ${
                      index === 0 ? 'bg-gradient-to-r from-yellow-400 to-amber-500' :
                      index === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-400' :
                      'bg-gradient-to-r from-orange-300 to-orange-400'
                    }`}>
                      {index + 1}
                    </div>
                    <div className={`text-2xl font-bold ${
                      item.probability >= 90 ? 'text-green-600' : item.probability >= 80 ? 'text-blue-600' : 'text-yellow-600'
                    }`}>
                      {item.probability}%
                    </div>
                  </div>
                  <div className="font-bold text-lg text-gray-900 mb-2">{item.keyword}</div>
                  <div className="text-sm text-gray-500 mb-3">월 {item.volume.toLocaleString()}회 검색</div>
                  <div className="text-xs text-green-600 bg-green-50 rounded-lg p-2">
                    ✓ {item.reason}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* 서비스 특징 */}
            <div className="bg-gradient-to-r from-yellow-400 to-amber-500 rounded-2xl p-6 text-white text-center mb-8">
              <div className="flex flex-wrap items-center justify-center gap-8">
                <div>
                  <div className="text-3xl font-bold">내 레벨</div>
                  <div className="text-sm opacity-90">기준으로 고른 1위 가능 키워드</div>
                </div>
                <div className="hidden md:block w-px h-12 bg-white/30" />
                <div>
                  <div className="text-3xl font-bold">골든타임</div>
                  <div className="text-sm opacity-90">최적 발행 시간까지 안내</div>
                </div>
                <div className="hidden md:block w-px h-12 bg-white/30" />
                <div>
                  <div className="text-3xl font-bold">42개</div>
                  <div className="text-sm opacity-90">분석 지표로 블로그 진단</div>
                </div>
              </div>
              <p className="text-xs opacity-70 mt-3">* 결과는 개인 블로그 상태 및 운영 방식에 따라 다를 수 있습니다</p>
            </div>

            <div className="text-center">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-bold text-lg rounded-2xl hover:shadow-xl transition-all"
              >
                <Crown className="w-5 h-5 gi3d" />
                Pro 7일 무료로 체험하기
                <ArrowRight className="w-5 h-5 gi3d" />
              </Link>
              <p className="text-sm text-gray-500 mt-3">7일 내 해지 시 0원 · 클릭 한 번으로 해지</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* P1: 사용자 후기 (Testimonials) */}
      <section className="py-20 relative bg-gray-50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-sm font-medium text-[#0064FF] mb-4">
              <Heart className="w-4 h-4 gi3d" />
              REVIEWS
            </span>
            <h2 className="text-4xl md:text-5xl font-black mb-4 text-gray-900">
              이런 경험을 할 수 있어요
            </h2>
            <p className="text-sm text-gray-500">* 서비스 활용 시나리오 예시이며, 실제 사용자 후기가 아닙니다</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                name: '맛집탐방러',
                level: 'Lv.7 → Lv.9',
                period: '3개월 사용',
                content: '"1위 가능 키워드 기능이 진짜 신세계예요. 추천받은 키워드로 글 쓰니까 바로 상위 노출되더라고요!"',
                highlight: '일 방문자 300 → 2,400'
              },
              {
                name: '육아맘 블로거',
                level: 'Lv.4 → Lv.6',
                period: '2개월 사용',
                content: '"초보라서 어떤 키워드로 글을 써야 할지 몰랐는데, 블랭크가 딱 맞는 키워드를 알려줘서 자신감이 생겼어요."',
                highlight: 'VIEW탭 첫 노출 성공'
              },
              {
                name: 'IT리뷰어',
                level: 'Lv.8 → Lv.10',
                period: '6개월 사용',
                content: '"경쟁도 분석이 정확해서 시간 낭비 없이 승산 있는 키워드만 공략할 수 있어요. 효율이 확 올랐습니다."',
                highlight: '월 수익 3배 증가'
              }
            ].map((review, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 bg-white rounded-2xl border border-gray-200 shadow-lg"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#0064FF] to-[#3182F6] flex items-center justify-center text-white font-bold">
                    {review.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{review.name}</div>
                    <div className="text-xs text-gray-500">{review.level} · {review.period}</div>
                  </div>
                </div>
                <p className="text-gray-600 text-sm mb-4 leading-relaxed">{review.content}</p>
                <div className="px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium">
                  {review.highlight}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* P1: 무료 vs Pro 비교 */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto"
          >
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-black mb-4 text-gray-900">
                무료 vs <span className="text-[#0064FF]">Pro</span>
              </h2>
              <p className="text-gray-600">무료로 시작하고, 필요할 때 업그레이드하세요</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* 무료 */}
              <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
                <div className="text-center mb-6">
                  <div className="text-2xl font-bold text-gray-900 mb-1">무료</div>
                  <div className="text-4xl font-black text-gray-900">0원</div>
                </div>
                <ul className="space-y-3">
                  {[
                    '블로그 분석 2회/일',
                    '키워드 검색 8회/일',
                    '지수 변화 추이 기록',
                    '기본 분석 리포트'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-600">
                      <Check className="w-4 h-4 text-gray-400 gi3d" />
                      {item}
                    </li>
                  ))}
                  {[
                    '1위 가능 키워드 추천',
                    '순위 추적 & 알림',
                    '경쟁사 비교 분석',
                    '엑셀 내보내기'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-400">
                      <X className="w-4 h-4 gi3d" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/analyze"
                  className="block w-full mt-6 py-3 text-center bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition-colors"
                >
                  무료로 시작
                </Link>
              </div>

              {/* Pro */}
              <div className="p-6 bg-gradient-to-br from-[#0064FF] to-[#3182F6] rounded-2xl text-white relative overflow-hidden">
                <div className="absolute top-4 right-4 px-3 py-1 bg-white/20 rounded-full text-xs font-bold">
                  추천
                </div>
                <div className="text-center mb-6">
                  <div className="text-2xl font-bold mb-1">Pro</div>
                  <div className="text-4xl font-black">19,900원<span className="text-lg font-normal">/월</span></div>
                  <div className="text-sm opacity-80 mt-1">7일 내 전액 환불</div>
                </div>
                <ul className="space-y-3">
                  {[
                    '블로그 분석 무제한',
                    '키워드 검색 200회/일',
                    '지수 변화 추이 + 발행 활동 분석',
                    '상세 분석 리포트',
                    '1위 가능 키워드 추천',
                    '순위 추적 & 알림',
                    '경쟁사 10개 비교',
                    '엑셀 내보내기'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="w-4 h-4 gi3d" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className="block w-full mt-6 py-3 text-center bg-white text-[#0064FF] font-bold rounded-xl hover:bg-blue-50 transition-colors"
                >
                  7일 환불 보장으로 시작
                </Link>
                <p className="text-xs text-center mt-2 opacity-80">클릭 한 번으로 언제든 해지</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto text-center"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200 text-sm font-medium text-gray-600 mb-6">
              <Star className="w-4 h-4 gi3d" />
              WHY BLANK
            </span>
            <h2 className="text-4xl md:text-5xl font-black mb-12">
              왜 <span className="bg-[#0064FF] bg-clip-text text-transparent">블랭크</span>인가요?
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: BarChart3,
                  title: '정확한 지수 분석',
                  description: '40개 이상의 지표를 분석하여 11단계 레벨로 블로그 품질을 객관적으로 평가합니다.'
                },
                {
                  icon: Search,
                  title: '키워드 경쟁 분석',
                  description: '네이버 VIEW 탭 상위 블로그들의 지수를 비교 분석하여 경쟁력을 파악할 수 있습니다.'
                },
                {
                  icon: TrendingUp,
                  title: '성장 가이드 제공',
                  description: 'AI 기반 맞춤 개선 권장사항으로 블로그 성장 전략을 제안받을 수 있습니다.'
                },
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -5 }}
                  className="p-6 rounded-3xl bg-white border border-gray-200 shadow-xl shadow-gray-100/50"
                >
                  <feature.icon className="w-12 h-12 mb-4 mx-auto text-[#0064FF]" strokeWidth={1.5} />
                  <h3 className="font-bold text-lg mb-2 text-gray-900">{feature.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-pink-600 to-orange-500" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="relative container mx-auto px-4 text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto"
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-flex mb-6"
            >
              <GlassIcon icon={Sparkles} size={86} />
            </motion.div>

            <h2 className="text-4xl md:text-5xl font-black mb-6">
              지금 바로 시작하세요
            </h2>
            <p className="text-xl mb-10 text-white/90">
              무료로 블로그 지수를 확인하고, 성장 전략을 받아보세요
            </p>

            {/* P1: CTA 최적화 - Primary 강조, Secondary 약화 */}
            <div className="flex flex-col items-center justify-center gap-4">
              <Link
                href="/pricing"
                className="group inline-flex items-center gap-3 px-10 py-5 bg-white text-[#0064FF] rounded-2xl font-bold text-lg hover:scale-105 transition-all shadow-2xl"
              >
                <Crown className="w-6 h-6 gi3d" />
                7일 환불 보장으로 시작
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform gi3d" />
              </Link>

              {/* 신뢰 신호 강화 */}
              <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-white/80">
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-green-400 gi3d" />
                  <span>7일 내 해지 시 0원</span>
                </div>
                <span className="text-white/40">|</span>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-green-400 gi3d" />
                  <span>클릭 한 번으로 해지</span>
                </div>
              </div>

              {/* Secondary CTA - 약화 */}
              <Link
                href="/analyze"
                className="text-white/70 hover:text-white transition-colors text-sm font-medium flex items-center gap-1 mt-2"
              >
                또는 무료로 먼저 분석해보기
                <ArrowRight className="w-3 h-3 gi3d" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section - 블랭크 실제 지표 */}
      <section className="py-20 bg-gray-900 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#0064FF]/10 rounded-full blur-[120px]" />
        </div>

        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0064FF]/20 border border-[#0064FF]/30 mb-8">
              <TrendingUp className="w-4 h-4 text-[#3182F6] gi3d" />
              <span className="text-sm text-blue-300 font-medium">블로거들이 신뢰하는 분석 플랫폼</span>
            </div>

            <h3 className="text-4xl md:text-5xl font-black text-white mb-12">
              데이터로 <span className="bg-gradient-to-r from-[#0064FF] to-[#3182F6] bg-clip-text text-transparent">성장</span>을 증명합니다
            </h3>

            <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto mb-12">
              {[
                { value: '40+', label: '분석 지표' },
                { value: '11단계', label: '레벨 시스템' },
                { value: '실시간', label: '키워드 분석' },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <div className="text-4xl md:text-5xl font-black bg-gradient-to-r from-[#0064FF] to-[#3182F6] bg-clip-text text-transparent mb-2">{stat.value}</div>
                  <div className="text-gray-400 text-sm">{stat.label}</div>
                </motion.div>
              ))}
            </div>

            <div className="flex flex-col items-center">
              <Link
                href="/pricing"
                className="group inline-flex items-center gap-3 px-8 py-4 bg-[#0064FF] text-white rounded-2xl font-bold text-lg hover:shadow-lg hover:shadow-[#0064FF]/20 transition-all"
              >
                7일 환불 보장으로 시작
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform gi3d" />
              </Link>
              <p className="text-xs text-gray-400 mt-3">클릭 한 번으로 언제든 해지 가능</p>
            </div>
          </motion.div>
        </div>
      </section>


      {/* Fixed Bottom Promo Popup - Pro 플랜 체험 */}
      <AnimatePresence>
        {showAdPopup && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[420px] z-50"
          >
            <div className="relative backdrop-blur-2xl bg-white/90 border border-gray-200 rounded-2xl overflow-hidden shadow-2xl shadow-gray-300/50">
              <div className="absolute inset-0 bg-gradient-to-r from-[#0064FF]/5 via-blue-500/5 to-cyan-500/5" />

              <button
                onClick={() => setShowAdPopup(false)}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-10"
              >
                <X className="w-4 h-4 text-gray-500 gi3d" />
              </button>

              <Link
                href="/pricing"
                className="relative block p-4 hover:bg-blue-50/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#0064FF] to-[#3182F6] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#0064FF]/15">
                    <Crown className="w-7 h-7 text-white gi3d" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 text-[9px] font-bold bg-green-500 text-white rounded-full">7일 무료</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900 truncate">1위 가능 키워드 추천</div>
                    <div className="text-xs text-gray-500">클릭 한 번으로 해지 · 위약금 0원</div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1 px-4 py-2 rounded-xl bg-[#0064FF] text-white text-xs font-bold flex-shrink-0">
                    <span>체험</span>
                    <ChevronRight className="w-3 h-3 gi3d" />
                  </div>
                </div>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
