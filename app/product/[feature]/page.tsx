import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { faqJsonLd, breadcrumbJsonLd } from '@/lib/seo-faqs'
import Client from './Client'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// SEO copy per product feature landing page. Keys mirror PAGES in ./Client.tsx.
const META: Record<string, { title: string; description: string }> = {
  ideas: { title: 'Feature Request & Idea Board Software', description: 'Collect and prioritise feature requests with Colvy idea boards — let customers vote and comment in one place.' },
  roadmap: { title: 'Public Product Roadmap Tool', description: 'Share what you’re building with a public Colvy roadmap and keep customers in the loop as work progresses.' },
  announcements: { title: 'Changelog & Product Announcement Tool', description: 'Announce new releases with a beautiful Colvy changelog and notify the customers who asked for each feature.' },
  knowledgebase: { title: 'Knowledge Base & Help Centre Software', description: 'Publish a searchable help centre and knowledge base that answers customers around the clock, and powers Colvy’s AI agents with your own answers.' },
  inbox: { title: 'Omnichannel Shared Inbox for Small Business', description: 'One shared inbox for SMS, calls, Instagram, Messenger, email, live chat and Google reviews. Assign conversations, schedule replies and answer from web or app. Start free.' },
  crm: { title: 'Simple CRM for Small Business, Built Into Your Inbox', description: 'A simple CRM that fills itself in: every customer’s details, channels, orders, bookings, notes and messages beside each conversation. No data entry, start free.' },
  gallery: { title: 'Shared Media Gallery for Customer Chats', description: 'Photos, videos and files in one searchable library — mark up photos, trim videos and send them into any chat in a tap.' },
  notes: { title: 'Internal Team Notes on Customer Conversations', description: 'Add private team notes to any conversation in Colvy so context never gets lost.' },
  orders: { title: 'WooCommerce & Shopify Orders in Your Inbox', description: 'See WooCommerce and Shopify orders beside every chat, update them, send tracking and payment links, and answer “where’s my order?” without leaving Colvy.' },
  payments: { title: 'Pay-by-Link & Payments in Chat with Stripe', description: 'Send a secure Stripe pay-by-link from any SMS, Instagram or email conversation, see when it’s paid, and follow up unpaid requests automatically.' },
  links: { title: 'Secure Upload & Payment Links', description: 'Send secure upload and payment links, and collect files from customers, right from Colvy.' },
  insights: { title: 'Customer Service Analytics & Response Times', description: 'Track response times, conversation volume, channels and team performance, and see what your customer conversations turn into.' },
  waitlists: { title: 'Back-in-Stock Waitlists for WooCommerce and Shopify', description: 'Add a “Notify me” form to sold-out WooCommerce or Shopify products and text everyone automatically when stock returns, with replies in your Colvy inbox.' },
  'voice-typing': { title: 'AI Voice Typing for Customer Replies', description: 'Dictate chat, SMS, social and email replies with Colvy Voice. Fillers removed, punctuation added and your product names spelled right, ready to send.' },
  'abandoned-carts': { title: 'Abandoned Cart Recovery for WooCommerce and Shopify', description: 'See every abandoned WooCommerce or Shopify checkout in your Colvy inbox, follow up by SMS or email, convert it to an order and track recovered revenue.' },
  booking: { title: 'Online Booking System with Deposits & SMS Reminders', description: 'Let customers book services online with Colvy: live staff availability, deposits with Stripe, SMS reminders and self-serve rescheduling, all in your inbox.' },
  calendar: { title: 'Shared Calendar & Appointment Reminders', description: 'Schedule and manage appointments alongside your conversations in Colvy.' },
  tasks: { title: 'Tasks & Follow-ups from Customer Chats', description: 'Turn conversations into tasks and never drop a follow-up with Colvy.' },
  broadcasts: { title: 'Bulk SMS & Email Broadcasts', description: 'Send targeted SMS and email broadcasts and handle replies in your Colvy inbox.' },
  automation: { title: 'Customer Messaging Automation', description: 'Automate replies, routing and follow-ups so your team focuses on the conversations that matter, with Colvy.' },
}

export async function generateMetadata({ params }: { params: Promise<{ feature: string }> }): Promise<Metadata> {
  const { feature } = await params
  const m = META[feature]
  if (!m) return { title: 'Product', alternates: { canonical: `/product/${feature}` } }
  return pageMeta({ title: m.title, description: m.description, path: `product/${feature}` })
}

// The page's questions (lib/seo-faqs.ts) and a breadcrumb trail as structured data.
export default async function Page({ params }: { params: Promise<{ feature: string }> }) {
  const { feature } = await params
  const m = META[feature]
  const path = `product/${feature}`
  const faq = faqJsonLd(path)
  const ld = m ? [...(faq ? [faq] : []), breadcrumbJsonLd(SITE_URL, [{ name: 'Product', path: 'product' }, { name: m.title, path }])] : []
  return (
    <>
      {ld.length > 0 && <JsonLd data={ld} />}
      <Client />
    </>
  )
}
