// Search titles and descriptions for the data-driven marketing routes.
// The routes' pages and layouts read them for their metadata, and
// lib/llms.ts lists every page with them, so AI assistants see the same
// title and summary as search engines. Keep each under 160 characters
// (scripts/marketing-routes.test.mjs checks).

export type PageMeta = { title: string; description: string }

// /product/<feature>: the feature pages
export const PRODUCT_META: Record<string, PageMeta> = {
  ideas: { title: 'Feature Request & Idea Board Software', description: 'Collect and prioritise feature requests with Colvy idea boards — let customers vote and comment in one place.' },
  roadmap: { title: 'Public Product Roadmap Tool', description: 'Share what you’re building with a public Colvy roadmap and keep customers in the loop as work progresses.' },
  announcements: { title: 'Changelog & Product Announcement Tool', description: 'Announce new releases with a beautiful Colvy changelog and notify the customers who asked for each feature.' },
  knowledgebase: { title: 'Knowledge Base & Help Centre Software', description: 'Publish a searchable help centre and knowledge base that answers customers around the clock, and powers Colvy’s AI agents with your own answers.' },
  inbox: { title: 'Omnichannel Shared Inbox for Teams of Every Size', description: 'One shared inbox for SMS, calls, Instagram, Messenger, email, live chat and Google reviews. Assign conversations, schedule replies and answer from web or app.' },
  crm: { title: 'AI-Powered CRM, Built Into Your Inbox', description: 'A simple CRM that fills itself in: every customer’s details, channels, orders, bookings, notes and messages beside each conversation. No data entry, start free.' },
  gallery: { title: 'Shared Media Gallery for Customer Chats', description: 'Photos, videos and files in one searchable library — mark up photos, trim videos and send them into any chat in a tap.' },
  notes: { title: 'Internal Team Notes on Customer Conversations', description: 'Add private team notes to any conversation in Colvy so context never gets lost.' },
  orders: { title: 'WooCommerce & Shopify Orders in Your Inbox', description: 'See WooCommerce and Shopify orders beside every chat, update them, send tracking and payment links, and answer “where’s my order?” without leaving Colvy.' },
  payments: { title: 'Pay-by-Link & Payments in Chat with Stripe', description: 'Send a secure Stripe pay-by-link from any SMS, Instagram or email conversation, see when it’s paid, and follow up unpaid requests automatically.' },
  links: { title: 'Secure Upload & Payment Links', description: 'Send secure upload and payment links, and collect files from customers, right from Colvy.' },
  insights: { title: 'Customer Service Analytics & Response Times', description: 'Track response times, conversation volume, channels and team performance, and see what your customer conversations turn into.' },
  waitlists: { title: 'Back-in-Stock Waitlists for WooCommerce and Shopify', description: 'Add a “Notify me” form to sold-out WooCommerce or Shopify products and text everyone automatically when stock returns, with replies in your Colvy inbox.' },
  'voice-typing': { title: 'AI Voice Typing for Customer Replies', description: 'Dictate chat, SMS, social and email replies with Colvy Voice. Fillers removed, punctuation added and your product names spelled right, ready to send.' },
  'abandoned-carts': { title: 'Abandoned Cart Recovery for WooCommerce and Shopify', description: 'See every abandoned WooCommerce or Shopify checkout in your Colvy inbox, follow up by SMS or email, convert it to an order and track recovered revenue.' },
  booking: { title: 'Online Booking System with Deposits & SMS Reminders', description: 'Let customers book services online with Colvy: live staff availability, deposits with Stripe, SMS reminders, regular bookings and a waitlist that fills gaps.' },
  reservations: { title: 'Restaurant Table Reservations, Floor Plan & Deposits', description: 'Take table bookings online, run the night from a day sheet and live floor plan, limit covers, take deposits for big groups and cut no-shows with Colvy.' },
  'check-in': { title: '“I’m Here” Guest Check-In for Bookings and Tables', description: 'Guests tap “I’m here” on their booking page when they arrive. Your team gets an alert and the booking or table shows them as arrived. No app needed.' },
  jobs: { title: 'Jobs & Quotes Software for Trades and Home Services', description: 'Send GST quotes customers accept online, run jobs on a list, board or calendar, assign your team with clash checks, and capture photos and signatures.' },
  'customer-accounts': { title: 'Customer Accounts: a Self-Service Portal for Your Customers', description: 'A “Your account” page at your address. Customers sign in with a code and see bookings, quotes, jobs, orders, receipts, payments due and messages.' },
  receipts: { title: 'Receipts & Tax Invoices for Your Customers', description: 'Every order in a customer’s account opens a receipt they can print or save as a PDF, and a tax invoice when you have an ABN and the sale includes GST.' },
  calendar: { title: 'Shared Calendar & Appointment Reminders', description: 'Schedule and manage appointments alongside your conversations in Colvy.' },
  tasks: { title: 'Tasks & Follow-ups from Customer Chats', description: 'Turn conversations into tasks and never drop a follow-up with Colvy.' },
  broadcasts: { title: 'Email & SMS Campaigns and Bulk SMS Broadcasts', description: 'Email and SMS campaigns built with Colvy AI: smart audiences, a drag-and-drop designer, texts from your Australian number and reports in orders and revenue.' },
  automation: { title: 'Customer Messaging Automation', description: 'Automate replies, routing and follow-ups so your team focuses on the conversations that matter, with Colvy.' },
}

