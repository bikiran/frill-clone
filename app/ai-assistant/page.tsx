import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'AI Assistant for Customer Messages',
  description: 'Colvy’s AI assistant drafts replies from your own knowledge, summarises conversations and takes actions like payment links and bookings, so your team replies faster.',
  path: 'ai-assistant',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'AI Assistant', path: 'ai-assistant' }])} />
      <Client />
    </>
  )
}
