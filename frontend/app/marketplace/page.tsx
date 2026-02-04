'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Briefcase, Users, TrendingUp, DollarSign, Shield,
  ChevronRight, Star, CheckCircle, Zap, Award
} from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/stores/auth'
import { getMarketplaceStats, MarketplaceStats } from '@/lib/api/marketplace'

export default function MarketplacePage() {
  const { user, isAuthenticated } = useAuthStore()
  const [stats, setStats] = useState<MarketplaceStats | null>(null)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await getMarketplaceStats()
      setStats(data)
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 pt-24">
      {/* 히어로 섹션 */}
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-4xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            블로그 상위노출 마켓플레이스
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              원하는 키워드에
            </span>
            <br />
            <span className="text-gray-900">상위노출 보장</span>
          </h1>

          <p className="text-xl text-gray-600 mb-8">
            업체는 원하는 키워드를 의뢰하고, 블로거는 실력으로 입찰하세요.
            <br />
            성과가 검증되면 자동 정산됩니다.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/marketplace/create-request"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
            >
              <Briefcase className="w-5 h-5" />
              상위노출 의뢰하기
              <ChevronRight className="w-5 h-5" />
            </Link>
            <Link
              href="/marketplace/gigs"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all"
            >
              <Users className="w-5 h-5" />
              의뢰 찾아보기 (블로거용)
            </Link>
          </div>
        </motion.div>

        {/* 통계 */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mb-16"
          >
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">
                {stats.total_requests}
              </div>
              <div className="text-sm text-gray-500">총 의뢰</div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <div className="text-3xl font-bold text-green-600 mb-1">
                {stats.completed_contracts}
              </div>
              <div className="text-sm text-gray-500">성공 건수</div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <div className="text-3xl font-bold text-purple-600 mb-1">
                {stats.success_rate.toFixed(0)}%
              </div>
              <div className="text-sm text-gray-500">성공률</div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <div className="text-3xl font-bold text-amber-600 mb-1">
                ₩{(stats.total_volume / 10000).toFixed(0)}만
              </div>
              <div className="text-sm text-gray-500">총 거래액</div>
            </div>
          </motion.div>
        )}

        {/* 작동 방식 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="max-w-5xl mx-auto mb-16"
        >
          <h2 className="text-2xl font-bold text-center mb-8">어떻게 작동하나요?</h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* 업체용 */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-blue-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">업체 (광고주)</h3>
                  <p className="text-sm text-gray-500">상위노출이 필요한 분</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <div className="font-medium">의뢰 등록</div>
                    <div className="text-sm text-gray-500">원하는 키워드와 예산을 입력</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    2
                  </div>
                  <div>
                    <div className="font-medium">블로거 선택</div>
                    <div className="text-sm text-gray-500">입찰한 블로거 중 마음에 드는 분 선택</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    3
                  </div>
                  <div>
                    <div className="font-medium">에스크로 결제</div>
                    <div className="text-sm text-gray-500">안전하게 플랫폼에 예치</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    ✓
                  </div>
                  <div>
                    <div className="font-medium text-green-600">성공 시 자동 정산</div>
                    <div className="text-sm text-gray-500">상위노출 실패 시 전액 환불</div>
                  </div>
                </div>
              </div>

              <Link
                href="/marketplace/create-request"
                className="mt-6 flex items-center justify-center gap-2 w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
              >
                의뢰 등록하기
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* 블로거용 */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-green-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">블로거 (공급자)</h3>
                  <p className="text-sm text-gray-500">실력으로 수익 창출</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <div className="font-medium">의뢰 탐색</div>
                    <div className="text-sm text-gray-500">내 레벨로 도전 가능한 의뢰 확인</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    2
                  </div>
                  <div>
                    <div className="font-medium">입찰</div>
                    <div className="text-sm text-gray-500">원하는 금액으로 입찰</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    3
                  </div>
                  <div>
                    <div className="font-medium">글 작성 & 발행</div>
                    <div className="text-sm text-gray-500">가이드에 맞춰 글 작성</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                    $
                  </div>
                  <div>
                    <div className="font-medium text-amber-600">목표 달성 시 정산</div>
                    <div className="text-sm text-gray-500">수수료 10% 제외 후 입금</div>
                  </div>
                </div>
              </div>

              <Link
                href="/marketplace/gigs"
                className="mt-6 flex items-center justify-center gap-2 w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
              >
                의뢰 찾아보기
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </motion.div>

        {/* 장점 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-4xl mx-auto mb-16"
        >
          <h2 className="text-2xl font-bold text-center mb-8">왜 블랭크 마켓인가요?</h2>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="font-bold mb-2">에스크로 결제</h3>
              <p className="text-sm text-gray-500">
                결제 금액은 플랫폼에 안전하게 보관.
                상위노출 실패 시 전액 환불됩니다.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="font-bold mb-2">자동 검증</h3>
              <p className="text-sm text-gray-500">
                순위 자동 체크 시스템으로
                목표 달성 여부를 객관적으로 확인합니다.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Award className="w-7 h-7 text-amber-600" />
              </div>
              <h3 className="font-bold mb-2">검증된 블로거</h3>
              <p className="text-sm text-gray-500">
                블로그 레벨, 성공률, 리뷰를 확인하고
                믿을 수 있는 블로거를 선택하세요.
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="max-w-2xl mx-auto text-center"
        >
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-8 text-white">
            <h2 className="text-2xl font-bold mb-4">지금 바로 시작하세요</h2>
            <p className="text-blue-100 mb-6">
              의뢰 등록은 무료입니다. 성사 시에만 수수료가 발생합니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/marketplace/create-request"
                className="px-8 py-4 bg-white text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition-colors"
              >
                업체로 시작
              </Link>
              <Link
                href="/marketplace/gigs"
                className="px-8 py-4 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-400 transition-colors"
              >
                블로거로 시작
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
