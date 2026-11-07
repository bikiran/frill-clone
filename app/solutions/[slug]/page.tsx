import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { SOLUTION_SLUGS } from '@/lib/marketing-routes'
import { faqJsonLd, breadcrumbJsonLd } from '@/lib/seo-faqs'
import Client from './Client'
import { SOLUTION_META } from '@/lib/page-meta'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// SEO copy per solution landing page. Keys mirror PAGES in ./Client.tsx.
const META = SOLUTION_META

// Only the solutions that exist are built (lib/marketing-routes.ts); any other
// address is a real 404, not this page with fallback copy.
export function generateStaticParams() {
  return SOLUTION_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Solutions', alternates: { canonical: `/solutions/${slug}` } }
  return pageMeta({ title: m.title, description: m.description, path: `solutions/${slug}` })
}

// The page's questions (lib/seo-faqs.ts) and a breadcrumb trail as structured data.
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!SOLUTION_SLUGS.includes(slug)) notFound()
  const m = META[slug]
  const path = `solutions/${slug}`
  const faq = faqJsonLd(path)
  const ld = m ? [...(faq ? [faq] : []), breadcrumbJsonLd(SITE_URL, [{ name: 'Solutions', path: 'solutions' }, { name: m.title, path }])] : []
  return (
    <>
      {ld.length > 0 && <JsonLd data={ld} />}
      <Client />
    </>
  )
}
