'use client'

import { usePathname } from 'next/navigation'
import SettingsShell from '@/components/settings/SettingsShell'

// Billing sits inside the Settings area, with its menu; a tax invoice opens on
// its own, ready to print.
export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  if (pathname.startsWith('/admin/billing/tax-invoice')) return <>{children}</>
  return <SettingsShell>{children}</SettingsShell>
}
