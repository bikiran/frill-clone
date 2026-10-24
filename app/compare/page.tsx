import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Compare Colvy with Podium, Birdeye, Zendesk, Intercom & More',
  description: 'See how Colvy compares with Podium, Birdeye, Coax, Gorgias, Zendesk, Freshdesk, Intercom, Gladly and ManyChat for Australian small businesses.',
  path: 'compare',
})

export default function Page() {
  return <Client />
}
