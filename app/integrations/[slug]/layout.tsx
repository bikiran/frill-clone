import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'
import { INTEGRATION_SLUGS } from '@/lib/marketing-routes'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// The page is a client component, so the address is checked here: only the
// integrations that exist are built (lib/marketing-routes.ts mirrors INTG in ./page.tsx),
// and any other address is a real 404, not a page with fallback copy.
export function generateStaticParams() {
  return INTEGRATION_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

// Search titles and descriptions, from each page's own name, headline and
// intro in ./page.tsx (keys mirror INTG; scripts/marketing-routes.test.mjs
// checks every page has one).
const META: Record<string, { title: string; description: string }> = {
  "woocommerce": { title: "WooCommerce orders, right in the chat", description: "Connect your WooCommerce store and see live orders, tracking and customer history beside every conversation — look things up and act without leaving the thread." },
  "shopify": { title: "Shopify orders in every conversation", description: "Sync your Shopify store — even multiple stores — so customers and orders flow into Colvy and sit beside every message your team answers." },
  "stripe": { title: "Stripe: Take payments inside the chat", description: "Connect your own Stripe account to send payment links and invoices right in a conversation — and record the sale on the thread the moment it’s paid." },
  "slack": { title: "Slack: Get the alerts where your team already works", description: "Post to Slack when it matters — new ideas, votes, status changes and conversations — so your team stays in the loop without living in another tab." },
  "zapier": { title: "Zapier: Connect Colvy to 5,000+ apps", description: "Wire Colvy into the rest of your stack with Zapier — start a Zap whenever something happens in Colvy, all without writing code." },
  "api": { title: "Build on Colvy with webhooks & API", description: "When you need something custom, Colvy sends signed webhooks for the events that matter, has a REST API for your feedback board, and an MCP server for AI…" },
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Not found', robots: { index: false } }
  return pageMeta({ title: m.title, description: m.description, path: `integrations/${slug}` })
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!INTEGRATION_SLUGS.includes(slug)) notFound()
  const m = META[slug]
  const path = `integrations/${slug}`
  return (
    <>
      {m && <JsonLd data={[breadcrumbJsonLd(SITE_URL, [{ name: 'Integrations', path: 'integrations' }, { name: m.title, path }])]} />}
      {children}
    </>
  )
}
