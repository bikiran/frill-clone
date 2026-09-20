import type { Metadata } from 'next'
import './globals.css'
import AppChrome from './AppChrome'

// The public marketing site lives on this origin; used to resolve canonical and
// Open Graph URLs. Falls back to the production domain when the env var is unset.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// Site-wide metadata defaults. Individual pages override `title` (the template
// turns "Pricing" into "Pricing · Colvy") and `description`; everything else
// (Open Graph, Twitter, icons, canonical base) is inherited from here.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Colvy — Omnichannel Inbox, CRM & Customer Feedback',
    template: '%s · Colvy',
  },
  description:
    'Colvy is the all-in-one customer platform: a shared inbox across Messenger, Instagram, WhatsApp, SMS and email, a lightweight CRM, and product feedback boards, roadmaps and changelogs — all in one place.',
  applicationName: 'Colvy',
  keywords: [
    'customer support inbox', 'shared inbox', 'omnichannel inbox', 'CRM',
    'customer feedback', 'feature request board', 'product roadmap', 'changelog',
    'Messenger', 'Instagram DM', 'WhatsApp', 'live chat', 'help desk',
  ],
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Colvy',
    url: SITE_URL,
    title: 'Colvy — Omnichannel Inbox, CRM & Customer Feedback',
    description:
      'One shared inbox across Messenger, Instagram, WhatsApp, SMS and email, a lightweight CRM, and product feedback boards, roadmaps and changelogs.',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Colvy' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Colvy — Omnichannel Inbox, CRM & Customer Feedback',
    description:
      'One shared inbox across Messenger, Instagram, WhatsApp, SMS and email, a lightweight CRM, and product feedback boards, roadmaps and changelogs.',
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: 'var(--canvas)' }}>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  )
}
