import type { Metadata } from 'next'
import { tenantPageMetadata } from '@/lib/tenant-brand'

// Table booking page on a company subdomain (roxy.colvy.com/reserve): the tab
// shows the restaurant's name and icon (lib/tenant-meta). /reserve/<company>
// brands itself in [slug]/layout.tsx.
export async function generateMetadata(): Promise<Metadata> {
  return (await tenantPageMetadata('reserve', '/reserve')) || {}
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
