import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Client from './Client'
import { getHelpIndexForHost } from '@/lib/help-public'

export const metadata: Metadata = {
  title: "Help Center",
  description: "Guides and answers for getting the most out of Colvy.",
  alternates: { canonical: "/help" },
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
