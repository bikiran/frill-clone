import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Features: Shared Inbox, Business Phone, CRM, AI Agents & Feedback',
  description: 'Everything in Colvy: a shared inbox, CRM, business phone and SMS, orders and payments, bookings, table reservations, jobs and quotes, customer accounts, AI agents and feedback boards.',
  path: 'product',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Features', path: 'product' }])} />
      <Client />
    </>
  )
}
