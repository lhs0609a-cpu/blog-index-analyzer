'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Mail, Lock, User, Loader2, Sparkles, ArrowLeft, Check, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { register } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/stores/auth'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const router = useRouter()
  const { login: setAuth } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const passwordRequirements = [
    { label: '최소 8자 이상', met: password.length >= 8 },
    { label: '영문자 포함', met: /[a-zA-Z]/.test(password) },
    { label: '숫자 포함', met: /\d/.test(password) },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name || !email || !password || !confirmPassword) {
      toast.error('모든 필드를 입력해주세요')
      return
    }

    if (password !== confirmPassword) {
      toast.error('비밀번호가 일치하지 않습니다')
      return
    }

    if (!passwordRequirements.every(req => req.met)) {
      toast.error('비밀번호 요구사항을 충족하지 못했습니다')
      return
    }

    setIsLoading(true)

    try {
      const response = await register({ name, email, password })
      setAuth(response.user, response.access_token)
      toast.success(`환영합니다, ${response.user.name}님!`)
      router.push('/dashboard')
    } catch (error) {
      const axiosError = error as { response?: { data?: { detail?: string } } }
      const message = axiosError.response?.data?.detail || '회원가입에 실패했습니다'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-gray-900 flex items-center justify-center py-12 px-4 overflow-hidden relative">
      {/* Cursor glow effect */}
      <div
        className="fixed pointer-events-none z-0 w-[600px] h-[600px] rounded-full opacity-30 blur-[120px] transition-all duration-200"
        style={{
          background: 'radial-gradient(circle, rgba(0, 100, 255, 0.15) 0%, rgba(49, 130, 246, 0.08) 50%, transparent 70%)',
          left: mousePosition.x - 300,
          top: mousePosition.y - 300,
        }}
      />

      {/* Animated background grid */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(0,100,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,100,255,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />

      {/* Floating orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-10 right-[15%] w-[350px] h-[350px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(49, 130, 246, 0.08) 0%, transparent 70%)' }}
          animate={{
            y: [0, -40, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-10 left-[10%] w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0, 100, 255, 0.08) 0%, transparent 70%)' }}
          animate={{
            y: [0, 40, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(251, 146, 60, 0.1) 0%, transparent 70%)' }}
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Back to Home */}
      <Link href="/" className="absolute top-6 left-6 z-50">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/70 border border-gray-200/50 backdrop-blur-xl hover:bg-white/90 transition-all text-sm font-medium shadow-lg shadow-gray-200/50"
        >
          <ArrowLeft className="w-4 h-4" />
          홈으로
        </motion.button>
      </Link>

      <div className="max-w-md w-full relative z-10">
        {/* Logo/Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.1 }}
            className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-[#0064FF] to-[#3182F6] mb-6 shadow-lg shadow-blue-100/50"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-4xl font-black mb-3">
            <span className="bg-gradient-to-r from-[#0064FF] to-[#3182F6] bg-clip-text text-transparent">회원가입</span>
          </h1>
          <p className="text-gray-500">
            지금 시작하고 블로그를 성장시키세요
          </p>
        </motion.div>

        {/* Register Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative"
        >
          {/* Card glow effect */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-3xl blur opacity-20" />

          <div className="relative backdrop-blur-2xl bg-white/80 border border-gray-200/50 rounded-3xl p-8 shadow-xl shadow-gray-200/50">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  이름
                </label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#0064FF] transition-colors" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="홍길동"
                    maxLength={50}
                    autoComplete="name"
                    className="w-full pl-12 pr-4 py-4 rounded-xl bg-gray-50/50 border border-gray-200 focus:border-[#0064FF] focus:ring-2 focus:ring-[#0064FF]/20 focus:outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  이메일
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#0064FF] transition-colors" />
                  <input
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  비밀번호
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#0064FF] transition-colors" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="w-full pl-12 pr-12 py-4 rounded-xl bg-gray-50/50 border border-gray-200 focus:border-[#0064FF] focus:ring-2 focus:ring-[#0064FF]/20 focus:outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                {/* Password Requirements */}
                {password && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 space-y-1.5"
                  >
                    {passwordRequirements.map((req, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                            req.met ? 'bg-emerald-500' : 'bg-gray-300'
                          }`}
                        >
                          {req.met && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className={req.met ? 'text-emerald-600' : 'text-gray-400'}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  비밀번호 확인
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-[#0064FF] transition-colors" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full pl-12 pr-12 py-4 rounded-xl bg-gray-50/50 border ${
                      confirmPassword && password !== confirmPassword
                        ? 'border-red-400'
                        : 'border-gray-200'
                    } focus:border-[#0064FF] focus:ring-2 focus:ring-[#0064FF]/20 focus:outline-none transition-all text-gray-900 placeholder:text-gray-400`}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-red-500 mt-2">비밀번호가 일치하지 않습니다</p>
                )}
                {confirmPassword && password === confirmPassword && confirmPassword.length > 0 && (
                  <p className="text-sm text-emerald-600 mt-2 flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    비밀번호가 일치합니다
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white font-bold text-lg hover:shadow-lg hover:shadow-[#0064FF]/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    가입 중...
                  </>
                ) : (
                  '회원가입'
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

            {/* Login Link */}
            <div className="text-center">
              <p className="text-gray-500">
                이미 계정이 있으신가요?{' '}
                <Link href="/login" className="font-semibold text-violet-600 hover:text-[#0064FF] transition-colors">
                  로그인
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
          회원가입하면 <Link href="/terms" className="font-semibold text-gray-500 hover:text-gray-600 transition-colors">이용약관</Link> 및{' '}
          <Link href="/privacy" className="font-semibold text-gray-500 hover:text-gray-600 transition-colors">개인정보 처리방침</Link>에 동의하게 됩니다.
        </motion.p>
      </div>
    </div>
  )
}
