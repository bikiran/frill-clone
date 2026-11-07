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
    metaDescription: 'Turn customer chats into sales: send products and prices, take payment by Stripe link, create WooCommerce and Shopify orders and follow up abandoned carts.',
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

  'email-sms-marketing': {
    slug: 'email-sms-marketing',
    accent: '#7c5cff',
    name: 'Email & SMS marketing',
    metaTitle: 'Email & SMS Marketing Software for Australian Businesses | Colvy',
    metaDescription: 'Email and SMS campaigns from your shared inbox: build them with Colvy AI, text from your Australian number, and see who clicked, replied and ordered.',
    eyebrow: 'Email & SMS campaigns',
    h1: 'Email and SMS campaigns that people reply to.',
    sub: 'Send a sale, a new arrival or a “we miss you” to the right customers by text, email or both. Colvy AI can build it for you, every reply lands in your shared inbox, and the report shows who clicked, replied and ordered.',
    primaryCta: 'Send your first campaign',
    chat: {
      channel: 'SMS campaign', who: 'Josh',
      lines: [
        { from: 'us', text: 'Weekend sale at Reef & Fin 🐠 20% off all aquarium plants, Saturday and Sunday only: reefandfin.com.au/s/plants' },
        { from: 'them', text: 'Do you have java fern in stock?' },
        { from: 'us', text: 'We do! 12 left. Want me to put two aside for pickup?' },
        { from: 'them', text: 'Yes please, I’ll grab them Saturday 🙌' },
      ],
      chips: [{ text: 'Clicked' }, { text: 'Ordered $64', tone: '#2563eb' }],
    },
    intro: {
      title: 'What are email and SMS campaigns?',
      paragraphs: [
        'An email or SMS campaign (also called a broadcast, bulk SMS or an email newsletter) is one message sent to many customers at once: a sale, a new arrival, an event, a reminder or a win-back for people who haven’t ordered in a while.',
        'Most tools stop at “sent”. In Colvy a campaign goes out from the same place you talk to customers, so a reply becomes a normal conversation your team can answer, and the report follows each person from delivered to clicked to ordered.',
      ],
    },
    sections: [
      {
        eyebrow: 'Build it', title: 'From an idea to a ready-to-send campaign',
        sub: 'Describe it in a sentence, or design every block yourself.',
        items: [
          { icon: 'spark', title: 'Build with Colvy AI', body: 'Describe the campaign, or start from an idea like a weekend sale, new stock or VIP early access. Colvy AI suggests who should get it (with a live count), writes the text and the email, picks real products from your store and suggests a day and time. You review the draft before anything is sent.' },
          { icon: 'form', title: 'An email designer with a real phone preview', body: 'Drag in text, images, buttons, two columns, video, products, coupons and social links. See it in a realistic phone, on desktop and in the inbox list, with checks for the subject, spammy wording, missing alt text and broken links.' },
          { icon: 'phone', title: 'Texts from your own number', body: 'SMS campaigns go from your business’s Australian number, shown in a phone preview with the message parts and the cost before you send, and tracked links so you can see who clicked.' },
          { icon: 'send', title: 'Test it first', body: 'Send a test to up to five email addresses or mobile numbers, yours or a teammate’s, and see that each one arrived.' },
        ],
      },
      {
        eyebrow: 'Measure it', title: 'Reports in orders and revenue, not just opens',
        items: [
          { icon: 'user', title: 'Who did what', body: 'Every person the campaign went to: delivered, opened, clicked (and which link), replied, unsubscribed or replied STOP, and ordered (and how much).', href: '/product/broadcasts' },
          { icon: 'bell', title: 'One-tap follow-ups', body: 'Text again the people who didn’t click, resend an email to people who didn’t open with a new subject line, or follow up people who clicked but didn’t order.' },
          { icon: 'chart', title: 'Campaign Insights', body: 'Every email and SMS campaign side by side: click rate, orders, revenue, cost and return on SMS spend, with the best performers picked out.', href: '/product/insights' },
          { icon: 'chat', title: 'Replies in the shared inbox', body: 'A reply to a campaign opens a normal conversation in the shared inbox, beside the customer’s orders and history, so a broadcast can turn into a sale.', href: '/product/inbox' },
        ],
      },
      {
        eyebrow: 'Stay on the right side of the rules', title: 'Consent built into every send',
        items: [
          { icon: 'check', title: 'Opt-outs respected', body: 'People who replied STOP, unsubscribed, bounced or marked an email as spam are left out of every campaign and every follow-up, test sends included.' },
          { icon: 'link', title: 'Unsubscribe and preference pages', body: 'Campaign emails link to an unsubscribe page and a preferences page, so customers can choose what they hear about.' },
          { icon: 'tag', title: 'Audiences that make sense', body: 'Everyone subscribed, a saved segment, people who bought a product or category, customers who haven’t ordered in a while, shoppers at one outlet, tags, people who clicked an earlier campaign, or abandoned checkouts.' },
        ],
      },
    ],
    stepsTitle: 'From idea to orders in three steps',
    steps: [
      { title: 'Describe it', body: 'Tell Colvy AI what you want to promote, or start from an idea or a template. Get the audience, the copy and a suggested time.' },
      { title: 'Check and send', body: 'Tweak the email in the designer or the text in the phone preview, send yourself a test, then send now or schedule it.' },
      { title: 'Answer and measure', body: 'Replies land in the shared inbox. The report shows who clicked, replied and ordered, and lets you follow up the rest.' },
    ],
    faqs: [
      { q: 'What is the difference between an SMS campaign and a broadcast?', a: 'They’re the same thing: one message sent to many customers at once. Colvy calls them campaigns, and they can go by SMS, by email or both.' },
      { q: 'Can I send bulk SMS in Australia from my business number?', a: 'Yes. SMS campaigns go from your business’s Australian number in Colvy, and replies come back to the same shared inbox as the rest of your texts. Inbox plans include 3,000 texts a month, with prepaid credits for more.' },
      { q: 'Can Colvy write my campaign for me?', a: 'Yes. Describe it in a sentence and Colvy AI suggests the audience (with a live count), writes the text and the email, picks real products from your store and suggests a time to send. It creates a draft for you to review; nothing is sent until you send it.' },
      { q: 'How do I know if a campaign worked?', a: 'Each campaign’s report lists everyone it went to and what they did: opened, clicked, replied, unsubscribed or ordered, with revenue from the campaign’s links. Campaign Insights compares every campaign by click rate, orders, revenue and return on SMS spend.' },
      { q: 'How are opt-outs handled?', a: 'People who replied STOP, unsubscribed, bounced or marked an email as spam are left out of every campaign and follow-up automatically. Campaign emails link to unsubscribe and preference pages.' },
      { q: 'Does it work with WooCommerce and Shopify?', a: 'Yes. Campaigns can feature real products from your store, and orders made through a campaign’s links are counted in its report, so you can see the revenue each campaign brought in.' },
      { q: 'How much does it cost?', a: `Email and SMS campaigns are part of Colvy’s Inbox and Everything plans. The Inbox plan includes 3,000 texts a month; extra texts are prepaid credits from A$0.15 each. ${START}` },
    ],
    cta: { title: 'Send a campaign people actually answer.', sub: 'Describe it to Colvy AI, check it in the phone preview, and answer every reply from one inbox.', secondary: { label: 'See broadcasts', href: '/product/broadcasts' } },
    related: [
      { label: 'Bulk SMS & email broadcasts', href: '/product/broadcasts' },
      { label: 'Business SMS in Australia', href: '/channels/sms' },
      { label: 'SMS marketing and consent in Australia', href: '/blog/sms-marketing-consent-australia' },
      { label: 'Abandoned cart texts: what to send', href: '/blog/abandoned-cart-sms-woocommerce-shopify' },
    ],
  },

  'whatsapp-shared-inbox': {
    slug: 'whatsapp-shared-inbox',
    accent: '#16a34a',
    name: 'WhatsApp shared inbox',
    metaTitle: 'WhatsApp Shared Inbox for Teams: How It Works (and Colvy)',
    metaDescription: 'What a WhatsApp shared inbox is, how it differs from the WhatsApp Business app, what to look for, and how WhatsApp is coming to Colvy’s shared inbox.',
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
