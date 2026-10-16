import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import Client from './Client'
import { getHelpIndexForHost } from '@/lib/help-public'
import { tenantPageMetadata, tenantPageViewport } from '@/lib/tenant-brand'

// Colvy's own help centre (colvy.com/help).
const COLVY_METADATA: Metadata = {
  title: "Help Center",
  description: "Guides and answers for getting the most out of Colvy.",
  alternates: { canonical: "/help" },
}

// On a company subdomain the tab reads "<Company> Help Centre" with the
// company's icon and help-centre subtitle instead (lib/tenant-meta).
export async function generateMetadata(): Promise<Metadata> {
  return (await tenantPageMetadata('help', '/help')) || COLVY_METADATA
}

export async function generateViewport(): Promise<Viewport> {
  return tenantPageViewport()
}

// The help centre is rendered on the server with this host's published
// articles (from a short-lived shared cache, see lib/help-public), so visitors
// get content in the first paint instead of a spinner and a chain of requests.
export default async function Page() {
  const h = await headers()
  const host = h.get('host') || h.get('x-forwarded-host') || ''
  const initial = await getHelpIndexForHost(host)
  return <Client initial={initial} />
}
