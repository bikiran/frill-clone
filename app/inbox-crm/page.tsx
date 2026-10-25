import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Shared Inbox & AI-Powered CRM',
  description: 'Colvy’s shared inbox and simple CRM bring SMS, calls, Instagram, Messenger, email and live chat, plus every customer’s orders and history, into one place.',
  path: 'inbox-crm',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Inbox & CRM', path: 'inbox-crm' }])} />
      <Client />
    </>
  )
}
