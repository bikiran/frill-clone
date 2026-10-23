import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: 'AI Agents for Support, Bookings, Sales, Orders & Reviews',
  description: 'Five AI agents that answer customers, book appointments, follow up carts, chase late orders and reply to reviews. They check your real data first, start as drafts, and hand your team the exceptions.',
  alternates: { canonical: '/ai-agents' },
}

export default function Page() {
  return <Client />
}
