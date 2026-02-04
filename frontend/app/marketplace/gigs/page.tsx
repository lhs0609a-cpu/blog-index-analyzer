'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Briefcase, Target, DollarSign, Clock, Users, Star,
  ChevronRight, Search, Filter, TrendingUp, Award, Zap
} from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import {
  getOpenRequests,
  createBid,
  GigRequest,
  formatBudget,
  getStatusColor,
  getStatusLabel
} from '@/lib/api/marketplace'
import toast from 'react-hot-toast'

export default function GigsPage() {
  const { user, isAuthenticated } = useAuthStore()
  const [requests, setRequests] = useState<GigRequest[]>([])
  const [bloggerLevel, setBloggerLevel] = useState(5)
  const [isLoading, setIsLoading] = useState(true)

  // 필터
  const [blogId, setBlogId] = useState('')
  const [category, setCategory] = useState('')
  const [minBudget, setMinBudget] = useState<number | undefined>()

  // 선택된 의뢰
  const [selectedRequest, setSelectedRequest] = useState<GigRequest | null>(null)

  // 입찰 모달
  const [showBidModal, setShowBidModal] = useState(false)
  const [bidAmount, setBidAmount] = useState(0)
  const [bidMessage, setBidMessage] = useState('')
  const [isSubmittingBid, setIsSubmittingBid] = useState(false)

  useEffect(() => {
    loadRequests()
  }, [blogId, category, minBudget])

  const loadRequests = async () => {
    setIsLoading(true)
    try {
      const result = await getOpenRequests({
        blogId: blogId || undefined,
        category: category || undefined,
        minBudget
      })
      setRequests(result.requests || [])
      setBloggerLevel(result.blogger_level || 0)
    } catch (err) {
      console.error('Failed to load requests:', err)
      toast.error('의뢰 목록을 불러오는데 실패했습니다')
      setRequests([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleBid = async () => {
    if (!isAuthenticated || !user) {
      toast.error('로그인이 필요합니다')
      return
    }

    if (!blogId) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    if (!selectedRequest) return

    if (bidAmount < 10000) {
      toast.error('입찰 금액은 10,000원 이상이어야 합니다')
      return
    }

    setIsSubmittingBid(true)

    try {
      await createBid(user.id, {
        request_id: selectedRequest.id,
        blog_id: blogId,
        bid_amount: bidAmount,
        message: bidMessage || undefined
      })

      toast.success('입찰이 완료되었습니다!')
      setShowBidModal(false)
      setBidAmount(0)
      setBidMessage('')
      loadRequests()
    } catch (err) {
      console.error('Failed to create bid:', err)
      toast.error('입찰에 실패했습니다')
    } finally {
      setIsSubmittingBid(false)
    }
  }

  const categories = [
    '맛집', '카페', '여행', '숙소', '뷰티', '화장품',
    '병원', '피부과', '성형', '육아', '교육', 'IT',
    '가전', '자동차', '부동산', '패션', '인테리어', '기타'
  ]

  const getRemainingTime = (expiresAt: string | null) => {
    if (!expiresAt) return ''
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return '마감'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours >= 24) return `${Math.floor(hours / 24)}일 남음`
    return `${hours}시간 남음`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pt-24">
      <div className="container mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                💼 의뢰 찾기
              </span>
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              내 레벨로 도전 가능한 의뢰를 찾아보세요
            </p>
          </div>

          <Link
            href="/marketplace/my-bids"
            className="px-4 py-2 bg-green-100 text-green-700 rounded-xl font-medium hover:bg-green-200 transition-colors"
          >
            내 입찰 내역
          </Link>
        </div>

        {/* 블로그 ID 입력 */}
        <div className="bg-white rounded-2xl p-6 shadow-lg mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            내 블로그 ID (1위 확률 계산용)
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={blogId}
              onChange={(e) => setBlogId(e.target.value)}
              placeholder="예: myblog123"
              className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-green-400 focus:outline-none"
            />
            <button
              onClick={loadRequests}
              className="px-6 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
            >
              적용
            </button>
          </div>
          {blogId && (
            <p className="text-sm text-green-600 mt-2">
              내 레벨: Lv.{bloggerLevel}
            </p>
          )}
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-green-400"
          >
            <option value="">전체 카테고리</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={minBudget?.toString() || ''}
            onChange={(e) => setMinBudget(e.target.value ? parseInt(e.target.value) : undefined)}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-green-400"
          >
            <option value="">최소 예산</option>
            <option value="50000">5만원 이상</option>
            <option value="100000">10만원 이상</option>
            <option value="150000">15만원 이상</option>
            <option value="200000">20만원 이상</option>
          </select>
        </div>

        {/* 의뢰 목록 */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl p-6 animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : requests.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  열린 의뢰가 없습니다
                </h3>
                <p className="text-gray-500 text-sm">
                  조건에 맞는 의뢰가 없거나, 나중에 다시 확인해주세요.
                </p>
              </div>
            ) : (
              requests.map((request, index) => (
                <motion.div
                  key={request.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedRequest(request)}
                  className={`bg-white rounded-2xl p-6 cursor-pointer transition-all ${
                    selectedRequest?.id === request.id
                      ? 'ring-2 ring-green-400 shadow-lg'
                      : 'hover:shadow-md border border-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-gray-900">
                          {request.keyword}
                        </span>
                        {request.category && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {request.category}
                          </span>
                        )}
                      </div>
                      {request.business_name && (
                        <p className="text-sm text-gray-500">
                          {request.business_name}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-bold text-green-600">
                        {formatBudget(request.budget_min, request.budget_max)}
                      </div>
                      <div className="text-xs text-gray-500">예산</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Target className="w-4 h-4" />
                        {request.target_rank_min}~{request.target_rank_max}위
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        {request.maintain_days}일 유지
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Users className="w-4 h-4" />
                        {request.bid_count}명 입찰
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      {request.my_win_probability !== undefined && (
                        <span className={`px-2 py-1 rounded-full ${
                          request.my_win_probability >= 80
                            ? 'bg-green-100 text-green-700'
                            : request.my_win_probability >= 60
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          1위 확률 {request.my_win_probability}%
                        </span>
                      )}
                      <span className="text-orange-600">
                        {getRemainingTime(request.expires_at)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          {/* 선택된 의뢰 상세 */}
          <div className="lg:col-span-1">
            <AnimatePresence mode="wait">
              {selectedRequest && (
                <motion.div
                  key={selectedRequest.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white rounded-2xl p-6 shadow-lg border border-green-100 sticky top-24"
                >
                  <h3 className="text-xl font-bold mb-2">{selectedRequest.keyword}</h3>
                  {selectedRequest.business_name && (
                    <p className="text-gray-500 mb-4">{selectedRequest.business_name}</p>
                  )}

                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">예산</span>
                      <span className="font-semibold text-green-600">
                        {formatBudget(selectedRequest.budget_min, selectedRequest.budget_max)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">목표 순위</span>
                      <span className="font-medium">
                        {selectedRequest.target_rank_min}~{selectedRequest.target_rank_max}위
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">유지 기간</span>
                      <span className="font-medium">{selectedRequest.maintain_days}일</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">글 조건</span>
                      <span className="font-medium">
                        {selectedRequest.min_word_count.toLocaleString()}자, 사진 {selectedRequest.photo_count}장
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">현재 입찰</span>
                      <span className="font-medium">{selectedRequest.bid_count}명</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">입찰 마감</span>
                      <span className="font-medium text-orange-600">
                        {getRemainingTime(selectedRequest.expires_at)}
                      </span>
                    </div>
                  </div>

                  {selectedRequest.content_requirements && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">요구사항</h4>
                      <p className="text-sm text-gray-600">{selectedRequest.content_requirements}</p>
                    </div>
                  )}

                  {selectedRequest.my_win_probability !== undefined && (
                    <div className={`mb-6 p-4 rounded-xl ${
                      selectedRequest.my_win_probability >= 80
                        ? 'bg-green-50'
                        : selectedRequest.my_win_probability >= 60
                        ? 'bg-blue-50'
                        : 'bg-yellow-50'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4" />
                        <span className="font-semibold">내 1위 확률</span>
                      </div>
                      <div className="text-2xl font-bold">
                        {selectedRequest.my_win_probability}%
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        현재 1위 레벨: Lv.{selectedRequest.current_rank1_level || '?'} / 내 레벨: Lv.{bloggerLevel}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setBidAmount(selectedRequest.budget_min)
                      setShowBidModal(true)
                    }}
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <Zap className="w-5 h-5" />
                    입찰하기
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 입찰 모달 */}
        <AnimatePresence>
          {showBidModal && selectedRequest && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setShowBidModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl p-6 w-full max-w-md"
              >
                <h3 className="text-xl font-bold mb-4">입찰하기</h3>
                <p className="text-gray-500 mb-6">"{selectedRequest.keyword}" 의뢰에 입찰합니다</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      입찰 금액
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₩</span>
                      <input
                        type="number"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(parseInt(e.target.value) || 0)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-green-400 focus:outline-none"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      예산 범위: {formatBudget(selectedRequest.budget_min, selectedRequest.budget_max)}
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      예상 정산액: ₩{Math.floor(bidAmount * 0.9).toLocaleString()} (수수료 10% 제외)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      메시지 (선택)
                    </label>
                    <textarea
                      value={bidMessage}
                      onChange={(e) => setBidMessage(e.target.value)}
                      placeholder="의뢰자에게 전달할 메시지..."
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-green-400 focus:outline-none resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowBidModal(false)}
                    className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleBid}
                    disabled={isSubmittingBid || bidAmount < 10000}
                    className="flex-1 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {isSubmittingBid ? '처리 중...' : '입찰 제출'}
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
