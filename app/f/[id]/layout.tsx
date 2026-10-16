import type { Metadata } from 'next'
import { recordPageMetadata } from '@/lib/tenant-brand'

// A contact form (often embedded). These links are shared on colvy.com as well as on
// company subdomains, so the tab is branded by the company that owns the
// record (lib/tenant-meta), with the record's own title.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return (await recordPageMetadata('contact-form', 'contact_forms', id, `/f/${encodeURIComponent(id || '')}`)) || {}
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
