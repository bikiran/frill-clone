import type { Metadata } from 'next'
import Client from './Client'
import JsonLd from '@/components/JsonLd'
import { PRICING_FAQS } from '@/lib/pricing-faqs'
import { pageMeta } from '@/lib/seo'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Pricing: Shared Inbox, Business SMS & CRM Plans',
  description: 'Colvy pricing in AUD. Start free, then pick Inbox for SMS, calls, social, email and live chat with AI agents, Feedback for roadmaps and help centre, or Everything. 14-day free trial.',
  path: 'pricing',
})

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
      <JsonLd data={[faqLd, breadcrumbJsonLd(SITE_URL, [{ name: 'Pricing', path: 'pricing' }])]} />
      <Client />
    </>
  )
}
