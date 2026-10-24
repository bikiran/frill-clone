import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Book a Demo',
  description: 'See Colvy in action: try the shared inbox, business SMS, CRM and AI agents, or book a personalised demo with our Australian team.',
  path: 'demo',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Book a Demo', path: 'demo' }])} />
      <Client />
    </>
  )
}
