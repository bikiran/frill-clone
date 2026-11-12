import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { BUSINESS_NUMBER_FAQS } from '@/lib/business-number-faqs'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Get a Business Phone Number Online in Australia',
  description: 'Get a local 02, 03, 07 or 08 number or an 04 mobile online in minutes. Forward calls to your mobile for $35 a month all in, or answer from one shared inbox.',
  path: 'business-phone-number-australia',
})

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: BUSINESS_NUMBER_FAQS.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}

export default function Page() {
  return (
    <>
      <JsonLd data={[faqLd, breadcrumbJsonLd(SITE_URL, [{ name: 'Business Phone Number Australia', path: 'business-phone-number-australia' }])]} />
      <Client />
    </>
  )
}
