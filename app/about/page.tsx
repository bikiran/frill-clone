import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'About Colvy',
  description: 'Colvy is an Australian customer communication platform helping small businesses answer every customer across SMS, calls, social, email and chat from one inbox.',
  path: 'about',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'About', path: 'about' }])} />
      <Client />
    </>
  )
}
