import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { PLATFORM_FAQS } from '@/lib/platform-faqs'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'All-in-One Customer Platform for Every Business',
  description: 'One platform for every customer: shared inbox, business phone, CRM, payments, bookings, reviews and AI, with every step from first click to paid order tracked.',
  path: 'all-in-one-customer-platform',
})

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: PLATFORM_FAQS.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}

export default function Page() {
  return (
    <>
      <JsonLd data={[faqLd, breadcrumbJsonLd(SITE_URL, [{ name: 'All-in-One Customer Platform', path: 'all-in-one-customer-platform' }])]} />
      <Client />
    </>
  )
}
