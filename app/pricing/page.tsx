import type { Metadata } from 'next'
import Client from './Client'
import JsonLd from '@/components/JsonLd'
import { PRICING_FAQS } from '@/lib/pricing-faqs'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple, transparent pricing for Colvy — the omnichannel inbox, CRM and customer-feedback platform. Start free.',
  alternates: { canonical: '/pricing' },
}

// Mirror the on-page FAQ into FAQPage structured data for rich results.
const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: PRICING_FAQS.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function Page() {
  return (
    <>
      <JsonLd data={faqLd} />
      <Client />
    </>
  )
}
