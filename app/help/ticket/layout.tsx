import type { Metadata } from 'next'
import { tenantPageMetadata } from '@/lib/tenant-brand'

// Submit a help ticket.
// On a company subdomain or custom domain the tab shows the company's name,
// icon and description (lib/tenant-meta). On colvy.com nothing changes.
export async function generateMetadata(): Promise<Metadata> {
  return (await tenantPageMetadata('help-ticket', '/help/ticket')) || {}
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
