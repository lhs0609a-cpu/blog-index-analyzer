'use client'
import { usePathname } from 'next/navigation'
import Footer from './Footer'
export default function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const standalone = ['/login', '/register', '/payment'].some(route => pathname.startsWith(route))
  return <div className={standalone ? 'standalone-frame' : 'site-frame'}><main id="main-content" tabIndex={-1} className={pathname === '/' ? 'site-main' : 'site-main tool-page'}>{children}</main><Footer /></div>
}