// /channels/<slug>
export const CHANNEL_META: Record<string, PageMeta> = {
  meta: { title: 'Instagram DM & Facebook Messenger Inbox for Business', description: 'Answer Instagram DMs, Instagram and Facebook comments and Messenger chats from one shared inbox. Assign conversations, reply as a team and let AI draft answers.' },
  email: { title: 'Shared Email Inbox for Teams (Gmail & Any Mailbox)', description: 'Turn your support email into a shared inbox. Assign, tag and answer emails as a team from your own address, tied to each customer’s SMS, social and orders.' },
  phones: { title: 'Business Phone System with Australian Numbers', description: 'A business phone system in your inbox: Australian local, mobile and 1800 numbers, calls in browser and app, ring groups, voicemail and recordings per customer.' },
  'chat-widget': { title: 'Website Live Chat Widget for Business', description: 'Add live chat to your website, WordPress, WooCommerce or Shopify store. Answer from your shared inbox, continue by SMS or email, and let AI cover after hours.' },
  'google-reviews': { title: 'Google Reviews Management for Australian Businesses', description: 'Reply to Google reviews from one inbox, send SMS review requests after each order or booking, and let AI draft on-brand replies. For Australian businesses.' },
  whatsapp: { title: 'WhatsApp Business Inbox (Coming Soon)', description: 'WhatsApp support is coming to Colvy. See what we’re building, and the channels in Colvy’s shared inbox today: SMS, Instagram, Messenger, email, chat and phone.' },
  sms: { title: 'Business SMS & Two-Way Texting in Australia', description: 'Two-way business texting on an Australian 04 number: SMS from a shared inbox on web or app, with broadcasts, reminders and 3,000 texts a month on Inbox plans.' },
  forms: { title: 'Contact Forms That Land in Your Shared Inbox', description: 'Build contact and lead forms with Colvy and route every submission straight into your shared inbox and CRM, ready to answer by SMS, email or phone.' },
  broadcasts: { title: 'Bulk SMS & Email Broadcasts for Business', description: 'Send bulk SMS and email broadcasts to customer lists and segments, then answer every reply as its own conversation in your shared inbox.' },
}

// /solutions/<slug>
export const SOLUTION_META: Record<string, PageMeta> = {
  'customer-support': { title: 'Customer Support Software for Teams of Every Size', description: 'Run customer support across SMS, calls, Instagram, Messenger, email and live chat from one shared inbox, with a help centre, CRM and AI agents. Start free.' },
  sales: { title: 'Sales Inbox & AI-Powered CRM', description: 'Chase leads and close deals in Colvy — an omnichannel inbox and lightweight CRM that keeps every conversation and order in one place.' },
  marketing: { title: 'SMS & Email Marketing for Business', description: 'SMS and email campaigns built with Colvy AI, sent to smart audiences, with every reply in your shared inbox and reports in orders and revenue.' },
  reviews: { title: 'Review & Reputation Management for Business', description: 'Get more Google reviews with SMS review requests, reply to every review and social comment from one inbox, and let AI draft replies in your tone.' },
  feedback: { title: 'Customer Feedback Software & Public Roadmaps', description: 'Capture feature requests, prioritise a public roadmap and announce releases with Colvy feedback boards.' },
  bookings: { title: 'Online Appointment Booking & Scheduling Software', description: 'Let customers book appointments online: staff and location availability, Stripe deposits, SMS reminders and self-serve rescheduling, all in your shared inbox.' },
  payments: { title: 'Take Payments in Chat with Pay-by-Link', description: 'Send secure pay-by-link requests inside any conversation and reconcile them against orders — all in Colvy.' },
}

