import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { CHANNEL_SLUGS } from '@/lib/marketing-routes'
import { faqJsonLd, breadcrumbJsonLd } from '@/lib/seo-faqs'
import Client from './Client'
import { GuidesProvider } from '@/components/marketing/RelatedGuides'
import { guidesFor } from '@/lib/guides-for'
import { CHANNEL_META } from '@/lib/page-meta'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// SEO copy per channel landing page. Keys mirror CH in ./Client.tsx.
// WhatsApp isn't live yet (lib/feature-availability.ts), so its page says
// it's coming rather than selling it.
const META = CHANNEL_META

// Only the channels that exist are built (lib/marketing-routes.ts); any other
// address is a real 404, not this page with fallback copy.
export function generateStaticParams() {
  return CHANNEL_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Channels', alternates: { canonical: `/channels/${slug}` } }
  return pageMeta({ title: m.title, description: m.description, path: `channels/${slug}` })
}

// The page's questions (lib/seo-faqs.ts) and a breadcrumb trail as structured data.
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!CHANNEL_SLUGS.includes(slug)) notFound()
  const m = META[slug]
  const path = `channels/${slug}`
  const faq = faqJsonLd(path)
  const ld = m ? [...(faq ? [faq] : []), breadcrumbJsonLd(SITE_URL, [{ name: 'Channels', path: 'channels' }, { name: m.title, path }])] : []
  return (
    <>
      {ld.length > 0 && <JsonLd data={ld} />}
      <GuidesProvider guides={guidesFor(`channels/${slug}`)}><Client /></GuidesProvider>
    </>
  )
}
