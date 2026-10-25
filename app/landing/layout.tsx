import type { Metadata } from 'next'
import ColvyJsonLd from '@/components/ColvyJsonLd'
import { pageMeta } from '@/lib/seo'

// colvy.com/ is served by this page (proxy.ts rewrites "/" here), so its
// title, description and canonical address live here. The canonical is "/"
// so Google keeps one home page rather than also listing /landing or
// www.colvy.com as separate pages.
export const metadata: Metadata = pageMeta({
  title: 'Colvy | Shared Inbox, Business Phone & SMS, AI-Powered CRM',
  description:
    'One shared inbox for calls, SMS, Instagram, Messenger, email and live chat, with a business phone system, an AI-powered CRM and AI agents. For teams of every size, up to enterprise. Start free.',
  path: '',
  absolute: true,
})

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <><ColvyJsonLd />{children}</>
}
