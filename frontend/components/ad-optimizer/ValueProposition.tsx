'use client'

import { motion } from 'framer-motion'
import {
  TrendingUp, Zap, Shield, Clock, Target,
  DollarSign, BarChart3, Brain, Sparkles
} from 'lucide-react'

interface ValuePropositionProps {
  type: 'main' | 'budget' | 'anomaly' | 'hourly' | 'funnel' | 'quality' | 'creative' | 'pacing'
}

const propositions = {
  main: {
    title: "광고비는 줄이고, 매출은 올리는",
    subtitle: "AI 자동 최적화 시스템",
    highlight: "평균 ROAS 47% 향상",
    description: "24시간 쉬지 않는 AI가 1분마다 광고 성과를 분석하고 자동으로 입찰가를 조정합니다.",
    stats: [
      { label: "광고비 절감", value: "20-30%", icon: DollarSign, color: "text-green-400" },
      { label: "전환율 증가", value: "15-25%", icon: TrendingUp, color: "text-blue-400" },
      { label: "최적화 주기", value: "1분", icon: Clock, color: "text-purple-400" },
    ],
    benefits: [
      "고효율 키워드에 예산 자동 집중",
      "비효율 키워드 실시간 차단",
      "전환 의도 높은 신규 키워드 자동 발굴",
      "CPC 급등, CTR 급락 즉시 감지 및 대응"
    ]
  },
  budget: {
    title: "돈 버는 곳에 돈을 넣어주는",
    subtitle: "AI 예산 재분배 엔진",
    highlight: "월 평균 50만원+ 절감",
    description: "플랫폼별 ROAS를 분석해 고효율 채널에 예산을 자동으로 이동시킵니다.",
    stats: [
      { label: "예산 효율화", value: "30%↑", icon: Target, color: "text-green-400" },
      { label: "ROAS 개선", value: "45%↑", icon: BarChart3, color: "text-blue-400" },
      { label: "자동 분석", value: "24/7", icon: Brain, color: "text-purple-400" },
    ],
    benefits: [
      "ROAS 300% 이상 채널 → 예산 자동 증액",
      "ROAS 100% 미만 채널 → 예산 자동 축소",
      "시즌/요일별 최적 예산 배분",
      "클릭 한 번으로 재분배 적용"
    ]
  },
  anomaly: {
    title: "광고비 새는 구멍을 막아주는",
    subtitle: "실시간 이상 징후 감지",
    highlight: "손실 90% 사전 차단",
    description: "CPC가 갑자기 뛰거나 CTR이 급락하면 즉시 알림을 보내고 자동 대응합니다.",
    stats: [
      { label: "감지 속도", value: "실시간", icon: Zap, color: "text-yellow-400" },
      { label: "손실 방지", value: "90%", icon: Shield, color: "text-green-400" },
      { label: "자동 대응", value: "즉시", icon: Clock, color: "text-blue-400" },
    ],
    benefits: [
      "CPC 급등 → 입찰가 자동 하향 조정",
      "CTR 급락 → 키워드 자동 일시정지",
      "경쟁사 입찰 공격 실시간 감지",
      "예산 소진 속도 이상 시 즉시 알림"
    ]
  },
  hourly: {
    title: "시간대별로 돈을 아껴주는",
    subtitle: "스마트 시간대 입찰",
    highlight: "야간 광고비 70% 절감",
    description: "전환이 잘 되는 시간에는 공격적으로, 안 되는 시간에는 보수적으로 자동 조정합니다.",
    stats: [
      { label: "피크타임 투자", value: "+30%", icon: TrendingUp, color: "text-green-400" },
      { label: "비수기 절감", value: "-70%", icon: DollarSign, color: "text-blue-400" },
      { label: "요일별 최적화", value: "7일", icon: Clock, color: "text-purple-400" },
    ],
    benefits: [
      "오후 2-6시 전환율 피크 → 입찰가 상향",
      "새벽 1-6시 전환율 바닥 → 입찰가 70% 하향",
      "주말 vs 평일 다른 전략 자동 적용",
      "업종별 골든타임 자동 학습"
    ]
  },
  funnel: {
    title: "구매 직전 고객만 잡아주는",
    subtitle: "전환 퍼널 입찰 최적화",
    highlight: "구매 전환율 2배",
    description: "인지→관심→비교→구매 각 단계별로 최적의 입찰 전략을 자동 적용합니다.",
    stats: [
      { label: "구매 키워드", value: "+50%", icon: Target, color: "text-green-400" },
      { label: "인지 키워드", value: "-30%", icon: DollarSign, color: "text-blue-400" },
      { label: "전환율", value: "2배", icon: TrendingUp, color: "text-purple-400" },
    ],
    benefits: [
      "\"가격\", \"구매\", \"신청\" → 최우선 투자",
      "\"정보\", \"방법\" → 적정 수준 유지",
      "브랜드 키워드 → 방어적 입찰",
      "전환 의도 점수로 자동 분류"
    ]
  },
  quality: {
    title: "네이버가 좋아하는 광고로",
    subtitle: "품질지수 자동 개선",
    highlight: "CPC 평균 25% 절감",
    description: "품질지수가 높으면 같은 순위도 더 싸게 노출됩니다. AI가 품질지수를 자동 관리합니다.",
    stats: [
      { label: "품질지수", value: "7→9점", icon: Sparkles, color: "text-yellow-400" },
      { label: "CPC 절감", value: "25%", icon: DollarSign, color: "text-green-400" },
      { label: "노출 순위", value: "+2단계", icon: TrendingUp, color: "text-blue-400" },
    ],
    benefits: [
      "광고문구 최적화 자동 추천",
      "랜딩페이지 관련성 점수 분석",
      "키워드-광고-랜딩 일치도 개선",
      "저품질 키워드 자동 필터링"
    ]
  },
  creative: {
    title: "지친 광고를 새 광고로",
    subtitle: "크리에이티브 피로도 관리",
    highlight: "CTR 유지율 95%",
    description: "같은 광고를 오래 보면 클릭률이 떨어집니다. AI가 피로도를 감지하고 교체를 추천합니다.",
    stats: [
      { label: "피로도 감지", value: "자동", icon: Brain, color: "text-purple-400" },
      { label: "CTR 유지", value: "95%", icon: BarChart3, color: "text-green-400" },
      { label: "교체 추천", value: "적시", icon: Clock, color: "text-blue-400" },
    ],
    benefits: [
      "노출 빈도 기반 피로도 자동 계산",
      "CTR 하락 추이 실시간 모니터링",
      "최적의 크리에이티브 교체 시점 알림",
      "A/B 테스트 성과 자동 분석"
    ]
  },
  pacing: {
    title: "예산을 똑똑하게 쓰게 해주는",
    subtitle: "예산 페이싱 자동화",
    highlight: "예산 활용률 98%",
    description: "하루 예산을 효율적으로 분배해 오전에 다 소진되거나 남는 일을 방지합니다.",
    stats: [
      { label: "예산 활용", value: "98%", icon: Target, color: "text-green-400" },
      { label: "균등 소진", value: "24시간", icon: Clock, color: "text-blue-400" },
      { label: "낭비 방지", value: "100%", icon: Shield, color: "text-purple-400" },
    ],
    benefits: [
      "시간대별 예산 자동 배분",
      "조기 소진 방지 자동 조절",
      "남은 예산 피크타임에 집중",
      "월말 예산 최적화 자동 계산"
    ]
  }
}

