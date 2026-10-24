// Topic landing pages: one page per thing people search for that Colvy's
// feature pages don't answer head-on ("selling chat", "whatsapp shared
// inbox"). Rendered by components/marketing/TopicPage.tsx; each page.tsx
// publishes the FAQs as FAQPage data, so the answers must be true of Colvy
// today. WhatsApp isn't live yet (lib/feature-availability.ts), so its page
// explains the topic and says plainly that Colvy's WhatsApp is coming.

export type TopicItem = { icon: string; title: string; body: string; href?: string }
export type TopicChat = { channel: string; who: string; lines: { from: 'them' | 'us' | 'ai'; text: string }[]; chips?: { text: string; tone?: string }[] }
export type TopicSection = { eyebrow: string; title: string; sub?: string; items: TopicItem[] }
export type TopicPage = {
  slug: string
  accent: string
  name: string                 // breadcrumb label
  metaTitle: string
  metaDescription: string
  eyebrow: string
  h1: string
  sub: string
  comingSoon?: boolean
  primaryCta: string
  chat: TopicChat
  intro: { title: string; paragraphs: string[] }
  sections: TopicSection[]
  steps: { title: string; body: string }[]
  stepsTitle: string
  faqs: { q: string; a: string }[]
  cta: { title: string; sub: string; secondary?: { label: string; href: string } }
  related: { label: string; href: string }[]
}

const START = 'You can start free with no credit card, and every paid plan has a 14-day free trial.'

