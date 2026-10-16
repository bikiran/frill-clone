import type { Metadata } from 'next'
import { tenantPageMetadata } from '@/lib/tenant-brand'

// A board member's public profile (/user/<username>). On a company subdomain
// or custom domain the tab shows "<name> · <Company>" with the company's icon
// (lib/tenant-meta), not Colvy's marketing title, and the profile is kept out
// of search results. On colvy.com nothing changes.
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params
  return (await tenantPageMetadata('profile', `/user/${encodeURIComponent(username || '')}`, { title: safeDecode(username), noIndex: true })) || {}
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s || '').slice(0, 80) } catch { return '' }
}
