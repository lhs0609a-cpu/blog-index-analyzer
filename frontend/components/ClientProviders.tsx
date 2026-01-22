'use client'

import { ReactNode } from 'react'
import WelcomeOnboarding from './WelcomeOnboarding'

interface ClientProvidersProps {
  children: ReactNode
}

export default function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <>
      {children}
      <WelcomeOnboarding />
    </>
  )
}
