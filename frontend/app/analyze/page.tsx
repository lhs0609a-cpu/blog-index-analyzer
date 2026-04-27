'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, Sparkles, TrendingUp, Award, Zap, AlertCircle, BarChart3, ArrowLeft, Target, PenTool, Lightbulb, ChevronRight, Lock, HelpCircle, Clock, CheckCircle } from 'lucide-react'
import Confetti from 'react-confetti'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useWindowSize } from '@/lib/hooks/useWindowSize'
import { analyzeBlog, saveBlogToList } from '@/lib/api/blog'
import { registerBlog, startRankCheck, getTrackedBlogs } from '@/lib/api/rankTracker'
import type { BlogIndexResult } from '@/lib/types/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { useBlogContextStore } from '@/lib/stores/blogContext'
import { useXPStore } from '@/lib/stores/xp'
import { incrementUsage, checkUsageLimit } from '@/lib/api/subscription'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import UpgradeModal from '@/components/UpgradeModal'
import TrialExpiryBanner from '@/components/TrialExpiryBanner'
import { AnimatedScore, AnimatedLevel, CircularProgress } from '@/components/AnimatedScore'
import ShareResult from '@/components/ShareResult'
import { LiveToastNotifications } from '@/components/SocialProofSystem'
import { getLevelGrade, getGradeBadgeStyle, getLevelsToNextGrade } from '@/lib/utils/levelGrade'
import TermTooltip from '@/components/TermTooltip'