export const TOPIC_PAGES: Record<string, TopicPage> = {
  'selling-chat': {
    slug: 'selling-chat',
    accent: '#ff6a4d',
    name: 'Selling chat',
    metaTitle: 'Selling Chat: Sell to Customers in SMS, Instagram & Web Chat',
    metaDescription: 'Turn customer chats into sales. Send products and prices, take payment with a Stripe link, create WooCommerce and Shopify orders and follow up abandoned carts, all from one Colvy inbox.',
    eyebrow: 'Selling chat',
    h1: 'Selling chat: sell in the conversation, not after it.',
    sub: 'Customers ask about products by text, Instagram, Messenger and your website chat. Colvy lets your team answer with the product, the price and a payment link in the same conversation, and creates the order without switching apps.',
    primaryCta: 'Start selling in chat',
    chat: {
      channel: 'Instagram', who: 'Mia Chen',
      lines: [
        { from: 'them', text: 'Is the 4ft reef tank still available? Can you deliver to Brunswick?' },
        { from: 'us', text: 'Yes! 4ft Reef Tank, $1,249. Delivery to Brunswick is $49. Want me to hold one for you?' },
        { from: 'them', text: 'Yes please 🙌' },
        { from: 'us', text: 'Here’s your secure payment link. We’ll deliver Thursday.' },
      ],
      chips: [{ text: 'Paid $1,298' }, { text: 'Order #1042 created', tone: '#2563eb' }],
    },
    intro: {
      title: 'What is selling chat?',
      paragraphs: [
        'Selling chat (also called chat commerce or conversational selling) means helping a customer choose and buy inside a conversation: they ask a question in a message, you answer with the right product, and they pay without leaving the chat.',
        'It works because the customer is already interested. Someone asking “do you have this in stock?” is a buyer. Make them go and find the product, add it to a cart and check out on their own, and many won’t. Send them the answer and a way to pay, and many will.',
      ],
    },
    sections: [
      {
        eyebrow: 'In Colvy', title: 'Everything a sale needs, inside the conversation',
        sub: 'One shared inbox for SMS, Instagram, Messenger, email and your website chat, with your store and payments beside every thread.',
        items: [
          { icon: 'tag', title: 'Send products and prices', body: 'Search your WooCommerce or Shopify catalogue from the reply box and send a product’s price, link or both in one tap, including variations.', href: '/product/orders' },
          { icon: 'card', title: 'Take payment in the thread', body: 'Send a secure Stripe payment link from any conversation. The thread shows when it’s been paid.', href: '/product/payments' },
          { icon: 'box', title: 'Create the order', body: 'Turn the chat into a WooCommerce or Shopify order without opening your store’s admin, and see every past order beside the customer.', href: '/product/orders' },
          { icon: 'store', title: 'Photos and videos that sell', body: 'Send product photos and videos from a shared gallery, mark up a photo or trim a video first, all as one tidy link.', href: '/product/gallery' },
          { icon: 'link', title: 'Know what they clicked', body: 'Every link you send is tracked, so you can see when a customer opened the product or payment link, and follow up at the right moment.', href: '/product/links' },
          { icon: 'spark', title: 'An AI Sales Agent', body: 'Colvy’s Sales Agent follows up quotes, unpaid payment links and abandoned carts with a personal message, starting as drafts for your team to approve.', href: '/ai-agents' },
        ],
      },
      {
        eyebrow: 'Win back the ones that got away', title: 'Follow up the sales that nearly happened',
        items: [
          { icon: 'cart', title: 'Abandoned carts', body: 'See every abandoned WooCommerce or Shopify checkout in the inbox and send a personal text or email to bring it back.', href: '/product/abandoned-carts' },
          { icon: 'bell', title: 'Back-in-stock texts', body: 'Customers who asked about a sold-out product get a text the moment it’s back, with replies straight to your inbox.', href: '/product/waitlists' },
          { icon: 'chart', title: 'See what chat sells', body: 'Track payments and orders that came from conversations, so you know which channels and people bring in revenue.', href: '/product/insights' },
        ],
      },
    ],
    stepsTitle: 'From question to paid order in one thread',
    steps: [
      { title: 'A customer asks', body: 'A text, Instagram DM, Messenger chat or website chat arrives in your shared inbox, beside the customer’s past orders.' },
      { title: 'You answer with the product', body: 'Send the product and price from your catalogue, a photo or video, and answer their questions.' },
      { title: 'They pay in the chat', body: 'Send a Stripe payment link. When it’s paid, create the order and send the delivery details.' },
    ],
    faqs: [
      { q: 'What is selling chat?', a: 'Selling chat means helping customers choose and buy inside a conversation, by text, Instagram, Messenger or website chat, instead of sending them off to find the product and check out alone. You answer with the product, the price and a payment link in the same thread.' },
      { q: 'Which channels can I sell on with Colvy?', a: 'SMS on an Australian number, Instagram Direct, Facebook Messenger, email and the Colvy chat widget on your website, all from one shared inbox. WhatsApp is coming soon.' },
      { q: 'Does it work with WooCommerce and Shopify?', a: 'Yes. Connect your WooCommerce or Shopify store to send products from your catalogue, see each customer’s orders beside the chat, create orders and follow up abandoned checkouts.' },
      { q: 'How do customers pay in a chat?', a: 'You send a secure Stripe payment link from the conversation. The customer pays by card, the money goes to your own Stripe account, and the thread shows it as paid.' },
      { q: 'Can AI help sell?', a: 'Colvy’s Sales Agent follows up quotes, unpaid payment links and abandoned carts with personal messages. It drafts them for your team to approve at first, and you choose what it may send on its own.' },
      { q: 'How much does it cost?', a: `Selling in chat is part of Colvy’s Inbox and Everything plans. ${START}` },
    ],
    cta: { title: 'Turn your next chat into a sale.', sub: 'Connect your channels and your store, and answer the next “is this available?” with a product and a payment link.', secondary: { label: 'See Colvy for ecommerce', href: '/for/ecommerce' } },
    related: [
      { label: 'Colvy for ecommerce', href: '/for/ecommerce' },
      { label: 'Payments in chat', href: '/solutions/payments' },
      { label: 'Abandoned cart recovery', href: '/product/abandoned-carts' },
      { label: 'Abandoned cart texts: what to send', href: '/blog/abandoned-cart-sms-woocommerce-shopify' },
    ],
  },

  'whatsapp-shared-inbox': {
    slug: 'whatsapp-shared-inbox',
    accent: '#16a34a',
    name: 'WhatsApp shared inbox',
    metaTitle: 'WhatsApp Shared Inbox for Teams: How It Works (and Colvy)',
    metaDescription: 'What a WhatsApp shared inbox is, how it differs from the WhatsApp Business app, what to look for, and how WhatsApp is coming to Colvy’s shared inbox alongside SMS, Instagram and email.',
    eyebrow: 'WhatsApp shared inbox',
    h1: 'A WhatsApp shared inbox for the whole team.',
    sub: 'The WhatsApp Business app is built for one person on one phone. A shared inbox lets your team answer WhatsApp together, with assignment, notes and the customer’s history. Here’s how it works, and how it’s coming to Colvy.',
    comingSoon: true,
    primaryCta: 'Start with the channels live today',
    chat: {
      channel: 'WhatsApp', who: 'Liam Walsh',
      lines: [
        { from: 'them', text: 'Hi, is my order ready to collect?' },
        { from: 'ai', text: 'Hi Liam, yes! Order #2210 is ready at our Oakleigh store until 6pm.' },
        { from: 'us', text: 'See you soon 👋' },
      ],
      chips: [{ text: 'Assigned to Sam', tone: '#2563eb' }, { text: 'Order #2210' }],
    },
    intro: {
      title: 'What is a WhatsApp shared inbox?',
      paragraphs: [
        'A WhatsApp shared inbox connects your business’s WhatsApp number to software your whole team can use. Every WhatsApp conversation arrives in one queue, each one can be assigned to a person, and anyone can see what was said before, so customers never have to repeat themselves.',
        'It runs on the WhatsApp Business Platform (Meta’s API for businesses), not the WhatsApp Business app on a phone. That’s what makes it possible for several people to answer the same number at once, with history, notes and reporting.',
      ],
    },
    sections: [
      {
        eyebrow: 'App vs shared inbox', title: 'When the WhatsApp Business app stops being enough',
        items: [
          { icon: 'user', title: 'More than one person answering', body: 'The app is tied to one phone (with a few linked devices). A shared inbox lets every teammate log in and answer with their own account.' },
          { icon: 'chat', title: 'Ownership and handovers', body: 'Assign a chat to a person, leave internal notes and hand over without asking the customer to start again.' },
          { icon: 'chart', title: 'History and reporting', body: 'See every past conversation, how fast the team replies and what’s still waiting, instead of scrolling one phone.' },
          { icon: 'inbox', title: 'All your channels together', body: 'The same customer can text, DM on Instagram, email and message on WhatsApp. A shared inbox keeps it all on one record.' },
        ],
      },
      {
        eyebrow: 'Worth knowing', title: 'How WhatsApp for business works',
        items: [
          { icon: 'cal', title: 'The 24-hour window', body: 'When a customer messages you, you can reply freely for 24 hours. After that, you can only start a conversation with a pre-approved message template.' },
          { icon: 'form', title: 'Templates for reminders and updates', body: 'Order updates, booking reminders and other messages you start are sent as templates that Meta approves in advance.' },
          { icon: 'check', title: 'Opt-in matters', body: 'Only message customers who agreed to hear from you on WhatsApp, and make it easy for them to stop.' },
        ],
      },
      {
        eyebrow: 'Colvy and WhatsApp', title: 'WhatsApp is coming to Colvy',
        sub: 'We’re building WhatsApp into the same shared inbox as your other channels. It isn’t available yet. Until it lands, these channels are live today:',
        items: [
          { icon: 'chat', title: 'Two-way SMS', body: 'Text customers from an Australian 04 number, shared by the whole team.', href: '/channels/sms' },
          { icon: 'send', title: 'Instagram & Messenger', body: 'Instagram DMs and comments and Facebook Messenger, in one inbox.', href: '/channels/meta' },
          { icon: 'phone', title: 'Calls, email and web chat', body: 'Business calls in the browser and app, your shared email inbox and your website chat.', href: '/channels' },
        ],
      },
    ],
    stepsTitle: 'What to look for in a WhatsApp shared inbox',
    steps: [
      { title: 'Every channel in one place', body: 'WhatsApp beside SMS, social, email and chat, so the team works one queue and sees one history per customer.' },
      { title: 'Customer context beside the chat', body: 'Orders, bookings and past conversations next to each message, so anyone can answer properly.' },
      { title: 'Help with the busy times', body: 'Saved replies, AI-drafted answers from your own information, and clear ownership so nothing is missed.' },
    ],
    faqs: [
      { q: 'What is a WhatsApp shared inbox?', a: 'It connects your business WhatsApp number to software your whole team uses, so every WhatsApp conversation lands in one queue that several people can answer, with assignment, internal notes and each customer’s history.' },
      { q: 'Can more than one person use the WhatsApp Business app?', a: 'The app is designed for one phone, with a small number of linked devices. To let a whole team answer the same number with their own logins, history and assignment, you need a shared inbox connected through the WhatsApp Business Platform.' },
      { q: 'Does Colvy support WhatsApp?', a: 'Not yet. WhatsApp is coming to Colvy’s shared inbox. Today Colvy brings SMS, calls, Instagram, Facebook Messenger, email, web chat and Google reviews into one inbox.' },
      { q: 'What is the WhatsApp 24-hour window?', a: 'After a customer messages your business, you can reply freely for 24 hours. Outside that window, you can only start a conversation with a message template that Meta has approved.' },
      { q: 'What can I use until WhatsApp arrives in Colvy?', a: `Two-way SMS on an Australian number works for most of the same conversations, alongside Instagram, Messenger, email and web chat in one shared inbox. ${START}` },
    ],
    cta: { title: 'Start with the channels that work today.', sub: 'SMS, calls, Instagram, Messenger, email and web chat in one shared inbox, with WhatsApp to follow.', secondary: { label: 'See all channels', href: '/channels' } },
    related: [
      { label: 'WhatsApp Business shared inbox guide', href: '/blog/whatsapp-business-shared-inbox-guide' },
      { label: 'Business SMS in Australia', href: '/channels/sms' },
      { label: 'Instagram & Messenger inbox', href: '/channels/meta' },
      { label: 'The best shared inbox for small business', href: '/blog/best-shared-inbox-for-small-business' },
    ],
  },
}

export const TOPIC_SLUGS = Object.keys(TOPIC_PAGES)
