'use client'

import { motion } from 'framer-motion'

/**
 * P3-1: 스켈레톤 로딩 UI 컴포넌트
 * 콘텐츠 로딩 중 placeholder를 표시하여 체감 로딩 시간 개선
 */

interface SkeletonProps {
  className?: string
  animate?: boolean
}

// 기본 스켈레톤 블록
export function Skeleton({ className = '', animate = true }: SkeletonProps) {
  return (
    <div
      className={`bg-gray-200 rounded ${animate ? 'animate-pulse' : ''} ${className}`}
    />
  )
}

// 텍스트 라인 스켈레톤
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

// 블로그 분석 결과 카드 스켈레톤
export function SkeletonAnalysisCard() {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-10 w-20 rounded-lg" />
      </div>

      {/* 점수 영역 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="text-center p-4 bg-gray-50 rounded-xl">
            <Skeleton className="h-8 w-16 mx-auto mb-2" />
            <Skeleton className="h-3 w-12 mx-auto" />
          </div>
        ))}
      </div>

      {/* 상세 정보 */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  )
}

// 키워드 검색 결과 테이블 행 스켈레톤
export function SkeletonTableRow() {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Skeleton className="w-8 h-8 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      </td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-12 mx-auto" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-16 mx-auto" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-20 mx-auto" /></td>
    </tr>
  )
}

// 키워드 검색 결과 전체 스켈레톤
export function SkeletonKeywordResults() {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* 헤더 */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* 인사이트 요약 */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="text-center">
              <Skeleton className="h-6 w-12 mx-auto mb-1" />
              <Skeleton className="h-3 w-16 mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            {['순위', '블로그', '레벨', '점수', '포스트'].map((header) => (
              <th key={header} className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonTableRow key={i} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 블루오션 카드 스켈레톤
export function SkeletonBlueOceanCard() {
  return (
    <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
      {/* 상단 */}
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-8 w-12" />
      </div>

      {/* 키워드 */}
      <Skeleton className="h-6 w-32 mb-3" />

      {/* 지표 그리드 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white/60 rounded-lg py-2 text-center">
            <Skeleton className="h-3 w-10 mx-auto mb-1" />
            <Skeleton className="h-4 w-8 mx-auto" />
          </div>
        ))}
      </div>

      {/* 프로그레스 바 */}
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  )
}

// 대시보드 통계 카드 스켈레톤
export function SkeletonStatCard() {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-8 w-20 mb-1" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

// 풀페이지 로딩 스켈레톤 (페이지 전체)
export function SkeletonPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gray-50 p-4 md:p-6"
    >
      {/* 헤더 */}
      <div className="max-w-4xl mx-auto mb-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* 메인 카드 */}
      <div className="max-w-4xl mx-auto">
        <SkeletonAnalysisCard />
      </div>
    </motion.div>
  )
}

// 리스트 아이템 스켈레톤
export function SkeletonListItem() {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100">
      <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-4 w-3/4 mb-1" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
    </div>
  )
}

export default Skeleton
