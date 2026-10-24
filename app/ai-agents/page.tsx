import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'AI Agents for Support, Bookings, Sales, Orders & Reviews',
  description: 'Five AI agents that answer customers, book appointments, follow up carts, chase late orders and reply to reviews. They check your real data first, start as drafts, and hand your team the exceptions.',
  path: 'ai-agents',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'AI Agents', path: 'ai-agents' }])} />
      <Client />
    </>
  )
}
