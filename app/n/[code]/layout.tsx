import type { Metadata } from 'next'
import { tenantPageMetadata } from '@/lib/tenant-brand'

// A shared note (/n/<code>).
// On a company subdomain or custom domain the tab shows the company's name
// and icon (lib/tenant-meta); on colvy.com a plain title. Never Colvy's
// marketing copy. It's a personal link, so it's never indexed.
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params
  const md = await tenantPageMetadata('note', `/n/${encodeURIComponent(code || '')}`, { noIndex: true })
  return md || {
    title: { absolute: 'Shared note' },
    description: null,
    openGraph: { title: 'Shared note', description: undefined, images: [] },
    twitter: { card: 'summary', title: 'Shared note', images: [] },
    robots: { index: false, follow: false },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
