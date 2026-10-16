import type { Metadata } from 'next'
import { tenantPageMetadata } from '@/lib/tenant-brand'

// Manage a booking (/booking/<token>). On a company subdomain or custom domain
// the tab shows the company's name and icon (lib/tenant-meta). The page is
// private to whoever holds the link, so it's never indexed on any host.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const md = await tenantPageMetadata('booking', `/booking/${encodeURIComponent(token || '')}`)
  // On colvy.com the company is only known once the booking loads (the page
  // then titles itself "Your booking · <Company>"); until then a plain title,
  // never Colvy's marketing one.
  const plain: Metadata = {
    title: { absolute: 'Your booking' },
    description: 'View, change or cancel your booking.',
    openGraph: { title: 'Your booking', description: 'View, change or cancel your booking.', images: [] },
    twitter: { card: 'summary', title: 'Your booking', description: 'View, change or cancel your booking.', images: [] },
  }
  return { ...(md || plain), robots: { index: false, follow: false } }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
