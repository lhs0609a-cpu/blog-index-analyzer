'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Share2, Download, Twitter, MessageCircle, Link2, Check, X, Camera } from 'lucide-react'
import toast from 'react-hot-toast'

interface ShareResultProps {
  blogName: string
  blogId: string
  level: number
  grade: string
  totalScore: number
  percentile: number
  stats: {
    posts: number
    visitors: number
    neighbors: number
  }
}

export default function ShareResult({
  blogName,
  blogId,
  level,
  grade,
  totalScore,
  percentile,
  stats
}: ShareResultProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const getLevelColor = (lvl: number) => {
    if (lvl >= 9) return 'from-purple-500 to-pink-500'
    if (lvl >= 7) return 'from-blue-500 to-cyan-500'
    if (lvl >= 5) return 'from-green-500 to-emerald-500'
    if (lvl >= 3) return 'from-yellow-500 to-orange-500'
    return 'from-gray-400 to-gray-500'
  }

  const getTierName = (lvl: number) => {
    if (lvl <= 2) return 'Bronze'
    if (lvl <= 4) return 'Silver'
    if (lvl <= 6) return 'Gold'
    if (lvl <= 8) return 'Platinum'
    if (lvl <= 10) return 'Diamond'
    return 'Challenger'
  }

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/analyze?blogId=${blogId}`
    : ''

  const shareText = `[블랭크 블로그 분석 결과]\n\n${blogName} 블로그\n레벨: Lv.${level} (${grade})\n티어: ${getTierName(level)}\n전체 블로거 중 상위 ${100 - percentile}%\n\n나도 분석하기`

  // 클립보드에 링크 복사
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
      setCopied(true)
      toast.success('클립보드에 복사되었습니다!')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error('복사에 실패했습니다')
    }
  }

  // 트위터 공유
  const shareTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
    window.open(twitterUrl, '_blank', 'width=600,height=400')
  }

  // 카카오톡 공유 (Web SDK 필요)
  const shareKakao = () => {
    if (typeof window !== 'undefined' && (window as any).Kakao) {
      const Kakao = (window as any).Kakao
      if (!Kakao.isInitialized()) {
        // 카카오 앱 키가 없으면 링크 복사로 대체
        copyLink()
        return
      }

      Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: `${blogName} 블로그 분석 결과`,
          description: `Lv.${level} ${getTierName(level)} - 상위 ${100 - percentile}%`,
          imageUrl: 'https://blank-blog.com/og-image.png',
          link: {
            mobileWebUrl: shareUrl,
            webUrl: shareUrl
          }
        },
        buttons: [
          {
            title: '내 블로그도 분석하기',
            link: {
              mobileWebUrl: shareUrl,
              webUrl: shareUrl
            }
          }
        ]
      })
    } else {
      // 카카오 SDK가 없으면 링크 복사로 대체
      copyLink()
    }
  }

  // 이미지로 저장 (html2canvas 사용)
  const downloadImage = async () => {
    if (!cardRef.current) return

    try {
      // 동적 import로 html2canvas 로드
      const html2canvas = (await import('html2canvas')).default

      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false
      })

      const link = document.createElement('a')
      link.download = `blank-blog-${blogId}-result.png`
      link.href = canvas.toDataURL('image/png')
      link.click()

      toast.success('이미지가 저장되었습니다!')
    } catch (error) {
      console.error('Image download failed:', error)
      toast.error('이미지 저장에 실패했습니다')
    }
  }

  return (
    <>
      {/* 공유 버튼 */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white rounded-xl font-medium shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
      >
        <Share2 className="w-4 h-4" />
        결과 공유하기
      </motion.button>

      {/* 공유 모달 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">분석 결과 공유</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 공유 카드 미리보기 */}
              <div
                ref={cardRef}
                className="bg-gradient-to-br from-[#0064FF]/5 to-purple-500/5 rounded-xl p-6 mb-6 border border-gray-200"
              >
                <div className="text-center">
                  {/* 로고 */}
                  <div className="text-2xl font-bold mb-4">
                    <span className="gradient-text">BLANK</span>
                  </div>

                  {/* 블로그 정보 */}
                  <div className="mb-4">
                    <div className="text-lg font-bold text-gray-900">{blogName}</div>
                    <div className="text-sm text-gray-500">@{blogId}</div>
                  </div>

                  {/* 레벨 & 티어 */}
                  <div className="inline-flex flex-col items-center mb-4">
                    <div className={`px-6 py-3 rounded-2xl bg-gradient-to-r ${getLevelColor(level)} text-white font-bold text-2xl shadow-lg mb-2`}>
                      Lv.{level}
                    </div>
                    <div className="text-sm font-medium text-gray-600">
                      {getTierName(level)} · {grade}
                    </div>
                  </div>

                  {/* 순위 */}
                  <div className="bg-white rounded-xl p-4 mb-4">
                    <div className="text-sm text-gray-500">전체 블로거 중</div>
                    <div className="text-3xl font-bold text-[#0064FF]">
                      상위 {100 - percentile}%
                    </div>
                  </div>

                  {/* 통계 */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-lg font-bold text-gray-900">{stats.posts}</div>
                      <div className="text-xs text-gray-500">포스트</div>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-lg font-bold text-gray-900">{stats.visitors.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">방문자</div>
                    </div>
                    <div className="bg-white rounded-lg p-3">
                      <div className="text-lg font-bold text-gray-900">{stats.neighbors}</div>
                      <div className="text-xs text-gray-500">이웃</div>
                    </div>
                  </div>

                  {/* 워터마크 */}
                  <div className="mt-4 text-xs text-gray-400">
                    blank-blog.com에서 분석
                  </div>
                </div>
              </div>

              {/* 공유 버튼들 */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <button
                  onClick={copyLink}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  {copied ? (
                    <Check className="w-6 h-6 text-green-500" />
                  ) : (
                    <Link2 className="w-6 h-6 text-gray-600" />
                  )}
                  <span className="text-xs text-gray-600">링크 복사</span>
                </button>

                <button
                  onClick={shareTwitter}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 transition-colors"
                >
                  <Twitter className="w-6 h-6 text-[#1DA1F2]" />
                  <span className="text-xs text-[#1DA1F2]">트위터</span>
                </button>

                <button
                  onClick={shareKakao}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#FEE500]/30 hover:bg-[#FEE500]/50 transition-colors"
                >
                  <MessageCircle className="w-6 h-6 text-[#3C1E1E]" />
                  <span className="text-xs text-[#3C1E1E]">카카오톡</span>
                </button>

                <button
                  onClick={downloadImage}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-purple-100 hover:bg-purple-200 transition-colors"
                >
                  <Camera className="w-6 h-6 text-purple-600" />
                  <span className="text-xs text-purple-600">이미지 저장</span>
                </button>
              </div>

              {/* 안내 */}
              <p className="text-xs text-gray-500 text-center">
                분석 결과를 친구들과 공유하고 블로그 성장 팁을 나눠보세요!
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
