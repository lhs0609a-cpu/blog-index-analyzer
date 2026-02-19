'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null

    if (!token && !isAuthenticated) {
      router.push('/login')
    } else {
      setChecking(false)
    }
  }, [isAuthenticated, router])

  // Show loading state while checking auth
  if (checking && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="inline-flex p-6 rounded-full bg-[#0064FF] mb-4"
          >
            <Sparkles className="w-12 h-12 text-white" />
          </motion.div>
          <p className="text-gray-600 text-lg">로딩 중...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
