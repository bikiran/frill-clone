import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { CHANNEL_SLUGS } from '@/lib/marketing-routes'
import { faqJsonLd, breadcrumbJsonLd } from '@/lib/seo-faqs'
import Client from './Client'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// SEO copy per channel landing page. Keys mirror CH in ./Client.tsx.
// WhatsApp isn't live yet (lib/feature-availability.ts), so its page says
// it's coming rather than selling it.
const META: Record<string, { title: string; description: string }> = {
  meta: { title: 'Instagram DM & Facebook Messenger Inbox for Business', description: 'Answer Instagram DMs, Instagram and Facebook comments and Messenger chats from one shared inbox. Assign conversations, reply as a team and let AI draft answers.' },
  email: { title: 'Shared Email Inbox for Teams (Gmail & Any Mailbox)', description: 'Turn your support email into a shared inbox. Assign, tag and answer emails as a team from your own address, tied to each customer’s SMS, social and orders.' },
  phones: { title: 'Business Phone System with Australian Numbers', description: 'A business phone system in your inbox: Australian local, mobile and 1800 numbers, calls in browser and app, ring groups, voicemail and recordings per customer.' },
  'chat-widget': { title: 'Website Live Chat Widget for Business', description: 'Add live chat to your website, WordPress, WooCommerce or Shopify store. Answer from your shared inbox, continue by SMS or email, and let AI cover after hours.' },
  'google-reviews': { title: 'Google Reviews Management for Australian Businesses', description: 'Reply to Google reviews from one inbox, send SMS review requests after each order or booking, and let AI draft on-brand replies. For Australian businesses.' },
  whatsapp: { title: 'WhatsApp Business Inbox (Coming Soon)', description: 'WhatsApp support is coming to Colvy. See what we’re building, and the channels in Colvy’s shared inbox today: SMS, Instagram, Messenger, email, chat and phone.' },
  sms: { title: 'Business SMS & Two-Way Texting in Australia', description: 'Two-way business texting on an Australian 04 number: SMS from a shared inbox on web or app, with broadcasts, reminders and 3,000 texts a month on Inbox plans.' },
  forms: { title: 'Contact Forms That Land in Your Shared Inbox', description: 'Build contact and lead forms with Colvy and route every submission straight into your shared inbox and CRM, ready to answer by SMS, email or phone.' },
  broadcasts: { title: 'Bulk SMS & Email Broadcasts for Business', description: 'Send bulk SMS and email broadcasts to customer lists and segments, then answer every reply as its own conversation in your shared inbox.' },
}

// Only the channels that exist are built (lib/marketing-routes.ts); any other
// address is a real 404, not this page with fallback copy.
export function generateStaticParams() {
  return CHANNEL_SLUGS.map(slug => ({ slug }))
}
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Channels', alternates: { canonical: `/channels/${slug}` } }
  return pageMeta({ title: m.title, description: m.description, path: `channels/${slug}` })
}

// The page's questions (lib/seo-faqs.ts) and a breadcrumb trail as structured data.
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!CHANNEL_SLUGS.includes(slug)) notFound()
  const m = META[slug]
  const path = `channels/${slug}`
  const faq = faqJsonLd(path)
  const ld = m ? [...(faq ? [faq] : []), breadcrumbJsonLd(SITE_URL, [{ name: 'Channels', path: 'channels' }, { name: m.title, path }])] : []
  return (
    <>
      {ld.length > 0 && <JsonLd data={ld} />}
      <Client />
    </>
  )
}
