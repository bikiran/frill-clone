import type { Metadata } from 'next'
import { tenantPageMetadata } from '@/lib/tenant-brand'

// A business's customer account page on its subdomain (roxy.colvy.com/account):
// the tab shows the business's name and icon (lib/tenant-meta). Never indexed.
export async function generateMetadata(): Promise<Metadata> {
  return (await tenantPageMetadata('account', '/account', { noIndex: true })) || { robots: { index: false, follow: false } }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
