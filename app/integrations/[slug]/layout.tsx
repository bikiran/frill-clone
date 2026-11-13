import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { GuidesProvider } from '@/components/marketing/RelatedGuides'
import { guidesFor } from '@/lib/guides-for'
import { pageMeta } from '@/lib/seo'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'
import { INTEGRATION_SLUGS } from '@/lib/marketing-routes'
import { INTEGRATION_META } from '@/lib/page-meta'

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
const META = INTEGRATION_META

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
      <GuidesProvider guides={guidesFor(`integrations/${slug}`)}>{children}</GuidesProvider>
    </>
  )
}
