import type { Metadata } from 'next'
import './globals.css'
import AppChrome from './AppChrome'
import JsonLd from '@/components/JsonLd'

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
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'Colvy — customer communication made simple' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Colvy — Omnichannel Inbox, CRM & Customer Feedback',
    description:
      'One shared inbox across Messenger, Instagram, WhatsApp, SMS and email, a lightweight CRM, and product feedback boards, roadmaps and changelogs.',
    images: ['/og.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
}

// Site-wide structured data. Helps search engines understand that Colvy is an
// organisation and a software product (not the rapper / mattress it collides
// with), and can earn richer results. Only verifiable facts are declared — no
// ratings or prices are invented here (the free tier is declared as $0).
const ORG_ID = `${SITE_URL}/#organization`
const structuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Colvy',
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      'Colvy is an all-in-one customer platform: an omnichannel shared inbox, a lightweight CRM, and product feedback boards, roadmaps and changelogs.',
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@colvy.com',
      contactType: 'customer support',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: 'Colvy',
    url: SITE_URL,
    publisher: { '@id': ORG_ID },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Colvy',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    url: SITE_URL,
    description:
      'One shared inbox across Messenger, Instagram, WhatsApp, SMS, email, live chat and phone, plus a lightweight CRM and customer feedback boards.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' },
    publisher: { '@id': ORG_ID },
  },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: 'var(--canvas)' }}>
        <JsonLd data={structuredData} />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  )
}
