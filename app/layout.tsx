import type { Metadata } from 'next'
import { preconnect } from 'react-dom'
import './globals.css'
import AppChrome from './AppChrome'
import JsonLd from '@/components/JsonLd'
import PhoneHost from '@/components/PhoneHost'

// The public marketing site lives on this origin; used to resolve canonical and
// Open Graph URLs. Falls back to the production domain when the env var is unset.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// Site-wide metadata defaults. Individual pages override `title` (the template
// turns "Pricing" into "Pricing · Colvy") and `description`; everything else
// (Open Graph, Twitter, icons, canonical base) is inherited from here.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Colvy — Shared Inbox, CRM & Business Phone for Small Businesses',
    template: '%s · Colvy',
  },
  description:
    'Colvy is the all-in-one customer platform for small businesses: one shared inbox for WhatsApp, Instagram, Messenger, email, SMS and live chat, with a CRM, business phone, store orders, payments, AI agents and customer feedback built in.',
  applicationName: 'Colvy',
  keywords: [
    'shared inbox', 'omnichannel inbox', 'small business CRM', 'business phone',
    'business SMS', 'WhatsApp', 'Instagram DM', 'Messenger', 'live chat', 'help desk',
    'WooCommerce', 'Shopify', 'AI agents', 'customer feedback',
  ],
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Colvy',
    url: SITE_URL,
    title: 'Colvy — Shared Inbox, CRM & Business Phone for Small Businesses',
    description:
      'One shared inbox for WhatsApp, Instagram, Messenger, email, SMS and live chat, with a CRM, business phone, store orders, payments and AI agents built in.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'Colvy — customer communication made simple' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Colvy — Shared Inbox, CRM & Business Phone for Small Businesses',
    description:
      'One shared inbox for WhatsApp, Instagram, Messenger, email, SMS and live chat, with a CRM, business phone, store orders, payments and AI agents built in.',
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
      'Colvy is an all-in-one customer platform for small businesses: a shared inbox across every channel, a CRM, business phone, store orders, payments, AI agents and customer feedback.',
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
      'One shared inbox across WhatsApp, Instagram, Messenger, SMS, email, live chat and phone, with a CRM, WooCommerce and Shopify orders, payments, AI agents and customer feedback boards.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' },
    publisher: { '@id': ORG_ID },
  },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page talks to Supabase early (session, data) — open that connection
  // while the HTML is still arriving.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) preconnect(process.env.NEXT_PUBLIC_SUPABASE_URL, { crossOrigin: 'anonymous' })
  return (
    <html lang="en">
      <body style={{ background: 'var(--canvas)' }}>
        {/*
          Password-reset rescue. The reset email's link redirects to the site root
          (Supabase's Site URL) with the recovery tokens in the URL hash. The
          Supabase client is configured with detectSessionInUrl + implicit flow,
          so it parses AND STRIPS that hash the instant its module loads — before
          any React effect can see it — leaving the user on the landing/sign-in
          page with no way to the reset screen. This inline script runs during
          HTML parse, BEFORE the app bundle (and Supabase) executes, so it catches
          the recovery hash first and forwards to /reset-password with the hash
          intact (where the session is then established from it).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var h=window.location.hash||'';if(h.indexOf('type=recovery')!==-1&&h.indexOf('access_token=')!==-1&&window.location.pathname.indexOf('/reset-password')!==0){window.location.replace('/reset-password'+h);}}catch(e){}})();",
          }}
        />
        <JsonLd data={structuredData} />
        <AppChrome>{children}</AppChrome>
        {/* Outside AppChrome on purpose: AppChrome swaps between two trees
            (full-page vs app chrome), which would remount — and hang up — a
            live call. Here the phone persists across every route in the tab. */}
        <PhoneHost />
      </body>
    </html>
  )
}
