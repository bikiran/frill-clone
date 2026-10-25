import JsonLd from '@/components/JsonLd'
import { COLVY_CONTACT } from '@/lib/colvy-contact'

// Colvy's Organization / WebSite / SoftwareApplication JSON-LD, rendered only
// on Colvy's own marketing pages (each marketing route's layout includes
// <ColvyJsonLd />; the list mirrors lib/marketing-routes.ts). It used to sit in
// the root layout, which put Colvy's organisation, email and phone on every
// business's board, help centre and booking page too. Static: no request data.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'

// Colvy's own structured data. Helps search engines understand that Colvy is an
// organisation and a software product (not the rapper / mattress it collides
// with), and can earn richer results. Only verifiable facts are declared — no
// ratings or prices are invented here (the free tier is declared as $0).
const ORG_ID = `${SITE_URL}/#organization`
// Official Colvy profiles elsewhere. Google uses these to tie the brand
// together (and for a knowledge panel). Add social profiles here as they're
// set up, e.g. 'https://www.linkedin.com/company/colvy'.
const SAME_AS = [
  'https://apps.apple.com/app/id6803380512',
  'https://play.google.com/store/apps/details?id=com.colvy.app',
]
const structuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Colvy',
    alternateName: 'Colvy App',
    url: SITE_URL,
    logo: { '@type': 'ImageObject', '@id': `${SITE_URL}/#logo`, url: `${SITE_URL}/logo.png`, contentUrl: `${SITE_URL}/logo.png`, width: 256, height: 256, caption: 'Colvy' },
    image: { '@id': `${SITE_URL}/#logo` },
    sameAs: SAME_AS,
    description:
      'Colvy is an all-in-one customer platform for teams of every size, from small businesses to enterprise: a shared inbox across every channel, business phone and SMS, an AI-powered CRM, store orders, payments, AI agents and customer feedback.',
    telephone: COLVY_CONTACT.phoneE164,
    email: COLVY_CONTACT.email,
    areaServed: 'AU',
    knowsAbout: ['Shared inbox software', 'Customer messaging', 'Business SMS', 'Business phone systems', 'AI-powered CRM', 'CRM for small business', 'Enterprise customer communication', 'Google review management', 'Conversational commerce', 'AI customer service agents', 'WooCommerce', 'Shopify'],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: COLVY_CONTACT.phoneE164,
        email: COLVY_CONTACT.email,
        contactType: 'customer support',
        areaServed: 'AU',
        availableLanguage: ['en'],
      },
      {
        '@type': 'ContactPoint',
        telephone: COLVY_CONTACT.phoneE164,
        email: COLVY_CONTACT.email,
        contactType: 'sales',
        areaServed: 'AU',
        availableLanguage: ['en'],
      },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    // The site name Google shows above each result (instead of "colvy.com").
    name: 'Colvy',
    alternateName: ['Colvy App', 'colvy.com'],
    url: SITE_URL,
    inLanguage: 'en-AU',
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
      'One shared inbox across Instagram, Messenger, SMS, email, live chat and phone, with a CRM, WooCommerce and Shopify orders, payments, AI agents and customer feedback boards.',
    // Mirrors the plans on /pricing (AUD per month).
    offers: {
      '@type': 'AggregateOffer', priceCurrency: 'AUD', lowPrice: '0', highPrice: '259', offerCount: 4,
      offers: [
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'AUD' },
        { '@type': 'Offer', name: 'Feedback', price: '39', priceCurrency: 'AUD' },
        { '@type': 'Offer', name: 'Inbox', price: '179', priceCurrency: 'AUD' },
        { '@type': 'Offer', name: 'Everything', price: '259', priceCurrency: 'AUD' },
      ],
    },
    applicationSubCategory: 'Shared inbox, business phone & SMS, AI-powered CRM',
    areaServed: { '@type': 'Country', name: 'Australia' },
    audience: { '@type': 'BusinessAudience', audienceType: 'Businesses of every size, from small teams to enterprise' },
    featureList: [
      'Shared inbox for SMS, phone calls, Instagram, Facebook Messenger, email, live chat and Google reviews',
      'Australian business phone numbers for calls and texts',
      'Built-in CRM with each customer’s orders, bookings and messages',
      'WooCommerce and Shopify orders, products and abandoned carts in the inbox',
      'Stripe payment links in any conversation',
      'Five AI agents for support, bookings, sales follow-ups, order updates and reviews',
      'Online booking with deposits and SMS reminders',
      'Broadcasts, review requests and back-in-stock texts',
      'Help centre, ideas board, public roadmap and changelog',
      'iPhone and Android apps',
    ],
    keywords: 'shared inbox, omnichannel inbox, AI-powered CRM, business phone and SMS, small business CRM, enterprise shared inbox, business SMS Australia, business phone number Australia, Instagram DM inbox, Google review management, live chat, help desk, AI agents for customer service, selling chat, Podium alternative',
    image: `${SITE_URL}/og.png`,
    sameAs: SAME_AS,
    publisher: { '@id': ORG_ID },
  },
]

export const colvyStructuredData = structuredData

export default function ColvyJsonLd() {
  // The plain-text summary for AI assistants (app/llms.txt), linked from every
  // marketing page so agents reading a page can find it.
  return <><link rel="alternate" type="text/plain" href="/llms.txt" title="Colvy summary for AI assistants" /><JsonLd data={structuredData} /></>
}
