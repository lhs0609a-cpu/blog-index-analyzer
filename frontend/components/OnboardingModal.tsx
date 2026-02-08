'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, Search, Zap, ArrowRight, Check, Crown } from 'lucide-react'
import Link from 'next/link'

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-gray-200 bg-white rounded-t-3xl">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">시작하기</h2>
                <p className="text-sm text-gray-500">블랭크를 최대한 활용해보세요</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* 콘텐츠 */}
            <div className="p-6 space-y-4">
              {/* Step 1: 블로그 분석 */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-white border border-purple-100">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-purple-500 text-white text-sm flex items-center justify-center font-bold">1</div>
                      <h3 className="font-bold text-gray-900">블로그 분석하기</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      블로그 ID를 입력하면 11단계 레벨과 42개 지표로 현재 상태를 파악할 수 있습니다.
                    </p>
                    <Link
                      href="/analyze"
                      onClick={onClose}
                      className="inline-flex items-center gap-2 text-sm font-medium text-purple-600 hover:text-purple-700"
                    >
                      무료로 분석하기
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Step 2: 키워드 검색 */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-white border border-blue-100">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#0064FF] flex items-center justify-center flex-shrink-0">
                    <Search className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-[#0064FF] text-white text-sm flex items-center justify-center font-bold">2</div>
                      <h3 className="font-bold text-gray-900">키워드 분석</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      키워드를 입력하고 상위 10개 블로그를 분석해 경쟁 가능성을 확인하세요.
                    </p>
                    <Link
                      href="/keyword-search"
                      onClick={onClose}
                      className="inline-flex items-center gap-2 text-sm font-medium text-[#0064FF] hover:text-[#0050CC]"
                    >
                      키워드 검색하기
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Step 3: Pro 플랜 */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-yellow-50 to-white border-2 border-yellow-200">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center flex-shrink-0">
                    <Crown className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-yellow-500 text-white text-sm flex items-center justify-center font-bold">3</div>
                      <h3 className="font-bold text-gray-900">1위 가능 키워드 받기</h3>
                      <span className="text-xs font-bold px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">Pro</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      매일 5개의 1위 가능 키워드를 추천받으세요. Pro 사용자의 82%가 30일 내 상위 노출됩니다.
                    </p>
                    <Link
                      href="/pricing"
                      onClick={onClose}
                      className="inline-flex items-center gap-2 text-sm font-bold text-yellow-600 hover:text-yellow-700"
                    >
                      7일 무료 체험
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* 유용한 팁 */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-900 mb-2">팁</h4>
                    <ul className="text-sm text-green-800 space-y-1">
                      <li>무료로 블로그 분석과 키워드 검색을 매일 이용할 수 있습니다</li>
                      <li>Pro로 업그레이드하면 1위 가능 키워드를 매일 추천받습니다</li>
                      <li>7일 무료 체험 후 결제 여부를 선택할 수 있습니다</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 text-center font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                나중에
              </button>
              <Link
                href="/analyze"
                onClick={onClose}
                className="flex-1 py-3 px-4 text-center font-semibold text-white bg-[#0064FF] rounded-xl hover:bg-[#0050CC] transition-colors"
              >
                지금 시작하기
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
