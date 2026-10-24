import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Integrations: WooCommerce, Shopify, Stripe, Slack & Zapier',
  description: 'Connect Colvy to WooCommerce, Shopify, Stripe, Slack, Zapier and more, so orders, payments and alerts flow into your shared inbox.',
  path: 'integrations',
})

export default function Page() {
  return <Client />
}
