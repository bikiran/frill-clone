import type { Metadata } from 'next'
import { preconnect } from 'react-dom'
import './globals.css'
import AppChrome from './AppChrome'
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
  // The black rounded tile (the app icon), so the mark stays visible on dark
  // browser tabs. Google shows the favicon beside every result and wants a
  // square in a multiple of 48px.
  icons: {
    icon: [
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.png', sizes: '256x256', type: 'image/png' },
    ],
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
        <AppChrome>{children}</AppChrome>
        {/* Outside AppChrome on purpose: AppChrome swaps between two trees
            (full-page vs app chrome), which would remount — and hang up — a
            live call. Here the phone persists across every route in the tab. */}
        <PhoneHost />
      </body>
    </html>
  )
}
