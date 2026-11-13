// The public, indexable marketing surface of colvy.com — the single source of
// truth for the sitemap. Auth, app (/admin), API and tenant board routes are
// deliberately excluded (they're also blocked in robots.ts).
//
// The dynamic slug lists below MUST stay in sync with the `PAGES` / `CH` / `IND`
// / `PH` / `AI` / `INTG` maps in the corresponding app/<route>/[param] files.
// Those are client components, so their slug maps can't be imported on the
// server; this mirror is the trade-off. The lists also decide which addresses
// exist: each [param] route builds only these and 404s anything else
// (dynamicParams = false). scripts/marketing-routes.test.mjs checks the
// mirror against the maps, so a page added to a map but not here is caught.

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
  'selling-chat',
  'email-sms-marketing',
  'whatsapp-shared-inbox',
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
  'voice-typing', 'reservations', 'check-in', 'jobs', 'customer-accounts', 'receipts',
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

// Phone system features; mirrors PH in app/phones/[slug]/page.tsx.
export const PHONE_SLUGS: string[] = [
  'click-to-dial', 'browser-dialer', 'hd-audio', 'numbers-porting', 'mobile-app',
  'warm-transfer', 'call-forwarding', 'cascade-ring', 'simultaneous-ring', 'ivr',
  'ai-receptionist', 'ai-call-intelligence', 'ai-actions', 'call-recording',
  'call-reporting', 'missed-call-text-back', 'voicemail', 'voip', 'international',
  'command-centre',
]
// AI assistant capabilities; mirrors AI in app/ai-assistant/[slug]/page.tsx.
export const AI_SLUGS: string[] = [
  'ai-replies', 'knowledge-base', 'auto-summaries', 'ai-actions', 'auto-routing',
  'follow-ups', 'tasks-reminders', 'workflows', 'human-in-control',
]
// Integrations; mirrors INTG in app/integrations/[slug]/page.tsx.
export const INTEGRATION_SLUGS: string[] = [
  'woocommerce', 'shopify', 'stripe', 'slack', 'zapier', 'api',
]

// Colvy vs <competitor> pages; mirrors CMP in app/compare/[slug]/Client.tsx.
export const COMPARE_SLUGS: string[] = [
  'podium', 'birdeye', 'coax', 'gorgias', 'zendesk', 'freshdesk', 'intercom', 'gladly', 'manychat', 'highlevel', 'salesforce',
  'aircall', 'dialpad', 'ringcentral', 'krispcall',
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
    ...PHONE_SLUGS.map(s => `phones/${s}`),
    ...AI_SLUGS.map(s => `ai-assistant/${s}`),
    ...INTEGRATION_SLUGS.map(s => `integrations/${s}`),
  ]
}
