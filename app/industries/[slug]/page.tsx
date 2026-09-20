import type { Metadata } from 'next'
import Client from './Client'

// SEO copy per industry landing page. Keys mirror IND in ./Client.tsx.
const META: Record<string, { title: string; description: string }> = {
  saas: { title: 'Colvy for SaaS', description: 'Support, onboard and gather feedback from SaaS users — one shared inbox, a CRM and public roadmaps in Colvy.' },
  agencies: { title: 'Colvy for Agencies', description: 'Manage client conversations across every channel from one inbox, with a CRM and white-label boards built for agencies.' },
  ecommerce: { title: 'Colvy for Ecommerce', description: 'Answer buyers on Instagram, WhatsApp, SMS and email, tie chats to orders, and take payments — all in Colvy.' },
  hospitality: { title: 'Colvy for Hospitality', description: 'Handle bookings, enquiries and reviews across channels from one shared inbox built for hospitality teams.' },
  'real-estate': { title: 'Colvy for Real Estate', description: 'Capture and nurture property leads across SMS, WhatsApp and email with Colvy’s shared inbox and CRM.' },
  healthcare: { title: 'Colvy for Healthcare', description: 'Coordinate patient enquiries, reminders and reviews across channels from one secure shared inbox in Colvy.' },
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Industries', alternates: { canonical: `/industries/${slug}` } }
  return { title: m.title, description: m.description, alternates: { canonical: `/industries/${slug}` } }
}

export default function Page() {
  return <Client />
}
