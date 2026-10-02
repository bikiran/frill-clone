import type { Metadata } from 'next'
import Client from './Client'

// SEO copy per product feature landing page. Keys mirror PAGES in ./Client.tsx.
const META: Record<string, { title: string; description: string }> = {
  ideas: { title: 'Idea & Feature Request Boards', description: 'Collect and prioritise feature requests with Colvy idea boards — let customers vote and comment in one place.' },
  roadmap: { title: 'Public Product Roadmap', description: 'Share what you’re building with a public Colvy roadmap and keep customers in the loop as work progresses.' },
  announcements: { title: 'Changelog & Announcements', description: 'Announce new releases with a beautiful Colvy changelog and notify the customers who asked for each feature.' },
  knowledgebase: { title: 'Knowledge Base & Help Center', description: 'Answer common questions with a searchable Colvy help center that deflects tickets around the clock.' },
  inbox: { title: 'Omnichannel Shared Inbox', description: 'Bring Messenger, Instagram, WhatsApp, SMS, email and live chat into one shared, assignable inbox with Colvy.' },
  crm: { title: 'Lightweight CRM', description: 'Keep every customer’s profile, channels, orders and history together in Colvy’s built-in CRM.' },
  gallery: { title: 'Shared Media Gallery', description: 'Every image, video and file a customer sends, organised and searchable in Colvy.' },
  notes: { title: 'Internal Notes', description: 'Add private team notes to any conversation in Colvy so context never gets lost.' },
  orders: { title: 'Orders in the Inbox', description: 'See a customer’s orders next to the conversation and act on them without leaving Colvy.' },
  payments: { title: 'Payments & Pay-by-Link', description: 'Request and collect payments inside any chat with secure Stripe pay-by-link in Colvy.' },
  links: { title: 'Secure Links & Uploads', description: 'Send secure upload and payment links, and collect files from customers, right from Colvy.' },
  insights: { title: 'Analytics & Insights', description: 'Track response times, volume and team performance with Colvy analytics.' },
  calendar: { title: 'Bookings & Calendar', description: 'Schedule and manage appointments alongside your conversations in Colvy.' },
  tasks: { title: 'Tasks & Follow-ups', description: 'Turn conversations into tasks and never drop a follow-up with Colvy.' },
  broadcasts: { title: 'Broadcasts', description: 'Send targeted SMS, WhatsApp and email broadcasts and handle replies in your Colvy inbox.' },
  automation: { title: 'Automations', description: 'Automate replies, routing and follow-ups so your team focuses on the conversations that matter, with Colvy.' },
}

export async function generateMetadata({ params }: { params: Promise<{ feature: string }> }): Promise<Metadata> {
  const { feature } = await params
  const m = META[feature]
  if (!m) return { title: 'Product', alternates: { canonical: `/product/${feature}` } }
  return { title: m.title, description: m.description, alternates: { canonical: `/product/${feature}` } }
}

export default function Page() {
  return <Client />
}
