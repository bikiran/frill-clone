import type { Metadata } from 'next'
import Client from './Client'

// SEO copy per channel landing page. Keys mirror CH in ./Client.tsx.
const META: Record<string, { title: string; description: string }> = {
  meta: { title: 'Instagram & Facebook Messenger Inbox', description: 'Manage Instagram DMs, comments and Facebook Messenger from one shared inbox in Colvy — with a CRM, automations and team replies.' },
  email: { title: 'Shared Email Inbox', description: 'Turn support email into a shared, assignable inbox in Colvy — threaded, tagged and tied to each customer’s history.' },
  phones: { title: 'Business Phone & Calls', description: 'Take and make business calls in Colvy — click-to-dial, call notes and recordings, all attached to the customer record.' },
  'chat-widget': { title: 'Website Live Chat Widget', description: 'Add a live chat widget to your site and answer visitors in Colvy’s shared inbox, with history and CRM built in.' },
  'google-reviews': { title: 'Google Reviews Management', description: 'See and reply to Google reviews from Colvy, and route new reviews to your team like any other conversation.' },
  whatsapp: { title: 'WhatsApp Business Inbox', description: 'Reply to WhatsApp Business messages from Colvy’s shared inbox — with a CRM, saved replies and automations.' },
  sms: { title: 'Business SMS / Text Messaging', description: 'Send and receive business SMS in Colvy — two-way texting, broadcasts and reminders tied to each customer.' },
  forms: { title: 'Contact Forms', description: 'Capture leads with Colvy contact forms and route every submission straight into your shared inbox and CRM.' },
  broadcasts: { title: 'Broadcast Messaging', description: 'Send targeted broadcasts over SMS, WhatsApp and email from Colvy, and handle replies in your shared inbox.' },
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const m = META[slug]
  if (!m) return { title: 'Channels', alternates: { canonical: `/channels/${slug}` } }
  return { title: m.title, description: m.description, alternates: { canonical: `/channels/${slug}` } }
}

export default function Page() {
  return <Client />
}
