'use client'

import { useState, useEffect, Suspense } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { login } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/stores/auth'
import { track, signupFailReason } from '@/lib/analytics/track'
import { safeNextPath } from '@/lib/auth/nextPath'
import toast from 'react-hot-toast'
import BlspiLogo from '@/components/BlspiLogo'


function LoginForm() {
  const router = useRouter()
  // 결제·분석을 하려다 로그인 벽에 막힌 사람은 그 자리로 돌려보내야 한다.
  // 무조건 /dashboard 로 보내면 '요금을 보고 마음먹은 순간'이 그대로 사라진다.
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get('next'))
  const { login: setAuth, isAuthenticated } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // 이미 로그인된 사용자는 대시보드로 리다이렉트
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (token && isAuthenticated) {
      router.replace(next)
    }
  }, [isAuthenticated, router, next])



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    track('login_submit')

    if (!email || !password) {
      toast.error('이메일과 비밀번호를 입력해주세요')
      track('login_fail', { reason: 'missing_field' })
      return
    }

    setIsLoading(true)

    try {
      const response = await login({ email, password })
      setAuth(response.user, response.access_token)
      track('login_success', { userId: response.user?.id })
      toast.success(`환영합니다, ${response.user.name}님!`)
      router.push(next)
    } catch (error) {
      const axiosError = error as { response?: { status?: number; data?: { detail?: string } } }
      const status = axiosError.response?.status
      const message = axiosError.response?.data?.detail || '로그인에 실패했습니다'
      // 로그인 실패가 쏟아지면 그건 '가입을 안 하는' 게 아니라
      // '이미 가입했는데 못 들어오는' 문제다 — 둘은 처방이 완전히 다르다.
      track('login_fail', { reason: signupFailReason(message, status), props: { http: status ?? 0 } })
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-page min-h-screen text-gray-900 flex items-center justify-center py-24 px-4 relative">
      <Link href="/" className="absolute top-6 left-6 z-50 text-link">
          <ArrowLeft className="w-4 h-4 gi3d" />
          홈으로

      </Link>

      <div className="max-w-md w-full relative z-10">
        {/* Logo/Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="flex justify-center mb-7"><BlspiLogo markClassName="w-11 h-11" /></div>
          {/* 로그인은 이미 결정한 사람이 오는 화면이다. 설득하지 말고 빨리 통과시킨다. */}
          <h1 className="ds-headline mb-3">다시 오셨네요</h1>
          <p className="ds-lede">그동안 쌓인 진단 기록이 기다리고 있습니다.</p>
        </motion.div>

        {/* Login Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative"
        >
          {/* Card glow effect */}


          <div className="auth-card">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email */}
              <div>
                <label htmlFor="login-email" className="block text-sm font-semibold text-gray-700 mb-2">
                  이메일
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#0064FF] transition-colors gi3d" />
                  <input id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    autoComplete="email"
                    required
                    className="w-full pl-12 pr-4 py-4 rounded-xl bg-gray-50/50 border border-gray-200 focus:border-[#0064FF] focus:ring-2 focus:ring-[#0064FF]/20 focus:outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="login-password" className="block text-sm font-semibold text-gray-700 mb-2">
                  비밀번호
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#0064FF] transition-colors gi3d" />
                  <input id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full pl-12 pr-12 py-4 rounded-xl bg-gray-50/50 border border-gray-200 focus:border-[#0064FF] focus:ring-2 focus:ring-[#0064FF]/20 focus:outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5 gi3d" /> : <Eye className="w-5 h-5 gi3d" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 px-6 rounded-xl bg-[#0064FF] text-white font-bold text-lg hover:shadow-lg hover:shadow-[#0064FF]/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  '로그인'
                )}
              </motion.button>
            </form>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-400">또는</span>
              </div>
            </div>

            {/* Sign Up Link */}
            <div className="text-center">
              <p className="text-gray-500">
                계정이 없으신가요?{' '}
                <Link href="/register" className="font-semibold text-[#0064FF] hover:text-[#3182F6] transition-colors">
                  회원가입
                </Link>
              </p>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-sm text-gray-400 mt-8"
        >
          로그인하면 <Link href="/terms" className="font-semibold text-gray-500 hover:text-gray-600 transition-colors">이용약관</Link> 및{' '}
          <Link href="/privacy" className="font-semibold text-gray-500 hover:text-gray-600 transition-colors">개인정보 처리방침</Link>에 동의하게 됩니다.
        </motion.p>
      </div>
    </div>
  )
}


/**
 * useSearchParams 를 쓰는 화면은 Suspense 경계가 있어야 한다.
 * 없으면 Next 가 이 라우트를 통째로 클라이언트 렌더로 떨어뜨리고
 * 프로덕션 빌드에서 걸린다(결제 화면도 같은 이유로 감싸져 있다).
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-page min-h-screen" aria-label="로그인 화면 불러오는 중" />}>
      <LoginForm />
    </Suspense>
  )
}
