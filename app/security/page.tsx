import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export const metadata: Metadata = pageMeta({
  title: 'Security',
  description: 'How Colvy protects your data — encryption, access controls and privacy by design.',
  path: 'security',
})

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(SITE_URL, [{ name: 'Security', path: 'security' }])} />
      <Client />
    </>
  )
}
