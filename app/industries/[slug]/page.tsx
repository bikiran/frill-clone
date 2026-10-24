import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { faqJsonLd, breadcrumbJsonLd } from '@/lib/seo-faqs'
import Client from './Client'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// SEO copy per industry landing page. Keys mirror IND in ./Client.tsx.
const META: Record<string, { title: string; description: string }> = {
  saas: { title: 'Customer Support & Feedback Software for SaaS', description: 'Support, onboard and gather feedback from SaaS users — one shared inbox, a CRM and public roadmaps in Colvy.' },
  agencies: { title: 'Client Messaging Inbox & CRM for Agencies', description: 'Manage client conversations across every channel from one inbox, with a CRM and white-label boards built for agencies.' },
  ecommerce: { title: 'Colvy for Ecommerce', description: 'Answer buyers on Instagram, SMS and email, tie chats to orders, and take payments — all in Colvy.' },
  hospitality: { title: 'Messaging, Bookings & Reviews for Hospitality', description: 'Handle bookings, enquiries and reviews across channels from one shared inbox built for hospitality teams.' },
  'real-estate': { title: 'Colvy for Real Estate', description: 'Capture and nurture property leads across SMS, calls and email with Colvy’s shared inbox and CRM.' },
  healthcare: { title: 'Patient Messaging & Reminders for Clinics', description: 'Coordinate patient enquiries, reminders and reviews across channels from one secure shared inbox in Colvy.' },
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Industries', alternates: { canonical: `/industries/${slug}` } }
  return pageMeta({ title: m.title, description: m.description, path: `industries/${slug}` })
}

// The page's questions (lib/seo-faqs.ts) and a breadcrumb trail as structured data.
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const m = META[slug]
  const path = `industries/${slug}`
  const faq = faqJsonLd(path)
  const ld = m ? [...(faq ? [faq] : []), breadcrumbJsonLd(SITE_URL, [{ name: 'Industries', path: 'industries' }, { name: m.title, path }])] : []
  return (
    <>
      {ld.length > 0 && <JsonLd data={ld} />}
      <Client />
    </>
  )
}
