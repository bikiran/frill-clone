import type { Metadata } from 'next'
import ColvyJsonLd from '@/components/ColvyJsonLd'
import { pageMeta } from '@/lib/seo'

// colvy.com/ is served by this page (proxy.ts rewrites "/" here), so its
// title, description and canonical address live here. The canonical is "/"
// so Google keeps one home page rather than also listing /landing or
// www.colvy.com as separate pages.
export const metadata: Metadata = pageMeta({
  title: 'Colvy | Shared Inbox, Business SMS & CRM for Australian Small Business',
  description:
    'One shared inbox for SMS, calls, Instagram, Messenger, email, live chat and Google reviews, with Australian numbers, a CRM, WooCommerce and Shopify orders and AI agents. Start free.',
  path: '',
  absolute: true,
})

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <><ColvyJsonLd />{children}</>
}
