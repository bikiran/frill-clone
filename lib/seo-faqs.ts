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
  // ── Email & SMS campaigns ───────────────────────────────────────────────────
  'product/broadcasts': [
    { q: 'Can I send email and SMS campaigns from Colvy?', a: 'Yes. Send a campaign by SMS from your Australian business number, by email, or both, to an audience you choose. Every reply opens a normal conversation in your shared inbox, and the report shows who clicked, replied, unsubscribed and ordered.' },
    { q: 'Can AI build a campaign for me?', a: 'Yes. Describe it in a sentence, or start from an idea like a weekend sale or new stock, and Colvy AI suggests the audience with a live count, writes the text and the email, picks real products from your store and suggests a time. It creates a draft for you to review; nothing is sent until you send it.' },
    { q: 'Who can I send a campaign to?', a: 'Everyone subscribed, a saved segment, people who bought a product or category, customers who haven’t ordered in a while, shoppers at one outlet, people with certain tags, people who clicked an earlier campaign, or abandoned checkouts. People who replied STOP, unsubscribed, bounced or marked an email as spam are always left out.' },
    { q: 'How do I see what a campaign earned?', a: 'Each campaign’s report lists every person it went to and what they did, with orders and revenue through its links. Campaign Insights compares every email and SMS campaign by click rate, orders, revenue, cost and return on SMS spend.' },
  ],
  'channels/broadcasts': [
    { q: 'What is a broadcast?', a: 'A broadcast (or campaign) is one message sent to many customers at once, such as a sale, a new arrival or a reminder. In Colvy it can go by SMS, email or both, and every reply lands in your shared inbox as its own conversation.' },
    { q: 'Can I send bulk SMS in Australia with Colvy?', a: `Yes, from your business’s Australian number. Inbox plans include 3,000 texts a month, and prepaid credits from A$0.15 a text cover more. Colvy shows the message parts and the cost before you send, and leaves out anyone who replied STOP. ${STARTER}` },
    { q: 'Can I test a campaign before it goes out?', a: 'Yes. Send a test to up to five email addresses or Australian mobiles, yours or a teammate’s, and see that each one arrived. Test texts start with [TEST] and test emails with [Test].' },
  ],
  'solutions/marketing': [
    { q: 'Is Colvy an SMS marketing tool?', a: 'Yes, and an email one. Colvy sends SMS and email campaigns from the same place you talk to customers, so replies become conversations your team can answer, and reports show clicks, replies, orders and revenue.' },
    { q: 'Does Colvy handle consent and opt-outs?', a: 'People who replied STOP, unsubscribed, bounced or marked an email as spam are left out of every campaign and follow-up automatically, and campaign emails link to unsubscribe and preference pages. You’re still responsible for having consent to message people, as Australia’s Spam Act requires.' },
    { q: 'Can I follow up people who didn’t respond?', a: 'Yes. From a campaign’s report, text again the people who didn’t click, resend an email to people who didn’t open with a new subject line, or follow up people who clicked but didn’t order. Opt-outs are never included.' },
  ],

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
    { q: 'Is Colvy a good CRM for small businesses?', a: `Yes. Colvy is built for teams that talk to customers every day, from a sole trader to a multi-site business: retail stores, ecommerce, service businesses, clinics and agencies. ${STARTER}` },
    { q: 'Does Colvy work for larger teams and enterprise?', a: 'Yes. Colvy has team roles with per-person permissions, audit logs, unlimited team members on the Everything plan, a number per location, API keys and an MCP server, and an Enterprise option with dedicated onboarding and support, custom contracts, white-label branding and high-volume rates.' },
  ],
  'product/booking': [
    { q: 'Can customers book appointments online with Colvy?', a: 'Yes. You get a booking page with live staff and location availability. Customers pick a service and time, can pay a deposit by card, and get SMS reminders and a link to reschedule or cancel.' },
    { q: 'Can I take deposits for bookings?', a: 'Yes. Deposits and full payments are taken securely with Stripe when the customer books, which helps cut no-shows.' },
    { q: 'Can the AI book appointments over text?', a: 'Colvy’s Reception Agent can offer available times and book appointments when a customer asks by SMS or chat, within the rules you set.' },
    { q: 'Can I set up a regular booking for a customer?', a: 'Yes. Repeat any booking every 1, 2, 3, 4, 6, 8 or 12 weeks, for up to 26 visits. Colvy shows which dates are free before you confirm and skips any that aren’t. The customer gets one message with every date and a calendar file, and each visit has its own reminders and its own link to change or cancel it.' },
    { q: 'How does the booking waitlist work?', a: 'When a day is full, customers can join the waitlist for the days and times that suit them. When a time frees up, Colvy offers it by text, or by email when a text can’t go: either to a few people at once, where the first to book gets it, or to one person at a time with the time held for them for the minutes you choose.' },
  ],
  'product/reservations': [
    { q: 'Can guests book a table online with Colvy?', a: 'Yes. Your table booking page lets guests choose the party size, date and time, where they’d like to sit and the occasion, and add a note, and you can embed it on your own website. They get a confirmation email with buttons to change or cancel and to add it to their calendar, then a reminder before they come.' },
    { q: 'Can I limit covers so the kitchen isn’t swamped?', a: 'Yes. Set the most guests seated at once and, if you like, the most guests arriving in each interval. Online bookings can’t go over either limit. Your team can, after a warning, for a regular or a walk-in.' },
    { q: 'Does it have a floor plan?', a: 'Yes. Draw your rooms and tables, choose which tables can be pushed together and which can be booked online. Each booking gets the smallest free table that fits, or you pick one, and the live floor shows which tables are free, booked, seated, late or out of action. Walk-ins can be seated at a free table in a tap.' },
    { q: 'Can I take deposits for bigger groups?', a: 'Yes, once your Stripe account is connected. Ask for a deposit per guest or per booking, from a party size and on the days you choose. If a guest cancels online before your cut-off, the deposit is refunded automatically. After that, or for a no-show, it’s kept.' },
    { q: 'What can I do about no-shows?', a: 'Colvy can mark a table as a no-show a set number of minutes after its time if nobody seated it, ask guests with past no-shows for a deposit, and stop guests with repeated no-shows from booking online, so they call you instead.' },
  ],
  'product/check-in': [
    { q: 'When does the “I’m here” button appear?', a: 'From 30 minutes before an in-person booking until it ends, on the guest’s booking page, which is linked from their confirmation. Earlier the same day, the page tells them when the button will appear.' },
    { q: 'What does my team see when a guest taps it?', a: 'A bell alert, a push notification to the team’s phones that opens the guest’s conversation, and a note in that conversation. Table reservations show “Here” and the time on the day sheet and glow on the floor plan, and appointments get a “Here” chip in the bookings list.' },
    { q: 'Does it work for appointments as well as tables?', a: 'Yes, for any in-person booking. Phone and video appointments don’t show the button.' },
    { q: 'Does the guest need an app or an account?', a: 'No. The button is on the booking page they already have from their confirmation, so there’s nothing to download or sign in to. Your team is told once per booking, however many times it’s tapped.' },
  ],
  'product/jobs': [
    { q: 'Can customers accept a quote online?', a: 'Yes. Send a quote by text, email or link. The customer sees each line and the GST, and accepts by typing their name or declines with a reason. If you ask for a deposit and take card payments through Stripe, they can pay it as they accept. The job then moves to Scheduled on its own.' },
    { q: 'Do quotes handle GST?', a: 'Yes. Quotes use 10% GST by default, with prices either including or excluding GST, and a setting for businesses that aren’t registered for GST. The GST is shown on its own line.' },
    { q: 'How does Colvy stop me double-booking my team?', a: 'When you assign someone to a job, Colvy checks their other jobs, bookings and calendar events at that time and asks you to confirm if there’s a clash. Once they’re on the job, that time is blocked on their booking calendar.' },
    { q: 'What can my team do on site?', a: 'Open My jobs to see their jobs by day with directions, start and stop a work timer, tick off a checklist, add before and after photos, and get the customer’s signature on screen. You can require a signature before a job is completed.' },
    { q: 'Can I hide prices from field staff?', a: 'Yes. A setting limits anyone who isn’t an owner or admin to the jobs they’re on, without prices, quotes or the price list.' },
  ],
  'product/customer-accounts': [
    { q: 'How do customers sign in to their account?', a: 'With a 6-digit code sent to the email address or mobile number you have for them, so there’s no password to remember. Codes expire after 10 minutes. A booking or quote link you sent also signs them in for the day.' },
    { q: 'What can customers see in their account?', a: 'Their upcoming bookings, table reservations and deliveries, with a link to change or cancel; quotes waiting for them and how their jobs are going; in-store and online orders with receipts; payment links and deposits still to pay; and their conversation with you, which they can reply to. They can also update their name and choose whether they get marketing by email and text.' },
    { q: 'Can customers book again or pay a deposit from their account?', a: 'Yes. Book again shows what they’ve booked before, with one tap to the booking page for that service, or the table page for the same party size, with their details filled in. A table or booking held for a deposit, and the deposit on a quote they’ve accepted, can be paid by card from the account page.' },
    { q: 'Can I choose what customers see?', a: 'Yes. Owners and admins turn customer accounts on in Settings and switch each section on or off.' },
    { q: 'Where does the account page live?', a: 'At your Colvy address, like yourname.colvy.com/account. Once it’s on, your booking and quote pages link to it too.' },
    { q: 'Is it private?', a: 'Customers only see what’s linked to their own email or mobile at your business. Codes and sessions are stored as hashes, card numbers and addresses aren’t shown, and the sign-in page never says whether an address belongs to a customer.' },
  ],
  'product/receipts': [
    { q: 'Which orders get a receipt?', a: 'In-store sales through Prexty POS on your WooCommerce store, online WooCommerce and Shopify orders, and paid payment links. Customers open them from Orders and receipts in their account, and print them or save them as a PDF.' },
    { q: 'When is a receipt a tax invoice?', a: 'When your business has an ABN in Colvy and the order includes GST, the receipt is titled “Tax invoice” and shows your ABN and the GST included. Otherwise it’s titled “Receipt”. Payment links show as a receipt, with a link to the card receipt from Stripe.' },
    { q: 'Can I send a customer their receipt?', a: 'Yes. From the Orders page, or an order card in the inbox, email or text the customer a private link to their receipt or tax invoice. They can view it, print it or save it as a PDF, without signing in.' },
    { q: 'Are prices shown with GST?', a: 'Yes. Amounts are shown including GST, as Australian customers expect, with the GST on its own line.' },
    { q: 'Does this replace my accounting software?', a: 'No. Receipts give your customers a record of what they bought, any time they need it. Keep your books and lodge your BAS from your accounting software as usual.' },
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
    { q: 'Is Colvy a good Birdeye alternative for small businesses?', a: 'Colvy brings reviews, business texting, social messages, email and live chat into one shared inbox with a CRM, booking and AI agents, for Australian teams of every size, from one location to many.' },
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
    { q: 'What is a good Freshdesk alternative for small businesses?', a: 'Colvy combines a shared inbox for SMS, calls, Instagram, Messenger, email and live chat with a CRM, help centre, reviews, booking, payments and AI agents, so a team of any size can run customer conversations from one app.' },
    { q: 'Does Colvy include phone and SMS?', a: 'Yes. Australian business numbers for calls and two-way SMS are built in, not a separate add-on product.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/intercom': [
    { q: 'Is Colvy a good Intercom alternative?', a: 'Colvy offers live chat on your website plus SMS, calls, Instagram, Messenger, email and Google reviews in the same shared inbox, with AI agents, a help centre and a customer feedback board, priced for small businesses.' },
    { q: 'Does Colvy have AI for customer support?', a: 'Yes. Five AI agents cover support, bookings, sales follow-ups, order updates and reviews. They draft for approval at first, and you decide what they may do on their own.' },
    { q: 'Can I try it before I switch?', a: STARTER },
  ],
  'compare/gladly': [
    { q: 'What is a Gladly alternative for small businesses?', a: 'Colvy gives teams of every size a customer-centred shared inbox, where every SMS, call, social message, email and chat sits on one customer timeline, with fair, published pricing rather than forced enterprise contracts.' },
    { q: 'Does Colvy keep one history per customer?', a: 'Yes. Every channel lands on the customer’s record, so anyone on the team can pick up the conversation with full context.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/highlevel': [
    { q: 'Is Colvy a HighLevel alternative?', a: 'Yes, for businesses that answer their own customers. Colvy puts SMS, calls, Instagram, Messenger, email, live chat and Google reviews in one shared inbox, with a CRM, five AI agents, store orders and online booking. HighLevel is built mainly for marketing agencies that set up accounts for their clients.' },
    { q: 'Do I need to be an agency to use Colvy?', a: 'No. Colvy is set up and run by the business itself, with no sub-accounts or reselling to manage. Most teams connect their channels and start replying in about 45 minutes.' },
    { q: 'Are texts and AI included?', a: 'The Inbox and Everything plans include five AI agents and 3,000 SMS a month. Texts beyond that use prepaid credits from A$0.15, so there are no surprise bills.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/salesforce': [
    { q: 'Is Colvy a Salesforce alternative for small businesses?', a: 'Yes. Colvy is a CRM with a shared inbox for SMS, calls, Instagram, Messenger, email and live chat, plus five AI agents, store orders and online booking, and most teams set it up in about 45 minutes. Salesforce is a broader CRM platform where messaging, calls and AI agents are added on higher editions.' },
    { q: 'Is Colvy priced per user?', a: 'No. The Inbox and Everything plans are one monthly price in AUD with unlimited team members, and you can cancel anytime.' },
    { q: 'Does Colvy include AI agents?', a: 'Yes. The Inbox and Everything plans include five AI agents for support, bookings, sales follow-ups, order updates and reviews. They draft for approval at first, and you decide what they may do on their own.' },
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