// /industries/<slug> (some redirect to /for)
export const INDUSTRY_META: Record<string, PageMeta> = {
  saas: { title: 'Customer Support & Feedback Software for SaaS', description: 'Support, onboard and gather feedback from SaaS users — one shared inbox, a CRM and public roadmaps in Colvy.' },
  agencies: { title: 'Client Messaging Inbox & CRM for Agencies', description: 'Manage client conversations across every channel from one inbox, with a CRM and white-label boards built for agencies.' },
  ecommerce: { title: 'Colvy for Ecommerce', description: 'Answer buyers on Instagram, SMS and email, tie chats to orders, and take payments — all in Colvy.' },
  hospitality: { title: 'Messaging, Bookings & Reviews for Hospitality', description: 'Handle bookings, enquiries and reviews across channels from one shared inbox built for hospitality teams.' },
  'real-estate': { title: 'Colvy for Real Estate', description: 'Capture and nurture property leads across SMS, calls and email with Colvy’s shared inbox and CRM.' },
  healthcare: { title: 'Patient Messaging & Reminders for Clinics', description: 'Coordinate patient enquiries, reminders and reviews across channels from one secure shared inbox in Colvy.' },
}

// /phones/<slug>
export const PHONE_META: Record<string, PageMeta> = {
  "click-to-dial": { title: "Click to Call: Call customers instantly in one click", description: "Instant click to call from any conversation, contact or order, in the browser or the app. No copying numbers, no desk phone, and every call logged." },
  "browser-dialer": { title: "Web-Based Phone Dialer: Business calls in your browser", description: "A web-based phone dialer for your business number: make and take calls from any browser tab or the app. No handsets, no install, caller history on screen." },
  "hd-audio": { title: "HD Audio: HD voice on the Colvy side of every call", description: "Calls in the Colvy app and browser use the Opus HD codec, so your end of the conversation sounds fuller and clearer." },
  "numbers-porting": { title: "Telephone Numbers for Business: New or ported", description: "Get a telephone number for your business online: an Australian local, 04 mobile or 1800 number in minutes, or port your number in 1 to 3 weeks." },
  "mobile-app": { title: "Mobile App: Take Colvy calls anywhere", description: "Answer calls and messages on the go — the full inbox and dialer in your pocket, on iOS and Android." },
  "warm-transfer": { title: "Call Transfer for Small Business: Warm transfers", description: "Transfer calls to a colleague the right way: brief them first, then hand over, with the customer’s history on their screen. In the browser and the app." },
  "call-forwarding": { title: "Call Forwarding Australia: Forward calls to your mobile", description: "Call forwarding for small business: forward your number to any Australian mobile, always or only after hours. A$35 a month all in, number included." },
  "cascade-ring": { title: "Cascade Ring: Ring the team in order", description: "Ring one person at a time, in the order you choose, then everyone, then your mobile if you like. Anyone offline or already on a call is skipped." },
  "simultaneous-ring": { title: "Simultaneous Ring: Ring everyone at once", description: "Ring everyone who’s available at once so the fastest to answer gets the call. Teammates already on a call are skipped." },
  "ivr": { title: "Auto Attendant & IVR: Press-1 menus for your number", description: "An auto attendant (IVR) for your business number: up to 10 press-1 options to ring the team, forward to a mobile, take a voicemail or reach the AI receptionist." },
  "ai-receptionist": { title: "AI Receptionist: Answers calls and order inquiries", description: "An AI receptionist for your business number: answers out of hours or when you’re busy, handles order inquiries and common questions, and takes messages." },
  "ai-call-intelligence": { title: "Phone Call Intelligence: Know the caller before you answer", description: "Phone call intelligence for small teams: who’s calling and why before you answer, then a transcript, call summary and follow-up tasks after." },
  "ai-actions": { title: "AI Actions: The call ends, the work is done", description: "After a call, AI drafts the follow-up, creates tasks and updates the contact — so the admin doesn’t pile up." },
  "call-recording": { title: "Cloud Call Recording with Transcripts & Call Summaries", description: "Cloud call recording for your business number: every call recorded, transcribed and summarised on the customer’s conversation, and searchable." },
  "call-reporting": { title: "Call Analytics: Volume, missed calls, talk time", description: "Call analytics for small business: call volume, answered and missed calls, talk time and busy hours, by person and team, so you staff the right hours." },
  "missed-call-text-back": { title: "Missed Call Text Back: Miss a call, keep the lead", description: "When you can’t pick up, Colvy auto-texts the caller so the conversation continues instead of going cold." },
  "voicemail": { title: "Voicemail that reads itself", description: "Voicemails transcribed, summarised and dropped into the inbox — read them in seconds instead of dialling in." },
  "voip": { title: "Online Phone System for Small Business (VoIP)", description: "An online phone system built into your inbox: Australian business numbers, call routing, IVR, voicemail and call recording. No PBX, no desk phones." },
  "international": { title: "International calling is coming", description: "We’re working on international calling from the Colvy dialer. Today, Colvy numbers are Australian, and calls run in the browser and the Colvy app." },
  "command-centre": { title: "Command Centre: Every call, on one screen", description: "A live dashboard of calls in progress, missed callers and team status — with the AI receptionist’s calls right beside your team’s." },
}

