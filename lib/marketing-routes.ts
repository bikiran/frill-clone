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
  'integrations',
  'ai-assistant',
  'phones',
  'compare',
  'testimonials',
  'about',
  'careers',
  'blog',
  'changelog',
  'security',
  'status',
  'help',
  'roadmap',
  'announcements',
  'demo',
  'privacy',
  'terms',
]

// Dynamic landing pages, grouped by their parent segment.
export const PRODUCT_FEATURES: string[] = [
  'ideas', 'roadmap', 'announcements', 'knowledgebase', 'inbox', 'crm', 'gallery',
  'notes', 'orders', 'payments', 'links', 'insights', 'calendar', 'tasks',
  'broadcasts', 'automation',
]
export const CHANNEL_SLUGS: string[] = [
  'meta', 'email', 'phones', 'chat-widget', 'google-reviews', 'whatsapp', 'sms',
  'forms', 'broadcasts',
]
export const SOLUTION_SLUGS: string[] = [
  'customer-support', 'sales', 'marketing', 'reviews', 'feedback', 'payments',
]
export const INDUSTRY_SLUGS: string[] = [
  'saas', 'agencies', 'ecommerce', 'hospitality', 'real-estate', 'healthcare',
]

// Every indexable path (relative, e.g. '' or 'channels/whatsapp').
export function allMarketingPaths(): string[] {
  return [
    ...STATIC_MARKETING_ROUTES,
    ...PRODUCT_FEATURES.map(s => `product/${s}`),
    ...CHANNEL_SLUGS.map(s => `channels/${s}`),
    ...SOLUTION_SLUGS.map(s => `solutions/${s}`),
    ...INDUSTRY_SLUGS.map(s => `industries/${s}`),
  ]
}
