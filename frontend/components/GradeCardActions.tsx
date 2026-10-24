'use client'

import { Download, Link2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { CARD_HONESTY_NOTE, cardImagePath, cardPageUrl, isValidBlogId } from '@/lib/blogCard'

/**
 * 분석 결과 화면의 "등급 카드 저장 / 공유 링크 복사".
 * 카드 페이지·이미지는 저장된 분석 결과만 읽는다(새 수집 없음).
 * 측정 불가(level=null)면 렌더하지 않는다.
 */
export default function GradeCardActions({
  blogId,
  level,
  estimated,
}: {
  blogId: string
  level: number | null | undefined
  estimated?: boolean
}) {
  if (level == null || !isValidBlogId(blogId)) return null

  const pageUrl = cardPageUrl(blogId)
  const imagePath = cardImagePath(blogId)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl)
      toast.success('등급 카드 링크를 복사했습니다')
    } catch {
      toast.error('복사하지 못했습니다. 주소를 직접 복사해 주세요: ' + pageUrl)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={imagePath}
        download={`${blogId}-grade-card.png`}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Download className="h-4 w-4" />
        등급 카드 저장
      </a>
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Link2 className="h-4 w-4" />
        공유 링크 복사
      </button>
      <span className="text-xs text-gray-400">
        {CARD_HONESTY_NOTE}
        {/* 추정 등급은 서버가 저장하지 않는다 — 카드는 마지막 완전 측정분(없으면 '기록 없음')을 보여준다 */}
        {estimated ? ' · 추정 등급은 카드에 반영되지 않습니다(마지막 정확 측정 기준)' : ''}
      </span>
    </div>
  )
}
