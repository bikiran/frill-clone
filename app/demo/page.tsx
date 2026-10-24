import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Book a Demo',
  description: 'See Colvy in action: try the shared inbox, business SMS, CRM and AI agents, or book a personalised demo with our Australian team.',
  path: 'demo',
})

export default function Page() {
  return <Client />
}
