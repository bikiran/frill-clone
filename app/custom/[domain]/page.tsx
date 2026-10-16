import type { Metadata } from 'next'
import CustomDomainPage from './CustomDomainClient'
import { getCustomDomainHelp } from '@/lib/help-public'
import { brandForHostName, hostFromDomainParam } from '@/lib/tenant-brand'
import { buildTenantMetadata, customHostIsHelp } from '@/lib/tenant-meta'

// The tab belongs to the company: "<Company> Help Centre" on a help domain,
// "<Company> Feedback" on a board domain, with its icon (lib/tenant-meta).
export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }): Promise<Metadata> {
  const host = hostFromDomainParam((await params).domain)
  const brand = await brandForHostName(host.host)
  return buildTenantMetadata({ host, brand, page: customHostIsHelp(host, brand) ? 'help' : 'feedback', path: '/' })
}

// Custom-domain home (help.acme.com → /custom/help__acme__com via proxy.ts).
// The company and its published help articles are resolved on the server from a
// short-lived shared cache, so the help centre arrives already rendered.
export default async function Page({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params
  const hostname = (domain || '').replace(/__/g, '.')
  const initial = await getCustomDomainHelp(hostname)
  return <CustomDomainPage initial={initial} domain={hostname} />
}
