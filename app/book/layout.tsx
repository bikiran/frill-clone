import type { Metadata, Viewport } from 'next'
import { tenantPageMetadata, tenantPageViewport } from '@/lib/tenant-brand'

// Booking page on a company subdomain (roxy.colvy.com/book): the tab shows the
// company's name, icon and description (lib/tenant-meta). On colvy.com nothing
// changes here; /book/<company> brands itself in [slug]/layout.tsx.
export async function generateMetadata(): Promise<Metadata> {
  return (await tenantPageMetadata('book', '/book')) || {}
}

export async function generateViewport(): Promise<Viewport> {
  return tenantPageViewport()
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
