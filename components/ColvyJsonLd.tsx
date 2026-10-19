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
      'Colvy is an all-in-one customer platform for small businesses: a shared inbox across every channel, a CRM, business phone, store orders, payments, AI agents and customer feedback.',
    telephone: COLVY_CONTACT.phoneE164,
    email: COLVY_CONTACT.email,
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
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' },
    image: `${SITE_URL}/og.png`,
    sameAs: SAME_AS,
    publisher: { '@id': ORG_ID },
  },
]

export const colvyStructuredData = structuredData

export default function ColvyJsonLd() {
  return <JsonLd data={structuredData} />
}