export default function ValueProposition({ type }: ValuePropositionProps) {
  const data = propositions[type]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-8"
    >
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border border-blue-500/20 p-8">
        {/* Background Effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#0064FF] opacity-10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500 opacity-10 rounded-full blur-3xl" />

        <div className="relative z-10">
          {/* Title */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="inline-block mb-4"
            >
              <span className="bg-gradient-to-r from-[#0064FF] to-blue-400 text-white text-sm font-bold px-4 py-2 rounded-full">
                💰 {data.highlight}
              </span>
            </motion.div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">
              {data.title}
            </h2>
            <h3 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#0064FF] to-cyan-400 bg-clip-text text-transparent">
              {data.subtitle}
            </h3>
            <p className="text-gray-400 mt-4 max-w-2xl mx-auto">
              {data.description}
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {data.stats.map((stat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10 text-center"
              >
                <stat.icon className={`w-8 h-8 mx-auto mb-2 ${stat.color}`} />
                <div className={`text-2xl md:text-3xl font-bold ${stat.color}`}>
                  {stat.value}
                </div>
                <div className="text-gray-400 text-sm mt-1">{stat.label}</div>
              </motion.div>
            ))}
          </div>

          {/* Benefits Grid */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              이렇게 돈을 벌어다 줍니다
            </h4>
            <div className="grid md:grid-cols-2 gap-3">
              {data.benefits.map((benefit, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + idx * 0.1 }}
                  className="flex items-center gap-3 text-gray-300"
                >
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-green-400 text-sm">✓</span>
                  </div>
                  <span className="text-sm">{benefit}</span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Trust Badge */}
          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm">
              🔒 광고 계정 연동만 하면 자동으로 작동 · 설정 변경 언제든 가능 · 수수료 0%
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// Compact version for sub-pages
export function ValuePropositionCompact({ type }: ValuePropositionProps) {
  const data = propositions[type]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 bg-gradient-to-r from-blue-950/50 to-purple-950/50 border border-blue-500/20 rounded-2xl p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-[#0064FF] text-white text-xs font-bold px-3 py-1 rounded-full">
              💰 {data.highlight}
            </span>
          </div>
          <h3 className="text-xl font-bold text-white">
            {data.title} <span className="text-[#0064FF]">{data.subtitle}</span>
          </h3>
          <p className="text-gray-400 text-sm mt-1">{data.description}</p>
        </div>

        <div className="flex gap-4">
          {data.stats.slice(0, 2).map((stat, idx) => (
            <div key={idx} className="text-center">
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-gray-500 text-xs">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
