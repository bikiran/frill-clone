import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'
import { TOPIC_PAGES } from '@/lib/topic-pages'
import Client from './Client'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
const p = TOPIC_PAGES['whatsapp-shared-inbox']

export const metadata: Metadata = pageMeta({ title: p.metaTitle, description: p.metaDescription, path: p.slug, absolute: true })

export default function Page() {
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
  return (
    <>
      <JsonLd data={[faqLd, breadcrumbJsonLd(SITE_URL, [{ name: p.name, path: p.slug }])]} />
      <Client />
    </>
  )
}
