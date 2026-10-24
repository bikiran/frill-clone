import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { COMPARE_SLUGS } from '@/lib/marketing-routes'
import { faqJsonLd, breadcrumbJsonLd } from '@/lib/seo-faqs'
import { COMPARE_META as META } from '@/lib/compare-meta'
import Client from './Client'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export function generateStaticParams() {
  return COMPARE_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Not found', robots: { index: false } }
  return pageMeta({ title: m.title, description: m.description, path: `compare/${slug}`, absolute: true })
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const m = META[slug]
  if (!m) notFound()
  const faq = faqJsonLd(`compare/${slug}`)
  const ld = [
    ...(faq ? [faq] : []),
    breadcrumbJsonLd(SITE_URL, [{ name: 'Compare', path: 'compare' }, { name: `Colvy vs ${m.name}`, path: `compare/${slug}` }]),
  ]
  return (
    <>
      <JsonLd data={ld} />
      <Client />
    </>
  )
}
