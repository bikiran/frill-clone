import CustomDomainPage from './CustomDomainClient'
import { getCustomDomainHelp } from '@/lib/help-public'

// Custom-domain home (help.acme.com → /custom/help__acme__com via proxy.ts).
// The company and its published help articles are resolved on the server from a
// short-lived shared cache, so the help centre arrives already rendered.
export default async function Page({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params
  const hostname = (domain || '').replace(/__/g, '.')
  const initial = await getCustomDomainHelp(hostname)
  return <CustomDomainPage initial={initial} domain={hostname} />
}
