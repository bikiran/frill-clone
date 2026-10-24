import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Channels: SMS, Calls, Instagram, Messenger, Email & Chat',
  description: 'Connect SMS and calls on Australian numbers, Instagram, Facebook Messenger, email, live chat, forms and Google reviews to one shared inbox with Colvy.',
  path: 'channels',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Channels', path: 'channels' }])} />
      <Client />
    </>
  )
}
