'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  BarChart3,
  Clock,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  Target
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import {
  getTrackedBlogs,
  registerBlog,
  deleteTrackedBlog,
  startRankCheck,
  getTaskStatus,
  type TrackedBlog,
  type TaskStatus
} from '@/lib/api/rankTracker'

export default function RankTrackerPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()

  const [blogs, setBlogs] = useState<TrackedBlog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newBlogId, setNewBlogId] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  // 순위 확인 진행 상태
  const [runningTask, setRunningTask] = useState<TaskStatus | null>(null)
  const [checkingBlogId, setCheckingBlogId] = useState<string | null>(null)

  const loadBlogs = useCallback(async () => {
    if (!user?.id) return

    try {
      setIsLoading(true)
      const data = await getTrackedBlogs(user.id)
      setBlogs(data.blogs)
    } catch (error) {
      console.error('Failed to load blogs:', error)
      toast.error('블로그 목록을 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      loadBlogs()
    }
  }, [isAuthenticated, user?.id, loadBlogs])

  // 진행 상태 폴링
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (runningTask && runningTask.status === 'running') {
      interval = setInterval(async () => {
        try {
          const status = await getTaskStatus(runningTask.task_id)
          setRunningTask(status)

          if (status.status === 'completed') {
            toast.success('순위 확인이 완료되었습니다!')
            setCheckingBlogId(null)
            loadBlogs()
          } else if (status.status === 'error') {
            toast.error(status.error_message || '순위 확인 중 오류가 발생했습니다.')
            setCheckingBlogId(null)
          }
        } catch (error) {
          console.error('Failed to get task status:', error)
        }
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [runningTask, loadBlogs])

  const handleAddBlog = async () => {
    if (!user?.id || !newBlogId.trim()) return

    try {
      setIsAdding(true)
      const result = await registerBlog(user.id, newBlogId.trim())
      toast.success(result.message)
      setShowAddModal(false)
      setNewBlogId('')
      loadBlogs()
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (detail?.error === 'plan_limit_exceeded') {
        toast.error(detail.message)
      } else {
        toast.error('블로그 등록에 실패했습니다.')
      }
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteBlog = async (blogId: string) => {
    if (!user?.id) return

    if (!confirm('이 블로그를 삭제하시겠습니까? 모든 순위 기록이 삭제됩니다.')) {
      return
    }

    try {
      await deleteTrackedBlog(user.id, blogId)
      toast.success('블로그가 삭제되었습니다.')
      loadBlogs()
    } catch (error) {
      toast.error('블로그 삭제에 실패했습니다.')
    }
  }

  const handleStartCheck = async (blogId: string) => {
    if (!user?.id) return

    try {
      setCheckingBlogId(blogId)
      const result = await startRankCheck(user.id, blogId, 50, false)
      toast.success(result.message)

      // 상태 폴링 시작
      const status = await getTaskStatus(result.task_id)
      setRunningTask(status)
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (detail?.error === 'task_already_running') {
        toast.error('이미 실행 중인 작업이 있습니다.')
        setRunningTask({ task_id: detail.task_id, status: 'running' } as TaskStatus)
      } else {
        toast.error('순위 확인 시작에 실패했습니다.')
      }
      setCheckingBlogId(null)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">로그인이 필요합니다</h2>
          <button
            onClick={() => router.push('/login')}
            className="mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            로그인하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Target className="w-8 h-8 text-purple-600" />
                순위 추적
              </h1>
              <p className="text-gray-600 mt-1">내 블로그 포스팅의 검색 순위를 추적하세요</p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors shadow-lg"
          >
            <Plus className="w-5 h-5" />
            블로그 추가
          </button>
        </div>

        {/* 진행 상태 카드 */}
        <AnimatePresence>
          {runningTask && runningTask.status === 'running' && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 bg-white rounded-2xl shadow-lg p-6 border border-purple-100"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">순위 확인 중...</h3>
                    <p className="text-sm text-gray-500">
                      {runningTask.current_keyword || '키워드 분석 중'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-purple-600">
                    {Math.round(runningTask.progress * 100)}%
                  </div>
                  <div className="text-sm text-gray-500">
                    {runningTask.completed_keywords}/{runningTask.total_keywords} 키워드
                  </div>
                </div>
              </div>

              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${runningTask.progress * 100}%` }}
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 블로그 목록 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
          </div>
        ) : blogs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-lg p-12 text-center"
          >
            <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="w-10 h-10 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              등록된 블로그가 없습니다
            </h3>
            <p className="text-gray-600 mb-6">
              블로그를 추가하고 순위를 추적해보세요
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
            >
              첫 번째 블로그 추가하기
            </button>
          </motion.div>
        ) : (
          <div className="grid gap-4">
            {blogs.map((blog, index) => (
              <motion.div
                key={blog.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">
                        {blog.blog_name || blog.blog_id}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <BarChart3 className="w-4 h-4" />
                          {blog.posts_count}개 포스팅
                        </span>
                        {blog.last_checked_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {new Date(blog.last_checked_at).toLocaleDateString('ko-KR')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`https://blog.naver.com/${blog.blog_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>

                    <button
                      onClick={() => handleStartCheck(blog.blog_id)}
                      disabled={checkingBlogId === blog.blog_id}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
                    >
                      {checkingBlogId === blog.blog_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      순위 확인
                    </button>

                    <button
                      onClick={() => router.push(`/dashboard/rank-tracker/${blog.blog_id}`)}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <BarChart3 className="w-4 h-4" />
                      상세 보기
                    </button>

                    <button
                      onClick={() => handleDeleteBlog(blog.blog_id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* 블로그 추가 모달 */}
        <AnimatePresence>
          {showAddModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setShowAddModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md"
              >
                <h2 className="text-xl font-bold text-gray-900 mb-4">블로그 추가</h2>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    블로그 ID
                  </label>
                  <input
                    type="text"
                    value={newBlogId}
                    onChange={(e) => setNewBlogId(e.target.value)}
                    placeholder="예: myblog123"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    blog.naver.com/<span className="text-purple-600 font-medium">myblog123</span> → myblog123 입력
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAddBlog}
                    disabled={isAdding || !newBlogId.trim()}
                    className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isAdding ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Plus className="w-5 h-5" />
                    )}
                    추가
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
