'use client'

import { ReactNode } from 'react'
import WelcomeOnboarding from './WelcomeOnboarding'
import MobileBottomNav from './MobileBottomNav'
import ServerMaintenanceModal, { MaintenanceProvider } from './ServerMaintenanceModal'
import AuthInitializer from './AuthInitializer'

interface ClientProvidersProps {
  children: ReactNode
}

export default function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <MaintenanceProvider>
      <AuthInitializer />
      {children}
      <WelcomeOnboarding />
      <MobileBottomNav />
      <ServerMaintenanceModal />
    </MaintenanceProvider>
  )
}
