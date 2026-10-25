import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { faqJsonLd, breadcrumbJsonLd } from '@/lib/seo-faqs'
import Client from './Client'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// SEO copy per solution landing page. Keys mirror PAGES in ./Client.tsx.
const META: Record<string, { title: string; description: string }> = {
  'customer-support': { title: 'Customer Support Software for Teams of Every Size', description: 'Run customer support across SMS, calls, Instagram, Messenger, email and live chat from one shared inbox, with a help centre, CRM and AI agents. Start free.' },
  sales: { title: 'Sales Inbox & AI-Powered CRM', description: 'Chase leads and close deals in Colvy — an omnichannel inbox and lightweight CRM that keeps every conversation and order in one place.' },
  marketing: { title: 'SMS Marketing & Broadcasts for Business', description: 'Grow and re-engage your audience with Colvy broadcasts over SMS and email, then handle every reply in your shared inbox.' },
  reviews: { title: 'Review & Reputation Management for Business', description: 'Get more Google reviews with SMS review requests, reply to every review and social comment from one inbox, and let AI draft replies in your tone.' },
  feedback: { title: 'Customer Feedback Software & Public Roadmaps', description: 'Capture feature requests, prioritise a public roadmap and announce releases with Colvy feedback boards.' },
  bookings: { title: 'Online Appointment Booking & Scheduling Software', description: 'Let customers book appointments online with Colvy: staff and location availability, Stripe deposits, SMS reminders and self-serve rescheduling, all in your shared inbox.' },
  payments: { title: 'Take Payments in Chat with Pay-by-Link', description: 'Send secure pay-by-link requests inside any conversation and reconcile them against orders — all in Colvy.' },
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Solutions', alternates: { canonical: `/solutions/${slug}` } }
  return pageMeta({ title: m.title, description: m.description, path: `solutions/${slug}` })
}

// The page's questions (lib/seo-faqs.ts) and a breadcrumb trail as structured data.
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const m = META[slug]
  const path = `solutions/${slug}`
  const faq = faqJsonLd(path)
  const ld = m ? [...(faq ? [faq] : []), breadcrumbJsonLd(SITE_URL, [{ name: 'Solutions', path: 'solutions' }, { name: m.title, path }])] : []
  return (
    <>
      {ld.length > 0 && <JsonLd data={ld} />}
      <Client />
    </>
  )
}
