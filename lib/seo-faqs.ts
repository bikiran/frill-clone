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
  // ── Phone system (/phones/…) ────────────────────────────────────────────────
  // Written around what people search for: call forwarding, call transfer for
  // small business, auto attendant and IVR, web-based phone dialer, cloud call
  // recording, phone call summaries, call analytics. True of Colvy today.
  'phones/call-forwarding': [
    { q: 'How does call forwarding work in Colvy?', a: 'Your Colvy business number forwards calls to an Australian mobile or landline: every call, only when you’re closed (by your opening hours), after your team’s phones have rung, or when a caller picks it from your phone menu. Whoever answers hears who the call is for and presses 1 to take it, so their own voicemail can’t swallow the call.' },
    { q: 'How much does call forwarding cost in Australia?', a: 'The Business number plan is A$35 a month, all in: one Australian number (02, 03, 07, 08 or an 04 mobile), forwarding to your mobile, voicemail and every call in the Colvy app, with 100 call minutes a month and 20c a minute after that. Teams on the Inbox or Everything plan add numbers for A$15 a month each.' },
    { q: 'Can I forward calls only after hours?', a: 'Yes. Choose “only when closed” and calls ring your team during opening hours and forward to your mobile when you’re closed, including the holiday hours on your Google Business Profile.' },
    { q: 'What happens if nobody answers the forwarded call?', a: 'The call carries on to your voicemail, a missed-call text or the AI receptionist, whichever you’ve set up, and it’s logged in the inbox like every other call, with the recording, transcript and summary.' },
    { q: 'Is call forwarding the same as call transfer?', a: 'Not quite. Forwarding sends incoming calls to another number before anyone answers. A transfer passes a call you’ve already answered to a colleague. Colvy does both: forwarding from your number’s call routing, and warm transfers from a live call.' },
  ],
  'phones/warm-transfer': [
    { q: 'What is a warm call transfer?', a: 'A warm transfer is when you speak to the colleague first, tell them who’s calling and what they need, then pass the caller across. The customer doesn’t have to repeat themselves, which is why it suits small businesses where every call matters.' },
    { q: 'Can I transfer a call to a colleague in Colvy?', a: 'Yes. During a call, choose a teammate, brief them privately, then hand the call over. The customer’s history, notes and orders are on their screen when they pick up.' },
    { q: 'Do I need a desk phone to transfer calls?', a: 'No. Calls run in the browser and the Colvy app on iOS and Android, so transfers work wherever your team is.' },
    { q: 'How is call transfer different from call forwarding?', a: 'A transfer moves a call you’ve already answered. Forwarding sends incoming calls to another number, such as your mobile, before anyone answers. Colvy does both.' },
  ],
  'phones/ivr': [
    { q: 'What’s the difference between an auto attendant and an IVR?', a: 'People use the words for the same thing: a recorded greeting that asks callers to press a key (“For sales, press 1”) and sends them to the right place. Colvy’s auto attendant is a press-1 menu with up to 10 options on keys 0 to 9.' },
    { q: 'What can each menu option do?', a: 'Ring the team, ring people in order, forward to a mobile, take a voicemail, hand over to the AI receptionist, play a message or text the caller a link or address.' },
    { q: 'Can I have a different menu after hours?', a: 'Yes. Colvy switches to your after-hours menu by your opening hours, so callers hear the right options when you’re closed.' },
    { q: 'What if the caller doesn’t press anything?', a: 'The menu plays once more, then your default action runs: ringing everyone unless you pick something else. The inbox shows what each caller pressed, like “Pressed 2 · Support”.' },
  ],
  'phones/browser-dialer': [
    { q: 'Is Colvy a web-based phone dialer?', a: 'Yes. Make and take business calls from any modern browser tab, with nothing to install and no desk phone. The same calls work in the Colvy app on iOS and Android.' },
    { q: 'Can I call from my business number, not my personal one?', a: 'Yes. Calls go out from your Colvy business number, so customers see the business, never your personal mobile.' },
    { q: 'Does the dialer show who’s calling?', a: 'Yes. Incoming calls ring in the browser with the caller identified and their history, orders and notes on screen, and every call is logged on the customer’s conversation.' },
    { q: 'Which numbers can I get?', a: 'An Australian local number (02, 03, 07 or 08), an 04 mobile or an 1800 number when available, or keep your current number by porting it to Colvy.' },
  ],
  'phones/click-to-dial': [
    { q: 'What is click to call?', a: 'Click to call (click to dial) means calling a customer with one click on their number, instead of copying it into a phone. In Colvy every phone number in a conversation, contact or order is clickable.' },
    { q: 'Do I need a softphone or headset app?', a: 'No. Calls run in the browser and the Colvy app. A headset helps, but there’s nothing to install.' },
    { q: 'Are click-to-call calls logged?', a: 'Yes. Each call is saved on the customer’s conversation, and recorded calls get a transcript and an AI summary.' },
  ],
  'phones/call-recording': [
    { q: 'Does Colvy record calls in the cloud?', a: 'Yes. Calls are recorded in the cloud and saved on the customer’s conversation with a full transcript and an AI summary, so there’s no recorder to run and nothing to download.' },
    { q: 'Do I get a summary of every phone call?', a: 'Every recorded call gets a short AI summary on the thread, with the key details and suggested follow-up tasks, so anyone on the team can catch up without listening to the whole call.' },
    { q: 'Can I search what was said on a call?', a: 'Yes. Transcripts are searchable, so you can find a call by a word, an order number or a name.' },
    { q: 'Where do recordings go: email or the inbox?', a: 'Colvy keeps each recording, transcript and summary on the customer’s conversation rather than in someone’s email, so the whole team can play it, read it and follow up from one place, on the web or in the app.' },
    { q: 'Do I need to tell callers they’re being recorded?', a: 'Recording laws differ between Australian states, so check what applies to you. Many businesses mention it at the start of the call; if you use a press-1 menu, you can add it to the menu greeting.' },
  ],
  'phones/call-reporting': [
    { q: 'What call analytics does Colvy give me?', a: 'Call volume, answered and missed calls, answer and miss rates, talk time and busy hours, by person and for the whole team, so you can staff the busy times and follow up the missed ones.' },
    { q: 'Can I see total talk time?', a: 'Yes. The call log shows total talk time for today, the last 7 days and the last 30 days, and every call’s length.' },
    { q: 'Do missed calls show up?', a: 'Yes. Missed calls are listed with the caller, and a missed-call text can go out automatically so the conversation keeps going.' },
  ],
  'phones/ai-call-intelligence': [
    { q: 'What is phone call intelligence?', a: 'Phone call intelligence uses AI to make sense of calls: who’s calling and why before you answer, and a transcript, summary and next steps after. Colvy does both, on the customer’s conversation.' },
    { q: 'What does Colvy show when the phone rings?', a: 'The caller’s name if they’re a customer, their recent conversations, orders and notes, and a hint at why they might be calling, so you can answer informed.' },
    { q: 'What happens after the call?', a: 'Recorded calls are transcribed and summarised, and AI drafts follow-up tasks you can keep or discard.' },
  ],
  'phones/ai-receptionist': [
    { q: 'Can the AI receptionist answer order inquiries?', a: 'Yes, when you turn it on. If the caller’s number matches a customer, it can look up their orders; for any other order it asks for the order number and the email or postcode on it before sharing anything. It can also answer opening hours, stock questions and free booking times.' },
    { q: 'When does the AI receptionist answer?', a: 'You choose: out of hours, when nobody picks up, or always. It handles common questions, takes messages and can text callers what they need, such as an address or a link.' },
    { q: 'Do I see what the AI said?', a: 'Yes. Each AI call appears in the inbox with a transcript and summary, beside your team’s calls in the Command Centre.' },
  ],
  'phones/ai-actions': [
    { q: 'Can calls turn into tasks and reminders?', a: 'Yes. After a call, AI drafts the follow-up and suggests tasks with due dates, which you can keep, change or discard. Colvy reminds the person a task is assigned to when it’s due.' },
    { q: 'Does the AI change anything without me?', a: 'No. Suggested tasks and follow-ups are drafts until someone on your team keeps them.' },
  ],
  'phones/voip': [
    { q: 'Is Colvy an online phone system for small business?', a: 'Yes. Colvy is a cloud (VoIP) phone system built into a shared inbox: business numbers, ringing rules, a press-1 menu, voicemail, call recording, transcripts and reports, with calls in the browser and the Colvy app. No PBX or desk phones.' },
    { q: 'How much does a business phone number cost?', a: 'Numbers are A$15 a month each on the Inbox and Everything plans (1800 numbers A$25). If you only want a number that forwards to your mobile, the Business number plan is A$35 a month all in, with 100 call minutes.' },
    { q: 'Can I keep my existing number?', a: 'Yes. Request a port in Colvy and our team handles it with the carriers, typically within 1 to 3 weeks.' },
    { q: 'Can I make international calls?', a: 'Not yet. Colvy numbers are Australian, and international calling from the dialer is on the way.' },
  ],
  'phones/numbers-porting': [
    { q: 'What telephone numbers can my business get?', a: 'An Australian local number (02, 03, 07 or 08), an 04 mobile number for calls and texts, or an 1800 number when available, usually ready within a couple of minutes of ordering online.' },
    { q: 'How long does porting a number take?', a: 'Most ports take 1 to 3 weeks. Send one request in Colvy and our team lodges it with the carriers and keeps you posted. Keep your current service until we tell you the move is complete.' },
    { q: 'What does a number cost after porting?', a: 'A$15 a month, like any Colvy number, on the Inbox and Everything plans.' },
  ],
  'compare/krispcall': [
    { q: 'Is Colvy a KrispCall alternative?', a: 'Yes. Colvy is a cloud phone system inside a shared inbox: Australian local, mobile and 1800 numbers, press-1 menus, forwarding, voicemail, call recording, transcripts and AI summaries, with SMS, email, live chat, Instagram and Messenger in the same place.' },
    { q: 'Can I get just a business phone number?', a: 'Yes. The Business number plan is A$35 a month: one Australian local or mobile number forwarded to your mobile, always or only after hours, with voicemail, every call in the Colvy app and 100 call minutes a month, then 20c a minute.' },
    { q: 'Are texts included?', a: 'Yes, on the Inbox and Everything plans: 3,000 SMS a month. More texts use prepaid credits from A$0.15 a text, and texting stops rather than running up a bill when credit runs out.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/servicem8': [
    { q: 'Is Colvy a ServiceM8 alternative?', a: 'Yes, for trades and service businesses that want their jobs and customer conversations in one place. Colvy has quotes customers accept online, deposits, jobs with checklists, photos, time and signatures, repeating jobs and invoices paid online, beside calls, SMS, email, live chat, Instagram and Messenger.' },
    { q: 'Does Colvy limit how many jobs I can do?', a: 'No. Colvy doesn’t count jobs. The Inbox plan is A$179 a month, or A$149 a month billed yearly, GST included, for unlimited team members, with 3,000 SMS a month.' },
    { q: 'Does Colvy sync with Xero or MYOB?', a: 'No, Colvy doesn’t sync with Xero, MYOB or QuickBooks. Each invoice shows what’s been paid, by card, cash or bank transfer, and what’s still owing.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/tradify': [
    { q: 'Is Colvy a Tradify alternative?', a: 'Yes. Colvy gives trades quotes customers accept online, deposits, jobs with checklists, photos, time and signatures, repeating jobs and invoices paid online, in the same inbox as calls, SMS, email, live chat, Instagram and Messenger.' },
    { q: 'Is Colvy priced per user?', a: 'No. The Inbox plan is one price for unlimited team members: A$179 a month, or A$149 a month billed yearly, GST included, with 3,000 SMS a month.' },
    { q: 'Can customers book a job online?', a: 'Yes. Your booking page lists your services, including ones done at the customer’s address. Customers pick a time, pay a deposit if you ask for one, and get reminders.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/fresha': [
    { q: 'Is Colvy a Fresha alternative?', a: 'Yes. Colvy gives salons, spas and clinics online booking with deposits and reminders, repeat appointments, packs and memberships, and client accounts, with texts, calls, email, live chat, Instagram and Messenger in one inbox.' },
    { q: 'Does Colvy charge a fee for new clients?', a: 'No. Colvy doesn’t run a marketplace and doesn’t charge a fee for new clients. Clients book on your own booking page.' },
    { q: 'Can I sell memberships and packs?', a: 'Yes. Sell packs, like 10 visits for $150, and memberships that renew weekly, fortnightly or monthly, paid into your own Stripe account. Clients use them when they book and see what’s left in their account.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/timely': [
    { q: 'Is Colvy a Timely alternative?', a: 'Yes. Colvy has online booking with deposits and reminders, repeat appointments, packs and memberships, and client accounts, plus two-way texts, calls, email, live chat, Instagram and Messenger in one inbox.' },
    { q: 'Can clients text back?', a: 'Yes. Clients text your Australian business number and your team replies from the shared inbox. The Inbox and Everything plans include 3,000 SMS a month.' },
    { q: 'Does Colvy take deposits?', a: 'Yes. For each service, choose no payment, a deposit or the full price, paid by card through your own Stripe account.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/mindbody': [
    { q: 'Is Colvy a Mindbody alternative?', a: 'Yes, for gyms and studios that want class booking, class packs, memberships, campaigns and every member conversation in one place: texts, calls, email, live chat, Instagram and Messenger.' },
    { q: 'Can Colvy bill memberships automatically?', a: 'Yes. Memberships renew weekly, fortnightly or monthly through your own Stripe account, and members see their classes left and next renewal in their account.' },
    { q: 'How much does Colvy cost?', a: 'The Inbox plan is A$179 a month, or A$149 a month billed yearly, GST included, for unlimited team members, with email and SMS campaigns, five AI agents and 3,000 SMS a month.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/aircall': [
    { q: 'Is Colvy an Aircall alternative?', a: 'Yes. Colvy is a cloud phone system inside a shared inbox: Australian business numbers, press-1 menus, forwarding, ring groups, voicemail, call recording, transcripts and AI summaries, with SMS, email, live chat, Instagram and Messenger in the same place.' },
    { q: 'Is Colvy priced per user?', a: 'No. The Inbox plan is one price for unlimited team members: A$179 a month, or A$149 a month billed yearly, GST included, with 3,000 SMS a month. Numbers are A$15 a month each, and call minutes are metered.' },
    { q: 'Can I keep my phone number?', a: 'Yes. Request a port in Colvy and our team handles it with the carriers, typically within 1 to 3 weeks. Keep your current service running until we tell you the move is complete.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/dialpad': [
    { q: 'Is Colvy a Dialpad alternative?', a: 'Yes. Colvy gives you a business phone system with call recording, transcripts and AI summaries, in the same shared inbox as SMS, email, live chat, Instagram and Messenger, plus a CRM, store orders and five AI agents.' },
    { q: 'Does Colvy include live chat and email?', a: 'Yes. The Inbox and Everything plans include live chat, email, SMS, calls, Instagram and Messenger in one inbox, at one price for the whole team.' },
    { q: 'How many texts are included?', a: 'The Inbox and Everything plans include 3,000 SMS a month. More texts use prepaid credits from A$0.15 a text, and texting stops rather than running up a bill when credit runs out.' },
    { q: 'How do I get started?', a: STARTER },
  ],
  'compare/ringcentral': [
    { q: 'Is Colvy a RingCentral alternative for small business?', a: 'Yes. Colvy is a business phone system for small Australian teams: local, mobile and 1800 numbers, press-1 menus, forwarding, voicemail, call recording and AI summaries, in one inbox with SMS, email, live chat and social.' },
    { q: 'Do Colvy’s prices include GST?', a: 'Yes. Colvy’s prices are in Australian dollars and include GST. The Inbox plan is A$179 a month, or A$149 a month billed yearly, for unlimited team members.' },
    { q: 'Does Colvy have an AI receptionist?', a: 'Yes, on the Inbox and Everything plans. It can answer out of hours, when nobody picks up, or always, handle common questions, take messages and text callers what they need. Its calls use your metered call minutes.' },
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