// /ai-assistant/<slug>
export const AI_META: Record<string, PageMeta> = {
  "ai-replies": { title: "AI Replies: Replies drafted in a blink", description: "The assistant drafts an on-brand answer for every message — ready to send, tweak or discard. You’re never staring at a blank reply box." },
  "knowledge-base": { title: "Knowledge Base: Answers from your own knowledge", description: "Teach the assistant your help center, docs and best replies, so every answer is accurate and on-brand — and it hands off when it isn’t sure." },
  "auto-summaries": { title: "Auto-Summaries: Every thread, summed up", description: "Long conversations and calls condensed to a line at the top, so anyone can pick up where things left off in seconds." },
  "ai-actions": { title: "AI Actions: AI that takes real action", description: "Beyond chat: the assistant looks up orders, checks stock, creates tasks and records sales — with a human approving anything that matters." },
  "auto-routing": { title: "Auto-Routing: Every conversation, to the right person", description: "The assistant reads each incoming message and sends it to the right teammate or team — automatically, the moment it lands." },
  "follow-ups": { title: "Follow-ups: Nothing slips through", description: "The assistant turns conversations into reminders and tasks, and nudges at the right moment — so the things you promised actually happen." },
  "tasks-reminders": { title: "Tasks & Reminders: Turn chats into to-dos", description: "Spin a task out of any conversation, assign it and set a reminder — so what you agreed to actually gets done." },
  "workflows": { title: "Workflows: Trigger actions on any event", description: "Build simple automations — when this happens, do that — so the routine runs itself while you focus on customers." },
  "human-in-control": { title: "Human in Control: AI proposes, you decide", description: "Every reply is a suggestion and every action is opt-in, with a full audit log. The assistant helps — it never goes rogue." },
}

// /integrations/<slug>
export const INTEGRATION_META: Record<string, PageMeta> = {
  "woocommerce": { title: "WooCommerce orders, right in the chat", description: "Connect your WooCommerce store and see live orders, tracking and customer history beside every conversation — look things up and act without leaving the thread." },
  "shopify": { title: "Shopify orders in every conversation", description: "Sync your Shopify store — even multiple stores — so customers and orders flow into Colvy and sit beside every message your team answers." },
  "stripe": { title: "Stripe: Take payments inside the chat", description: "Connect your own Stripe account to send payment links and invoices right in a conversation — and record the sale on the thread the moment it’s paid." },
  "slack": { title: "Slack: Get the alerts where your team already works", description: "Post to Slack when it matters — new ideas, votes, status changes and conversations — so your team stays in the loop without living in another tab." },
  "zapier": { title: "Zapier: Connect Colvy to 5,000+ apps", description: "Wire Colvy into the rest of your stack with Zapier — start a Zap whenever something happens in Colvy, all without writing code." },
  "api": { title: "Build on Colvy with webhooks & API", description: "When you need something custom, Colvy sends signed webhooks for the events that matter, has a REST API for your feedback board, and an MCP server for AI…" },
}
