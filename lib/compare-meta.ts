// Colvy vs <competitor> page copy: titles and descriptions for
// app/compare/[slug] and the llms.txt summaries (lib/llms.ts).

// Keys mirror CMP in app/compare/[slug]/Client.tsx. People search
// "<competitor> alternative" (often with "Australia"), so lead with that.
export const COMPARE_META: Record<string, { name: string; title: string; description: string }> = {
  podium: { name: 'Podium', title: 'Podium Alternative for Australian Businesses: Colvy vs Podium', description: 'Looking for a Podium alternative in Australia? Colvy brings SMS on Australian numbers, Google reviews, payments, social, email and live chat into one inbox.' },
  birdeye: { name: 'Birdeye', title: 'Birdeye Alternative for Australian Businesses: Colvy vs Birdeye', description: 'Compare Colvy and Birdeye: Google reviews, SMS review requests, business texting, social messages and AI agents in one shared inbox for Australian teams.' },
  coax: { name: 'Coax', title: 'Coax Alternative: Colvy vs Coax', description: 'Compare Colvy and Coax: an Australian shared inbox for SMS, calls, social, email and live chat, with a CRM, Google reviews, booking, AI agents and feedback.' },
  gorgias: { name: 'Gorgias', title: 'Gorgias Alternative for WooCommerce & Shopify: Colvy vs Gorgias', description: 'A Gorgias alternative for WooCommerce and Shopify: orders beside every chat, five AI agents in the plan, Australian SMS and calls, campaigns and cart texts.' },
  zendesk: { name: 'Zendesk', title: 'Zendesk Alternative: Colvy vs Zendesk', description: 'A simpler Zendesk alternative: one shared inbox for SMS, calls, social, email and live chat, with a help centre, CRM, five AI agents and campaigns.' },
  freshdesk: { name: 'Freshdesk', title: 'Freshdesk Alternative: Colvy vs Freshdesk', description: 'Compare Colvy and Freshdesk: a shared inbox for SMS, calls, Instagram, Messenger, email and live chat, with a CRM, help centre, reviews, booking and AI agents.' },
  intercom: { name: 'Intercom', title: 'Intercom Alternative: Colvy vs Intercom', description: 'An Intercom alternative: live chat plus SMS, calls, social, email and Google reviews in one inbox, with five AI agents in the plan and a help centre.' },
  gladly: { name: 'Gladly', title: 'Gladly Alternative: Colvy vs Gladly', description: 'Compare Colvy and Gladly. One customer timeline across SMS, calls, social, email and chat, with fair, published pricing instead of forced enterprise contracts.' },
  highlevel: { name: 'HighLevel', title: 'HighLevel Alternative for Australian Businesses: Colvy vs HighLevel', description: 'A HighLevel alternative built for the business itself: SMS, calls, social, email and live chat in one inbox, with five AI agents, store orders and AUD pricing.' },
  salesforce: { name: 'Salesforce', title: 'Salesforce Alternative for Small Businesses: Colvy vs Salesforce', description: 'A Salesforce alternative for small teams: SMS, calls, social, email and live chat in one inbox, with a CRM and five AI agents, at one AUD price for the team.' },
  aircall: { name: 'Aircall', title: 'Aircall Alternative in Australia: Colvy vs Aircall', description: 'An Aircall alternative for Australian teams: your number in one inbox with SMS, email and live chat, plus call summaries and an AI receptionist, one AUD price.' },
  dialpad: { name: 'Dialpad', title: 'Dialpad Alternative in Australia: Colvy vs Dialpad', description: 'A Dialpad alternative with every channel in one inbox: calls, SMS, email, live chat and social, with store orders and AI agents, at one AUD price for the team.' },
  ringcentral: { name: 'RingCentral', title: 'RingCentral Alternative for Small Business: Colvy vs RingCentral', description: 'A RingCentral alternative for small Australian teams: calls, SMS, email and live chat in one inbox, an AI receptionist and call summaries, GST included.' },
  manychat: { name: 'ManyChat', title: 'ManyChat Alternative for Instagram & Messenger: Colvy vs ManyChat', description: 'A ManyChat alternative where your team and AI agents answer Instagram and Messenger together, with SMS, email, live chat, reviews and orders in one inbox.' },
}
