'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter()
  const { isAuthenticated, isLoading, setLoading } = useAuthStore()

  useEffect(() => {
    // Check if user is authenticated
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null

    if (!token && !isAuthenticated) {
      // Redirect to login if not authenticated
      router.push('/login')
    }

    setLoading(false)
  }, [isAuthenticated, router, setLoading])

  // Show loading state
  if (isLoading || (!isAuthenticated && typeof window !== 'undefined' && !localStorage.getItem('auth_token'))) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="inline-flex p-6 rounded-full instagram-gradient mb-4"
          >
            <Sparkles className="w-12 h-12 text-white" />
          </motion.div>
          <p className="text-gray-600 text-lg">로딩 중...</p>
        </div>
      </div>
    )
  }

  // Show protected content
  return <>{children}</>
}
