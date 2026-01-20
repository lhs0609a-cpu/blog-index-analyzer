'use client'

import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion'
import { Sparkles, TrendingUp, Zap, Award, BarChart3, Search, BookOpen, ArrowRight, Building2, Mic, X, PenTool, Target, Star, Flame, Crown, ChevronRight, Play, Rocket, Heart, MousePointer, ArrowUpRight, Layers, Globe, Check, Users } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
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
  const [searchKeyword, setSearchKeyword] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [showAdPopup, setShowAdPopup] = useState(true)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const handleKeywordSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchKeyword.trim()) {
      toast.error('키워드를 입력해주세요')
      return
    }
    setIsSearching(true)
    router.push(`/keyword-search?keyword=${encodeURIComponent(searchKeyword.trim())}`)
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-gray-900 overflow-hidden">
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

              {/* Main Title */}
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-5xl md:text-7xl lg:text-8xl font-black mb-6 tracking-tight leading-[0.9]"
              >
                <span className="block mb-2 text-gray-900">블로그 지수를</span>
                <span className="relative inline-block">
                  <span className="text-[#0064FF]">한눈에</span>
                  <motion.span
                    className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-full"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.8, duration: 0.6 }}
                  />
                </span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg md:text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed"
              >
                <span className="text-[#0064FF] font-semibold">40+</span> 지표 분석 · <span className="text-[#3182F6] font-semibold">11단계</span> 레벨 시스템
                <br className="hidden md:block" />
                인플루언서들이 선택한 <span className="text-gray-900 font-semibold">#1</span> 분석 도구
              </motion.p>

              {/* Search Bar */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="max-w-2xl mx-auto mb-10"
              >
                <form onSubmit={handleKeywordSearch} className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                  <div className="relative flex items-center bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xl shadow-gray-200/50">
                    <div className="absolute left-5 text-gray-400">
                      <Search className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder="키워드를 입력하세요 (예: 맛집, 여행, 육아)"
                      className="w-full px-5 py-5 pl-14 pr-36 bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none"
                      disabled={isSearching}
                    />
                    <button
                      type="submit"
                      disabled={isSearching}
                      className="absolute right-2 px-6 py-3 rounded-xl bg-[#0064FF] text-white font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-[#0064FF]/15"
                    >
                      {isSearching ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          검색중
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          검색
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>

              {/* Stats Row */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="flex flex-wrap items-center justify-center gap-8 md:gap-16"
              >
                {[
                  { value: '40+', label: '분석 지표', color: 'from-[#0064FF] to-[#3182F6]' },
                  { value: '11단계', label: '레벨 시스템', color: 'from-[#3182F6] to-[#5CA3FF]' },
                  { value: '실시간', label: '분석 제공', color: 'from-[#0064FF] to-[#0050CC]' },
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
            {['블로그 분석', '키워드 리서치', 'AI 글쓰기', '광고 최적화', '성장 가이드', '레벨 측정', 'VIEW 탭 분석', '경쟁 분석'].map((item, i) => (
              <span key={i} className="flex items-center gap-3 text-lg font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0064FF]" />
                {item}
              </span>
            ))}
          </div>
        </Marquee>
      </section>

      {/* Bento Grid Section */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-12 gap-4 max-w-6xl mx-auto"
          >
            {/* 블로그 분석 - Large */}
            <Link href="/analyze" className="col-span-12 md:col-span-6 group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="relative h-full p-8 rounded-3xl bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 overflow-hidden shadow-xl shadow-blue-100/50"
                >
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-100/30 rounded-full blur-[100px]" />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-[#0064FF] flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all shadow-lg shadow-[#0064FF]/15">
                        <Zap className="w-7 h-7 text-white" />
                      </div>
                      <ArrowUpRight className="w-6 h-6 text-[#0064FF] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">블로그 분석</h3>
                    <p className="text-gray-600 mb-6">블로그 ID만 입력하면 40개 이상의 지표를 즉시 분석합니다</p>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 text-xs font-medium bg-[#0064FF] text-white rounded-full">FREE</span>
                      <span className="px-3 py-1 text-xs font-medium bg-white text-gray-600 rounded-full border border-gray-200">11단계 레벨</span>
                    </div>
                  </div>
                </motion.div>
              </TiltCard>
            </Link>

            {/* 프리미엄 도구 - Wide */}
            <Link href="/tools" className="col-span-12 md:col-span-6 group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="relative h-full p-8 rounded-3xl bg-gradient-to-r from-blue-50 via-blue-50 to-white border border-blue-100/50 overflow-hidden shadow-xl shadow-blue-100/50"
                >
                  <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-100/20 rounded-full blur-[100px]" />
                  <div className="relative flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center shadow-lg">
                          <Sparkles className="w-5 h-5 text-[#0064FF]" />
                        </div>
                        <span className="text-xs font-bold text-[#0064FF] bg-white/80 px-3 py-1 rounded-full">9개 도구</span>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">프리미엄 AI 도구</h3>
                      <p className="text-gray-600">블로그 성장에 필요한 모든 것</p>
                    </div>
                    <ChevronRight className="w-8 h-8 text-gray-400 group-hover:translate-x-2 group-hover:text-[#0064FF] transition-all" />
                  </div>
                </motion.div>
              </TiltCard>
            </Link>

            {/* 커뮤니티 */}
            <Link href="/community" className="col-span-12 md:col-span-6 group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="relative h-full p-8 rounded-3xl bg-gradient-to-br from-blue-50 to-blue-50 border border-blue-100 overflow-hidden shadow-xl shadow-blue-100/50"
                >
                  <span className="absolute top-4 right-4 px-2 py-1 text-[10px] font-bold bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white rounded-full">NEW</span>
                  <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-100/20 rounded-full blur-[50px]" />
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0064FF] to-[#0050CC] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-[#0064FF]/15">
                      <Users className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">커뮤니티</h3>
                    <p className="text-gray-600 mb-6">실시간 활동 & 랭킹, 정보 공유</p>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 text-xs font-medium bg-[#0064FF] text-white rounded-full">FREE</span>
                    </div>
                  </div>
                </motion.div>
              </TiltCard>
            </Link>

            {/* 광고 최적화 - Medium */}
            <Link href="/ad-optimizer" className="col-span-12 md:col-span-6 group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="relative h-full p-8 rounded-3xl bg-gradient-to-br from-emerald-100 to-teal-50 border border-emerald-200/50 overflow-hidden shadow-xl shadow-emerald-100/50"
                >
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-200/30 rounded-full blur-[80px]" />
                  <span className="absolute top-4 right-4 px-2 py-1 text-[10px] font-bold bg-orange-500 text-white rounded-full animate-pulse">HOT</span>
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-emerald-500/30">
                      <Target className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">광고 최적화</h3>
                    <p className="text-gray-600 mb-6">네이버 광고 성과 분석 및 최적화 추천</p>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 text-xs font-medium bg-emerald-500 text-white rounded-full">PRO</span>
                    </div>
                  </div>
                </motion.div>
              </TiltCard>
            </Link>

            {/* 통합 광고 */}
            <Link href="/ad-optimizer/unified" className="col-span-6 md:col-span-3 group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="relative h-full p-6 rounded-3xl bg-white border border-gray-200 overflow-hidden shadow-lg shadow-gray-100/50"
                >
                  <div className="flex gap-1 absolute top-3 right-3">
                    <span className="px-2 py-0.5 text-[9px] font-bold bg-[#0064FF] text-white rounded-full">PRO</span>
                    <span className="px-2 py-0.5 text-[9px] font-bold bg-orange-500 text-white rounded-full">NEW</span>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:-rotate-6 transition-all shadow-lg shadow-[#0064FF]/15">
                    <Rocket className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">통합 광고</h3>
                  <p className="text-xs text-gray-500">멀티 플랫폼</p>
                </motion.div>
              </TiltCard>
            </Link>

            {/* 대시보드 */}
            <Link href="/dashboard" className="col-span-6 md:col-span-3 group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="relative h-full p-6 rounded-3xl bg-white border border-gray-200 overflow-hidden shadow-lg shadow-gray-100/50"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center mb-4 group-hover:scale-110 transition-all shadow-lg shadow-gray-500/25">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">대시보드</h3>
                  <p className="text-xs text-gray-500">내 분석 현황</p>
                </motion.div>
              </TiltCard>
            </Link>

            {/* Threads 자동화 */}
            <Link href="/threads" className="col-span-6 md:col-span-3 group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="relative h-full p-6 rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 overflow-hidden shadow-xl shadow-gray-900/50"
                >
                  <span className="absolute top-3 right-3 px-2 py-0.5 text-[9px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full">NEW</span>
                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg">
                    <svg viewBox="0 0 192 192" className="w-6 h-6" fill="black">
                      <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3175 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C120.004 17.1122 137.663 24.4614 149.327 38.7841C155.009 45.7891 159.261 54.4084 162.016 64.4261L178.088 60.1456C174.707 47.6817 169.325 36.9498 161.966 28.223C147.511 10.6416 126.655 1.6412 97.0681 1.43254C97.0356 1.43235 97.003 1.43234 96.9706 1.43234C66.8499 1.43234 46.0339 10.6435 31.7322 28.6345C16.6042 47.6679 9.00188 74.0045 9.00001 96.0001C9.00188 117.996 16.6042 144.332 31.7322 163.365C46.034 181.356 66.85 190.568 96.9706 190.568C97.0029 190.568 97.0356 190.568 97.0681 190.567C126.655 190.359 147.511 181.358 161.966 163.777C176.568 146.016 177.166 125.248 172.215 112.084C168.514 102.133 161.18 93.9236 150.949 87.7622C150.882 87.7227 150.814 87.6832 150.746 87.6438C150.68 87.6051 150.614 87.5665 150.548 87.5279C150.543 87.5254 150.538 87.5229 150.533 87.5204C148.313 86.1711 145.984 84.9754 143.572 83.9421C143.572 83.9415 143.572 83.9408 143.572 83.9402C143.57 83.9395 143.569 83.9389 143.568 83.9383C142.904 83.6608 142.23 83.3933 141.547 83.1359C141.544 83.1347 141.54 83.1335 141.537 83.1324V88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z"/>
                    </svg>
                  </div>
                  <h3 className="font-bold text-white mb-1">Threads 자동화</h3>
                  <p className="text-xs text-gray-400">AI 콘텐츠 자동 게시</p>
                </motion.div>
              </TiltCard>
            </Link>

            {/* X (Twitter) 자동화 */}
            <Link href="/x" className="col-span-6 md:col-span-3 group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="relative h-full p-6 rounded-3xl bg-gradient-to-br from-sky-950 to-slate-900 border border-sky-800/50 overflow-hidden shadow-xl shadow-sky-900/50"
                >
                  <span className="absolute top-3 right-3 px-2 py-0.5 text-[9px] font-bold bg-gradient-to-r from-sky-500 to-blue-500 text-white rounded-full">NEW</span>
                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg">
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="black">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </div>
                  <h3 className="font-bold text-white mb-1">X 자동화</h3>
                  <p className="text-xs text-gray-400">AI 트윗 자동 게시</p>
                </motion.div>
              </TiltCard>
            </Link>

            {/* AI 글쓰기 */}
            <a href="https://doctor-voice-pro-ghwi.vercel.app/" target="_blank" rel="noopener noreferrer" className="col-span-6 md:col-span-3 group">
              <TiltCard className="h-full">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="relative h-full p-6 rounded-3xl bg-gradient-to-br from-cyan-100 to-blue-50 border border-cyan-200/50 overflow-hidden shadow-xl shadow-cyan-100/50"
                >
                  <div className="w-12 h-12 rounded-xl bg-cyan-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-cyan-500/30">
                    <PenTool className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">AI 글쓰기</h3>
                  <p className="text-xs text-gray-500">자동 작성</p>
                </motion.div>
              </TiltCard>
            </a>
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
              <Layers className="w-4 h-4" />
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

      {/* 30일 챌린지 배너 */}
      <section className="py-12 relative">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Link href="/challenge" className="group block">
              <div className="relative overflow-hidden rounded-3xl p-1 bg-gradient-to-r from-[#0064FF] to-[#3182F6] shadow-2xl shadow-violet-500/20">
                <div className="relative bg-white rounded-[1.4rem] p-8 md:p-10">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-[100px]" />
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-100 rounded-full blur-[80px]" />

                  <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="text-center md:text-left">
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 mb-4">
                        <Rocket className="w-4 h-4 text-[#0064FF]" />
                        <span className="text-sm font-semibold text-[#0064FF]">무료 회원도 참여 가능</span>
                      </div>

                      <h3 className="text-3xl md:text-4xl font-black text-gray-900 mb-3">
                        30일 블로그 챌린지
                      </h3>

                      <p className="text-gray-600 text-lg mb-4 max-w-lg">
                        매일 10분! 블로그 초보자도 30일 후에는 전문가가 됩니다.
                      </p>

                      <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                        {['30일 커리큘럼', '배지 & XP', '연속 기록'].map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                            <Check className="w-4 h-4 text-[#0064FF]" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-4">
                      <div className="grid grid-cols-3 gap-2">
                        {['🌱', '📝', '⭐', '🔥', '🏆', '👑'].map((emoji, i) => (
                          <motion.div
                            key={i}
                            whileHover={{ scale: 1.2, rotate: 10 }}
                            className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl"
                          >
                            {emoji}
                          </motion.div>
                        ))}
                      </div>
                      <div className="px-8 py-4 rounded-2xl bg-[#0064FF] text-white font-bold text-lg group-hover:scale-105 transition-transform flex items-center gap-2 shadow-lg shadow-[#0064FF]/15">
                        지금 시작하기
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
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
              <Star className="w-4 h-4" />
              WHY BLANK
            </span>
            <h2 className="text-4xl md:text-5xl font-black mb-12">
              왜 <span className="bg-[#0064FF] bg-clip-text text-transparent">블랭크</span>인가요?
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: '📊',
                  title: '정확한 지수 분석',
                  description: '40개 이상의 지표를 분석하여 11단계 레벨로 블로그 품질을 객관적으로 평가합니다.'
                },
                {
                  icon: '🔍',
                  title: '키워드 경쟁 분석',
                  description: '네이버 VIEW 탭 상위 블로그들의 지수를 비교 분석하여 경쟁력을 파악할 수 있습니다.'
                },
                {
                  icon: '📈',
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
                  <div className="text-5xl mb-4">{feature.icon}</div>
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
              <Sparkles className="w-12 h-12 text-white/80" />
            </motion.div>

            <h2 className="text-4xl md:text-5xl font-black mb-6">
              지금 바로 시작하세요
            </h2>
            <p className="text-xl mb-10 text-white/90">
              무료로 블로그 지수를 확인하고, 성장 전략을 받아보세요
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/analyze"
                className="group inline-flex items-center gap-3 px-10 py-5 bg-white text-[#0064FF] rounded-2xl font-bold text-lg hover:scale-105 transition-all shadow-2xl"
              >
                <Sparkles className="w-6 h-6" />
                무료 분석 시작
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="https://www.brandplaton.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-3 px-10 py-5 bg-white/10 backdrop-blur-md border border-white/30 rounded-2xl font-bold text-lg hover:bg-white hover:text-[#0064FF] transition-all"
              >
                <Building2 className="w-5 h-5" />
                전문가 상담받기
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gray-900 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-violet-600/10 rounded-full blur-[120px]" />
        </div>

        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0064FF]/20 border border-violet-500/30 mb-8">
              <Heart className="w-4 h-4 text-pink-400" />
              <span className="text-sm text-violet-300 font-medium">Trusted by 70+ Healthcare Partners</span>
            </div>

            <h3 className="text-4xl md:text-5xl font-black text-white mb-12">
              마케팅, <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">결과</span>로 증명합니다
            </h3>

            <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto mb-12">
              {[
                { value: '70+', label: '파트너 병원' },
                { value: '200%', label: '평균 성장률' },
                { value: '3개월', label: '성과 달성' },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <div className="text-4xl md:text-5xl font-black bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent mb-2">{stat.value}</div>
                  <div className="text-gray-500 text-sm">{stat.label}</div>
                </motion.div>
              ))}
            </div>

            <a
              href="https://www.brandplaton.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 px-8 py-4 bg-[#0064FF] text-white rounded-2xl font-bold text-lg hover:shadow-lg hover:shadow-[#0064FF]/20 transition-all"
            >
              성공 사례 확인하기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
          </motion.div>
        </div>
      </section>


      {/* Fixed Bottom Ad Popup */}
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
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-pink-500/5 to-orange-500/5" />

              <button
                onClick={() => setShowAdPopup(false)}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-10"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>

              <a
                href="https://www.brandplaton.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="relative block p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#0064FF]/15">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-[#0064FF]">AD</span>
                      <span className="px-2 py-0.5 text-[9px] font-bold bg-gradient-to-r from-violet-500 to-pink-500 text-white rounded-full">HOT</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900 truncate">병원 매출, 3개월 만에 2배 성장</div>
                    <div className="text-xs text-gray-500">플라톤마케팅 | 70+ 병원 선택</div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1 px-4 py-2 rounded-xl bg-[#0064FF] text-white text-xs font-bold flex-shrink-0">
                    <span>보기</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
