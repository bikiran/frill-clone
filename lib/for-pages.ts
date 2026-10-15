// Text for the /for/* workflow pages that the server needs too: page titles,
// descriptions and FAQs (the FAQs are also emitted as FAQPage structured data).
// The animated stories and cards live in app/for/[slug]/content.tsx.
//
// Copy rule: describe what Colvy actually does today. No invented customers,
// quotes or statistics.

export type ForFaq = { q: string; a: string }
export type ForMeta = { name: string; title: string; description: string; faqs: ForFaq[] }

export const FOR_PAGES: Record<string, ForMeta> = {
  ecommerce: {
    name: 'Ecommerce',
    title: 'Colvy for Ecommerce: turn chats into orders',
    description: 'Answer Instagram, Messenger, SMS, email and live chat in one inbox, see each buyer’s Shopify or WooCommerce orders, send payment links, recover carts and ask for reviews.',
    faqs: [
      { q: 'Which stores does Colvy work with?', a: 'Shopify (one-click install) and WooCommerce (with the Colvy WordPress plugin or an API key). Orders and customers come into Colvy, so you see a buyer’s order history next to their messages.' },
      { q: 'Can I take payment inside a conversation?', a: 'Yes. Send a secure payment link from the chat, or create the order for the customer and send them the link to pay. When they pay, it shows as paid and the sale is recorded against the conversation.' },
      { q: 'Does it handle “Where’s my order?” questions?', a: 'Colvy shows the order in the chat, with tracking from WooCommerce, ShipStation or labels made in Colvy, can send order updates by SMS, and the AI can answer order-status questions from the real order, so your team only steps in when something needs a person.' },
      { q: 'Will the AI reply to customers on its own?', a: 'Only if you let it. Start with drafts that a person checks and sends. You choose, action by action, what the AI may do by itself, and every action has a “Why?” explanation.' },
    ],
  },
  'real-estate': {
    name: 'Real estate',
    title: 'Colvy for Real Estate: answer every enquiry, book every inspection',
    description: 'Bring portal enquiry emails, Facebook messages, website chat and texts into one inbox, reply fast with the listing, book inspections online and follow up after the sale.',
    faqs: [
      { q: 'Can portal enquiries come into Colvy?', a: 'Yes. Connect your realestate.com.au agency, or the email address your portal enquiries go to, and each enquiry arrives as a conversation in the shared inbox alongside Facebook, website chat and SMS.' },
      { q: 'Can buyers book inspections themselves?', a: 'Yes. Set up inspection or appraisal times on your booking page, share the link, and Colvy sends SMS reminders the day before and two hours before.' },
      { q: 'Can we collect applications and documents?', a: 'Yes. Build a form with file uploads and a signature, send the link in the conversation, and the responses come back to you in Colvy.' },
      { q: 'Which portals work with Colvy?', a: 'Colvy can connect to realestate.com.au to receive enquiries directly. Any other portal that emails you works through your connected email address.' },
    ],
  },
  'multi-location-retail': {
    name: 'Multi-location retail',
    title: 'Colvy for Multi-location Retail: every store, one inbox',
    description: 'Give each store its own local number, answer every store from one shared inbox, check live stock, take payment before pickup and compare link sales by store.',
    faqs: [
      { q: 'Can each store have its own phone number?', a: 'Yes. Buy an Australian local number for each location from inside Colvy and assign it to that store, and add an 04 mobile number for texting. Every number is answered from the same shared inbox.' },
      { q: 'Can the AI tell customers what’s in stock?', a: 'Yes. When your WooCommerce store is connected, Colvy’s AI agents check live stock for a product before they answer. Stock levels for each individual store aren’t available yet.' },
      { q: 'Can I see results for each location?', a: 'Yes. Link Reports break down tracked-link sales by outlet, order and campaign reports can be split by store, and calls can be filtered by location in the Command Centre.' },
      { q: 'Can staff be set up for their own store?', a: 'Team members can have a default store, and each person’s access can be limited by feature. Limiting what a person can see by store is not available yet.' },
    ],
  },
  'service-businesses': {
    name: 'Service businesses',
    title: 'Colvy for Service Businesses: from missed call to five-star review',
    description: 'For trades, salons, cleaners and clinics: text back missed calls, get photos before you quote, take deposits, let customers book online and ask for a review when the job is done.',
    faqs: [
      { q: 'What happens when I miss a call on a job?', a: 'Switch on missed-call text back and Colvy texts the caller straight away from your business number. Their reply lands in your inbox, and your dashboard shows which missed calls still need a call back.' },
      { q: 'Can customers send me photos of the job?', a: 'Yes. Send an upload link and the customer can send photos or videos at full quality, straight into the conversation.' },
      { q: 'Can I take a deposit?', a: 'Yes. Send a payment link in the conversation, or ask for a deposit on your booking page when they book.' },
      { q: 'Does Colvy send booking reminders?', a: 'Yes. Customers get SMS reminders the day before and two hours before, with a link to reschedule or cancel.' },
    ],
  },
  restaurants: {
    name: 'Restaurants',
    title: 'Colvy for Restaurants: nothing missed during service',
    description: 'Calls, Instagram, Facebook and texts in one inbox, instant answers about hours and menus, function enquiries with deposits, replies to every review and SMS to regulars who opted in.',
    faqs: [
      { q: 'Can the AI answer questions about our hours?', a: 'Yes. Colvy’s AI can answer opening hours, including holiday hours from your Google Business Profile, and questions covered in your knowledge such as menus and dietary notes. Anything it can’t answer goes to your team.' },
      { q: 'How do function enquiries work?', a: 'Send an enquiry form with the details you need, then a payment link for the deposit, all in the same conversation so the whole booking is in one place.' },
      { q: 'Can we text our regulars?', a: 'Yes, to customers who have agreed to hear from you. Send an SMS broadcast, see who clicked, and replies come straight into your inbox.' },
      { q: 'Does Colvy replace our table booking system?', a: 'No. Colvy handles the conversations around bookings: enquiries, functions, deposits, reminders and reviews. Keep your table booking system for covers and floor plans.' },
    ],
  },
}

export const FOR_SLUGS = Object.keys(FOR_PAGES)
