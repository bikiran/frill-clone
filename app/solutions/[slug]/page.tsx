import type { Metadata } from 'next'
import Client from './Client'

// SEO copy per solution landing page. Keys mirror PAGES in ./Client.tsx.
const META: Record<string, { title: string; description: string }> = {
  'customer-support': { title: 'Customer Support Software', description: 'Run customer support across Messenger, Instagram, WhatsApp, SMS, email and live chat from one shared inbox in Colvy.' },
  sales: { title: 'Sales Inbox & CRM', description: 'Chase leads and close deals in Colvy — an omnichannel inbox and lightweight CRM that keeps every conversation and order in one place.' },
  marketing: { title: 'Marketing & Broadcasts', description: 'Grow and re-engage your audience with Colvy broadcasts over SMS, WhatsApp and email, then handle every reply in your shared inbox.' },
  reviews: { title: 'Reviews & Reputation', description: 'Collect, monitor and reply to Google reviews from Colvy, and turn happy customers into public proof.' },
  feedback: { title: 'Customer Feedback & Roadmaps', description: 'Capture feature requests, prioritise a public roadmap and announce releases with Colvy feedback boards.' },
  payments: { title: 'Payments in Chat', description: 'Send secure pay-by-link requests inside any conversation and reconcile them against orders — all in Colvy.' },
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Solutions', alternates: { canonical: `/solutions/${slug}` } }
  return { title: m.title, description: m.description, alternates: { canonical: `/solutions/${slug}` } }
}

export default function Page() {
  return <Client />
}
