// Colvy vs <competitor> page copy: titles and descriptions for
// app/compare/[slug] and the llms.txt summaries (lib/llms.ts).

// Keys mirror CMP in app/compare/[slug]/Client.tsx. People search
// "<competitor> alternative" (often with "Australia"), so lead with that.
export const COMPARE_META: Record<string, { name: string; title: string; description: string }> = {
  podium: { name: 'Podium', title: 'Podium Alternative for Australian Businesses: Colvy vs Podium', description: 'Looking for a Podium alternative in Australia? Colvy brings business SMS on Australian numbers, Google reviews, payments, Instagram, Messenger, email and live chat into one shared inbox. Start free.' },
  birdeye: { name: 'Birdeye', title: 'Birdeye Alternative for Australian Small Businesses: Colvy vs Birdeye', description: 'Compare Colvy and Birdeye. Google reviews, review requests by SMS, business texting, social messages and AI agents in one shared inbox built for Australian small businesses.' },
  coax: { name: 'Coax', title: 'Coax Alternative: Colvy vs Coax', description: 'Compare Colvy and Coax. An Australian shared inbox for SMS, calls, Instagram, Messenger, email and live chat, with a CRM, Google reviews, booking, AI agents and a customer feedback board.' },
  gorgias: { name: 'Gorgias', title: 'Gorgias Alternative for WooCommerce & Shopify: Colvy vs Gorgias', description: 'A Gorgias alternative for WooCommerce and Shopify stores: orders beside every chat, Australian SMS and calls, Instagram and Messenger, abandoned-cart texts and back-in-stock alerts in one inbox.' },
  zendesk: { name: 'Zendesk', title: 'Zendesk Alternative for Small Businesses: Colvy vs Zendesk', description: 'A simpler Zendesk alternative for small teams: one shared inbox for SMS, calls, social, email and live chat, with a help centre, CRM and AI agents. Running in about 45 minutes.' },
  freshdesk: { name: 'Freshdesk', title: 'Freshdesk Alternative for Small Businesses: Colvy vs Freshdesk', description: 'Compare Colvy and Freshdesk. A shared inbox for SMS, calls, Instagram, Messenger, email and live chat with a CRM, help centre, reviews, booking and AI agents, built for small teams.' },
  intercom: { name: 'Intercom', title: 'Intercom Alternative for Small Businesses: Colvy vs Intercom', description: 'An Intercom alternative with live chat plus SMS, calls, Instagram, Messenger, email and Google reviews in one shared inbox, with AI agents and a help centre, priced for small businesses.' },
  gladly: { name: 'Gladly', title: 'Gladly Alternative for Small Businesses: Colvy vs Gladly', description: 'Compare Colvy and Gladly. One customer timeline across SMS, calls, social, email and chat, with small-business pricing instead of enterprise contracts.' },
  manychat: { name: 'ManyChat', title: 'ManyChat Alternative for Instagram & Messenger: Colvy vs ManyChat', description: 'A ManyChat alternative where your team and AI agents answer Instagram and Messenger together, with SMS, email, live chat, reviews and store orders in the same shared inbox.' },
}
