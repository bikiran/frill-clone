import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { FOR_PAGES, FOR_SLUGS } from '@/lib/for-pages'
import Client from './Client'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

export function generateStaticParams() {
  return FOR_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = FOR_PAGES[slug]
  if (!m) return { title: 'Not found', robots: { index: false } }
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: `/for/${slug}` },
    openGraph: { title: m.title, description: m.description, url: `${SITE_URL}/for/${slug}` },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const m = FOR_PAGES[slug]
  if (!m) notFound()
  // The on-page FAQ, mirrored as structured data, plus a breadcrumb trail.
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: m.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Colvy', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Who it’s for', item: `${SITE_URL}/for` },
        { '@type': 'ListItem', position: 3, name: m.name, item: `${SITE_URL}/for/${slug}` },
      ],
    },
  ]
  return (
    <>
      <JsonLd data={ld} />
      <Client slug={slug} />
    </>
  )
}
