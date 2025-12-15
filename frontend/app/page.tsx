'use client'

import { motion } from 'framer-motion'
import { Sparkles, TrendingUp, Zap, Award, Users, BarChart3, LogOut, Search, BookOpen, ArrowRight, Building2, Mic } from 'lucide-react'
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
              <span className="text-sm font-medium">블랭크 - AI 기반 블로그 분석 플랫폼</span>
              <span className="text-xs text-purple-500 bg-purple-100 px-2 py-0.5 rounded-full font-semibold">v1.2.0</span>
            </motion.div>

            {/* Main Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-6xl md:text-7xl font-bold mb-6"
            >
              <span className="gradient-text">블랭크</span>
              <br />
              <span className="text-gray-900">블로그 지수 분석</span>
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
                <Mic className="w-5 h-5" />
                AI 자동 글쓰기
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

            {/* Platon Marketing Premium Banner */}
            <motion.a
              href="https://www.brandplaton.com/"
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              whileHover={{ scale: 1.02 }}
              className="group block mt-12 relative overflow-hidden rounded-2xl bg-black text-white shadow-2xl hover:shadow-purple-500/25 transition-all duration-500 cursor-pointer"
            >
              {/* Animated gradient border */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute inset-[2px] bg-black rounded-2xl" />

              {/* Content */}
              <div className="relative p-6 flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-purple-400 tracking-wider uppercase">Premium Partner</span>
                      <span className="px-2 py-0.5 text-[10px] bg-gradient-to-r from-purple-500 to-pink-500 rounded-full font-bold">HOT</span>
                    </div>
                    <div className="text-xl font-bold">병원 매출, 3개월 만에 2배 성장시킨 비결</div>
                    <div className="text-sm text-gray-400 mt-1">플라톤마케팅 | 70+ 병원이 선택한 마케팅 파트너</div>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black font-semibold group-hover:bg-gradient-to-r group-hover:from-purple-500 group-hover:to-pink-500 group-hover:text-white transition-all duration-300">
                  <span>성공 사례 보기</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </motion.a>
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

          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                icon: <TrendingUp className="w-10 h-10" />,
                title: '실시간 지수 측정',
                description: '11단계 레벨 시스템으로 블로그 등급을 정확하게 평가합니다.',
                gradient: 'from-purple-500 to-pink-500',
                link: '/analyze'
              },
              {
                icon: <BarChart3 className="w-10 h-10" />,
                title: '상세한 분석',
                description: '신뢰도, 콘텐츠, 참여도, SEO, 트래픽을 종합 분석합니다.',
                gradient: 'from-pink-500 to-orange-500',
                link: '/keyword-search'
              },
              {
                icon: <Award className="w-10 h-10" />,
                title: '맞춤 개선안',
                description: 'AI가 분석한 맞춤형 권장사항으로 블로그를 성장시키세요.',
                gradient: 'from-orange-500 to-yellow-500',
                link: '/dashboard'
              },
              {
                icon: <BookOpen className="w-10 h-10" />,
                title: '글쓰기 가이드',
                description: '상위 글 분석 데이터 기반 실시간 최적화 가이드를 제공합니다.',
                gradient: 'from-green-500 to-teal-500',
                link: '/writing-guide',
                isNew: true
              },
            ].map((feature, index) => (
              <Link key={index} href={feature.link || '#'}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -10 }}
                  className="group relative glass rounded-3xl p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer h-full"
                >
                  {feature.isNew && (
                    <span className="absolute top-4 right-4 px-2 py-1 text-xs font-bold bg-green-500 text-white rounded-full">
                      NEW
                    </span>
                  )}
                  <div className={`inline-flex p-3 rounded-2xl bg-gradient-to-br ${feature.gradient} text-white mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </motion.div>
              </Link>
            ))}
          </div>

          {/* Platon Marketing Success Story */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-20"
          >
            <a
              href="https://www.brandplaton.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="group block relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 md:p-10 cursor-pointer"
            >
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl" />

              <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm mb-4">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs font-medium text-white/80">실시간 상담 가능</span>
                  </div>

                  <h3 className="text-3xl md:text-4xl font-bold text-white mb-3">
                    블로그 상위노출,<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">전문가에게 맡기세요</span>
                  </h3>

                  <p className="text-gray-300 text-lg mb-6 max-w-lg">
                    70개 이상의 병원이 플라톤마케팅과 함께 성장했습니다.
                    데이터 기반 마케팅으로 확실한 결과를 만들어드립니다.
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span>무료 블로그 진단</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span>맞춤 전략 제안</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span>월 리포트 제공</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <Building2 className="w-10 h-10 text-white" />
                  </div>
                  <button className="px-8 py-4 rounded-full bg-white text-gray-900 font-bold text-lg group-hover:bg-gradient-to-r group-hover:from-purple-500 group-hover:to-pink-500 group-hover:text-white transition-all duration-300 shadow-xl flex items-center gap-2">
                    무료 상담 신청
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </a>
          </motion.div>
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
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/analyze"
                className="inline-flex items-center gap-2 px-10 py-5 bg-white text-purple-600 rounded-full font-bold text-lg hover:scale-105 transition-transform duration-300 shadow-2xl"
              >
                <Sparkles className="w-6 h-6" />
                무료 분석 시작
              </Link>
              <a
                href="https://www.brandplaton.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-3 px-10 py-5 bg-white/10 backdrop-blur-md text-white border border-white/30 rounded-full font-bold text-lg hover:bg-white hover:text-purple-600 transition-all duration-300"
              >
                <Building2 className="w-5 h-5" />
                <span>전문가 상담받기</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Platon Marketing Showcase */}
      <section className="py-20 bg-black relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-600/20 rounded-full blur-[120px]" />
        </div>

        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-purple-500/30 bg-purple-500/10 mb-8">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-sm text-purple-300 font-medium">Trusted by 70+ Healthcare Partners</span>
            </div>

            <h3 className="text-4xl md:text-6xl font-bold text-white mb-6">
              마케팅, 결과로 증명합니다
            </h3>

            <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
              데이터 기반 전략으로 병원 매출 성장을 이끌어드립니다
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto mb-12">
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">70+</div>
                <div className="text-gray-500 text-sm">파트너 병원</div>
              </div>
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">200%</div>
                <div className="text-gray-500 text-sm">평균 성장률</div>
              </div>
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">3개월</div>
                <div className="text-gray-500 text-sm">성과 달성</div>
              </div>
            </div>

            <a
              href="https://www.brandplaton.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full font-bold text-lg hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300"
            >
              <span>성공 사례 확인하기</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg font-bold gradient-text">블랭크</span>
                <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">v1.2.0</span>
              </div>
              <p className="text-sm text-gray-400">
                AI 기반 블로그 분석 플랫폼으로<br />
                블로그 성장을 도와드립니다.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">서비스</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/analyze" className="hover:text-white transition-colors">블로그 분석</Link></li>
                <li><Link href="/keyword-search" className="hover:text-white transition-colors">키워드 검색</Link></li>
                <li><Link href="/dashboard" className="hover:text-white transition-colors">대시보드</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">플라톤마케팅</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <a href="https://www.brandplaton.com/" target="_blank" rel="noopener noreferrer" className="hover:text-purple-400 transition-colors flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    병원마케팅 전문
                  </a>
                </li>
                <li>
                  <a href="https://www.brandplaton.com/" target="_blank" rel="noopener noreferrer" className="hover:text-purple-400 transition-colors flex items-center gap-2">
                    <ArrowRight className="w-4 h-4" />
                    무료 상담 신청
                  </a>
                </li>
                <li>
                  <a href="https://doctor-voice-pro-ghwi.vercel.app/" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors flex items-center gap-2">
                    <Mic className="w-4 h-4" />
                    AI 자동 글쓰기
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-400">
              © 2024 <a href="https://www.brandplaton.com/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 transition-colors font-medium">플라톤마케팅</a>. All rights reserved.
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>AI 학습 엔진 탑재</span>
              <span>•</span>
              <span>실시간 분석</span>
              <span>•</span>
              <a href="https://www.brandplaton.com/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 transition-colors">
                병원마케팅 문의
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
