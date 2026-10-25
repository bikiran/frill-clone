import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { faqJsonLd, breadcrumbJsonLd } from '@/lib/seo-faqs'
import Client from './Client'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// SEO copy per channel landing page. Keys mirror CH in ./Client.tsx.
// WhatsApp isn't live yet (lib/feature-availability.ts), so its page says
// it's coming rather than selling it.
const META: Record<string, { title: string; description: string }> = {
  meta: { title: 'Instagram DM & Facebook Messenger Inbox for Business', description: 'Answer Instagram DMs, Instagram and Facebook comments and Messenger chats from one shared inbox. Assign conversations, reply as a team and let AI draft answers. Start free.' },
  email: { title: 'Shared Email Inbox for Teams (Gmail & Any Mailbox)', description: 'Turn your support email into a shared inbox. Assign, tag and answer emails as a team, sent from your own address and tied to each customer’s SMS, social and order history.' },
  phones: { title: 'Business Phone System with Australian Numbers', description: 'A business phone system in your inbox: Australian local, mobile and 1800 numbers, calls in the browser and app, ring groups, voicemail and call recordings on every customer record.' },
  'chat-widget': { title: 'Website Live Chat Widget for Business', description: 'Add live chat to your website, WordPress, WooCommerce or Shopify store. Answer visitors from your shared inbox, keep talking by SMS or email, and let AI cover out of hours.' },
  'google-reviews': { title: 'Google Reviews Management for Australian Businesses', description: 'Reply to Google reviews from one inbox, send review requests by SMS after every order or booking, and let AI draft on-brand replies. Built for Australian small businesses.' },
  whatsapp: { title: 'WhatsApp Business Inbox (Coming Soon)', description: 'WhatsApp support is coming to Colvy. Here’s what we’re building, and the channels that work in Colvy’s shared inbox today: SMS, Instagram, Messenger, email, web chat and phone.' },
  sms: { title: 'Business SMS & Two-Way Texting in Australia', description: 'Two-way business texting on an Australian 04 number. Send and receive SMS from a shared inbox, web or app, with broadcasts, reminders and 3,000 texts a month included on Inbox plans.' },
  forms: { title: 'Contact Forms That Land in Your Shared Inbox', description: 'Build contact and lead forms with Colvy and route every submission straight into your shared inbox and CRM, ready to answer by SMS, email or phone.' },
  broadcasts: { title: 'Bulk SMS & Email Broadcasts for Business', description: 'Send bulk SMS and email broadcasts to customer lists and segments, then answer every reply as its own conversation in your shared inbox.' },
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Channels', alternates: { canonical: `/channels/${slug}` } }
  return pageMeta({ title: m.title, description: m.description, path: `channels/${slug}` })
}

// The page's questions (lib/seo-faqs.ts) and a breadcrumb trail as structured data.
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
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
