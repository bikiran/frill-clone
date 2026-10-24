import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Customer Messaging Software by Industry',
  description: 'Colvy for SaaS, agencies, hospitality and healthcare: one shared inbox, CRM, bookings and reviews shaped around how each industry works.',
  path: 'industries',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Industries', path: 'industries' }])} />
      <Client />
    </>
  )
}
