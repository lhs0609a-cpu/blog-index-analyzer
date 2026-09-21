'use client'

import { useState, Suspense } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Lock, Eye, EyeOff, Check, X, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { resetPassword } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/stores/auth'
import toast from 'react-hot-toast'
import BlspiLogo from '@/components/BlspiLogo'

/**
 * 새 비밀번호 정하기.
 *
 * 바꾸는 데 성공하면 **그 자리에서 로그인된다.** 로그인 화면으로 돌려보내면
 * 방금 정한 비밀번호를 한 번 더 치게 하는 셈이고, 여기까지 온 사람을 한 걸음
 * 더 걷게 할 이유가 없다.
 */
function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const { login: setAuth } = useAuthStore()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // 가입 폼과 **같은 규칙**을 쓴다. 두 화면의 규칙이 다르면 가입은 되는데
  // 재설정은 거부되는(또는 그 반대의) 상태가 만들어진다.
  const requirements = [
    { label: '최소 8자 이상', met: password.length >= 8 },
    { label: '영문자 포함', met: /[a-zA-Z]/.test(password) },
    { label: '숫자 포함', met: /\d/.test(password) },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!requirements.every((r) => r.met)) {
      toast.error('비밀번호 요구사항을 충족하지 못했습니다')
      return
    }
    if (password !== confirmPassword) {
      toast.error('비밀번호가 일치하지 않습니다')
      return
    }

    setIsLoading(true)
    try {
      const response = await resetPassword(token, password)
      setAuth(response.user, response.access_token)
      toast.success('비밀번호를 바꿨습니다')
      router.push('/dashboard')
    } catch (error) {
      const axiosError = error as { response?: { data?: { detail?: string } } }
      toast.error(axiosError?.response?.data?.detail || '재설정에 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 토큰 없이 들어온 사람에게 빈 폼을 보여주면 다 채우고 나서야 실패한다.
  if (!token) {
    return (
      <div className="auth-page min-h-screen flex items-center justify-center px-4">
        <div className="auth-card max-w-md w-full text-center">
          <h1 className="text-xl font-bold mb-3">링크가 올바르지 않습니다</h1>
          <p className="text-sm text-gray-600 mb-6">
            재설정 링크가 잘렸거나 만료되었습니다. 다시 요청해주세요.
          </p>
          <Link
            href="/forgot-password"
            className="inline-flex items-center justify-center w-full py-3 rounded-xl bg-[#0064FF] text-white font-semibold"
          >
            재설정 링크 다시 받기
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page min-h-screen text-gray-900 flex items-center justify-center py-24 px-4 relative">
      <Link href="/login" className="absolute top-6 left-6 z-50 text-link">
        <ArrowLeft className="w-4 h-4 gi3d" />
        로그인으로
      </Link>

      <div className="max-w-md w-full relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="flex justify-center mb-7"><BlspiLogo markClassName="w-11 h-11" /></div>
          <h1 className="ds-headline mb-3">새 비밀번호 정하기</h1>
          <p className="ds-lede">바꾸고 나면 바로 로그인됩니다.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="auth-card">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="reset-password" className="block text-sm font-semibold text-gray-700 mb-2">
                  새 비밀번호
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#0064FF] transition-colors gi3d" />
                  <input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    className="w-full pl-12 pr-12 py-4 rounded-xl bg-gray-50/50 border border-gray-200 focus:border-[#0064FF] focus:ring-2 focus:ring-[#0064FF]/20 focus:outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5 gi3d" /> : <Eye className="w-5 h-5 gi3d" />}
                  </button>
                </div>

                {password.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {requirements.map((req) => (
                      <li key={req.label} className="flex items-center gap-2 text-xs">
                        {req.met ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-gray-300" />
                        )}
                        <span className={req.met ? 'text-green-600' : 'text-gray-400'}>{req.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label htmlFor="reset-password-confirm" className="block text-sm font-semibold text-gray-700 mb-2">
                  비밀번호 확인
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#0064FF] transition-colors gi3d" />
                  <input
                    id="reset-password-confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    className="w-full pl-12 pr-4 py-4 rounded-xl bg-gray-50/50 border border-gray-200 focus:border-[#0064FF] focus:ring-2 focus:ring-[#0064FF]/20 focus:outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    disabled={isLoading}
                  />
                </div>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="mt-2 text-xs text-rose-500">비밀번호가 일치하지 않습니다</p>
                )}
              </div>

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
                    바꾸는 중...
                  </>
                ) : (
                  '비밀번호 바꾸고 시작하기'
                )}
              </motion.button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
