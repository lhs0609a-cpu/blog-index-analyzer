'use client'

import { useState, Suspense } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { requestPasswordReset } from '@/lib/api/auth'
import toast from 'react-hot-toast'
import BlspiLogo from '@/components/BlspiLogo'

/**
 * 비밀번호 찾기.
 *
 * 이 화면이 없어서 비밀번호를 잊은 사람은 영구히 잠겨 있었다. 로그인 화면은
 * "비밀번호가 올바르지 않습니다"라고만 말하고 갈 곳을 주지 않았다.
 *
 * ⚠️ 성공 화면에서 가입 여부를 드러내지 않는다. 서버가 일부러 같은 답을
 * 돌려주는데 화면이 "없는 계정입니다"를 띄우면 그 방어가 그대로 무너진다.
 */
function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(() => {
    const given = searchParams.get('email') || ''
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(given) ? given : ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      toast.error('이메일을 입력해주세요')
      return
    }

    setIsLoading(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (error) {
      const axiosError = error as { response?: { data?: { detail?: string } } }
      toast.error(axiosError?.response?.data?.detail || '요청에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
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
          <h1 className="ds-headline mb-3">비밀번호 찾기</h1>
          <p className="ds-lede">가입한 이메일로 재설정 링크를 보내드립니다.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="auth-card">
            {sent ? (
              <div className="text-center py-4">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4 gi3d" />
                <p className="text-gray-800 font-semibold mb-2">메일을 보냈습니다</p>
                <p className="text-sm text-gray-600 leading-relaxed mb-6">
                  가입된 이메일이라면 재설정 링크가 도착합니다.
                  <br />
                  링크는 30분 뒤 만료되고 한 번만 쓸 수 있습니다.
                </p>
                <p className="text-xs text-gray-400 mb-6">
                  메일이 보이지 않으면 스팸함도 확인해주세요.
                </p>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center w-full py-3 rounded-xl bg-[#0064FF] text-white font-semibold"
                >
                  로그인으로 돌아가기
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="forgot-email" className="block text-sm font-semibold text-gray-700 mb-2">
                    이메일
                  </label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#0064FF] transition-colors gi3d" />
                    <input
                      id="forgot-email"
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
                      보내는 중...
                    </>
                  ) : (
                    '재설정 링크 받기'
                  )}
                </motion.button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  )
}
