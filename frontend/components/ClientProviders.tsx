'use client'

import { ReactNode } from 'react'
import WelcomeOnboarding from './WelcomeOnboarding'
import MobileBottomNav from './MobileBottomNav'

interface ClientProvidersProps {
  children: ReactNode
}

export default function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <>
      {children}
      <WelcomeOnboarding />
      <MobileBottomNav />
    </>
  )
}
