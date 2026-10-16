import type { Metadata, Viewport } from 'next'
import { brandBySlug, requestTenant } from '@/lib/tenant-brand'
import { buildTenantMetadata, buildTenantViewport } from '@/lib/tenant-meta'

// colvy.com/book/<company>[/<service>] — or, on <company>.colvy.com,
// /book/<service>. Either way the tab belongs to the company taking the
// booking, never to Colvy (lib/tenant-meta).
async function resolve(slug: string) {
  const { host, brand: hostBrand } = await requestTenant()
  const brand = host.kind === 'colvy' ? await brandBySlug(slug) : hostBrand
  return { host, brand }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { host, brand } = await resolve(slug)
  if (host.kind === 'colvy' && !brand) return {}
  return buildTenantMetadata({ host, brand, page: 'book', path: `/book/${encodeURIComponent(slug || '')}` })
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const { slug } = await params
  return buildTenantViewport((await resolve(slug)).brand)
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
