'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Heart, MessageCircle, Eye, Sparkles, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { getUserBlogs } from '@/lib/api/blog'
import type { BlogListItem } from '@/lib/types/api'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const [myBlogs, setMyBlogs] = useState<BlogListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadBlogs()
  }, [])

  const loadBlogs = async () => {
    setIsLoading(true)
    try {
      const blogs = await getUserBlogs()
      setMyBlogs(blogs)
    } catch (error) {
      console.error('Failed to load blogs:', error)
      toast.error('블로그 목록을 불러오는데 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredBlogs = myBlogs.filter(blog =>
    blog.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    blog.blog_id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Mock data for initial demo
  const demoBlogs: BlogListItem[] = [
    {
      id: 1,
      blog_id: 'food_blog',
      name: '맛집 탐방 블로그',
      avatar: '🍽️',
      level: 7,
      grade: '준최적화7',
      score: 72.5,
      change: +2.5,
      stats: {
        posts: 150,
        visitors: 2450,
        engagement: 145
      }
    },
    {
      id: 2,
      blog_id: 'travel_blog',
      name: '여행 일기',
      avatar: '✈️',
      level: 5,
      grade: '준최적화5',
      score: 62.0,
      change: +1.2,
      stats: {
        posts: 89,
        visitors: 1200,
        engagement: 78
      }
    },
    {
      id: 3,
      blog_id: 'tech_blog',
      name: '테크 리뷰',
      avatar: '💻',
      level: 9,
      grade: '최적화2',
      score: 86.5,
      change: -0.5,
      stats: {
        posts: 234,
        visitors: 5600,
        engagement: 412
      }
    },
  ]

  // Combine actual blogs with demo blogs if no blogs exist
  const displayBlogs = myBlogs.length > 0 ? filteredBlogs : demoBlogs

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              <span className="gradient-text">대시보드</span>
            </h1>
            <p className="text-gray-600">내 블로그 지수를 한눈에 확인하세요</p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/keyword-search"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-white border-2 border-purple-500 text-purple-600 font-semibold hover:shadow-lg transition-all duration-300"
            >
              <Search className="w-5 h-5" />
              키워드 검색
            </Link>
            <Link
              href="/analyze"
              className="flex items-center gap-2 px-6 py-3 rounded-full instagram-gradient text-white font-semibold hover:shadow-lg transition-all duration-300"
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
          className="glass rounded-3xl p-8 mb-8 bg-gradient-to-br from-purple-50 to-pink-50"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full instagram-gradient flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold gradient-text">키워드 지수분석</h2>
                <p className="text-sm text-gray-600">경쟁 키워드의 상위 블로그들을 분석하세요</p>
              </div>
            </div>
            <Link
              href="/keyword-search"
              className="flex items-center gap-2 px-6 py-3 rounded-full instagram-gradient text-white font-semibold hover:shadow-lg transition-all duration-300"
            >
              <Search className="w-5 h-5" />
              분석 시작
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Eye className="w-4 h-4 text-purple-600" />
                </div>
                <span className="font-semibold text-gray-700">상위 노출 분석</span>
              </div>
              <p className="text-sm text-gray-500">
                키워드 검색 시 상위에 노출되는 블로그들의 지수를 파악합니다
              </p>
            </div>

            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-pink-600" />
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

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-4 mb-8"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="블로그 검색..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-transparent focus:border-purple-500 focus:outline-none transition-all"
            />
          </div>
        </motion.div>

        {/* Blog Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="inline-flex p-6 rounded-full instagram-gradient mb-4"
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>
              <p className="text-gray-600">블로그 목록을 불러오는 중...</p>
            </div>
          </div>
        ) : displayBlogs.length === 0 ? (
          <div className="col-span-full text-center py-20">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-bold mb-2">검색 결과가 없습니다</h3>
            <p className="text-gray-600">다른 키워드로 검색해보세요</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayBlogs.map((blog, index) => (
            <Link key={blog.id} href={`/blog/${blog.blog_id}`}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className="glass rounded-3xl p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer"
              >
              {/* Blog Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full instagram-gradient flex items-center justify-center text-3xl">
                  {blog.avatar}
                </div>

                <div className="flex-1">
                  <h3 className="font-bold text-lg">{blog.name}</h3>
                  <p className="text-sm text-gray-500">@{blog.blog_id}</p>
                </div>

                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center cursor-pointer"
                >
                  <Sparkles className="w-5 h-5 text-purple-600" />
                </motion.div>
              </div>

              {/* Level Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 mb-4">
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
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button className="py-2 px-4 rounded-xl bg-purple-100 text-purple-700 font-semibold hover:bg-purple-200 transition-colors">
                  상세보기
                </button>
                <button className="py-2 px-4 rounded-xl instagram-gradient text-white font-semibold hover:shadow-lg transition-all">
                  재분석
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
              className="glass rounded-3xl p-6 flex flex-col items-center justify-center hover:shadow-2xl transition-all duration-300 cursor-pointer border-2 border-dashed border-purple-300"
            >
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 text-purple-600" />
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
                color: 'purple'
              },
              {
                label: '평균 레벨',
                value: avgLevel,
                icon: '⭐',
                color: 'pink'
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
              className="glass rounded-2xl p-6 text-center hover:shadow-xl transition-all duration-300"
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
