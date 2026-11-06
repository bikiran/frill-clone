import type { Metadata } from 'next'
import { brandBySlug, requestTenant } from '@/lib/tenant-brand'
import { buildTenantMetadata } from '@/lib/tenant-meta'

// colvy.com/reserve/<restaurant>: the tab belongs to the restaurant taking the
// booking, never to Colvy (lib/tenant-meta).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { host, brand: hostBrand } = await requestTenant()
  const brand = host.kind === 'colvy' ? await brandBySlug(slug) : hostBrand
  if (host.kind === 'colvy' && !brand) return {}
  return buildTenantMetadata({ host, brand, page: 'reserve', path: `/reserve/${encodeURIComponent(slug)}` })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