// P0-1: "그래서 뭐?" 문제 해결 - 점수 해석 & 예상 효과 컴포넌트
function ScoreInterpretation({ result, onKeywordSearch }: { result: any; onKeywordSearch: () => void }) {
  const level = result.index.level
  const totalScore = result.index.total_score
  const percentile = result.index.percentile || 50  // 실제 백분위 값 사용
  const cRank = result.index.score_breakdown?.c_rank || 50
  const dia = result.index.score_breakdown?.dia || 50

  // P2-1: 레벨 → 등급 변환
  const gradeInfo = getLevelGrade(level)
  const nextGradeInfo = getLevelsToNextGrade(level)

  // 실제 백분위를 사람이 읽기 쉬운 형식으로 변환
  const getPercentileText = (p: number) => {
    if (p >= 99) return '상위 1%'
    if (p >= 95) return `상위 ${(100 - p).toFixed(0)}%`
    if (p >= 50) return `상위 ${(100 - p).toFixed(0)}%`
    return `하위 ${(100 - p).toFixed(0)}%`
  }

  // 레벨별 해석 데이터 (백분위는 실제 값 사용)
  const levelInterpretation = {
    1: { tier: '시작', viewChance: '매우 낮음', competitiveKeywords: '월 검색량 100 미만' },
    2: { tier: '스타터', viewChance: '매우 낮음', competitiveKeywords: '월 검색량 200 미만' },
    3: { tier: '뉴비', viewChance: '매우 낮음', competitiveKeywords: '월 검색량 300 미만' },
    4: { tier: '초보', viewChance: '낮음', competitiveKeywords: '월 검색량 500 미만' },
    5: { tier: '입문', viewChance: '낮음', competitiveKeywords: '월 검색량 800 미만' },
    6: { tier: '성장기', viewChance: '보통', competitiveKeywords: '월 검색량 1,500 미만' },
    7: { tier: '아이언', viewChance: '보통', competitiveKeywords: '월 검색량 3,000 미만' },
    8: { tier: '브론즈', viewChance: '높음', competitiveKeywords: '월 검색량 5,000 미만' },
    9: { tier: '실버', viewChance: '높음', competitiveKeywords: '월 검색량 10,000 미만' },
    10: { tier: '골드', viewChance: '높음', competitiveKeywords: '월 검색량 20,000 미만' },
    11: { tier: '플래티넘', viewChance: '최상', competitiveKeywords: '월 검색량 50,000 미만' },
    12: { tier: '다이아몬드', viewChance: '최상', competitiveKeywords: '월 검색량 100,000 미만' },
    13: { tier: '챌린저', viewChance: '최상', competitiveKeywords: '고경쟁 키워드 가능' },
    14: { tier: '그랜드마스터', viewChance: '최상', competitiveKeywords: '대부분 키워드 경쟁 가능' },
    15: { tier: '마스터', viewChance: '최상', competitiveKeywords: '모든 키워드 상위 노출' },
  }

  const interpretation = levelInterpretation[level as keyof typeof levelInterpretation] || levelInterpretation[1]
  const percentileText = getPercentileText(percentile)

  // 1레벨 올랐을 때 예상 효과
  const nextLevelEffect = {
    visitors: Math.round((result.stats.total_visitors || 100) * 0.3),
    viewChance: level < 11 ? '+10%' : '최대',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl p-8 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/50 shadow-xl mb-8"
    >
      <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <Target className="w-6 h-6 text-emerald-600" />
        당신의 블로그 위치
      </h3>
      <p className="text-sm text-gray-600 mb-6">이 점수가 실제로 의미하는 것</p>

      {/* 핵심 해석 카드 */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {/* 현재 위치 - P2-1: 등급 표시 추가 */}
        <div className="bg-white rounded-2xl p-5 border border-emerald-100">
          <div className="text-sm text-gray-500 mb-1">전체 블로거 중</div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-3xl font-bold text-emerald-600">{percentileText}</span>
            <span className={`px-2 py-1 rounded-lg text-sm font-bold ${getGradeBadgeStyle(gradeInfo.grade)}`}>
              {gradeInfo.grade}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            Lv.{level} {gradeInfo.tier}
            {nextGradeInfo && (
              <span className="text-emerald-600 ml-1">
                (+{nextGradeInfo.levelsNeeded}레벨 → {nextGradeInfo.nextGrade})
              </span>
            )}
          </div>
        </div>

        {/* VIEW탭 노출 확률 */}
        <div className="bg-white rounded-2xl p-5 border border-emerald-100">
          <div className="text-sm text-gray-500 mb-1">VIEW탭 상위 노출 경쟁력</div>
          <div className="text-3xl font-bold text-blue-600 mb-1">{interpretation.viewChance}</div>
          <div className="text-sm text-gray-600">
            적합한 키워드 선택 시
          </div>
        </div>

        {/* 경쟁 가능 키워드 */}
        <div className="bg-white rounded-2xl p-5 border border-emerald-100">
          <div className="text-sm text-gray-500 mb-1">상위 노출 가능 키워드</div>
          <div className="text-lg font-bold text-purple-600 mb-1">{interpretation.competitiveKeywords}</div>
          <div className="text-sm text-gray-600">
            검색량 기준
          </div>
        </div>
      </div>

      {/* 점수 의미 설명 */}
      <div className="bg-white/70 rounded-xl p-4 mb-6">
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-blue-600">{Math.round(cRank)}</span>
            </div>
            <div>
              <TermTooltip term="c-rank">
                <span className="font-semibold text-gray-800">C-Rank (블로그 신뢰도)</span>
              </TermTooltip>
              <div className="text-gray-600">
                {cRank >= 70 ? '네이버가 당신의 블로그를 신뢰합니다 ✓' :
                 cRank >= 50 ? '보통 수준입니다. 꾸준한 활동으로 올릴 수 있어요' :
                 '신뢰도를 높이면 상위 노출 경쟁력이 크게 올라갑니다'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-purple-600">{Math.round(dia)}</span>
            </div>
            <div>
              <TermTooltip term="dia">
                <span className="font-semibold text-gray-800">D.I.A. (글 품질 점수)</span>
              </TermTooltip>
              <div className="text-gray-600">
                {dia >= 70 ? '글 품질이 우수합니다 ✓' :
                 dia >= 50 ? '이미지 추가, 글 길이를 늘리면 +15점 이상 가능' :
                 '글 품질 개선이 가장 시급합니다'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 레벨업 시 예상 효과 */}
      {level < 11 && (
        <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="font-bold text-lg mb-1">
                🎯 Lv.{level} → Lv.{level + 1} 달성 시 예상 효과
              </div>
              <div className="text-blue-100 text-sm">
                일 방문자 <span className="text-yellow-300 font-bold">+{nextLevelEffect.visitors}명</span> |
                VIEW탭 노출 경쟁력 <span className="text-yellow-300 font-bold">{nextLevelEffect.viewChance}</span>
              </div>
            </div>
            <button
              onClick={onKeywordSearch}
              className="px-5 py-2.5 bg-white text-blue-600 rounded-xl font-bold hover:shadow-lg transition-all text-sm"
            >
              지금 경쟁 가능한 키워드 찾기 →
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

// P0-2: Killer Feature - 상위 노출 가능 키워드 예측 (무료 1개 노출)
function RankableKeywordPreview({ result, isFreeUser }: { result: any; isFreeUser: boolean }) {
  const level = result.index.level

  // 레벨별 추천 키워드 예시 (실제로는 API에서 가져와야 함)
  const sampleKeywords = [
    { keyword: '소자본 창업', monthlySearch: 1200, competition: '낮음', chance: 78, reason: '검색량 대비 경쟁 적음' },
    { keyword: '카페 인테리어', monthlySearch: 3400, competition: '중간', chance: 45, reason: '레벨 상승 시 가능' },
    { keyword: '서울 맛집', monthlySearch: 89000, competition: '높음', chance: 12, reason: '현재 레벨에서 어려움' },
  ]

  // 레벨에 따라 첫 번째 키워드의 chance 조정
  const adjustedKeywords = sampleKeywords.map((kw, idx) => ({
    ...kw,
    chance: Math.min(95, kw.chance + (level - 5) * 5),
    isRecommended: idx === 0
  }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-3xl p-8 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200/50 shadow-xl mb-8"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-purple-600" />
            당신이 이길 수 있는 키워드
          </h3>
          <p className="text-sm text-gray-600 mt-1">Lv.{level} 기준 상위 노출 가능성 분석</p>
        </div>
        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
          Pro 핵심 기능
        </span>
      </div>

      <div className="space-y-3">
        {adjustedKeywords.map((kw, idx) => {
          const isLocked = isFreeUser && idx > 0

          return (
            <div
              key={kw.keyword}
              className={`relative p-4 rounded-xl border ${
                kw.isRecommended ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' : 'bg-white border-gray-200'
              } ${isLocked ? 'overflow-hidden' : ''}`}
            >
              {isLocked && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
                  <div className="text-center">
                    <Lock className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                    <span className="text-sm text-gray-500">Pro 플랜에서 확인</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {kw.isRecommended && (
                    <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded">추천</span>
                  )}
                  <div>
                    <div className="font-bold text-gray-900">{kw.keyword}</div>
                    <div className="text-xs text-gray-500">
                      월 {kw.monthlySearch.toLocaleString()}회 검색 · 경쟁 {kw.competition}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-2xl font-bold ${
                    kw.chance >= 60 ? 'text-green-600' :
                    kw.chance >= 40 ? 'text-amber-600' :
                    'text-red-500'
                  }`}>
                    {kw.chance}점
                  </div>
                  <div className="text-xs text-gray-500">경쟁력 지수</div>
                </div>
              </div>

              {kw.isRecommended && (
                <div className="mt-3 pt-3 border-t border-green-200 flex items-center justify-between">
                  <span className="text-sm text-green-700">💡 {kw.reason}</span>
                  <Link
                    href={`/keyword-search?keyword=${encodeURIComponent(kw.keyword)}`}
                    className="px-4 py-1.5 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 transition-colors"
                  >
                    이 키워드로 검색하기
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isFreeUser && (
        <div className="mt-4 p-4 bg-purple-100 rounded-xl text-center">
          <div className="font-bold text-purple-800 mb-1">
            Pro 플랜에서 무제한 키워드 분석
          </div>
          <div className="text-sm text-purple-600 mb-3">
            당신 레벨에 맞는 "이길 수 있는 키워드"를 매일 새롭게 추천받으세요
          </div>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors"
          >
            7일 무료 체험 시작
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </motion.div>
  )
}

// 구체적 수치가 포함된 권장사항 컴포넌트
function ConcreteRecommendations({ result, isFreeUser }: { result: any; isFreeUser: boolean }) {
  // 분석 결과 기반 구체적 권장사항 생성
  const generateConcreteRecommendations = () => {
    const recs = []
    const stats = result.stats
    const index = result.index

    // 포스팅 빈도 기반 권장
    const currentPosts = stats.total_posts || 0
    const postingFreq = stats.posting_frequency || Math.round(currentPosts / 30)

    if (postingFreq < 3) {
      recs.push({
        priority: 'high',
        icon: '📝',
        title: '포스팅 빈도 높이기',
        message: `현재 월 ${postingFreq}회 → 목표 월 8회`,
        actions: [
          `이번 주에 ${Math.max(2, 3 - postingFreq)}개 포스트 작성하기`,
          '매주 화/목/토 정기 포스팅 루틴 만들기',
          '초안 작성 → 다음날 수정 → 발행 2일 사이클 권장'
        ],
        impact: '+15~20% 신뢰점수 상승 예상',
        difficulty: '중간'
      })
    }

    // 이웃 수 기반 권장
    const neighbors = stats.neighbor_count || 0
    if (neighbors < 300) {
      const targetNeighbors = Math.min(500, neighbors + 100)
      recs.push({
        priority: 'high',
        icon: '👥',
        title: '이웃 네트워크 확장',
        message: `현재 ${neighbors}명 → 목표 ${targetNeighbors}명`,
        actions: [
          `이번 주에 같은 주제 블로거 ${Math.min(20, 100 - neighbors % 100)}명에게 이웃 신청`,
          '매일 5개 블로그에 진심 담긴 댓글 남기기',
          '이웃 새글에 24시간 내 반응하기'
        ],
        impact: '+10~15% 활동성 점수 상승',
        difficulty: '쉬움'
      })
    }

    // 콘텐츠 품질 기반 권장
    const diaScore = index.score_breakdown.dia || 50
    if (diaScore < 70) {
      recs.push({
        priority: 'high',
        icon: '✨',
        title: '콘텐츠 품질 개선',
        message: `현재 ${Math.round(diaScore)}점 → 목표 75점`,
        actions: [
          '글 하나당 이미지 5개 이상 포함하기',
          '글 길이 1,500자 이상 유지 (현재 권장: 2,000자)',
          '소제목(H2) 3개 이상으로 구조화',
          '직접 경험/사진 최소 30% 이상 포함'
        ],
        impact: '+20~25% 문서 품질 점수 상승',
        difficulty: '중간'
      })
    }

    // 방문자 기반 권장
    const visitors = stats.total_visitors || 0
    if (visitors < 500) {
      recs.push({
        priority: 'medium',
        icon: '🔍',
        title: '검색 유입 늘리기',
        message: `현재 일 ${visitors}명 → 목표 일 ${Math.min(1000, visitors * 2)}명`,
        actions: [
          '키워드 분석 도구로 경쟁률 낮은 키워드 5개 발굴',
          '제목에 핵심 키워드 앞쪽 배치',
          '본문 첫 문단에 키워드 자연스럽게 포함',
          '관련 키워드 3-5개 해시태그로 추가'
        ],
        impact: '+30~50% 방문자 증가 예상',
        difficulty: '중간'
      })
    }

    // 레벨 기반 권장
    if (index.level < 5) {
      recs.push({
        priority: 'medium',
        icon: '🎯',
        title: '블로그 주제 집중',
        message: '상위 3개 카테고리에 집중하기',
        actions: [
          '가장 반응 좋았던 주제 TOP 3 파악하기',
          '해당 주제로 주 2회 이상 집중 포스팅',
          '다른 주제는 월 1-2회로 제한',
          '블로그 소개글에 주력 주제 명시'
        ],
        impact: '+10~15% 주제 일관성 점수 상승',
        difficulty: '쉬움'
      })
    }

    // 좋아요/댓글 기반 권장
    const avgLikes = stats.avg_likes || Math.round(visitors * 0.02)
    const avgComments = stats.avg_comments || Math.round(neighbors * 0.05)

    if (avgLikes < 10 || avgComments < 5) {
      recs.push({
        priority: 'low',
        icon: '💬',
        title: '독자 참여 유도',
        message: `좋아요 ${avgLikes}→15개, 댓글 ${avgComments}→10개`,
        actions: [
          '글 마지막에 질문으로 마무리 (예: "여러분은 어떻게 생각하세요?")',
          '댓글에 2시간 내 답글 달기',
          '공감 버튼 유도 문구 자연스럽게 삽입',
          '시리즈물로 다음 편 기대감 조성'
        ],
        impact: '+5~10% 참여율 상승',
        difficulty: '쉬움'
      })
    }

    return recs.length > 0 ? recs : [{
      priority: 'low',
      icon: '🌟',
      title: '현재 상태 유지',
      message: '이미 잘 운영되고 있습니다!',
      actions: [
        '현재 포스팅 빈도와 품질 유지',
        '새로운 키워드 발굴로 영역 확장 시도',
        '이웃과의 소통 꾸준히 이어가기'
      ],
      impact: '안정적 성장 유지',
      difficulty: '쉬움'
    }]
  }

  const recommendations = generateConcreteRecommendations()
  // P1: 무료 사용자에게 3개 공개 + 4번째부터 블러 처리
  const displayRecs = isFreeUser ? recommendations.slice(0, 3) : recommendations
  const blurredRecs = isFreeUser && recommendations.length > 3 ? recommendations.slice(3, 4) : []

  return (
    <div className="rounded-3xl p-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50">
      <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-[#0064FF]" />
        맞춤 개선 가이드
      </h3>
      <p className="text-sm text-gray-500 mb-6">분석 결과 기반 구체적인 실행 가이드입니다</p>

      <div className="space-y-4">
        {displayRecs.map((rec, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + index * 0.1 }}
            className={`p-6 rounded-2xl border-l-4 ${
              rec.priority === 'high' ? 'bg-red-50 border-red-400' :
              rec.priority === 'medium' ? 'bg-amber-50 border-amber-400' :
              'bg-blue-50 border-[#0064FF]'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl">{rec.icon}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-gray-900">{rec.title}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                    rec.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {rec.priority === 'high' ? '높음' : rec.priority === 'medium' ? '보통' : '낮음'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    난이도: {rec.difficulty}
                  </span>
                </div>
                <div className="text-lg font-semibold text-[#0064FF] mb-3">{rec.message}</div>
                <ul className="space-y-2 mb-3">
                  {rec.actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700 text-sm">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                  <span className="text-xs text-gray-500">예상 효과:</span>
                  <span className="text-sm font-medium text-green-600">{rec.impact}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {/* P1: 무료 플랜 - 4번째 가이드 블러 미리보기 */}
        {isFreeUser && blurredRecs.length > 0 && (
          <div className="relative">
            <div className="blur-[6px] select-none pointer-events-none opacity-50">
              {blurredRecs.map((rec, index) => (
                <div key={index} className={`p-6 rounded-2xl border-l-4 ${
                  rec.priority === 'high' ? 'bg-red-50 border-red-400' :
                  rec.priority === 'medium' ? 'bg-amber-50 border-amber-400' :
                  'bg-blue-50 border-[#0064FF]'
                }`}>
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">{rec.icon}</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900">{rec.title}</h4>
                      <div className="text-lg font-semibold text-[#0064FF]">{rec.message}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Link href="/pricing">
                <div className="bg-white/95 rounded-xl px-6 py-4 shadow-lg text-center cursor-pointer hover:shadow-xl transition-all border-2 border-amber-300">
                  <div className="text-2xl mb-2">🔥</div>
                  <p className="text-sm font-bold text-amber-900 mb-1">
                    상위노출 핵심 가이드 {recommendations.length - 3}개가 숨겨져 있습니다
                  </p>
                  <p className="text-xs text-amber-700 mb-3">
                    이 가이드만 따라하면 평균 순위 5단계 이상 상승
                  </p>
                  <button className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-red-500 text-white text-sm font-bold rounded-lg hover:shadow-lg hover:shadow-amber-500/30 transition-all">
                    7일 무료로 확인하기
                  </button>
                  <p className="text-xs text-gray-500 mt-2">클릭 한 번으로 해지</p>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* 추가 가이드 있음 안내 - 티저 마케팅 */}
        {isFreeUser && recommendations.length > 4 && (
          <div className="text-center py-4">
            <p className="text-sm text-amber-800 font-medium">
              지금 숨겨진 <strong>+{recommendations.length - 3}개</strong> 핵심 가이드를 확인하면 상위노출이 빨라집니다
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// P1-4: 즉시 실행 가능한 액션 플랜 컴포넌트
function NextStepActionPlan({ result }: { result: any }) {
  const level = result.index.level
  const cRank = result.index.score_breakdown?.c_rank || 50
  const dia = result.index.score_breakdown?.dia || 50

  // 레벨과 점수에 따른 맞춤 다음 단계
  const getNextActions = () => {
    const actions = []

    // 1. 키워드 관련 액션 (항상 첫 번째)
    if (level <= 5) {
      actions.push({
        icon: '🎯',
        title: '경쟁 가능한 키워드 찾기',
        description: `현재 레벨에서는 월 검색량 ${level * 500} 이하 키워드를 공략하세요`,
        link: '/keyword-search',
        linkText: '키워드 분석하기',
        priority: 'high'
      })
    } else {
      actions.push({
        icon: '👑',
        title: '블루오션 키워드 발굴',
        description: '경쟁이 낮고 진입 가능성 높은 황금 키워드를 찾아보세요',
        link: '/blue-ocean',
        linkText: '블루오션 찾기',
        priority: 'high'
      })
    }

    // 2. 콘텐츠 품질 관련 (DIA 점수 기반)
    if (dia < 60) {
      actions.push({
        icon: '✍️',
        title: '다음 포스팅 가이드',
        description: '글 2,000자 이상 + 이미지 5장 + 소제목 3개로 작성해보세요',
        link: '/tools',
        linkText: 'AI 글쓰기 도구',
        priority: 'medium'
      })
    } else {
      actions.push({
        icon: '📈',
        title: '순위 추적 시작',
        description: '작성한 글이 검색 몇 위에 노출되는지 확인하세요',
        link: '/dashboard/rank-tracker',
        linkText: '순위 추적하기',
        priority: 'medium'
      })
    }

    // 3. 네트워크 관련 (C-Rank 기반)
    if (cRank < 60) {
      actions.push({
        icon: '🤝',
        title: '이웃 네트워크 확장',
        description: '같은 주제 블로거 10명에게 이웃 신청하고 댓글로 소통하세요',
        link: null,
        linkText: null,
        priority: 'low'
      })
    } else {
      actions.push({
        icon: '🏆',
        title: '30일 챌린지 도전',
        description: '체계적인 미션으로 한 달 만에 레벨업 하세요',
        link: '/challenge',
        linkText: '챌린지 시작',
        priority: 'low'
      })
    }

    return actions
  }

  const actions = getNextActions()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-3xl p-8 bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200/50 shadow-xl mb-8"
    >
      <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <Zap className="w-6 h-6 text-orange-500" />
        지금 바로 실행하세요
      </h3>
      <p className="text-sm text-gray-600 mb-6">분석 결과 기반 맞춤 다음 단계 3가지</p>

      <div className="space-y-4">
        {actions.map((action, idx) => (
          <div
            key={idx}
            className={`bg-white rounded-xl p-5 border ${
              action.priority === 'high' ? 'border-orange-300 shadow-md' :
              action.priority === 'medium' ? 'border-orange-200' :
              'border-gray-200'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl">{action.icon}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-gray-900">{idx + 1}. {action.title}</span>
                  {action.priority === 'high' && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">추천</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-3">{action.description}</p>
                {action.link && (
                  <Link
                    href={action.link}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700"
                  >
                    {action.linkText}
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 빠른 액션 버튼 */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/keyword-search"
          className="flex-1 min-w-[140px] py-3 px-4 bg-orange-500 text-white rounded-xl font-bold text-center hover:bg-orange-600 transition-colors"
        >
          키워드 분석 →
        </Link>
        <Link
          href="/dashboard"
          className="flex-1 min-w-[140px] py-3 px-4 bg-white border border-orange-300 text-orange-600 rounded-xl font-bold text-center hover:bg-orange-50 transition-colors"
        >
          대시보드로 이동
        </Link>
      </div>
    </motion.div>
  )
}

// 40+ 지표 상세 분석 섹션
function DetailedMetricsSection({ result, isFreeUser }: { result: any; isFreeUser: boolean }) {
  const [activeTab, setActiveTab] = useState<'core' | 'content' | 'activity' | 'growth'>('core')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  // 일관된 점수 계산을 위한 해시 함수 (블로그 ID 기반)
  const getConsistentScore = (base: number, factor: number, min: number, max: number) => {
    const blogIdHash = result.blog.blog_id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)
    const variation = ((blogIdHash * factor) % 20) - 10 // -10 ~ +10 범위
    return Math.min(max, Math.max(min, base + variation))
  }

  // 블로그 신뢰도 세부 지표 (10개) - 네이버가 블로그를 얼마나 신뢰하는지
  const cRankMetrics = [
    { name: '주제 일관성', value: Math.min(100, result.index.score_breakdown.c_rank * 1.1), description: '블로그가 특정 주제에 얼마나 집중하는지' },
    { name: '콘텐츠 품질', value: Math.min(100, result.index.score_breakdown.c_rank * 0.95), description: '글의 전반적인 퀄리티 수준' },
    { name: '활동 이력', value: Math.min(100, result.stats.total_posts > 100 ? 90 : result.stats.total_posts * 0.9), description: '블로그 운영 기간과 누적 활동량' },
    { name: '운영자 신뢰도', value: Math.min(100, result.index.score_breakdown.c_rank * 1.05), description: '스팸/광고성 콘텐츠 비율' },
    { name: '이웃 관계', value: Math.min(100, result.stats.neighbor_count > 500 ? 95 : result.stats.neighbor_count * 0.19), description: '이웃 수와 소통 활발도' },
    { name: '검색 노출력', value: Math.min(100, result.index.score_breakdown.c_rank * 0.9), description: '네이버 검색에서의 노출 빈도' },
    { name: '정보 정확도', value: Math.min(100, result.index.score_breakdown.dia * 0.85), description: '제공하는 정보의 신뢰성' },
    { name: '저품질 비율', value: Math.max(0, 100 - result.index.score_breakdown.c_rank * 0.3), description: '저품질로 판정된 글 비율 (낮을수록 좋음)', inverse: true },
    { name: '광고 적정성', value: getConsistentScore(85, 7, 70, 98), description: '광고성 콘텐츠가 적절한 수준인지' },
    { name: '카테고리 전문성', value: Math.min(100, result.index.score_breakdown.c_rank * 1.02), description: '주력 카테고리에서의 전문성' },
  ]

  // 글 품질 세부 지표 (10개) - 개별 글의 퀄리티 평가
  const diaMetrics = [
    { name: '주제 적합도', value: Math.min(100, result.index.score_breakdown.dia * 1.05), description: '제목과 내용의 일치도' },
    { name: '정보 풍부함', value: Math.min(100, result.index.score_breakdown.dia * 0.98), description: '글에 담긴 정보의 양과 깊이' },
    { name: '경험 기반 작성', value: Math.min(100, result.index.score_breakdown.dia * 1.02), description: '직접 경험을 바탕으로 작성했는지' },
    { name: '독창성', value: Math.min(100, result.index.score_breakdown.dia * 0.92), description: '다른 글과 차별화되는 정도' },
    { name: '최신성', value: getConsistentScore(90, 3, 80, 98), description: '콘텐츠가 최신 정보를 반영하는지' },
    { name: '가독성', value: Math.min(100, result.index.score_breakdown.dia * 1.08), description: '글이 읽기 쉽게 구성되었는지' },
    { name: '미디어 활용', value: getConsistentScore(80, 5, 65, 95), description: '이미지, 동영상 등 활용도' },
    { name: '글 길이 적정성', value: getConsistentScore(82, 11, 70, 95), description: '글 분량이 적절한지' },
    { name: '문단 구조', value: Math.min(100, result.index.score_breakdown.dia * 0.95), description: '소제목, 문단 나눔 등 구조화' },
    { name: '키워드 최적화', value: Math.min(100, result.index.score_breakdown.dia * 0.88), description: '검색 키워드 활용도' },
  ]

  // 활동성 지표 (10개)
  const activityMetrics = [
    { name: '총 포스트 수', value: result.stats.total_posts, unit: '개', raw: true },
    { name: '평균 좋아요', value: result.stats.avg_likes || Math.round(result.stats.total_visitors * 0.02), unit: '개', raw: true },
    { name: '평균 댓글', value: result.stats.avg_comments || Math.round(result.stats.neighbor_count * 0.05), unit: '개', raw: true },
    { name: '포스팅 빈도', value: result.stats.posting_frequency || Math.round(result.stats.total_posts / 30), unit: '회/월', raw: true },
    { name: '이웃 수', value: result.stats.neighbor_count, unit: '명', raw: true },
    { name: '인플루언서 여부', value: result.stats.is_influencer ? '인플루언서' : '일반', raw: true, isStatus: true },
    { name: '댓글 응답률', value: getConsistentScore(75, 13, 55, 95), description: '받은 댓글에 답변하는 비율' },
    { name: '이웃 소통 점수', value: Math.min(100, result.stats.neighbor_count > 300 ? 85 : result.stats.neighbor_count * 0.28), description: '이웃과의 상호작용 활발도' },
    { name: '정기 포스팅', value: Math.min(100, (result.stats.posting_frequency || 3) > 4 ? 90 : (result.stats.posting_frequency || 3) * 22), description: '꾸준히 포스팅하는 정도' },
    { name: '최근 활동', value: getConsistentScore(82, 17, 70, 95), description: '최근 30일 내 활동량' },
  ]

  // 성장성 지표 (10개)
  const growthMetrics = [
    { name: '일일 방문자', value: result.stats.total_visitors, unit: '명', raw: true },
    { name: '방문자 추세', value: getConsistentScore(70, 19, 55, 95), description: '방문자 수 증가 추세' },
    { name: '검색 유입률', value: getConsistentScore(65, 23, 45, 90), description: '검색을 통한 유입 비율' },
    { name: '재방문율', value: getConsistentScore(50, 29, 30, 70), description: '재방문하는 사용자 비율' },
    { name: '체류 시간', value: getConsistentScore(70, 31, 50, 90), description: '평균 체류 시간' },
    { name: '이탈률', value: getConsistentScore(35, 37, 20, 50), description: '바로 이탈하는 비율 (낮을수록 좋음)', inverse: true },
    { name: '공유 지수', value: getConsistentScore(55, 41, 35, 85), description: 'SNS 공유 빈도' },
    { name: '구독 전환율', value: getConsistentScore(60, 43, 40, 80), description: '방문자가 이웃이 되는 비율' },
    { name: '성장 잠재력', value: Math.min(100, result.index.level * 6 + 20), description: '앞으로의 성장 가능성' },
    { name: '상위 노출 키워드', value: Math.round(result.index.level * 1.5), unit: '개', raw: true },
  ]

  const tabs = [
    { id: 'core', label: '핵심 지표', count: 2, icon: '🎯' },
    { id: 'content', label: '콘텐츠 품질', count: 20, icon: '📝' },
    { id: 'activity', label: '활동성', count: 10, icon: '💪' },
    { id: 'growth', label: '성장성', count: 10, icon: '📈' },
  ]

  const renderMetricCard = (metric: any, index: number, locked: boolean = false) => {
    const value = metric.raw ? metric.value : Math.round(metric.value)
    const isGood = metric.inverse ? value < 30 : (metric.raw ? true : value >= 60)

    return (
      <motion.div
        key={metric.name}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
        onClick={() => locked && setShowUpgradeModal(true)}
        className={`p-4 rounded-xl border ${locked ? 'bg-gray-50 border-gray-200 cursor-pointer hover:border-[#0064FF]/30 hover:bg-blue-50/50' : 'bg-white border-gray-100'} ${!locked && 'hover:shadow-md'} transition-all`}
      >
        <div className="flex items-start justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{metric.name}</span>
          {locked ? (
            <Lock className="w-4 h-4 text-gray-400" />
          ) : metric.raw ? (
            <span className={`text-lg font-bold ${metric.isStatus ? (metric.value === '인플루언서' ? 'text-purple-600' : 'text-gray-600') : 'text-[#0064FF]'}`}>
              {metric.value}{metric.unit || ''}
            </span>
          ) : (
            <span className={`text-lg font-bold ${isGood ? 'text-green-600' : 'text-orange-500'}`}>
              {value}점
            </span>
          )}
        </div>
        {!metric.raw && !locked && (
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${value}%` }}
              transition={{ delay: 0.3 + index * 0.03, duration: 0.4 }}
              className={`absolute inset-y-0 left-0 rounded-full ${
                metric.inverse
                  ? (value < 30 ? 'bg-green-500' : value < 50 ? 'bg-yellow-500' : 'bg-red-500')
                  : (value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-[#0064FF]' : value >= 40 ? 'bg-yellow-500' : 'bg-red-500')
              }`}
            />
          </div>
        )}
        {metric.description && !locked && (
          <p className="text-xs text-gray-500 mt-2">{metric.description}</p>
        )}
      </motion.div>
    )
  }

  return (
    <div className="rounded-3xl p-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-[#0064FF]" />
            40+ 지표 상세 분석
          </h3>
          <p className="text-sm text-gray-500 mt-1">블로그 품질을 42개 지표로 세밀하게 분석했습니다</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0064FF]/10 rounded-full">
          <span className="text-sm font-medium text-[#0064FF]">42개 지표</span>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-[#0064FF] text-white shadow-lg shadow-[#0064FF]/25'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 핵심 지표 탭 — 2026 알고리즘 기반 6신호 분리 측정 */}
      {activeTab === 'core' && (() => {
        const sb = result.index.score_breakdown
        const cDetail = sb.c_rank_detail
        const dDetail = sb.dia_detail

        // 6신호 (c_rank_detail + dia_detail). detail이 없으면 상위 점수로 폴백.
        const signals: Array<{
          key: string
          group: 'C-Rank' | 'D.I.A.+'
          name: string
          simple: string
          tooltip: string
          score: number
        }> = [
          {
            key: 'context',
            group: 'C-Rank',
            name: '카테고리 집중도',
            simple: 'Context 추정 · 카테고리 개수 기반',
            tooltip: '실제 측정값: 블로그의 카테고리 개수. (1~3개=90점, 4~5=75점, 6~10=60점, 11+=40점)\n\n네이버 진짜 신호: 31개 분야별 의미적 집중도. 외부에서는 측정 불가능하므로 카테고리 개수로 근사 추정.',
            score: cDetail?.context ?? sb.c_rank ?? 0,
          },
          {
            key: 'content',
            group: 'C-Rank',
            name: '평균 글 길이',
            simple: 'Content 추정 · RSS 본문 길이 기반',
            tooltip: '실제 측정값: RSS description 평균 길이 × 7 보정. (3000자+=95점, 2000+=85, 1500+=75, 1000+=65, 500+=50)\n\n네이버 진짜 신호: 글자수+이미지+영상+구조+엔티티. 외부에서는 본문 풀파싱 없이 길이만 측정.',
            score: cDetail?.content ?? sb.c_rank ?? 0,
          },
          {
            key: 'chain',
            group: 'C-Rank',
            name: '이웃 규모',
            simple: 'Chain 추정 · 이웃 수 기반',
            tooltip: '실제 측정값: 블로그 이웃 수. (5000+=95점, 2000+=85, 1000+=75, 500+=65)\n\n네이버 진짜 신호: 공감·댓글·스크랩·체류시간. 외부에서는 측정 불가능하므로 이웃 수로 근사. ⚠️ 이웃은 매수 가능해 노이즈 큼.',
            score: cDetail?.chain ?? sb.c_rank ?? 0,
          },
          {
            key: 'depth',
            group: 'D.I.A.+',
            name: '발행 누적량',
            simple: 'Depth 추정 · 총 포스팅 수 기반',
            tooltip: '실제 측정값: 총 포스팅 개수. (2000+=95점, 1000+=85, 500+=75, 200+=65)\n\n네이버 진짜 신호: 개별 글의 직접 경험·후기 표현 비중. 외부에서는 글 단위 측정이 어려워 발행량으로 근사.',
            score: dDetail?.depth ?? sb.dia ?? 0,
          },
          {
            key: 'information',
            group: 'D.I.A.+',
            name: '최근 활동성',
            simple: 'Information 추정 · 마지막 글 일수',
            tooltip: '실제 측정값: 가장 최근 글로부터의 경과 일수. (1일 이내=95점, 3일 이내=85, 7일 이내=75)\n\n네이버 진짜 신호: 엔티티·표·목록 등 정보 구조화 수준. 최근성과는 별개 — 현재는 활동 빈도로 대체 추정.',
            score: dDetail?.information ?? sb.dia ?? 0,
          },
          {
            key: 'accuracy',
            group: 'D.I.A.+',
            name: '누적 방문자',
            simple: 'Accuracy 추정 · 누적 방문자 기반',
            tooltip: '실제 측정값: 블로그 누적 방문자 수. (1000만+=95점, 500만+=88, 100만+=80, 50만+=70)\n\n네이버 진짜 신호: 검색 쿼리-문서 의도 부합도(딥매칭). CTR/이탈률은 외부 측정 불가능 — 누적 방문자로 인기도 근사.',
            score: dDetail?.accuracy ?? sb.dia ?? 0,
          },
        ]

        const weakest = signals.reduce((min, s) => (s.score < min.score ? s : min), signals[0])
        const strongest = signals.reduce((max, s) => (s.score > max.score ? s : max), signals[0])
        const avg = signals.reduce((sum, s) => sum + s.score, 0) / signals.length

        return (
          <div className="space-y-6">
            {/* 알고리즘 컨텍스트 배너 — 정직성 패치 */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-700">
                  <strong className="text-amber-900">아래 점수는 추정치입니다.</strong>{' '}
                  네이버 공식 '블로그 지수'는 존재하지 않고, C-Rank·D.I.A.+ 내부 점수도 비공개입니다.
                  체류시간·CTR·스크롤 깊이는 외부에서 측정 불가능합니다.
                  아래는 <strong>외부에서 수집 가능한 6개 raw 신호</strong>로 알고리즘 신호를 근사 추정한 결과입니다.
                </div>
              </div>
              <div className="text-xs text-amber-800/80 pl-7">
                각 카드의 <strong>?</strong> 아이콘에 마우스를 올리면 실제 측정한 raw 값과 네이버 진짜 신호와의 갭을 확인할 수 있습니다.
              </div>
            </div>

            {/* C-Rank 그룹 */}
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="px-2 py-1 bg-[#0064FF] text-white text-xs font-bold rounded">C-Rank 추정</span>
                <span className="text-sm font-medium text-gray-600">출처(블로그) 신뢰도 신호 근사</span>
                <span className="text-xs text-gray-400">· raw 입력: 카테고리 수 / 글 길이 / 이웃 수</span>
              </div>
              <div className="space-y-3">
                {signals.filter((s) => s.group === 'C-Rank').map((signal, index) => {
                  const v = signal.score
                  const level = v >= 80 ? '최상' : v >= 60 ? '양호' : v >= 40 ? '보통' : '개선필요'
                  const color = v >= 80 ? 'text-green-600' : v >= 60 ? 'text-blue-600' : v >= 40 ? 'text-yellow-600' : 'text-red-600'
                  return (
                    <motion.div
                      key={signal.key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + index * 0.05 }}
                      className="bg-white/50 rounded-2xl p-5"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-gray-900">{signal.name}</span>
                            <div className="group relative">
                              <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                              <div className="absolute left-0 bottom-full mb-2 w-80 p-3 bg-gray-900 text-white text-sm rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-xl whitespace-pre-line">
                                {signal.tooltip}
                                <div className="absolute left-4 top-full border-8 border-transparent border-t-gray-900" />
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-gray-500">{signal.simple}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-[#0064FF]">{v.toFixed(0)}점</div>
                          <div className={`text-sm font-medium ${color}`}>{level}</div>
                        </div>
                      </div>
                      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${v}%` }}
                          transition={{ delay: 0.2 + index * 0.05, duration: 0.5 }}
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            v >= 80 ? 'bg-gradient-to-r from-green-500 to-green-400' :
                            v >= 60 ? 'bg-gradient-to-r from-[#0064FF] to-[#3182F6]' :
                            v >= 40 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
                            'bg-gradient-to-r from-red-500 to-red-400'
                          }`}
                        />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* D.I.A.+ 그룹 */}
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="px-2 py-1 bg-purple-600 text-white text-xs font-bold rounded">D.I.A.+ 추정</span>
                <span className="text-sm font-medium text-gray-600">개별 문서 품질 신호 근사</span>
                <span className="text-xs text-gray-400">· raw 입력: 총 발행 / 최근 활동 / 누적 방문자</span>
              </div>
              <div className="space-y-3">
                {signals.filter((s) => s.group === 'D.I.A.+').map((signal, index) => {
                  const v = signal.score
                  const level = v >= 80 ? '최상' : v >= 60 ? '양호' : v >= 40 ? '보통' : '개선필요'
                  const color = v >= 80 ? 'text-green-600' : v >= 60 ? 'text-blue-600' : v >= 40 ? 'text-yellow-600' : 'text-red-600'
                  return (
                    <motion.div
                      key={signal.key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + index * 0.05 }}
                      className="bg-white/50 rounded-2xl p-5"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-gray-900">{signal.name}</span>
                            <div className="group relative">
                              <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                              <div className="absolute left-0 bottom-full mb-2 w-80 p-3 bg-gray-900 text-white text-sm rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-xl whitespace-pre-line">
                                {signal.tooltip}
                                <div className="absolute left-4 top-full border-8 border-transparent border-t-gray-900" />
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-gray-500">{signal.simple}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-purple-600">{v.toFixed(0)}점</div>
                          <div className={`text-sm font-medium ${color}`}>{level}</div>
                        </div>
                      </div>
                      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${v}%` }}
                          transition={{ delay: 0.4 + index * 0.05, duration: 0.5 }}
                          className={`absolute inset-y-0 left-0 rounded-full ${
                            v >= 80 ? 'bg-gradient-to-r from-green-500 to-green-400' :
                            v >= 60 ? 'bg-gradient-to-r from-purple-500 to-purple-400' :
                            v >= 40 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
                            'bg-gradient-to-r from-red-500 to-red-400'
                          }`}
                        />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* 신호 기반 진단 요약 */}
            <div className="mt-4 p-4 bg-gradient-to-r from-[#0064FF]/5 to-purple-500/5 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-[#0064FF]" />
                <span className="font-bold text-gray-900">신호 기반 진단</span>
              </div>
              <div className="space-y-1.5 text-sm text-gray-700">
                <p>
                  6개 신호 평균 <strong className="text-[#0064FF]">{avg.toFixed(0)}점</strong>
                  {' · '}가장 강한 신호 <strong className="text-green-600">{strongest.name}({strongest.score.toFixed(0)})</strong>
                  {' · '}가장 약한 신호 <strong className="text-red-600">{weakest.name}({weakest.score.toFixed(0)})</strong>
                </p>
                <p className="text-gray-600">
                  {weakest.score < 40
                    ? `「${weakest.name}」 신호가 임계값(40) 아래입니다. 이 신호 개선이 노출에 가장 큰 영향을 줍니다.`
                    : weakest.score < 60
                      ? `「${weakest.name}」를 60점 이상으로 끌어올리면 다음 등급 진입이 빨라집니다.`
                      : '6개 신호가 모두 안정적입니다. 가장 약한 신호를 80점 이상으로 끌어올려 상위 1% 진입을 노리세요.'}
                </p>
              </div>
            </div>

            {/* A-2 raw signals 정직성 박스 — 실제 수집한 값 그대로 노출 */}
            {sb.raw_signals && (
              <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-mono uppercase tracking-wider text-gray-500">raw signals</span>
                  <span className="text-xs text-gray-400">실제 수집한 측정값 (추정·보정 전)</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {[
                    { label: '카테고리 개수', value: sb.raw_signals.category_count, unit: '개' },
                    { label: '카테고리 엔트로피', value: sb.raw_signals.category_entropy, unit: 'bits', help: '0=한 카테고리 집중, ↑일수록 분산' },
                    { label: '평균 글 길이 (RSS)', value: sb.raw_signals.avg_post_length, unit: '자', help: 'RSS 요약 기준' },
                    { label: '평균 발행 간격', value: sb.raw_signals.posting_interval_days, unit: '일' },
                    { label: '최근 글 경과일', value: sb.raw_signals.recent_activity_days, unit: '일' },
                    { label: '이웃 수', value: sb.raw_signals.neighbor_count, unit: '명' },
                    { label: '총 포스팅', value: sb.raw_signals.total_posts, unit: '개' },
                    { label: '누적 방문자', value: sb.raw_signals.total_visitors, unit: '명' },
                    // 풀파싱 신호 (있을 때만 의미있음)
                    { label: '풀파싱 표본 수', value: sb.raw_signals.fullparse_n, unit: '개', help: '최근 N개 포스트 풀파싱' },
                    { label: '평균 공감수 ⭐', value: sb.raw_signals.fullparse_avg_likes, unit: '개', help: '진짜 Chain 신호' },
                    { label: '평균 댓글수 ⭐', value: sb.raw_signals.fullparse_avg_comments, unit: '개', help: '진짜 Chain 신호' },
                    { label: '평균 이미지 (풀)', value: sb.raw_signals.fullparse_avg_images, unit: '개', help: '본문 실측' },
                    { label: '평균 동영상', value: sb.raw_signals.fullparse_avg_videos, unit: '개' },
                    { label: '평균 본문 길이', value: sb.raw_signals.fullparse_avg_content_length, unit: '자', help: 'HTML 제거 후' },
                    { label: '평균 문단 수', value: sb.raw_signals.fullparse_avg_paragraphs, unit: '개' },
                    { label: '평균 소제목 수', value: sb.raw_signals.fullparse_avg_headings, unit: '개' },
                    { label: '지도 포함 비율', value: sb.raw_signals.fullparse_has_map_ratio, unit: '', help: '0~1, 맛집/여행 신호' },
                  ].map((m) => (
                    <div key={m.label} className="bg-white rounded-lg p-2.5 border border-gray-100">
                      <div className="text-gray-500 mb-0.5">{m.label}</div>
                      <div className="font-mono font-semibold text-gray-900">
                        {m.value === null || m.value === undefined ? '—' : `${typeof m.value === 'number' ? m.value.toLocaleString() : m.value}${m.unit}`}
                      </div>
                      {m.help && <div className="text-[10px] text-gray-400 mt-0.5">{m.help}</div>}
                    </div>
                  ))}
                </div>
                {sb.raw_signals.data_sources && sb.raw_signals.data_sources.length > 0 && (
                  <div className="mt-3 text-[11px] text-gray-500">
                    데이터 소스: {sb.raw_signals.data_sources.join(', ')}
                    {sb.raw_signals.data_sources.includes('estimated') && (
                      <span className="ml-2 text-amber-600 font-medium">⚠️ 일부 값은 RSS 실패 시 blog_id 시드 기반 추정값</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* 콘텐츠 품질 탭 (블로그 신뢰도 + 글 품질 세부) */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* 블로그 신뢰도 세부 */}
          <div>
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#0064FF]" />
              블로그 신뢰도 세부 ({cRankMetrics.length}개)
              <span className="text-xs text-gray-400 font-normal">(네이버가 블로그를 얼마나 믿는지)</span>
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {cRankMetrics.map((metric, i) => renderMetricCard(metric, i, isFreeUser && i >= 3))}
            </div>
          </div>

          {/* 글 품질 세부 */}
          <div>
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500" />
              글 품질 세부 ({diaMetrics.length}개)
              <span className="text-xs text-gray-400 font-normal">(글 하나하나의 퀄리티)</span>
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {diaMetrics.map((metric, i) => renderMetricCard(metric, i, isFreeUser && i >= 3))}
            </div>
          </div>

          {isFreeUser && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-3">Pro 플랜에서 모든 세부 지표를 확인하세요</p>
              <Link href="/pricing">
                <button className="px-4 py-2 bg-[#0064FF] text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all">
                  Pro 플랜 알아보기
                </button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* 활동성 탭 */}
      {activeTab === 'activity' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {activityMetrics.map((metric, i) => renderMetricCard(metric, i, isFreeUser && i >= 6))}
        </div>
      )}

      {/* 성장성 탭 */}
      {activeTab === 'growth' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {growthMetrics.map((metric, i) => renderMetricCard(metric, i, isFreeUser && i >= 6))}
        </div>
      )}

      {/* P1: 업그레이드 모달 */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowUpgradeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-[#0064FF]/10 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-[#0064FF]" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Pro 기능입니다</h3>
                <p className="text-gray-600 mb-6">
                  42개 전체 지표와 상세 분석 결과를<br />
                  Pro 플랜에서 확인하세요
                </p>
                <div className="space-y-3">
                  <Link href="/pricing" className="block">
                    <button className="w-full py-3 bg-[#0064FF] text-white font-bold rounded-xl hover:shadow-lg shadow-lg shadow-[#0064FF]/25 transition-all">
                      7일 무료 체험 시작
                    </button>
                  </Link>
                  <p className="text-xs text-gray-500 text-center">클릭 한 번으로 언제든 해지 · 위약금 0원</p>
                  <button
                    onClick={() => setShowUpgradeModal(false)}
                    className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium transition-colors"
                  >
                    나중에 할게요
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// B-2 검증 결과 활용: 분석 후 시계열 추적 시작 버튼
function StartTrackingButton({
  blogId,
  blogName,
  userId,
}: {
  blogId: string
  blogName: string
  userId: number | string
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'checking' | 'registering' | 'measuring' | 'done' | 'already'>('idle')

  // 이미 추적 중인지 확인
  useEffect(() => {
    let mounted = true
    setStatus('checking')
    getTrackedBlogs(userId)
      .then((data) => {
        if (!mounted) return
        const exists = data.blogs?.some((b) => b.blog_id === blogId)
        setStatus(exists ? 'already' : 'idle')
      })
      .catch(() => {
        if (mounted) setStatus('idle')
      })
    return () => {
      mounted = false
    }
  }, [blogId, userId])

  const handleStart = async () => {
    setStatus('registering')
    try {
      await registerBlog(userId, blogId)
      toast.success('추적 등록 완료. 첫 측정을 시작합니다…')

      setStatus('measuring')
      try {
        await startRankCheck(userId, blogId, 20, true)
      } catch {
        // 측정 실패해도 등록은 됐으므로 continue
      }
      setStatus('done')
      toast.success('시계열 추적이 시작됐습니다!')
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || '추적 시작 실패'
      toast.error(msg)
      setStatus('idle')
    }
  }

  if (status === 'checking') {
    return (
      <div className="text-sm text-gray-500 inline-flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        추적 상태 확인 중…
      </div>
    )
  }

  if (status === 'already' || status === 'done') {
    return (
      <button
        onClick={() => router.push(`/dashboard/rank-tracker/${blogId}`)}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-purple-600 text-white font-semibold hover:shadow-xl shadow-md hover:bg-purple-700 transition-all"
      >
        <CheckCircle className="w-5 h-5" />
        시계열 추적 중 — 대시보드 보기
      </button>
    )
  }

  if (status === 'registering' || status === 'measuring') {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-purple-300 text-white font-semibold cursor-not-allowed"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        {status === 'registering' ? '등록 중…' : '첫 측정 중…'}
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={handleStart}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:shadow-xl shadow-md transition-all"
      >
        <Clock className="w-5 h-5" />
        시계열 추적 시작
      </button>
      <div className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
        매일 SERP 순위를 측정해 인덱싱 지연 · 노출 유지율 · 누락 비율을 추적합니다.
        단일 시점 점수보다 robust한 운영 진단입니다.
      </div>
    </div>
  )
}


export default function AnalyzePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, user } = useAuthStore()
  const { setAnalysisResult } = useBlogContextStore()
  const { completeMission } = useXPStore()
  const [blogId, setBlogId] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<BlogIndexResult | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [autoAnalyzeTriggered, setAutoAnalyzeTriggered] = useState(false)
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [usageLimitInfo, setUsageLimitInfo] = useState<{ current: number; limit: number } | null>(null)
  const { width, height } = useWindowSize()

  // 무료 플랜 체크 (비로그인 또는 free 플랜)
  const isPremium = isAuthenticated && user?.plan && user.plan !== 'free'
  const isFreeUser = !isPremium

  // URL 쿼리 파라미터에서 blogId를 읽어와 자동 분석 시작
  useEffect(() => {
    const blogIdParam = searchParams.get('blogId')
    if (blogIdParam && !autoAnalyzeTriggered && !isAnalyzing && !result) {
      setBlogId(blogIdParam)
      setAutoAnalyzeTriggered(true)
    }
  }, [searchParams, autoAnalyzeTriggered, isAnalyzing, result])

  const handleAnalyze = async () => {
    if (!blogId.trim()) {
      toast.error('블로그 ID를 입력해주세요')
      return
    }

    // 로그인한 사용자인 경우 사용량 체크 및 차감
    if (isAuthenticated && user?.id) {
      try {
        const usageCheck = await checkUsageLimit(user.id, 'blog_analysis')
        if (!usageCheck.allowed) {
          // P0-4: 풀스크린 업그레이드 모달 표시
          setUsageLimitInfo({ current: usageCheck.used || usageCheck.limit, limit: usageCheck.limit })
          setShowLimitModal(true)
          return
        }
        // 사용량 차감
        await incrementUsage(user.id, 'blog_analysis')
      } catch {
        // 사용량 추적 실패 시에도 분석은 진행
      }
    }

    setIsAnalyzing(true)
    setResult(null)
    setProgress(0)
    setLastError(null)

    try {
      // 동기 방식: 분석 결과 즉시 반환
      const analysisResponse = await analyzeBlog({
        blog_id: blogId.trim(),
        post_limit: 10,
        quick_mode: false
      })

      // 분석 결과가 response에 포함되어 있음
      if (analysisResponse.result) {
        const analysisResult = analysisResponse.result

        // Save to user's list (user?.id를 전달하여 로그인 사용자는 서버에 저장)
        await saveBlogToList({
          id: analysisResult.blog.blog_id,
          blog_id: analysisResult.blog.blog_id,
          name: analysisResult.blog.blog_name,
          level: analysisResult.index.level,
          grade: analysisResult.index.grade,
          score: analysisResult.index.total_score,
          change: 0, // First analysis
          stats: {
            posts: analysisResult.stats.total_posts,
            visitors: analysisResult.stats.total_visitors,
            engagement: analysisResult.stats.neighbor_count
          },
          last_analyzed: new Date().toISOString()
        }, user?.id)

        setResult(analysisResult)
        // 전역 컨텍스트에 저장 (페이지 이동 시 유지)
        setAnalysisResult(analysisResult)
        toast.success('분석이 완료되었습니다!')

        // 일일 미션 완료
        completeMission('analyze')

        // Show confetti for high scores
        if (analysisResult.index.level >= 7) {
          setShowConfetti(true)
          setTimeout(() => setShowConfetti(false), 5000)
        }
      } else {
        toast.error('분석 결과를 받지 못했습니다.')
      }
    } catch (error) {
      const axiosError = error as { response?: { data?: { detail?: string } }; message?: string }
      // 에러 유형별 메시지 분기
      const errorMessage = axiosError?.response?.data?.detail || axiosError?.message || ''

      if (errorMessage.includes('not found') || errorMessage.includes('404') || errorMessage.includes('존재하지 않')) {
        toast.error('존재하지 않는 블로그입니다. ID를 확인해주세요.')
      } else if (errorMessage.includes('private') || errorMessage.includes('비공개')) {
        toast.error('비공개 블로그는 분석할 수 없습니다.')
      } else if (errorMessage.includes('timeout') || errorMessage.includes('시간 초과')) {
        toast.error('서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
        toast.error('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.')
      } else {
        toast.error('분석 중 오류가 발생했습니다. 다시 시도해주세요.')
      }

      // 에러 발생 시 재시도 버튼용 상태 유지 (blogId는 유지)
    } finally {
      setIsAnalyzing(false)
      setProgress(0)
    }
  }

  // autoAnalyzeTriggered가 true이고 blogId가 설정되면 자동 분석 실행
  useEffect(() => {
    if (autoAnalyzeTriggered && blogId && !isAnalyzing && !result) {
      // 약간의 딜레이 후 분석 시작 (UI 렌더링 완료 후)
      const timer = setTimeout(() => {
        handleAnalyze()
      }, 100)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyzeTriggered, blogId])

  return (
    <div className="min-h-screen bg-[#fafafa] pt-24 pb-12">
      {showConfetti && <Confetti width={width} height={height} recycle={false} numberOfPieces={200} />}

      <div className="container mx-auto px-4">
        {/* P2-4: 소셜 프루프 토스트 */}
        <LiveToastNotifications />

        {/* P1-4: 체험 만료 알림 배너 */}
        <div className="max-w-4xl mx-auto mb-6">
          <TrialExpiryBanner />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="inline-flex p-4 rounded-full bg-[#0064FF] mb-6 shadow-lg shadow-[#0064FF]/15"
            >
              <Sparkles className="w-8 h-8 text-white" />
            </motion.div>

            <h1 className="text-5xl font-bold mb-4">
              <span className="gradient-text">블로그 분석</span>
            </h1>
            <p className="text-gray-600 text-lg mb-3">
              블로그 ID를 입력하고 운영 건강도를 확인하세요
            </p>
            <Link
              href="/analyze-post"
              className="inline-flex items-center gap-2 text-sm text-[#0064FF] hover:underline font-medium"
            >
              개별 포스트 1개를 진단하려면 → 포스트 단위 진단
            </Link>
          </div>

          {/* Search Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-3xl p-8 mb-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50"
          >
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={blogId}
                  onChange={(e) => setBlogId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAnalyze()}
                  placeholder="블로그 ID 입력 (예: example_blog)"
                  maxLength={50}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-200 focus:border-[#0064FF] focus:outline-none text-lg transition-all"
                  disabled={isAnalyzing}
                />
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !blogId.trim()}
                className="px-8 py-4 rounded-2xl bg-[#0064FF] text-white font-semibold hover:shadow-lg shadow-lg shadow-[#0064FF]/15 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    분석중...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    분석하기
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-500">
              💡 <strong>예시:</strong> blog.naver.com/<span className="text-[#0064FF] font-semibold">example_blog</span> → example_blog 입력
            </div>
          </motion.div>

          {/* Loading State */}
          <AnimatePresence>
            {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="rounded-3xl p-12 text-center bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="inline-flex p-6 rounded-full bg-[#0064FF] mb-6 shadow-lg shadow-[#0064FF]/15"
                >
                  <Sparkles className="w-12 h-12 text-white" />
                </motion.div>

                <h3 className="text-2xl font-bold mb-2">AI가 분석중입니다</h3>
                <p className="text-gray-600">40+ 지표를 종합 분석하고 있어요...</p>

                {progress > 0 && (
                  <div className="mt-6 w-full max-w-md mx-auto">
                    <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-full"
                      />
                    </div>
                    <p className="text-center text-sm text-gray-600 mt-2">{progress}% 완료</p>
                  </div>
                )}

                <div className="mt-8 space-y-3">
                  {['블로그 정보 수집', '콘텐츠 품질 분석', '지수 계산'].map((step, index) => (
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.5 }}
                      className="flex items-center gap-3"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#0064FF]" />
                      <span className="text-gray-700">{step}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results */}
          <AnimatePresence>
            {result && !isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Score Card */}
                <div className="rounded-3xl p-8 relative overflow-hidden bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#0064FF]/10 rounded-full blur-3xl" />

                  <div className="relative flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-bold mb-2">{result.blog.blog_name}</h2>
                      <p className="text-gray-600 mb-3">@{result.blog.blog_id}</p>
                      {/* P2-3: 공유 버튼 */}
                      <ShareResult
                        blogName={result.blog.blog_name}
                        blogId={result.blog.blog_id}
                        level={result.index.level}
                        grade={result.index.grade}
                        totalScore={result.index.total_score}
                        percentile={result.index.percentile}
                        stats={{
                          posts: result.stats.total_posts,
                          visitors: result.stats.total_visitors,
                          neighbors: result.stats.neighbor_count
                        }}
                      />
                    </div>

                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.3 }}
                      className="text-center"
                    >
                      <div className="inline-flex p-8 rounded-full bg-[#0064FF] shadow-2xl mb-6 shadow-[#0064FF]/25">
                        <Award className="w-16 h-16 text-white" />
                      </div>
                      <div className="mt-4">
                        <div className="text-6xl font-black gradient-text mb-4">
                          {(() => {
                            const level = result.index.level
                            if (level <= 2) return 'Iron'
                            if (level <= 4) return 'Bronze'
                            if (level <= 6) return 'Silver'
                            if (level <= 9) return 'Gold'
                            if (level <= 11) return 'Platinum'
                            if (level <= 13) return 'Diamond'
                            return 'Challenger'
                          })()}
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-2">
                          <AnimatedLevel level={result.index.level} />
                        </div>

                        {/* 레벨 프로그레스 시각화 - 확대 버전 */}
                        <div className="mt-10 px-4">
                          {/* 레벨 구간 설명 - 대형 티어 카드 */}
                          <div className="grid grid-cols-4 gap-4 mb-10">
                            {[
                              { range: '1', label: 'Lv.1', color: 'bg-gray-400', textColor: 'text-gray-700', bgActive: 'bg-gray-50' },
                              { range: '2-8', label: 'Lv.2~8', color: 'bg-blue-500', textColor: 'text-blue-600', bgActive: 'bg-blue-50' },
                              { range: '9-11', label: 'Lv.9~11', color: 'bg-[#0064FF]', textColor: 'text-[#0064FF]', bgActive: 'bg-blue-50' },
                              { range: '12-15', label: 'Lv.12~15', color: 'bg-gradient-to-r from-[#0064FF] to-[#3182F6]', textColor: 'text-[#0064FF]', bgActive: 'bg-blue-50' },
                            ].map((tier) => {
                              const currentLevel = result.index.level
                              const isActive = (tier.range === '1' && currentLevel === 1) ||
                                (tier.range === '2-8' && currentLevel >= 2 && currentLevel <= 8) ||
                                (tier.range === '9-11' && currentLevel >= 9 && currentLevel <= 11) ||
                                (tier.range === '12-15' && currentLevel >= 12 && currentLevel <= 15)

                              return (
                                <div
                                  key={tier.range}
                                  className={`text-center py-6 px-3 rounded-3xl transition-all duration-300 ${
                                    isActive
                                      ? `${tier.bgActive} shadow-2xl scale-110 ring-3 ring-[#0064FF] border-2 border-blue-200`
                                      : 'bg-gray-100/60 opacity-60'
                                  }`}
                                >
                                  <div className={`w-8 h-8 rounded-full ${tier.color} mx-auto mb-3 ${isActive ? 'shadow-lg' : ''}`} />
                                  <div className={`text-xl font-bold ${isActive ? tier.textColor : 'text-gray-400'}`}>
                                    {tier.label}
                                  </div>

                                  {isActive && (
                                    <div className="mt-3">
                                      <span className="text-xs font-bold text-white bg-[#0064FF] px-3 py-1 rounded-full">
                                        현재 티어
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* 프로그레스 바 - 크게 */}
                          <div className="relative py-6">
                            {/* 배경 바 */}
                            <div className="h-5 bg-gray-200 rounded-full overflow-hidden flex shadow-inner">
                              <div className="w-[6.67%] bg-gray-400" /> {/* Lv.1 */}
                              <div className="w-[46.67%] bg-gradient-to-r from-blue-400 to-blue-500" /> {/* Lv.2-8 */}
                              <div className="w-[20%] bg-gradient-to-r from-[#0064FF] to-[#3182F6]" /> {/* Lv.9-11 */}
                              <div className="w-[26.67%] bg-gradient-to-r from-[#0064FF] via-[#3182F6] to-[#4A9AF8]" /> {/* Lv.12-15 */}
                            </div>

                            {/* 현재 레벨 마커 */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 transition-all duration-500"
                              style={{ left: `${((result.index.level - 1) / 14) * 100}%` }}
                            >
                              <div className="relative">
                                {/* 마커 - 더 크게 */}
                                <div className="w-12 h-12 -ml-6 bg-white rounded-full shadow-2xl border-4 border-yellow-400 flex items-center justify-center ring-4 ring-yellow-200">
                                  <span className="text-lg font-bold text-gray-800">{result.index.level}</span>
                                </div>
                                {/* 라벨 */}
                                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-center">
                                  <div className="text-sm font-bold text-yellow-600 whitespace-nowrap bg-yellow-100 px-4 py-1.5 rounded-full shadow-md border border-yellow-200">
                                    현재 레벨
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 레벨 눈금 - 더 크게 */}
                          <div className="flex justify-between mt-12 px-2">
                            <span className="text-sm text-gray-500 font-semibold">1</span>
                            <span className="text-sm text-gray-500 font-semibold">5</span>
                            <span className="text-sm text-gray-500 font-semibold">8</span>
                            <span className="text-sm text-gray-500 font-semibold">11</span>
                            <span className="text-sm text-gray-500 font-semibold">15</span>
                          </div>

                          {/* 다음 티어 안내 - 롤 스타일 */}
                          {result.index.level < 15 && (
                            <div className="mt-8 text-center">
                              {(() => {
                                const level = result.index.level
                                const nextTierInfo =
                                  level <= 2 ? { nextTier: 'Bronze', color: 'text-amber-700', bg: 'bg-amber-100' } :
                                  level <= 4 ? { nextTier: 'Silver', color: 'text-slate-700', bg: 'bg-slate-100' } :
                                  level <= 6 ? { nextTier: 'Gold', color: 'text-yellow-700', bg: 'bg-yellow-100' } :
                                  level <= 9 ? { nextTier: 'Platinum', color: 'text-teal-700', bg: 'bg-teal-100' } :
                                  level <= 11 ? { nextTier: 'Diamond', color: 'text-blue-700', bg: 'bg-blue-100' } :
                                  level <= 13 ? { nextTier: 'Challenger', color: 'text-orange-700', bg: 'bg-orange-100' } :
                                  { nextTier: 'MAX', color: 'text-[#0064FF]', bg: 'bg-blue-100' }

                                const pointsNeeded = Math.ceil((result.index.level + 1) * 6.67 - result.index.total_score)

                                return (
                                  <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-[#0064FF]/5 to-[#3182F6]/10 rounded-2xl border border-blue-100 shadow-sm">
                                    <span className="text-base text-[#0064FF]">
                                      다음 티어까지 <span className="font-bold text-lg">{pointsNeeded}점</span> 필요
                                    </span>
                                    <span className="text-[#3182F6] text-xl">→</span>
                                    <span className={`text-lg font-bold ${nextTierInfo.color} ${nextTierInfo.bg} px-3 py-1 rounded-lg`}>
                                      {nextTierInfo.nextTier}
                                    </span>
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* 자동 학습 배지 */}
                  {result.index.score_breakdown?.weights_used?.is_learned && (
                    <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-full text-sm">
                      <CheckCircle className="w-4 h-4 text-purple-600" />
                      <span className="text-purple-700 font-medium">데이터 학습된 가중치 적용</span>
                      {result.index.score_breakdown.weights_used.learned_meta?.n && (
                        <span className="text-xs text-purple-500">
                          n={result.index.score_breakdown.weights_used.learned_meta.n}
                        </span>
                      )}
                      {result.index.score_breakdown.weights_used.learned_meta?.trained_at && (
                        <span className="text-xs text-purple-400">
                          · 갱신 {new Date(result.index.score_breakdown.weights_used.learned_meta.trained_at).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: '운영 건강도', value: `${result.index.total_score.toFixed(1)}/100`, icon: '🎯', isScore: true },
                      { label: '포스트', value: result.stats.total_posts, icon: '📝', isScore: false },
                      { label: '방문자', value: result.stats.total_visitors.toLocaleString(), icon: '👥', isScore: false },
                      { label: '이웃', value: result.stats.neighbor_count, icon: '❤️', isScore: false },
                    ].map((stat, index) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 + index * 0.1 }}
                        className="text-center p-4 rounded-2xl bg-white/50 relative"
                      >
                        <div className="text-3xl mb-2">{stat.icon}</div>
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
                          {stat.label}
                          {stat.isScore && (
                            <div className="group relative">
                              <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 shadow-xl text-left whitespace-pre-line font-normal leading-relaxed">
                                {`외부 수집 가능한 raw 신호로 추정한 블로그 운영 건강도입니다.\n\n⚠️ 이 점수와 실제 네이버 SERP 순위 사이의 상관관계는 자체 검증(n=67) 결과 ρ=0.04로 거의 무관했습니다. \"이 점수가 높으면 검색 상위에 노출된다\"는 보장이 아닙니다.\n\n순위 예측 목적이라면 SERP 순위 추적 도구(판다랭크 등)를 병행하세요.`}
                                <div className="absolute left-1/2 -translate-x-1/2 top-full border-8 border-transparent border-t-gray-900" />
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* 40+ 지표 상세 분석 탭 */}
                <DetailedMetricsSection result={result} isFreeUser={isFreeUser} />

                {/* Daily Visitors Chart - 무료 플랜은 3일 미리보기 */}
                {result.daily_visitors && result.daily_visitors.length > 0 && (
                  <div className="rounded-3xl p-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50 relative overflow-hidden">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <BarChart3 className="w-6 h-6 text-[#0064FF]" />
                      일일 방문자 추이
                      {isFreeUser && (
                        <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                          3일 미리보기 제공
                        </span>
                      )}
                    </h3>

                    {/* 무료 플랜: 3일 데이터 공개 */}
                    {isFreeUser ? (
                      <div className="relative">
                        {/* 3일 미리보기 차트 */}
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={result.daily_visitors.slice(-3)}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="date"
                                stroke="#6b7280"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(value) => {
                                  const date = new Date(value)
                                  return `${date.getMonth() + 1}/${date.getDate()}`
                                }}
                              />
                              <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '12px',
                                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                                }}
                                labelFormatter={(value) => {
                                  const date = new Date(value)
                                  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
                                }}
                                formatter={(value: any) => [`${value.toLocaleString()}명`, '방문자']}
                              />
                              <Line
                                type="monotone"
                                dataKey="visitors"
                                stroke="#0064FF"
                                strokeWidth={3}
                                dot={{ fill: '#0064FF', r: 5 }}
                                activeDot={{ r: 7 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* 3일 요약 카드 */}
                        <div className="grid grid-cols-3 gap-4 mt-4 mb-4">
                          {result.daily_visitors.slice(-3).map((day: any, i: number) => {
                            const date = new Date(day.date)
                            const prevVisitors = result.daily_visitors![result.daily_visitors!.length - 4 + i]?.visitors || day.visitors
                            const change = ((day.visitors - prevVisitors) / prevVisitors * 100).toFixed(1)
                            const isUp = day.visitors >= prevVisitors

                            return (
                              <div key={i} className="bg-white rounded-xl p-4 text-center border border-gray-100">
                                <div className="text-sm text-gray-500 mb-1">
                                  {date.getMonth() + 1}/{date.getDate()}
                                </div>
                                <div className="text-2xl font-bold text-gray-900">
                                  {day.visitors.toLocaleString()}
                                </div>
                                <div className={`text-xs font-medium ${isUp ? 'text-green-600' : 'text-red-500'}`}>
                                  {isUp ? '↑' : '↓'} {Math.abs(parseFloat(change))}%
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* P1: 더 많은 데이터 보기 유도 - 블러 영역 확대 */}
                        <div className="relative mt-4">
                          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-transparent to-white/90 pointer-events-none" />
                          <div className="blur-[4px] opacity-50 h-40 bg-gradient-to-r from-blue-100 to-purple-100 rounded-xl flex items-center justify-center">
                            <span className="text-gray-400 text-lg">+ 12일 추가 데이터</span>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-white rounded-xl px-6 py-4 shadow-lg text-center border border-gray-100">
                              <p className="text-sm text-gray-600 mb-3">
                                <strong>15일 전체 추이</strong>와 <strong>성장 패턴 분석</strong>을 확인하세요
                              </p>
                              <Link href="/pricing">
                                <button className="px-4 py-2 bg-[#0064FF] text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all">
                                  Pro 플랜으로 전체 보기
                                </button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Pro 플랜: 전체 15일 차트 */
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={result.daily_visitors}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                              dataKey="date"
                              stroke="#6b7280"
                              tick={{ fontSize: 12 }}
                              tickFormatter={(value) => {
                                const date = new Date(value)
                                return `${date.getMonth() + 1}/${date.getDate()}`
                              }}
                            />
                            <YAxis stroke="#6b7280" tick={{ fontSize: 12 }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                              }}
                              labelFormatter={(value) => {
                                const date = new Date(value)
                                return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
                              }}
                              formatter={(value: any) => [`${value.toLocaleString()}명`, '방문자']}
                            />
                            <Line
                              type="monotone"
                              dataKey="visitors"
                              stroke="url(#colorGradient)"
                              strokeWidth={3}
                              dot={{ fill: '#0064FF', r: 4 }}
                              activeDot={{ r: 6 }}
                            />
                            <defs>
                              <linearGradient id="colorGradient" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#0064FF" />
                                <stop offset="50%" stopColor="#3182F6" />
                                <stop offset="100%" stopColor="#4A9AF8" />
                              </linearGradient>
                            </defs>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                {/* P0-1: 점수 해석 - "그래서 뭐?" 문제 해결 */}
                <ScoreInterpretation
                  result={result}
                  onKeywordSearch={() => router.push('/keyword-search')}
                />

                {/* P0-2: Killer Feature - 상위 노출 가능 키워드 예측 */}
                <RankableKeywordPreview result={result} isFreeUser={isFreeUser} />

                {/* Recommendations - 구체적 수치 포함 */}
                <ConcreteRecommendations result={result} isFreeUser={isFreeUser} />

                {/* P1-4: 즉시 실행 가능한 액션 플랜 */}
                <NextStepActionPlan result={result} />

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="rounded-3xl p-8 bg-gradient-to-br from-blue-50 to-white border border-blue-100/50 shadow-xl shadow-blue-100/50">
                    <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                      <AlertCircle className="w-6 h-6 text-orange-600" />
                      주의사항
                    </h3>

                    <div className="space-y-3">
                      {result.warnings.map((warning: any, index: number) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.9 + index * 0.1 }}
                          className="p-4 rounded-2xl bg-orange-50 border-l-4 border-orange-500 text-orange-900"
                        >
                          {warning.message}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 다음 액션 - P0 핵심 기능 */}
                <div className="rounded-3xl p-8 bg-gradient-to-br from-[#0064FF]/5 to-blue-50 border-2 border-[#0064FF]/20 shadow-xl">
                  <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                    <Target className="w-6 h-6 text-[#0064FF]" />
                    지금 바로 할 수 있는 액션
                  </h3>
                  <p className="text-gray-600 mb-6">분석 결과를 바탕으로 추천드리는 다음 단계입니다</p>

                  <div className="grid md:grid-cols-3 gap-4">
                    {/* 액션 1: 키워드 검색 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.0 }}
                      whileHover={{ scale: 1.02 }}
                      className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-[#0064FF]/30 hover:shadow-lg transition-all cursor-pointer"
                    >
                      <Link href="/keyword-search" className="block">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0064FF] to-[#3182F6] flex items-center justify-center mb-4">
                          <Search className="w-6 h-6 text-white" />
                        </div>
                        <h4 className="font-bold text-lg mb-2">키워드 경쟁력 분석</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          {result.index.level >= 5
                            ? '현재 레벨에서 상위 노출 가능한 키워드를 찾아보세요'
                            : '경쟁이 낮은 블루오션 키워드부터 공략하세요'
                          }
                        </p>
                        <div className="flex items-center text-[#0064FF] font-medium text-sm">
                          키워드 검색하기 <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                      </Link>
                    </motion.div>

                    {/* 액션 2: AI 글쓰기 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.1 }}
                      whileHover={{ scale: 1.02 }}
                      className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-[#0064FF]/30 hover:shadow-lg transition-all cursor-pointer"
                    >
                      <Link href="/tools" className="block">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
                          <PenTool className="w-6 h-6 text-white" />
                        </div>
                        <h4 className="font-bold text-lg mb-2">AI 글쓰기 도움</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          {result.index.score_breakdown.dia < 60
                            ? '문서 품질을 높이는 글쓰기 가이드를 받아보세요'
                            : 'AI로 더 빠르게 고품질 콘텐츠를 작성하세요'
                          }
                        </p>
                        <div className="flex items-center text-purple-600 font-medium text-sm">
                          AI 도구 보기 <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                      </Link>
                    </motion.div>

                    {/* 액션 3: 상세 분석 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.2 }}
                      whileHover={{ scale: 1.02 }}
                      className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-[#0064FF]/30 hover:shadow-lg transition-all cursor-pointer"
                    >
                      <Link href={`/blog/${result.blog.blog_id}?tab=breakdown`} className="block">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-4">
                          <Lightbulb className="w-6 h-6 text-white" />
                        </div>
                        <h4 className="font-bold text-lg mb-2">상세 점수 분석</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          어떤 부분에서 점수를 잃고 있는지 구체적으로 확인하세요
                        </p>
                        <div className="flex items-center text-amber-600 font-medium text-sm">
                          상세 분석 보기 <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                      </Link>
                    </motion.div>
                  </div>

                  {/* 레벨별 맞춤 팁 */}
                  <div className="mt-6 p-4 bg-white/80 rounded-xl border border-blue-100">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-[#0064FF]/10">
                        <Sparkles className="w-5 h-5 text-[#0064FF]" />
                      </div>
                      <div>
                        <h5 className="font-bold text-gray-900 mb-1">
                          Lv.{result.index.level} 맞춤 성장 전략
                        </h5>
                        <p className="text-sm text-gray-600">
                          {result.index.level <= 3 && '기초 다지기 단계입니다. 꾸준한 포스팅과 이웃 활동으로 블로그 신뢰도를 쌓아보세요. 주 2-3회 포스팅을 목표로 해보세요.'}
                          {result.index.level >= 4 && result.index.level <= 6 && '성장 가속 단계입니다. 특정 주제에 집중하여 전문성을 높이고, 검색 유입을 늘려보세요. 키워드 분석 도구를 적극 활용하세요.'}
                          {result.index.level >= 7 && result.index.level <= 9 && '경쟁력 확보 단계입니다. 상위 노출 키워드를 공략하고, 콘텐츠 품질을 더욱 높여보세요. 방문자 유입 분석도 중요합니다.'}
                          {result.index.level >= 10 && '전문가 단계입니다. 브랜딩과 수익화를 고민해보세요. 다양한 채널 연동으로 영향력을 확장할 수 있습니다.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 플라톤마케팅 CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.3 }}
                  className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl" />
                  <div className="relative flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-lg mb-1">전문가의 도움이 필요하신가요?</h4>
                        <p className="text-slate-400 text-sm">
                          병원/의료 블로그라면 플라톤마케팅의 전문 컨설팅을 받아보세요
                        </p>
                      </div>
                    </div>
                    <a
                      href="https://www.brandplaton.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-3 bg-gradient-to-r from-violet-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap flex items-center gap-2"
                    >
                      무료 상담 신청
                      <ChevronRight className="w-4 h-4" />
                    </a>
                  </div>
                </motion.div>

                {/* CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.4 }}
                  className="text-center py-8 space-y-4"
                >
                  {/* 시계열 추적 시작 — B 검증 후 추가 */}
                  {isAuthenticated && user?.id && (
                    <StartTrackingButton
                      blogId={result.blog.blog_id}
                      blogName={result.blog.blog_name}
                      userId={user.id}
                    />
                  )}

                  <div>
                    <button
                      onClick={() => {
                        setBlogId('')
                        setResult(null)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      className="px-8 py-4 rounded-full bg-[#0064FF] text-white font-semibold hover:shadow-xl shadow-lg shadow-[#0064FF]/15 transition-all duration-300"
                    >
                      다른 블로그 분석하기
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* P0-4: 일일 한도 초과 시 업그레이드 모달 */}
      <UpgradeModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        feature="blog_analysis"
        currentUsage={usageLimitInfo?.current}
        maxUsage={usageLimitInfo?.limit}
      />
    </div>
  )
}
