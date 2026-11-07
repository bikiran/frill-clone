import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { breadcrumbJsonLd } from '@/lib/seo-faqs'
import { AI_SLUGS } from '@/lib/marketing-routes'
import { AI_META } from '@/lib/page-meta'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// The page is a client component, so the address is checked here: only the
// AI assistant pages that exist are built (lib/marketing-routes.ts mirrors AI in ./page.tsx),
// and any other address is a real 404, not a page with fallback copy.
export function generateStaticParams() {
  return AI_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

// Search titles and descriptions, from each page's own name, headline and
// intro in ./page.tsx (keys mirror AI; scripts/marketing-routes.test.mjs
// checks every page has one).
const META = AI_META

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Not found', robots: { index: false } }
  return pageMeta({ title: m.title, description: m.description, path: `ai-assistant/${slug}` })
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!AI_SLUGS.includes(slug)) notFound()
  const m = META[slug]
  const path = `ai-assistant/${slug}`
  return (
    <>
      {m && <JsonLd data={[breadcrumbJsonLd(SITE_URL, [{ name: 'AI Assistant', path: 'ai-assistant' }, { name: m.title, path }])]} />}
      {children}
    </>
  )
}
