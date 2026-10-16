import type { Metadata } from 'next'
import { brandBySlug, requestTenant } from '@/lib/tenant-brand'
import { buildTenantMetadata } from '@/lib/tenant-meta'

// colvy.com/book/<company>[/<service>] — or, on <company>.colvy.com,
// /book/<service>. Either way the tab belongs to the company taking the
// booking, never to Colvy (lib/tenant-meta), and the canonical URL keeps the
// service so each service's booking page is its own address.
export async function generateMetadata({ params }: { params: Promise<{ slug: string; service?: string[] }> }): Promise<Metadata> {
  const { slug, service } = await params
  const { host, brand: hostBrand } = await requestTenant()
  const brand = host.kind === 'colvy' ? await brandBySlug(slug) : hostBrand
  if (host.kind === 'colvy' && !brand) return {}
  const path = ['book', slug, ...(service || []).slice(0, 1)].filter(Boolean).map(encodeURIComponent).join('/')
  return buildTenantMetadata({ host, brand, page: 'book', path: `/${path}` })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
