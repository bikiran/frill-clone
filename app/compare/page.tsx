import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Compare Colvy with Podium, Birdeye, Zendesk, Intercom & More',
  description: 'See how Colvy compares with Podium, Birdeye, Coax, Gorgias, Zendesk, Freshdesk, Intercom, Gladly and ManyChat for Australian small businesses.',
  path: 'compare',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Compare', path: 'compare' }])} />
      <Client />
    </>
  )
}
