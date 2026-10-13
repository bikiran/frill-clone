import type { Metadata } from 'next'

// colvy.com/ is served by this page (proxy.ts rewrites "/" here), so its
// title, description and canonical address live here. The canonical is "/"
// so Google keeps one home page rather than also listing /landing or
// www.colvy.com as separate pages.
export const metadata: Metadata = {
  title: { absolute: 'Colvy — Shared Inbox, CRM & Business Phone for Small Businesses' },
  description:
    'One shared inbox for WhatsApp, Instagram, Messenger, email, SMS and live chat, with a CRM, business phone, WooCommerce and Shopify orders, payments and AI agents built in. Start free.',
  alternates: { canonical: '/' },
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children
}
