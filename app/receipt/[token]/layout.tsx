import type { Metadata } from 'next'
import { tenantPageMetadata } from '@/lib/tenant-brand'

// A receipt the team sent a customer (roxy.colvy.com/receipt/<link>): the tab
// shows the business's name and icon (lib/tenant-meta). Never indexed.
export async function generateMetadata(): Promise<Metadata> {
  return (await tenantPageMetadata('receipt', '/receipt', { noIndex: true })) || { robots: { index: false, follow: false } }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
