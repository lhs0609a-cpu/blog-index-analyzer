'use client'

import { ReactNode } from 'react'
import WelcomeOnboarding from './WelcomeOnboarding'
import MobileBottomNav from './MobileBottomNav'
import ServerMaintenanceModal, { MaintenanceProvider } from './ServerMaintenanceModal'

interface ClientProvidersProps {
  children: ReactNode
}

export default function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <MaintenanceProvider>
      {children}
      <WelcomeOnboarding />
      <MobileBottomNav />
      <ServerMaintenanceModal />
    </MaintenanceProvider>
  )
}
