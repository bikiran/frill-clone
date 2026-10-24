import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { PLATFORM_FAQS } from '@/lib/platform-faqs'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'All-in-One Customer Platform for Small Business',
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
      <JsonLd data={faqLd} />
      <Client />
    </>
  )
}
