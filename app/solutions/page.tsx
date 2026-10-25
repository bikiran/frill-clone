import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Solutions for Support, Sales, Reviews & Bookings',
  description: 'How businesses of every size use Colvy for customer support, sales follow-ups, SMS marketing, Google reviews, online bookings, payments and customer feedback.',
  path: 'solutions',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Solutions', path: 'solutions' }])} />
      <Client />
    </>
  )
}
