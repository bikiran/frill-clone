import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Who Colvy is for',
  description: 'See the real workflow Colvy runs for ecommerce stores, multi-location retailers, service businesses, restaurants and real estate agencies.',
  path: 'for',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Who it’s for', path: 'for' }])} />
      <Client />
    </>
  )
}
