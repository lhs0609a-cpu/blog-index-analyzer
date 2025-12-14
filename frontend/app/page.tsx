'use client'

import { motion } from 'framer-motion'
import { Sparkles, TrendingUp, Zap, Award, Users, BarChart3, LogOut, Search } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Home() {
  const { isAuthenticated, user, logout } = useAuthStore()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    setMounted(true)
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

  const handleLogout = () => {
    logout()
    toast.success('로그아웃되었습니다')
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      {/* Header */}
      <div className="absolute top-0 right-0 p-8 z-10">
        {!mounted ? (
          <div className="flex items-center gap-4 opacity-0">
            <div className="px-6 py-3 rounded-full glass">로딩중...</div>
          </div>
        ) : isAuthenticated ? (
          <div className="flex items-center gap-4">
            <span className="text-gray-700 font-medium">안녕하세요, {user?.name}님</span>
            <Link href="/dashboard">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 rounded-full instagram-gradient text-white font-semibold hover:shadow-lg transition-all"
              >
                대시보드
              </motion.button>
            </Link>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleLogout}
              className="p-3 rounded-full glass hover:bg-white/90 transition-all"
            >
              <LogOut className="w-5 h-5" />
            </motion.button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link href="/login">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 rounded-full glass hover:bg-white/90 transition-all font-semibold"
              >
                로그인
              </motion.button>
            </Link>
            <Link href="/register">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 rounded-full instagram-gradient text-white font-semibold hover:shadow-lg transition-all"
              >
                회원가입
              </motion.button>
            </Link>
          </div>
        )}
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated background blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute top-20 left-20 w-96 h-96 bg-purple-400/30 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              x: [0, 50, 0],
              y: [0, 30, 0],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="absolute bottom-20 right-20 w-96 h-96 bg-pink-400/30 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.3, 1],
              x: [0, -50, 0],
              y: [0, -30, 0],
            }}
            transition={{
              duration: 15,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </div>

        <div className="relative container mx-auto px-4 py-20">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8"
            >
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium">플라톤 마케팅에서 개발한 AI 기반 블로그 분석 플랫폼</span>
              <span className="text-xs text-purple-500 bg-purple-100 px-2 py-0.5 rounded-full font-semibold">v1.2.0</span>
            </motion.div>

            {/* Main Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-6xl md:text-7xl font-bold mb-6"
            >
              <span className="gradient-text">블로그 지수,</span>
              <br />
              <span className="text-gray-900">한눈에 확인하세요</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto"
            >
              40+ 지표를 분석하여 블로그 품질을 정확하게 측정합니다.
              <br />
              인플루언서들이 선택한 #1 블로그 분석 도구
            </motion.p>

            {/* Keyword Search Bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="max-w-2xl mx-auto mb-8"
            >
              <form onSubmit={handleKeywordSearch} className="relative">
                <div className="relative flex items-center">
                  <div className="absolute left-5 text-gray-400">
                    <Search className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="키워드를 입력하세요 (예: 맛집, 여행, 육아)"
                    className="w-full pl-14 pr-36 py-5 rounded-full glass border-2 border-transparent focus:border-purple-400 focus:outline-none text-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                    disabled={isSearching}
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="absolute right-2 px-6 py-3 rounded-full instagram-gradient text-white font-semibold hover:opacity-90 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSearching ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        검색중...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        키워드 검색
                      </>
                    )}
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  💡 키워드로 검색하면 네이버 VIEW 탭 상위 블로그들의 지수를 한눈에 분석할 수 있어요
                </p>
              </form>
            </motion.div>

            {/* Divider */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.28 }}
              className="flex items-center justify-center gap-4 mb-8"
            >
              <div className="h-px w-16 bg-gray-300"></div>
              <span className="text-sm text-gray-400">또는</span>
              <div className="h-px w-16 bg-gray-300"></div>
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 flex-wrap"
            >
              <Link
                href="/analyze"
                className="group relative px-8 py-4 rounded-full glass border-2 border-purple-300 font-semibold hover:bg-purple-50 transition-all duration-300 overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2 text-purple-600">
                  <Zap className="w-5 h-5" />
                  블로그 ID로 분석하기
                </span>
              </Link>

              <Link
                href="/dashboard"
                className="px-8 py-4 rounded-full glass font-semibold hover:bg-white/90 transition-all duration-300"
              >
                대시보드 보기
              </Link>

              <a
                href="https://doctor-voice-pro-ghwi.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:shadow-lg hover:scale-105 transition-all duration-300 flex items-center gap-2"
              >
                <span className="text-lg">🎙️</span>
                닥터보이스 바로가기
              </a>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="grid grid-cols-3 gap-8 mt-16 max-w-2xl mx-auto"
            >
              {[
                { value: '10K+', label: '분석된 블로그' },
                { value: '98%', label: '정확도' },
                { value: '24/7', label: '실시간 추적' },
              ].map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-3xl font-bold gradient-text">{stat.value}</div>
                  <div className="text-sm text-gray-600 mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
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
            <h2 className="text-4xl font-bold mb-4">
              <span className="gradient-text">강력한 기능</span>
            </h2>
            <p className="text-gray-600 text-lg">블로그 성장에 필요한 모든 것</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <TrendingUp className="w-10 h-10" />,
                title: '실시간 지수 측정',
                description: '11단계 레벨 시스템으로 블로그 등급을 정확하게 평가합니다.',
                gradient: 'from-purple-500 to-pink-500'
              },
              {
                icon: <BarChart3 className="w-10 h-10" />,
                title: '상세한 분석',
                description: '신뢰도, 콘텐츠, 참여도, SEO, 트래픽을 종합 분석합니다.',
                gradient: 'from-pink-500 to-orange-500'
              },
              {
                icon: <Award className="w-10 h-10" />,
                title: '맞춤 개선안',
                description: 'AI가 분석한 맞춤형 권장사항으로 블로그를 성장시키세요.',
                gradient: 'from-orange-500 to-yellow-500'
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -10 }}
                className="group relative glass rounded-3xl p-8 hover:shadow-2xl transition-all duration-300"
              >
                <div className={`inline-flex p-3 rounded-2xl bg-gradient-to-br ${feature.gradient} text-white mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-20 bg-gradient-to-br from-purple-100 via-pink-100 to-orange-100">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto text-center"
          >
            <div className="inline-flex items-center gap-2 mb-6">
              <Users className="w-6 h-6 text-purple-600" />
              <span className="text-purple-600 font-semibold">10,000+ 블로거가 사용중</span>
            </div>

            <h2 className="text-4xl font-bold mb-12">
              성공한 블로거들의 선택
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  name: '김지은',
                  role: '라이프스타일 블로거',
                  avatar: '👩‍💼',
                  content: '지수가 Level 3에서 Level 9로 상승했어요! 정말 정확한 분석이에요.'
                },
                {
                  name: '박민수',
                  role: 'IT 블로거',
                  avatar: '👨‍💻',
                  content: 'SEO 개선 팁 덕분에 방문자가 3배 증가했습니다. 강력 추천!'
                },
                {
                  name: '이서연',
                  role: '맛집 블로거',
                  avatar: '👩‍🍳',
                  content: '매일 체크하는 필수 도구예요. VIEW 탭 진입도 쉬워졌어요!'
                },
              ].map((testimonial, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="glass rounded-3xl p-6 hover:shadow-xl transition-all duration-300"
                >
                  <div className="text-5xl mb-4">{testimonial.avatar}</div>
                  <p className="text-gray-700 mb-4 italic">"{testimonial.content}"</p>
                  <div className="font-semibold">{testimonial.name}</div>
                  <div className="text-sm text-gray-500">{testimonial.role}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 instagram-gradient opacity-90" />

        <div className="relative container mx-auto px-4 text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto"
          >
            <h2 className="text-5xl font-bold mb-6">
              지금 바로 시작하세요
            </h2>
            <p className="text-xl mb-10 text-white/90">
              무료로 블로그 지수를 확인하고,
              <br />
              성장 전략을 받아보세요
            </p>
            <Link
              href="/analyze"
              className="inline-flex items-center gap-2 px-10 py-5 bg-white text-purple-600 rounded-full font-bold text-lg hover:scale-105 transition-transform duration-300 shadow-2xl"
            >
              <Sparkles className="w-6 h-6" />
              무료 분석 시작
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold gradient-text">Blog Index Analyzer</span>
              <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">v1.2.0</span>
            </div>
            <div className="text-sm text-gray-400">
              © 2024 플라톤 마케팅. All rights reserved.
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>AI 학습 엔진 탑재</span>
              <span>•</span>
              <span>실시간 분석</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
