import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { BUSINESS_NUMBER_FAQS } from '@/lib/business-number-faqs'
import Client from './Client'

export const metadata: Metadata = {
  title: 'Get a Business Phone Number Online in Australia',
  description: 'Get a local 02, 03, 07 or 08 or an 04 mobile business number online in minutes. Calls and texts in one shared inbox, on your browser or phone, from $15 a month.',
  alternates: { canonical: '/business-phone-number-australia' },
}

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: BUSINESS_NUMBER_FAQS.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}

export default function Page() {
  return (
    <>
      <JsonLd data={faqLd} />
      <Client />
    </>
  )
}
