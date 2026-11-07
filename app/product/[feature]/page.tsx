import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { PRODUCT_FEATURES } from '@/lib/marketing-routes'
import { faqJsonLd, breadcrumbJsonLd } from '@/lib/seo-faqs'
import Client from './Client'
import { PRODUCT_META } from '@/lib/page-meta'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// SEO copy per product feature landing page. Keys mirror PAGES in ./Client.tsx.
const META = PRODUCT_META

// Only the product features that exist are built (lib/marketing-routes.ts); any other
// address is a real 404, not this page with fallback copy.
export function generateStaticParams() {
  return PRODUCT_FEATURES.map(feature => ({ feature }))
}
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ feature: string }> }): Promise<Metadata> {
  const { feature } = await params
  const m = META[feature]
  if (!m) return { title: 'Product', alternates: { canonical: `/product/${feature}` } }
  return pageMeta({ title: m.title, description: m.description, path: `product/${feature}` })
}

// The page's questions (lib/seo-faqs.ts) and a breadcrumb trail as structured data.
export default async function Page({ params }: { params: Promise<{ feature: string }> }) {
  const { feature } = await params
  if (!PRODUCT_FEATURES.includes(feature)) notFound()
  const m = META[feature]
  const path = `product/${feature}`
  const faq = faqJsonLd(path)
  const ld = m ? [...(faq ? [faq] : []), breadcrumbJsonLd(SITE_URL, [{ name: 'Product', path: 'product' }, { name: m.title, path }])] : []
  return (
    <>
      {ld.length > 0 && <JsonLd data={ld} />}
      <Client />
    </>
  )
}
