'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, X, Share, MoreVertical } from 'lucide-react'
import GlassIcon from '@/components/GlassIcon'

/**
 * 홈 첫 화면에서 즐겨찾기를 권하는 하단 카드.
 *
 * 브라우저는 스크립트로 북마크를 추가하는 길을 막아 두었다
 * (window.external.AddFavorite 는 구 IE 전용이었다). 그래서 할 수 있는 건
 * 사용자가 누를 단축키·메뉴를 기기에 맞게 정확히 보여 주는 것뿐이다.
 * 예외는 PWA 설치 — beforeinstallprompt 가 오면 버튼 한 번으로 설치를 띄운다.
 *
 * 모달이 아니다. 화면을 가리면 첫 방문자가 분석 입력창에 닿기 전에 떠난다.
 * 홈 전용 — 스크롤 문턱이 홈 히어로 높이를 전제로 한다.
 */

const STORAGE_KEY = 'blank_bookmark_prompt'
const SHOW_DELAY_MS = 5000
const SNOOZE_DAYS = 7

type Platform = 'mac' | 'desktop' | 'ios' | 'android'

// Chrome 계열만 쏘는 이벤트라 lib.dom 에 타입이 없다.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function readState(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeState(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // 사이트 데이터 차단 브라우저 — 이번 방문에서만 닫히면 된다
  }
}

function shouldShow(): boolean {
  const state = readState()
  if (state === 'done') return false
  if (state) {
    const snoozedAt = new Date(state).getTime()
    if (!Number.isNaN(snoozedAt) && Date.now() - snoozedAt < SNOOZE_DAYS * 86400000) return false
  }
  // 이미 홈 화면 앱으로 연 사람에게는 권할 게 없다
  if (window.matchMedia?.('(display-mode: standalone)').matches) return false
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return false
  return true
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  // iPadOS 13+ 는 UA 가 맥으로 나온다 — 터치 포인트로 가른다
  const isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || isIPadOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Mac/.test(navigator.platform || ua)) return 'mac'
  return 'desktop'
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[2rem] items-center justify-center rounded-lg border border-gray-300 border-b-[3px] bg-white px-2 py-1 text-sm font-bold text-gray-800 font-sans">
      {children}
    </kbd>
  )
}

export default function BookmarkPrompt() {
  const [eligible, setEligible] = useState(false)
  const [closed, setClosed] = useState(false)
  const [pastHero, setPastHero] = useState(false)
  const [platform, setPlatform] = useState<Platform>('desktop')
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (!shouldShow()) return
    setPlatform(detectPlatform())
    const timer = setTimeout(() => setEligible(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  // 히어로의 분석 입력창 위에 뜨면 첫 방문자의 핵심 동작을 가린다(모바일은 통째로 덮는다).
  // 첫 화면을 지나 내려간 뒤에만 띄우고, 다시 맨 위로 올라오면 잠시 비켜 준다.
  // 켜고 끄는 문턱을 다르게 둬 경계에서 깜빡이지 않게 했다.
  useEffect(() => {
    if (!eligible) return
    const onScroll = () => {
      const y = window.scrollY
      const h = window.innerHeight
      setPastHero((prev) => (prev ? y > h * 0.4 : y > h * 0.9))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [eligible])

  const visible = eligible && pastHero && !closed

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // 브라우저 기본 미니바 대신 이 카드의 버튼으로 띄운다
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const snooze = useCallback(() => {
    writeState(new Date().toISOString())
    setClosed(true)
  }, [])

  const complete = useCallback(() => {
    writeState('done')
    setClosed(true)
  }, [])

  // 카드를 보고 실제로 Ctrl/⌘+D 를 눌렀다면 할 일을 한 것이다.
  // preventDefault 하지 않는다 — 브라우저 북마크 창이 그대로 떠야 한다.
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') complete()
      else if (e.key === 'Escape') snooze()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, complete, snooze])

  const handleInstall = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    setInstallEvent(null) // 한 번 쓴 이벤트는 다시 prompt 할 수 없다
    if (outcome === 'accepted') complete()
  }

  const isMobile = platform === 'ios' || platform === 'android'
  const modKey = platform === 'mac' ? '⌘' : 'Ctrl'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          role="dialog"
          aria-labelledby="bookmark-prompt-title"
          aria-describedby="bookmark-prompt-desc"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[400px] z-50 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="relative backdrop-blur-2xl bg-white/95 border border-gray-200 rounded-2xl overflow-hidden shadow-2xl shadow-gray-300/50">
            <div className="absolute inset-0 bg-gradient-to-r from-[#0064FF]/5 via-blue-500/5 to-cyan-500/5" aria-hidden />

            <button
              onClick={snooze}
              aria-label="닫기"
              className="absolute top-3 right-3 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-10"
            >
              <X className="w-4 h-4 text-gray-500 gi3d" />
            </button>

            <div className="relative p-5">
              <div className="flex items-start gap-4 pr-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0064FF] to-[#3182F6] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#0064FF]/15">
                  <GlassIcon icon={Star} size={40} />
                </div>
                <div className="min-w-0">
                  <h2 id="bookmark-prompt-title" className="text-base font-bold text-gray-900">
                    {isMobile ? '블스피를 홈 화면에 두세요' : '블스피를 즐겨찾기 해두세요'}
                  </h2>
                  <p id="bookmark-prompt-desc" className="mt-1 text-sm text-gray-600 leading-relaxed">
                    내 블로그 지수가 궁금할 때 검색 없이 바로 들어올 수 있어요.
                  </p>
                </div>
              </div>

              {/* 기기별 방법 */}
              <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-700">
                {platform === 'ios' && (
                  <p className="flex flex-wrap items-center gap-1.5 leading-relaxed">
                    하단의 <Share className="inline w-4 h-4 text-[#0064FF]" aria-label="공유" />
                    <strong>공유</strong> 버튼 → <strong>홈 화면에 추가</strong>
                  </p>
                )}
                {platform === 'android' && !installEvent && (
                  <p className="flex flex-wrap items-center gap-1.5 leading-relaxed">
                    브라우저 메뉴 <MoreVertical className="inline w-4 h-4 text-[#0064FF]" aria-label="메뉴" />
                    → <strong>홈 화면에 추가</strong> 또는 <strong>북마크</strong>
                  </p>
                )}
                {platform === 'android' && installEvent && (
                  <p className="leading-relaxed">아래 버튼을 누르면 앱처럼 바로 열 수 있어요.</p>
                )}
                {!isMobile && (
                  <p className="flex flex-wrap items-center gap-1.5">
                    <Key>{modKey}</Key>
                    <span className="text-gray-400">+</span>
                    <Key>D</Key>
                    <span className="ml-1">를 누르면 바로 저장돼요</span>
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={snooze}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  다음에
                </button>
                {installEvent ? (
                  <button
                    onClick={handleInstall}
                    className="px-4 py-2 text-sm bg-[#0064FF] text-white rounded-xl font-semibold shadow-lg shadow-[#0064FF]/15 hover:bg-[#0052d4] transition-colors"
                  >
                    {isMobile ? '홈 화면에 추가' : '앱으로 설치'}
                  </button>
                ) : (
                  <button
                    onClick={complete}
                    className="px-4 py-2 text-sm bg-[#0064FF] text-white rounded-xl font-semibold shadow-lg shadow-[#0064FF]/15 hover:bg-[#0052d4] transition-colors"
                  >
                    추가했어요
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
