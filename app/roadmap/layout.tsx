import type { Metadata } from 'next'
import { tenantPageMetadata } from '@/lib/tenant-brand'

// The public roadmap.
// On a company subdomain or custom domain the tab shows the company's name,
// icon and description (lib/tenant-meta). On colvy.com nothing changes.
export async function generateMetadata(): Promise<Metadata> {
  return (await tenantPageMetadata('roadmap', '/roadmap')) || {}
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
