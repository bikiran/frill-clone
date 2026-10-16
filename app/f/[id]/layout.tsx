import type { Metadata, Viewport } from 'next'
import { brandById, publicRecord, recordPageMetadata, requestTenant } from '@/lib/tenant-brand'
import { buildTenantViewport } from '@/lib/tenant-meta'

// A contact form (often embedded). These links are shared on colvy.com as well as on
// company subdomains, so the tab is branded by the company that owns the
// record (lib/tenant-meta), with the record's own title.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return (await recordPageMetadata('contact-form', 'contact_forms', id, `/f/${encodeURIComponent(id || '')}`)) || {}
}

export async function generateViewport({ params }: { params: Promise<{ id: string }> }): Promise<Viewport> {
  const { id } = await params
  const [{ brand: hostBrand }, rec] = await Promise.all([requestTenant(), publicRecord('contact_forms', id)])
  return buildTenantViewport((rec?.companyId ? await brandById(rec.companyId) : null) || hostBrand)
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
