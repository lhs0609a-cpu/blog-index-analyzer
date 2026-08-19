'use client'

import { ReactNode } from 'react'
import WelcomeOnboarding from './WelcomeOnboarding'
import MobileBottomNav from './MobileBottomNav'
import { MaintenanceProvider } from './ServerMaintenanceModal'
import AuthInitializer from './AuthInitializer'
import PageviewTracker from './PageviewTracker'

interface ClientProvidersProps {
  children: ReactNode
}

export default function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <MaintenanceProvider>
      <AuthInitializer />
      <PageviewTracker />
      {children}
      <WelcomeOnboarding />
      <MobileBottomNav />
    </MaintenanceProvider>
  )
}
