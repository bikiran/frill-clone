// The public, indexable marketing surface of colvy.com — the single source of
// truth for the sitemap. Auth, app (/admin), API and tenant board routes are
// deliberately excluded (they're also blocked in robots.ts).
//
// The dynamic slug lists below MUST stay in sync with the `PAGES` / `CH` / `IND`
// maps in the corresponding app/<route>/[param]/page.tsx files. They're client
// components, so their slug maps can't be imported into a server sitemap; this
// mirror is the trade-off for keeping the sitemap self-contained.

// Top-level marketing pages (relative paths, no leading slash for '').
export const STATIC_MARKETING_ROUTES: string[] = [
  '',            // home / landing
  'inbox-crm',
  'pricing',
  'product',
  'channels',
  'solutions',
  'industries',
  'for',
  'business-phone-number-australia',
  'all-in-one-customer-platform',
  'integrations',
  'ai-assistant',
  'ai-agents',
  'phones',
  'compare',
  'about',
  'careers',
  'blog',
  'changelog',
  'security',
  'status',
  'help',
  'demo',
  'privacy',
  'terms',
]

// Dynamic landing pages, grouped by their parent segment.
export const PRODUCT_FEATURES: string[] = [
  'ideas', 'roadmap', 'announcements', 'knowledgebase', 'inbox', 'crm', 'gallery',
  'notes', 'orders', 'payments', 'links', 'insights', 'calendar', 'tasks',
  'broadcasts', 'automation', 'booking', 'waitlists', 'abandoned-carts',
  'voice-typing',
]
export const CHANNEL_SLUGS: string[] = [
  'meta', 'email', 'phones', 'chat-widget', 'google-reviews', 'whatsapp', 'sms',
  'forms', 'broadcasts',
]
export const SOLUTION_SLUGS: string[] = [
  'customer-support', 'sales', 'marketing', 'reviews', 'feedback', 'bookings', 'payments',
]
// ecommerce and real-estate moved to /for/* (the old /industries URLs redirect).
export const INDUSTRY_SLUGS: string[] = [
  'saas', 'agencies', 'hospitality', 'healthcare',
]
// Workflow pages; mirrors FOR_PAGES in lib/for-pages.ts.
export const FOR_SLUGS: string[] = [
  'ecommerce', 'real-estate', 'multi-location-retail', 'service-businesses', 'restaurants',
]

// Colvy vs <competitor> pages; mirrors CMP in app/compare/[slug]/Client.tsx.
export const COMPARE_SLUGS: string[] = [
  'podium', 'birdeye', 'coax', 'gorgias', 'zendesk', 'freshdesk', 'intercom', 'gladly', 'manychat',
]

// Every indexable path (relative, e.g. '' or 'channels/whatsapp').
export function allMarketingPaths(): string[] {
  return [
    ...STATIC_MARKETING_ROUTES,
    ...PRODUCT_FEATURES.map(s => `product/${s}`),
    ...CHANNEL_SLUGS.map(s => `channels/${s}`),
    ...SOLUTION_SLUGS.map(s => `solutions/${s}`),
    ...INDUSTRY_SLUGS.map(s => `industries/${s}`),
    ...FOR_SLUGS.map(s => `for/${s}`),
    ...COMPARE_SLUGS.map(s => `compare/${s}`),
  ]
}
