'use client'

import { useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * P2-2: 전문 용어 툴팁 컴포넌트
 * C-Rank, DIA, BOS 등 전문 용어에 대한 설명을 제공
 */

// 전문 용어 정의
export const TERM_DEFINITIONS: Record<string, { title: string; description: string; detail?: string }> = {
  'c-rank': {
    title: 'C-Rank (블로그 신뢰도)',
    description: '네이버가 블로그에 부여하는 신뢰도 점수입니다.',
    detail: '주제 일관성, 활동 이력, 스팸 비율 등을 종합적으로 평가합니다. C-Rank가 높을수록 검색 상위 노출 가능성이 높아집니다.'
  },
  'dia': {
    title: 'D.I.A. (글 품질 점수)',
    description: '개별 글의 품질을 평가하는 점수입니다.',
    detail: 'Document Intelligence Analysis의 약자로, 글의 정보량, 가독성, 이미지 활용도, 독창성 등을 종합 평가합니다.'
  },
  'bos': {
    title: 'BOS (블루오션 점수)',
    description: '키워드의 진입 난이도를 0~100점으로 나타낸 점수입니다.',
    detail: '점수가 높을수록 경쟁이 낮고 진입하기 좋은 키워드입니다. 80점 이상은 "황금 키워드"로 분류됩니다.'
  },
  'level': {
    title: '블로그 레벨 (0~11)',
    description: '블로그의 전체적인 경쟁력을 나타내는 등급입니다.',
    detail: '0~3: 신규 블로그 (하위 60%), 4~6: 성장 블로그 (상위 40~25%), 7~8: 우수 블로그 (상위 25~10%), 9~11: 최상위 블로그 (상위 10%). 레벨 9 이상이면 대부분의 키워드에서 경쟁 가능합니다.'
  },
  'percentile': {
    title: '상위 퍼센트',
    description: '전체 블로그 중 내 블로그의 위치입니다.',
    detail: '예: 상위 15%는 전체 블로그 중 상위 15%에 해당하는 점수를 가졌다는 뜻입니다. 퍼센트가 낮을수록 높은 순위입니다.'
  },
  'competition': {
    title: '경쟁도',
    description: '해당 키워드에서 상위 노출되기 위한 난이도입니다.',
    detail: 'Low(낮음): 내 레벨로 충분히 경쟁 가능, Medium(보통): 노력하면 가능, High(높음): 레벨 업이 필요할 수 있음. 경쟁도는 상위 노출된 블로그들의 평균 레벨과 내 레벨을 비교하여 산출됩니다.'
  },
  'view-tab': {
    title: 'VIEW 탭',
    description: '네이버 검색 결과의 "VIEW" 탭을 의미합니다.',
    detail: '블로그, 카페 등의 콘텐츠가 통합 노출되는 탭으로, 블로그 탭보다 노출 경쟁이 더 치열합니다.'
  },
  'search-volume': {
    title: '월간 검색량',
    description: '해당 키워드가 한 달 동안 검색된 횟수입니다.',
    detail: 'PC와 모바일 검색량을 합산한 수치입니다. 검색량이 높을수록 트래픽 잠재력이 크지만 경쟁도 치열합니다.'
  },
  'entry-chance': {
    title: '경쟁력 지수',
    description: '해당 키워드에서 상위 10위 안에 진입할 경쟁력을 나타냅니다.',
    detail: '현재 블로그 점수와 상위 10개 블로그의 평균 점수를 비교하여 산출합니다. 100점 만점 기준입니다.'
  },
  'influencer': {
    title: '인플루언서',
    description: '네이버 공식 인플루언서로 선정된 블로거입니다.',
    detail: '인플루언서는 검색에서 우선 노출되는 혜택이 있어, 인플루언서가 많은 키워드는 경쟁이 더 어렵습니다.'
  }
}

interface TermTooltipProps {
  term: keyof typeof TERM_DEFINITIONS
  children?: React.ReactNode
  className?: string
  iconSize?: number
}

export default function TermTooltip({ term, children, className = '', iconSize = 14 }: TermTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const definition = TERM_DEFINITIONS[term]

  if (!definition) return <>{children}</>

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {children}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center text-gray-400 hover:text-[#0064FF] transition-colors"
        aria-label={`${definition.title} 설명 보기`}
      >
        <HelpCircle style={{ width: iconSize, height: iconSize }} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-50"
              onClick={() => setIsOpen(false)}
            />

            {/* Tooltip Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-bold text-gray-900">{definition.title}</h4>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <p className="text-gray-700 text-sm mb-2">{definition.description}</p>
                {definition.detail && (
                  <p className="text-gray-500 text-xs leading-relaxed">{definition.detail}</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </span>
  )
}

/**
 * 인라인 툴팁 (호버 시 표시)
 */
export function InlineTermTooltip({ term, children, className = '' }: Omit<TermTooltipProps, 'iconSize'>) {
  const [isHovered, setIsHovered] = useState(false)
  const definition = TERM_DEFINITIONS[term]

  if (!definition) return <>{children}</>

  return (
    <span
      className={`relative inline-flex items-center gap-1 cursor-help ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      <HelpCircle className="w-3.5 h-3.5 text-gray-400" />

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-xl shadow-xl z-50"
          >
            <div className="font-bold mb-1">{definition.title}</div>
            <div className="text-gray-300">{definition.description}</div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
