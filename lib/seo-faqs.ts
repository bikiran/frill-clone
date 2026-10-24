// Questions and answers for Colvy's marketing landing pages, keyed by path
// ('channels/sms', 'compare/podium'). Each page shows them in a "Questions"
// section and its page.tsx mirrors them as FAQPage structured data, so the
// answers have to be visible on the page and true of Colvy today. They're
// written around what people actually search for (business SMS Australia,
// Podium alternative, Instagram DM inbox…), in plain words.
//
// No competitor prices or claims about what a competitor can't do: compare
// answers stick to what Colvy does.

export type SeoFaq = { q: string; a: string }

const STARTER = 'You can start free with no credit card, and every paid plan has a 14-day free trial.'

export const SEO_FAQS: Record<string, SeoFaq[]> = {
  // ── Channels ────────────────────────────────────────────────────────────────
  'channels/sms': [
    { q: 'Can I send and receive business SMS from an Australian number?', a: 'Yes. Colvy gives your business an Australian 04 mobile number, and customers text it like any other number. Their texts land in your shared inbox, your team replies from the web or the Colvy phone app, and the whole conversation stays on the customer’s record.' },
    { q: 'How much does business SMS cost in Colvy?', a: 'The Inbox and Everything plans include 3,000 SMS a month. Beyond that, prepaid credits start from A$0.15 a text and get cheaper in volume, and sending stops rather than running up a bill when credit runs out.' },
    { q: 'Can I keep my existing business number?', a: 'Yes. Request a port in Colvy and our team moves your existing mobile or landline across, which usually takes 1 to 3 weeks. Or get a new number online in a couple of minutes. Either way, texts and calls land in the same inbox as your Instagram, Messenger, email and live chat.' },
    { q: 'Can I text a group of customers at once?', a: 'Yes. Broadcasts send one message to a list or segment of customers, and every reply comes back into the shared inbox as its own conversation, so your team can answer each person.' },
  ],
  'channels/meta': [
    { q: 'Can I manage Instagram DMs and Facebook Messenger in one inbox?', a: 'Yes. Connect your Facebook Page and its Instagram business account and Colvy brings Instagram Direct messages, Messenger chats, and comments on your posts into one shared inbox alongside SMS, email and live chat.' },
    { q: 'Can I reply to Instagram and Facebook comments from Colvy?', a: 'Yes. The Social Engagement page lists comments from your Instagram and Facebook posts, shows which post each one is on, sorts them by topic and risk, and lets your team reply publicly, message the person privately or hide harmful comments.' },
    { q: 'Can more than one person answer our Instagram messages?', a: 'Yes. Everyone on your team answers from the same inbox with their own login, conversations can be assigned to a person, and internal notes let you hand over without asking the customer to repeat themselves.' },
    { q: 'Can AI answer Instagram messages for us?', a: 'Colvy’s Support Agent can draft replies to Instagram and Messenger messages from your own knowledge, products and orders. It starts by suggesting replies for your team to approve, and you decide what it may send on its own.' },
  ],
  'channels/google-reviews': [
    { q: 'Can I reply to Google reviews without logging into Google?', a: 'Yes. Connect your Google Business Profile and new reviews arrive in Colvy, where your team can read and reply to them from the same place as your customer messages.' },
    { q: 'Can AI write replies to our Google reviews?', a: 'Colvy’s Reputation Agent drafts a reply to each review in your business’s tone. Positive reviews can be answered automatically if you allow it, and anything negative waits for a person.' },
    { q: 'How do I get more Google reviews?', a: 'Ask at the right moment. Colvy can text a review request after an order, booking or finished job, so happy customers get a direct link to leave a Google review while the experience is fresh.' },
  ],
  'channels/email': [
    { q: 'Can my team share one support email inbox?', a: 'Yes. Connect Gmail or any other mailbox and your support address becomes a shared inbox: emails can be assigned, tagged and answered by anyone on the team, and each one is tied to the customer’s history.' },
    { q: 'Do email replies go out from our own address?', a: 'Yes. Replies are sent from your connected mailbox, so customers see your business address and replies stay in the same email thread.' },
    { q: 'Can I see a customer’s texts and emails together?', a: 'Yes. Colvy keeps every channel on the customer’s record, so their emails, SMS, Instagram messages and orders sit in one timeline.' },
  ],
  'channels/chat-widget': [
    { q: 'How do I add live chat to my website?', a: 'Copy one line of code into your site, or install the Colvy plugin on WordPress and WooCommerce. The chat widget appears on your pages and every conversation arrives in your shared inbox.' },
    { q: 'What happens when nobody is online to answer?', a: 'Visitors can leave their number or email and carry on the conversation by SMS or email later, and Colvy’s Support Agent can answer common questions from your own help content around the clock.' },
    { q: 'Does the chat widget work with WooCommerce and Shopify?', a: 'Yes. On a connected store your team sees the visitor’s cart and orders beside the chat, so you can answer order questions and recover sales without switching apps.' },
  ],
  'channels/phones': [
    { q: 'Can I get a business phone number online in Australia?', a: 'Yes. Choose a local, 04 mobile or 1800 number in Colvy, and it’s usually ready within minutes of payment. Calls ring in the browser and the Colvy phone app, and each call is saved to the customer’s record.' },
    { q: 'Can my whole team answer calls on one number?', a: 'Yes. By default every available teammate rings at once, or you can ring people in order, forward to a mobile or play a press-1 menu. Missed calls and voicemails show up in the shared inbox so someone always calls back.' },
    { q: 'Are calls recorded and transcribed?', a: 'Calls can be recorded and transcribed, with a summary added to the conversation, so your team can see what was said without listening back.' },
  ],

  // ── Product ─────────────────────────────────────────────────────────────────
  'product/inbox': [
    { q: 'What is a shared inbox?', a: 'A shared inbox is one place where your whole team sees and answers customer messages. In Colvy it brings together SMS, Instagram, Messenger, email, live chat, calls and Google reviews, with each conversation assigned to a person and tied to the customer’s history.' },
    { q: 'Which channels does the Colvy inbox support?', a: 'SMS and calls on Australian numbers, Instagram Direct and comments, Facebook Messenger and comments, email (Gmail or any mailbox), your website chat widget, contact forms and Google reviews. WhatsApp is coming soon.' },
    { q: 'Is there a mobile app?', a: 'Yes. Colvy has iPhone and Android apps, so your team can answer messages and take calls away from the desk.' },
    { q: 'How long does it take to set up?', a: `Most businesses connect their channels in about 45 minutes. ${STARTER}` },
  ],
  'product/crm': [
    { q: 'What makes Colvy different from a traditional CRM?', a: 'The CRM sits beside every conversation. Contact details, channels, orders, bookings, notes and past messages fill in automatically as customers talk to you, so there’s no separate system to keep up to date.' },
    { q: 'Can I import my existing customers?', a: 'Yes. Import contacts from a spreadsheet or another platform, and Colvy matches them to people as they message you by phone number, email or social account.' },
    { q: 'Is Colvy a good CRM for small businesses?', a: `Colvy is built for small and growing teams that talk to customers every day: retail stores, ecommerce, service businesses, clinics and agencies. ${STARTER}` },
  ],
  'product/booking': [
    { q: 'Can customers book appointments online with Colvy?', a: 'Yes. You get a booking page with live staff and location availability. Customers pick a service and time, can pay a deposit by card, and get SMS reminders and a link to reschedule or cancel.' },
    { q: 'Can I take deposits for bookings?', a: 'Yes. Deposits and full payments are taken securely with Stripe when the customer books, which helps cut no-shows.' },
    { q: 'Can the AI book appointments over text?', a: 'Colvy’s Reception Agent can offer available times and book appointments when a customer asks by SMS or chat, within the rules you set.' },
  ],
  'product/payments': [
    { q: 'How do I take payments in a chat?', a: 'Send a secure pay-by-link from any conversation. The customer pays by card through Stripe, and the payment shows up in the thread and on their record.' },
    { q: 'Which payment provider does Colvy use?', a: 'Colvy uses Stripe for card payments, so money goes straight to your own Stripe account.' },
    { q: 'Can I follow up unpaid payment requests?', a: 'Yes. Colvy shows which payment links are still unpaid, and the Sales Agent can send a polite reminder.' },
  ],
  'product/abandoned-carts': [
    { q: 'How does abandoned cart recovery work in Colvy?', a: 'Connect your WooCommerce or Shopify store and every abandoned checkout appears in Colvy with the customer and cart contents. Follow up by SMS or email, personally or with the Sales Agent, and track the revenue you recover.' },
    { q: 'Is a text better than an email for abandoned carts?', a: 'Texts are usually read within minutes, so a short, personal SMS often gets a reply where an automated email doesn’t. Colvy lets you use either, and replies come straight back to your inbox.' },
    { q: 'Does it work with WooCommerce and Shopify?', a: 'Yes, both. Install the Colvy plugin on WooCommerce or the Colvy app on Shopify.' },
  ],
  'product/waitlists': [
    { q: 'How do back-in-stock notifications work?', a: 'Colvy adds a “Notify me” form to sold-out products on your WooCommerce or Shopify store. When stock comes back, everyone on the waitlist gets a text automatically, and their replies arrive in your inbox.' },
    { q: 'Why text instead of email for back-in-stock alerts?', a: 'Restocked items often sell out again quickly. A text is seen within minutes, so customers who asked to be told get the first chance to buy.' },
    { q: 'Can I see who is waiting for a product?', a: 'Yes. The waitlist shows each product and who is waiting, so you can judge demand and reorder with confidence.' },
  ],

  // ── Solutions ───────────────────────────────────────────────────────────────
  'solutions/customer-support': [
    { q: 'What is the best customer support software for a small business?', a: 'One that puts every channel in one place without enterprise complexity. Colvy brings SMS, calls, Instagram, Messenger, email, live chat and Google reviews into a shared inbox with a built-in CRM, help centre and AI agents, and you can start free.' },
    { q: 'Can AI handle customer support questions?', a: 'Colvy’s Support Agent answers common questions about opening hours, orders, stock and policies from your own information. It drafts replies for approval at first, and you choose what it may send on its own.' },
    { q: 'Can I see how quickly my team replies?', a: 'Yes. Colvy tracks response times and conversation volume, and its Needs you list shows customers who are still waiting.' },
  ],
  'solutions/reviews': [
    { q: 'How can a small business get more Google reviews?', a: 'Ask every happy customer at the right moment and make it one tap. Colvy sends review requests by SMS after an order, booking or job, then helps you reply to every review that comes in.' },
    { q: 'Should I reply to every Google review?', a: 'Replying to reviews shows customers you’re listening. Colvy drafts replies in your tone so answering every review takes seconds, and negative reviews always wait for a person.' },
    { q: 'Can I manage Facebook and Instagram comments too?', a: 'Yes. Colvy’s Social Engagement page puts your Facebook and Instagram comments beside your reviews, so you can reply to them and hide harmful ones.' },
  ],
  'solutions/bookings': [
    { q: 'What is the easiest way to take online bookings?', a: 'Share a booking link. With Colvy, customers see real availability, book and pay a deposit in a minute, and get SMS reminders, while you see every booking next to the customer’s conversations.' },
    { q: 'Do SMS reminders reduce no-shows?', a: 'Reminder texts give customers a timely nudge and an easy way to reschedule, which helps fewer bookings go to waste. Colvy sends them automatically.' },
    { q: 'Can customers reschedule on their own?', a: 'Yes. Every booking confirmation includes a link to reschedule or cancel within the rules you set.' },
  ],

  // ── Comparisons ─────────────────────────────────────────────────────────────
  'compare/podium': [
    { q: 'Is Colvy a good Podium alternative in Australia?', a: 'Colvy covers the core of what local businesses use Podium for: business texting on Australian numbers, Google reviews, a shared inbox and payments. It adds Instagram and Messenger, email, live chat, booking, store orders and AI agents in the same app, with an Australian team.' },
    { q: 'Can I move from Podium to Colvy?', a: `Yes. Import your contacts, get or forward a business number, and connect your channels; most businesses are set up in about 45 minutes. ${STARTER}` },
    { q: 'Does Colvy have review requests like Podium?', a: 'Yes. Colvy texts review requests after an order, booking or job, and its Reputation Agent drafts replies to the reviews that come in.' },
  ],
  'compare/birdeye': [
    { q: 'Is Colvy a good Birdeye alternative for small businesses?', a: 'Colvy brings reviews, business texting, social messages, email and live chat into one shared inbox with a CRM, booking and AI agents, built for small Australian teams rather than large multi-site enterprises.' },
    { q: 'Can Colvy manage Google reviews like Birdeye?', a: 'Yes. Reply to Google reviews from Colvy, send review requests by SMS, and let the Reputation Agent draft replies in your tone.' },
    { q: 'How quickly can I switch to Colvy?', a: `Most businesses connect their channels and import contacts in about 45 minutes. ${STARTER}` },
  ],
  'compare/coax': [
    { q: 'What is a good Coax alternative?', a: 'Colvy is an Australian shared inbox for SMS, calls, Instagram, Messenger, email and live chat, with a CRM, Google reviews, booking, store orders, AI agents and a customer feedback board in one app.' },
    { q: 'Does Colvy support Australian SMS and phone numbers?', a: 'Yes. Colvy provides Australian numbers for two-way business texting and calls, with every conversation in the shared inbox.' },
    { q: 'Can I try Colvy before switching?', a: STARTER },
  ],
  'compare/gorgias': [
    { q: 'Is Colvy a good Gorgias alternative for WooCommerce and Shopify stores?', a: 'Colvy connects to both WooCommerce and Shopify, shows orders beside each conversation, and adds Australian SMS and calls, Instagram and Messenger, abandoned-cart follow-ups and back-in-stock texts to the same inbox.' },
    { q: 'Can I manage orders from the inbox?', a: 'Yes. See a customer’s orders next to the chat, update them, send payment links and answer “where’s my order?” without leaving Colvy.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/zendesk': [
    { q: 'Is Colvy a simpler Zendesk alternative?', a: 'Colvy is built for small teams that want one inbox for SMS, calls, social messages, email and live chat without a complex help desk setup. It includes a help centre, CRM and AI agents, and most businesses are running in about 45 minutes.' },
    { q: 'Does Colvy have a help centre?', a: 'Yes. Publish help articles on your own help centre, and Colvy’s Support Agent uses them to answer customer questions.' },
    { q: 'Can I try Colvy for free?', a: STARTER },
  ],
  'compare/freshdesk': [
    { q: 'What is a good Freshdesk alternative for small businesses?', a: 'Colvy combines a shared inbox for SMS, calls, Instagram, Messenger, email and live chat with a CRM, help centre, reviews, booking, payments and AI agents, so a small team can run customer conversations from one app.' },
    { q: 'Does Colvy include phone and SMS?', a: 'Yes. Australian business numbers for calls and two-way SMS are built in, not a separate add-on product.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/intercom': [
    { q: 'Is Colvy a good Intercom alternative?', a: 'Colvy offers live chat on your website plus SMS, calls, Instagram, Messenger, email and Google reviews in the same shared inbox, with AI agents, a help centre and a customer feedback board, priced for small businesses.' },
    { q: 'Does Colvy have AI for customer support?', a: 'Yes. Five AI agents cover support, bookings, sales follow-ups, order updates and reviews. They draft for approval at first, and you decide what they may do on their own.' },
    { q: 'Can I try it before I switch?', a: STARTER },
  ],
  'compare/gladly': [
    { q: 'What is a Gladly alternative for small businesses?', a: 'Colvy gives small teams a customer-centred shared inbox, where every SMS, call, social message, email and chat sits on one customer timeline, with pricing for small businesses rather than enterprise contracts.' },
    { q: 'Does Colvy keep one history per customer?', a: 'Yes. Every channel lands on the customer’s record, so anyone on the team can pick up the conversation with full context.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/manychat': [
    { q: 'Is Colvy a ManyChat alternative?', a: 'Colvy handles Instagram and Messenger conversations in a shared inbox where your team and AI agents reply together, and adds SMS, calls, email, live chat, reviews and store orders, so conversations turn into sales and bookings.' },
    { q: 'Can Colvy reply to Instagram comments and DMs?', a: 'Yes. Instagram DMs arrive in the inbox, and the Social Engagement page lets you reply to comments, message commenters privately or hide harmful ones.' },
    { q: 'How do I get started?', a: STARTER },
  ],
}

export function seoFaqs(path: string): SeoFaq[] {
  return SEO_FAQS[path] || []
}

/** FAQPage structured data for a page's questions, or null when it has none. */
export function faqJsonLd(path: string) {
  const faqs = seoFaqs(path)
  if (!faqs.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
}

/** BreadcrumbList structured data: Colvy › section › page. */
export function breadcrumbJsonLd(siteUrl: string, trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Colvy', path: '' }, ...trail].map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name, item: t.path ? `${siteUrl}/${t.path}` : siteUrl,
    })),
  }
}
