import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Business Phone System & Call Inbox',
  description: 'Make and take business calls in your browser or the Colvy app on Australian numbers, with ring groups, voicemail, recordings and transcripts on every customer record.',
  path: 'phones',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Business Phone', path: 'phones' }])} />
      <Client />
    </>
  )
}
