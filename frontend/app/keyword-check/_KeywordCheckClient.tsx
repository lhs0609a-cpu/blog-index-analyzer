'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Target, ArrowRight } from 'lucide-react'
import KeywordVerdictWidget from '@/components/KeywordVerdictWidget'
import { useAuthStore } from '@/lib/stores/auth'

/**
 * 키워드 상위노출 판정 단독 탭.
 *
 * 원래 이 기능은 /analyze 의 블로그 분석 **결과 아래**에만 있었다. 그러면 "이 키워드
 * 되나?"만 알고 싶은 사람도 블로그 전체 분석(수십 초)을 먼저 돌려야 했다.
 * 여기서는 블로그 ID + 키워드만 받아 바로 판정한다.
 */
export default function KeywordCheckClient() {
  const { user, isAuthenticated } = useAuthStore()
  const isPremium = isAuthenticated && user?.plan && user.plan !== 'free'
  const isFreeUser = !isPremium

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F5F7FA] to-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0064FF]/10 mb-4">
            <Target className="w-7 h-7 text-[#0064FF] gi3d" />
          </div>
          <h1 className="text-3xl font-bold mb-2">키워드 상위노출 판정</h1>
          <p className="text-gray-500">
            내 블로그 ID와 키워드만 넣으면, 그 키워드의 실제 1페이지와 비교해 판정합니다
          </p>
        </motion.div>

        <KeywordVerdictWidget isFreeUser={isFreeUser} showBlogInput />

        <div className="glass-3d p-6">
          <h2 className="font-bold mb-3">어떻게 판정하나요</h2>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside leading-relaxed">
            <li>그 키워드의 <b>실제 네이버 블로그탭 1페이지</b>를 가져옵니다. 검색량 추정이 아니라 지금 그 자리에 앉아 있는 블로그 목록입니다.</li>
            <li>내 블로그가 이미 거기 있으면 판정하지 않고 <b>현재 순위</b>를 그대로 보여줍니다.</li>
            <li>없으면 1페이지 블로그 10개를 <b>내 블로그와 똑같은 기준</b>으로 채점해 진입 컷라인을 구합니다.</li>
            <li>컷라인·1페이지 중앙값·내 주제 글 수·방치된 경쟁자 자리를 합쳐 1페이지 진입 확률을 냅니다.</li>
          </ol>
          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            검색량만 보고 판단하지 않습니다. 월 300회짜리 키워드인데 1페이지가 최적 등급으로 채워진 경우와,
            월 5,000회인데 방치된 블로그들이 앉아 있는 경우는 난이도가 정반대이기 때문입니다.
          </p>
          <Link href="/analyze" className="mt-5 inline-flex items-center gap-1 text-sm text-[#0064FF] font-medium">
            내 블로그 전체 지표도 보기 <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
