import type { Metadata } from 'next'
import { brandBySlug, requestTenant } from '@/lib/tenant-brand'
import { buildTenantMetadata } from '@/lib/tenant-meta'

// colvy.com/account/<business>: the tab belongs to the business, never to Colvy. Never indexed.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { host, brand: hostBrand } = await requestTenant()
  const brand = host.kind === 'colvy' ? await brandBySlug(slug) : hostBrand
  if (host.kind === 'colvy' && !brand) return { robots: { index: false, follow: false } }
  return buildTenantMetadata({ host, brand, page: 'account', path: `/account/${encodeURIComponent(slug)}`, noIndex: true })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
