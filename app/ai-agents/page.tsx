import type { Metadata } from 'next'
import Client from './Client'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'AI Agents for Support, Bookings, Sales, Orders & Reviews',
  description: 'Five AI agents that answer customers, book appointments, follow up carts, chase late orders and reply to reviews. They check your real data first, start as drafts, and hand your team the exceptions.',
  path: 'ai-agents',
})

export default function Page() {
  return <Client />
}
