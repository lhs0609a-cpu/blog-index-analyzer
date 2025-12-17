'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  BarChart3,
  RefreshCw,
  Download,
  ExternalLink,
  Search,
  Clock,
  Target,
  Award,
  AlertCircle,
  Loader2,
  CheckCircle,
  XCircle,
  Minus
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import {
  getRankResults,
  getRankHistory,
  startRankCheck,
  getTaskStatus,
  exportToExcel,
  downloadExcel,
  type RankResult,
  type RankStatistics,
  type RankHistory,
  type TaskStatus
} from '@/lib/api/rankTracker'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts'

interface PageProps {
  params: Promise<{ blogId: string }>
}

export default function RankTrackerDetailPage({ params }: PageProps) {
  const { blogId } = use(params)
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()

  const [isLoading, setIsLoading] = useState(true)
  const [blogName, setBlogName] = useState<string | null>(null)
  const [results, setResults] = useState<RankResult[]>([])
  const [statistics, setStatistics] = useState<RankStatistics | null>(null)
  const [history, setHistory] = useState<RankHistory[]>([])
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)

  // 순위 확인 상태
  const [isChecking, setIsChecking] = useState(false)
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null)

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'results' | 'history'>('results')

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      loadData()
    }
  }, [isAuthenticated, user, blogId])

  // 진행 상태 폴링
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (taskStatus && taskStatus.status === 'running') {
      interval = setInterval(async () => {
        try {
          const status = await getTaskStatus(taskStatus.task_id)
          setTaskStatus(status)

          if (status.status === 'completed') {
            toast.success('순위 확인이 완료되었습니다!')
            setIsChecking(false)
            loadData()
          } else if (status.status === 'error') {
            toast.error(status.error_message || '순위 확인 중 오류가 발생했습니다.')
            setIsChecking(false)
          }
        } catch (error) {
          console.error('Failed to get task status:', error)
        }
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [taskStatus])

  const loadData = async () => {
    if (!user?.id) return

    try {
      setIsLoading(true)

      const [resultsData, historyData] = await Promise.all([
        getRankResults(user.id, blogId),
        getRankHistory(user.id, blogId, 30)
      ])

      setBlogName(resultsData.blog.blog_name)
      setResults(resultsData.results)
      setStatistics(resultsData.statistics)
      setLastCheckedAt(resultsData.last_checked_at)
      setHistory(historyData.history)
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('데이터를 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartCheck = async () => {
    if (!user?.id) return

    try {
      setIsChecking(true)
      const result = await startRankCheck(user.id, blogId, 50, true)
      toast.success(result.message)

      const status = await getTaskStatus(result.task_id)
      setTaskStatus(status)
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (detail?.error === 'task_already_running') {
        toast.error('이미 실행 중인 작업이 있습니다.')
      } else {
        toast.error('순위 확인 시작에 실패했습니다.')
      }
      setIsChecking(false)
    }
  }

  const handleExportExcel = async () => {
    if (!user?.id) return

    try {
      const blob = await exportToExcel(user.id, blogId)
      const filename = `blog_rank_report_${blogId}_${new Date().toISOString().split('T')[0]}.xlsx`
      downloadExcel(blob, filename)
      toast.success('Excel 파일이 다운로드되었습니다.')
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (detail?.error === 'feature_not_available') {
        toast.error(detail.message)
      } else {
        toast.error('Excel 다운로드에 실패했습니다.')
      }
    }
  }

  const getRankBadge = (rank: number | null) => {
    if (rank === null) {
      return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">-</span>
    }
    if (rank <= 3) {
      return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">{rank}위</span>
    }
    if (rank <= 7) {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">{rank}위</span>
    }
    if (rank <= 10) {
      return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">{rank}위</span>
    }
    return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">{rank}위</span>
  }

  if (!isAuthenticated) {
    return null
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    )
  }

  // 차트 데이터 준비
  const distributionData = statistics ? [
    { name: '상위권\n(1-3위)', blog: statistics.blog_tab.top3_count, view: statistics.view_tab.top3_count },
    { name: '중위권\n(4-7위)', blog: statistics.blog_tab.mid_count, view: statistics.view_tab.mid_count },
    { name: '하위권\n(8-10위)', blog: statistics.blog_tab.low_count, view: statistics.view_tab.low_count },
  ] : []

  const exposureData = statistics ? [
    { name: '노출', value: statistics.blog_tab.exposed_count, fill: '#10b981' },
    { name: '미노출', value: statistics.total_keywords - statistics.blog_tab.exposed_count, fill: '#ef4444' },
  ] : []

  const historyChartData = history.map(h => ({
    date: h.check_date.split('-').slice(1).join('/'),
    blog: h.avg_blog_rank || 0,
    view: h.avg_view_rank || 0,
    exposure: h.blog_exposed
  })).reverse()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard/rank-tracker')}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {blogName || blogId}
              </h1>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                <a
                  href={`https://blog.naver.com/${blogId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-purple-600"
                >
                  blog.naver.com/{blogId}
                  <ExternalLink className="w-3 h-3" />
                </a>
                {lastCheckedAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    마지막 확인: {new Date(lastCheckedAt).toLocaleString('ko-KR')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-xl hover:bg-gray-50 transition-colors border border-gray-200"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
            <button
              onClick={handleStartCheck}
              disabled={isChecking}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {isChecking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              순위 확인
            </button>
          </div>
        </div>

        {/* 진행 상태 */}
        {taskStatus && taskStatus.status === 'running' && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-white rounded-2xl shadow-lg p-6 border border-purple-100"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                <div>
                  <span className="font-medium">순위 확인 중...</span>
                  <span className="text-gray-500 ml-2">{taskStatus.current_keyword}</span>
                </div>
              </div>
              <span className="text-purple-600 font-bold">
                {Math.round(taskStatus.progress * 100)}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                style={{ width: `${taskStatus.progress * 100}%` }}
              />
            </div>
          </motion.div>
        )}

        {/* 통계 카드 */}
        {statistics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Search className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-gray-600">총 키워드</span>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {statistics.total_keywords}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-gray-600">노출률</span>
              </div>
              <div className="text-3xl font-bold text-green-600">
                {statistics.blog_tab.exposure_rate}%
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-gray-600">평균 순위</span>
              </div>
              <div className="text-3xl font-bold text-blue-600">
                {statistics.blog_tab.avg_rank > 0 ? statistics.blog_tab.avg_rank.toFixed(1) : '-'}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Award className="w-5 h-5 text-yellow-600" />
                </div>
                <span className="text-gray-600">상위권 (1-3위)</span>
              </div>
              <div className="text-3xl font-bold text-yellow-600">
                {statistics.blog_tab.top3_count}개
              </div>
            </motion.div>
          </div>
        )}

        {/* 차트 영역 */}
        {statistics && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* 순위 분포 차트 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">순위 분포</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distributionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="blog" name="블로그탭" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="view" name="VIEW탭" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* 노출률 차트 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl shadow-lg p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">노출 현황</h3>
              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={exposureData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {exposureData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>
        )}

        {/* 히스토리 차트 */}
        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-lg p-6 mb-8"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">순위 추이 (최근 30일)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis reversed domain={[1, 10]} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="blog"
                    name="블로그탭 평균"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="view"
                    name="VIEW탭 평균"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ fill: '#f59e0b' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* 결과 테이블 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg overflow-hidden"
        >
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">상세 결과</h3>
          </div>

          {results.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">순위 데이터가 없습니다. 순위 확인을 실행해주세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">No</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">키워드</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-600">포스팅 제목</th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-gray-600">블로그탭</th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-gray-600">VIEW탭</th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-gray-600">확인일시</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((result, index) => (
                    <tr key={result.keyword_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-600">{index + 1}</td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-purple-600">{result.keyword}</span>
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={result.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-gray-900 hover:text-purple-600 flex items-center gap-1"
                        >
                          {result.post_title.length > 40
                            ? result.post_title.substring(0, 40) + '...'
                            : result.post_title}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getRankBadge(result.rank_blog_tab)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getRankBadge(result.rank_view_tab)}
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-gray-500">
                        {result.checked_at
                          ? new Date(result.checked_at).toLocaleDateString('ko-KR')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
