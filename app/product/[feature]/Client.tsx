'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import MarketingFooter from '@/components/MarketingFooter'
import SeoFaqSection from '@/components/marketing/SeoFaqSection'
import MarketingNav from '@/components/MarketingNav'
import FeatureMockup, { MockKind } from '@/components/FeatureMockups'
import FeatureIcon from '@/components/FeatureIcon'
import { SellioStyles, SPill, SGhost, STrust, SHead, SBento, SSteps, SLinkRow, SCta, SExplore } from '@/components/marketing/Sellio'

// Feature deep-dive page (ideas / roadmap / announcements / knowledgebase),
// re-skinned to match the main landing's bold, bright system.

const CORAL = '#ff6a4d'
const BLUE = '#2b59ff'
const YELLOW = '#ffcb45'
const GREEN = '#00c48c'
const PURPLE = '#7c5cff'
const PINK = '#ff4d8d'
const CYAN = '#0891b2'
const TEAL = '#0d9488'
const INDIGO = '#4f46e5'
const INK = '#0f1119'

const PAGES: Record<string, any> = {
  ideas: {
    icon: 'idea', color: CORAL, mock: 'ideas', subtitle: 'Ideas Board',
    title: 'Turn feedback into features',
    hero: 'One beautiful place for all your customer feedback. Collect, prioritise, and act on what matters most.',
    features: [
      { icon: 'vote', title: 'Public voting', desc: 'Let customers vote on ideas. The most wanted features rise to the top automatically.' },
      { icon: 'tag', title: 'Topics & tags', desc: 'Organize ideas by category so nothing gets lost in the noise.' },
      { icon: 'search', title: 'Smart search', desc: 'Find any idea instantly. Full-text search across all submissions.' },
      { icon: 'chart', title: 'Priority scoring', desc: 'RICE scoring built in — reach, impact, confidence, effort — calculated automatically.' },
      { icon: 'bell', title: 'Status updates', desc: 'Move ideas through statuses. Users get notified when their idea ships.' },
      { icon: 'user', title: 'Anonymous submission', desc: 'Let users submit without an account. Guest IDs track their votes.' },
    ],
    mockup: [
      { title: 'Dark mode support', votes: 47, status: 'Planned', tag: 'improvement' },
      { title: 'Mobile app for iOS', votes: 38, status: 'In Progress', tag: 'feature' },
      { title: 'CSV data export', votes: 29, status: 'Shipped', tag: 'improvement' },
      { title: 'Slack integration', votes: 24, status: 'Planned', tag: 'integrations' },
    ],
    cta: 'Start collecting feedback',
  },
  roadmap: {
    icon: 'map', color: BLUE, mock: 'roadmap', subtitle: 'Public Roadmap',
    title: 'Show users what’s coming',
    hero: 'Build trust by being transparent. A beautiful, public roadmap that your customers will actually check.',
    features: [
      { icon: 'kanban', title: 'Kanban columns', desc: 'Under Review, Planned, In Development, Shipped — drag ideas through your workflow.' },
      { icon: 'target', title: 'Custom statuses', desc: 'Create your own statuses with custom colors to match your team’s process.' },
      { icon: 'link', title: 'Linked to feedback', desc: 'Ideas on your board automatically appear on the roadmap when you update their status.' },
      { icon: 'calendar', title: 'Timeline view', desc: 'Show delivery dates and milestones in a visual timeline your users will love.' },
      { icon: 'globe', title: 'Embeddable', desc: 'Embed your roadmap on your website or in your app with one line of code.' },
      { icon: 'lock', title: 'Access control', desc: 'Private roadmap for internal use, public for transparency, or gated by SSO.' },
    ],
    mockup: [
      { col: 'Under Review', items: ['API webhooks', 'Dark mode', 'Custom branding'] },
      { col: 'In Development', items: ['Mobile app', 'CSV export'] },
      { col: 'Shipped', items: ['Slack integration', 'Priority scoring'] },
    ],
    cta: 'Build your roadmap',
  },
  announcements: {
    icon: 'megaphone', color: GREEN, mock: 'announcements', subtitle: 'Announcements',
    title: 'Keep users in the loop',
    hero: 'A beautiful changelog that celebrates every ship. Tell your story, build loyalty, and reduce support tickets.',
    features: [
      { icon: 'pen', title: 'Rich editor', desc: 'Write beautiful announcements with our markdown editor. Add images, embeds, and formatting.' },
      { icon: 'tag', title: 'Categorized tags', desc: 'New Feature, Bug Fix, Improvement — color-coded tags so users find what they care about.' },
      { icon: 'mail', title: 'Email subscribers', desc: 'Users subscribe to get notified by email when you publish. Built-in newsletter.' },
      { icon: 'reaction', title: 'Emoji reactions', desc: 'Let users react to updates with emoji. See what lands with your community.' },
      { icon: 'pin', title: 'Pin important updates', desc: 'Pin your most important announcements to the top so they never get buried.' },
      { icon: 'chart', title: 'View tracking', desc: 'See exactly how many users read each announcement with built-in analytics.' },
    ],
    mockup: [
      { title: 'Dark mode is live! 🌙', tag: 'New Feature', date: 'Jun 19', reactions: '🔥 12', views: 342 },
      { title: 'CSV Export shipped ✅', tag: 'New Feature', date: 'Jun 12', reactions: '👍 8', views: 198 },
      { title: 'Bug fix: voting on mobile', tag: 'Bug Fix', date: 'Jun 8', reactions: '❤️ 5', views: 156 },
    ],
    cta: 'Start your changelog',
  },
  knowledgebase: {
    icon: 'book', color: YELLOW, mock: 'kb', subtitle: 'Knowledgebase',
    title: 'Answer questions before they’re asked',
    hero: 'A beautiful, searchable help centre that reduces support tickets by 40% on average.',
    features: [
      { icon: 'search', title: 'Instant search', desc: 'Full-text search across all articles. Users find answers in seconds, not support queues.' },
      { icon: 'folder', title: 'Categories', desc: 'Organize articles by category — Getting Started, Features, Billing, Troubleshooting.' },
      { icon: 'star', title: 'Featured articles', desc: 'Pin your most important articles at the top so new users find them immediately.' },
      { icon: 'thumbsup', title: 'Helpfulness rating', desc: 'Users mark articles as helpful. See which docs need improvement.' },
      { icon: 'chat', title: 'Live chat integration', desc: 'Can’t find an answer? Start a live chat or open a support ticket directly from the help centre.' },
      { icon: 'globe', title: 'Custom domain', desc: 'Host your help centre on help.yourcompany.com with full white labeling.' },
    ],
    mockup: [
      { title: 'Getting started', articles: 4, category: '🚀', views: 1420 },
      { title: 'Features', articles: 6, category: '✨', views: 876 },
      { title: 'Integrations', articles: 3, category: 'link', views: 654 },
      { title: 'Billing', articles: 2, category: '💳', views: 432 },
    ],
    cta: 'Build your help centre',
  },
  inbox: {
    icon: 'inbox', color: TEAL, mock: 'inbox', subtitle: 'Shared inbox',
    title: 'Every channel, one shared inbox',
    hero: 'SMS, email, chat, Instagram, Messenger and calls thread into one place your whole team works from — each message beside the full customer story.',
    features: [
      { icon: 'inbox', title: 'One thread per customer', desc: 'Every channel in a single conversation.' },
      { icon: 'user', title: 'Full context', desc: 'History and profile beside each chat.' },
      { icon: 'target', title: 'Assign & @mention', desc: 'Route work and loop in teammates.' },
      { icon: 'bolt', title: 'Saved replies', desc: 'Answer common questions in a tap.' },
      { icon: 'calendar', title: 'Scheduled replies', desc: 'Write it now, send it later. Edit, send now or cancel any time.' },
      { icon: 'mic', title: 'Voice typing', desc: 'Speak a reply and send it polished.' },
    ],
    cta: 'Bring every channel together',
  },
  crm: {
    icon: 'user', color: BLUE, mock: 'crm', subtitle: 'Contacts & CRM',
    title: 'A CRM beside every chat',
    hero: 'A full profile, history and lifetime value next to every conversation — so you always know exactly who you’re talking to.',
    features: [
      { icon: 'user', title: 'Rich profiles', desc: 'Contact details, tags and notes in one place.' },
      { icon: 'inbox', title: 'Full history', desc: 'Every past conversation, on the profile.' },
      { icon: 'tag', title: 'Orders & spend', desc: 'What they’ve bought and their value.' },
      { icon: 'pen', title: 'Custom fields & tags', desc: 'Model your customers your way.' },
    ],
    cta: 'Know every customer',
  },
  gallery: {
    icon: 'folder', color: PURPLE, mock: 'gallery', subtitle: 'Media gallery',
    title: 'Every photo and video, ready to send',
    hero: 'Your product photos and videos, and everything customers send, in one searchable library — edit them right in Colvy and drop them into any chat in a tap.',
    features: [
      { icon: 'folder', title: 'Folders & categories', desc: 'Organise photos, videos and files your way.' },
      { icon: 'search', title: 'Searchable', desc: 'Find the file you need in seconds.' },
      { icon: 'pen', title: 'Photo markup', desc: 'Add arrows, shapes and text, saved as a new copy.' },
      { icon: 'scissors', title: 'Video trimming', desc: 'Cut a clip down to the part that matters.' },
      { icon: 'send', title: 'One-tap sending', desc: 'Into any chat, SMS or email, with optional expiry.' },
      { icon: 'user', title: 'Per contact', desc: 'Everything a customer sends, kept on their profile.' },
    ],
    cta: 'Keep every file in reach',
  },
  notes: {
    icon: 'pen', color: PINK, mock: 'notes', subtitle: 'Notes',
    title: 'Team notes on any thread',
    hero: 'Leave internal notes and @mention teammates on any conversation — visible to your team, never to the customer.',
    features: [
      { icon: 'pen', title: 'Internal notes', desc: 'Add context only your team can see.' },
      { icon: 'user', title: '@mention teammates', desc: 'Pull the right person into a thread.' },
      { icon: 'lock', title: 'Never customer-visible', desc: 'Notes stay strictly internal.' },
      { icon: 'bell', title: 'Notify the right person', desc: 'Mentions send an instant nudge.' },
    ],
    cta: 'Collaborate in context',
  },
  orders: {
    icon: 'tag', color: CORAL, mock: 'orders', subtitle: 'Orders',
    title: 'Live orders, right in the chat',
    hero: 'See WooCommerce and Shopify orders, status and tracking beside the conversation — and answer “where’s my order?” without leaving the thread.',
    features: [
      { icon: 'tag', title: 'Live orders', desc: 'Order details and status in the thread.' },
      { icon: 'target', title: 'WISMO answers', desc: 'Tracking pulled in automatically.' },
      { icon: 'plug', title: 'Woo & Shopify', desc: 'Two-way sync with your store.' },
      { icon: 'chart', title: 'Order history', desc: 'Everything they’ve bought, in view.' },
    ],
    cta: 'Put orders in the inbox',
  },
  payments: {
    icon: 'bolt', color: GREEN, mock: 'payments', subtitle: 'Payments',
    title: 'Get paid in the thread',
    hero: 'Send a secure payment link or invoice and record the sale on the conversation — no detour to a separate checkout.',
    features: [
      { icon: 'link', title: 'Secure links', desc: 'Send by SMS or email; they pay on their device.' },
      { icon: 'tag', title: 'Invoices', desc: 'Bill and get paid in a few taps.' },
      { icon: 'bolt', title: 'In the thread', desc: 'No bouncing to another tool.' },
      { icon: 'chart', title: 'Recorded sales', desc: 'Every sale tied to the conversation.' },
    ],
    cta: 'Take payment where you talk',
  },
  links: {
    icon: 'link', color: CYAN, mock: 'links', subtitle: 'Link reports',
    title: 'See who clicked what',
    hero: 'Track opens and clicks on the links you send, per conversation — so you know who’s engaged and who to follow up with.',
    features: [
      { icon: 'link', title: 'Tracked links', desc: 'Every link you send, measured.' },
      { icon: 'chart', title: 'Opens & clicks', desc: 'See exactly what got engagement.' },
      { icon: 'user', title: 'Per contact', desc: 'Know which customer clicked.' },
      { icon: 'bell', title: 'Follow-up signals', desc: 'Reach out while interest is warm.' },
    ],
    cta: 'Measure every link',
  },
  insights: {
    icon: 'chart', color: INDIGO, mock: 'insights', subtitle: 'Insights',
    title: 'See what your conversations do',
    hero: 'Analytics on volume, response times, resolution and the revenue conversations drive — so you can staff and improve with data, not hunches.',
    features: [
      { icon: 'chart', title: 'Conversation analytics', desc: 'Volume and trends over time.' },
      { icon: 'bolt', title: 'Response times', desc: 'See how fast you really reply.' },
      { icon: 'tag', title: 'Revenue per chat', desc: 'Tie conversations to sales.' },
      { icon: 'user', title: 'By team & person', desc: 'Understand who handles what.' },
    ],
    cta: 'Measure what matters',
  },
  waitlists: {
    icon: 'bell', color: PURPLE, mock: 'waitlist', subtitle: 'Back-in-stock waitlists',
    title: 'Sold out? Keep the sale',
    hero: 'A “Notify me” form on every sold-out WooCommerce or Shopify product. When stock comes back, everyone waiting gets a text automatically, and their replies land in your inbox.',
    features: [
      { icon: 'pen', title: '“Notify me” on sold-out products', desc: 'Added by the Colvy plugin on WooCommerce or the Colvy theme block on Shopify, including each sold-out variation.' },
      { icon: 'bell', title: 'Automatic restock alerts', desc: 'When stock returns, everyone waiting gets an SMS, or an email if there’s no mobile.' },
      { icon: 'chart', title: 'See what’s most wanted', desc: 'Lists ranked by demand, so you know what to reorder first.' },
      { icon: 'inbox', title: 'Replies in the inbox', desc: 'Alerts go out on the customer’s thread, so “can you hold one?” lands with your team.' },
      { icon: 'user', title: 'Add people from a chat', desc: 'Someone asks by text or phone? Put them on the list in one click, even for items not listed online.' },
      { icon: 'lock', title: 'Polite by design', desc: 'Sending hours of 9am to 8pm, each person told once, and STOP always respected.' },
    ],
    cta: 'Start a waitlist',
  },
  'voice-typing': {
    icon: 'mic', color: TEAL, mock: 'voice', subtitle: 'Colvy Voice',
    title: 'Talk your replies, send them polished',
    hero: 'Tap the mic in any composer and just speak. Colvy Voice turns it into a clean, punctuated reply, with the “ums” gone and your product and customer names spelled right.',
    features: [
      { icon: 'mic', title: 'In every composer', desc: 'Chat, SMS, social, email and internal notes, on the web and in the mobile app.' },
      { icon: 'pen', title: 'Polished, not just transcribed', desc: 'Fillers removed, punctuation and capitals added, so it reads like you typed it.' },
      { icon: 'tag', title: 'Knows your names', desc: 'Your products, brands and the customer’s name are recognised and spelled correctly.' },
      { icon: 'bolt', title: 'Faster than typing', desc: 'Answer a long question in seconds, even on your phone between jobs.' },
      { icon: 'inbox', title: 'Lands where your cursor is', desc: 'Dictation drops into the reply at the cursor, ready to edit before you send.' },
      { icon: 'lock', title: 'Nothing sends by itself', desc: 'You always see the text first. Voice drafts it, you hit send.' },
    ],
    cta: 'Try voice typing',
  },
  'abandoned-carts': {
    icon: 'cart', color: '#d97706', mock: 'carts', subtitle: 'Abandoned carts',
    title: 'Win back the checkouts you lose',
    hero: 'When a WooCommerce or Shopify shopper leaves checkout, their cart lands in your inbox with the items, total and contact details, so your team can follow up by text or email and turn it into an order.',
    features: [
      { icon: 'inbox', title: 'Every cart in the inbox', desc: 'A thread per shopper with what they left, the total and how to reach them.' },
      { icon: 'chat', title: 'Follow up by SMS or email', desc: 'Reply from the thread, answer the question that stopped them, send a coupon.' },
      { icon: 'tag', title: 'Convert to order', desc: 'Turn the cart into a WooCommerce order without leaving Colvy.' },
      { icon: 'chart', title: 'Recovered revenue', desc: 'Orders from abandoned carts are matched automatically, even when they buy on another device.' },
      { icon: 'megaphone', title: 'Win-back campaigns', desc: 'Target everyone with an unrecovered cart in a broadcast.' },
      { icon: 'plug', title: 'Captured automatically', desc: 'The Colvy plugin picks up WooCommerce carts as the shopper types; Shopify checkouts come in from your store.' },
    ],
    cta: 'Recover carts',
  },
  booking: {
    icon: 'calendar', color: CORAL, mock: 'booking', subtitle: 'Online booking',
    title: 'Bookings that fill themselves',
    hero: 'A booking page on your own address. Customers pick a service, a time and a team member, pay a deposit, and get reminders. Regulars rebook on repeat, a waitlist fills the gaps, and every booking lands in the inbox beside the customer.',
    features: [
      { icon: 'calendar', title: 'Your own booking page', desc: 'Services, prices and live availability at yourname.colvy.com/book, or in your chat widget.' },
      { icon: 'user', title: 'Staff & locations', desc: 'Set hours per person and per outlet. Customers only see times someone is free.' },
      { icon: 'bolt', title: 'Deposits & prepayment', desc: 'Take a deposit or the full price with Stripe when they book. No-shows cost less.' },
      { icon: 'bell', title: 'SMS & email reminders', desc: 'Confirmation straight away, then reminders 24 hours and 2 hours before.' },
      { icon: 'link', title: 'Reschedule & cancel links', desc: 'Customers change their own booking within your policy, with automatic refunds.' },
      { icon: 'inbox', title: 'Booked from the chat', desc: 'Send a booking link from any conversation, or let Colvy AI do it.' },
      { icon: 'repeat', title: 'Regular bookings', desc: 'Repeat a booking every week, every 2 weeks or up to every 12. Each visit gets its own reminders and its own link to change it.' },
      { icon: 'send', title: 'A waitlist that fills gaps', desc: 'Customers join from a full day. When a time frees up, Colvy offers it by text or email: first to book gets it, or one person at a time with the time held for them.' },
      { icon: 'hand', title: '“I’m here” check-in', desc: 'From 30 minutes before, the booking page shows “I’m here”. One tap and your team knows they’ve arrived.' },
      { icon: 'mail', title: 'Booking emails that look the part', desc: 'A status, a date tile, the details, Google, Apple and Outlook calendar buttons, and a proper dark mode.' },
      { icon: 'pen', title: 'Intake questions', desc: 'Ask what you need to know up front, so the appointment starts ready.' },
      { icon: 'star', title: 'Review follow-up', desc: 'After the visit, ask for a Google review automatically.' },
    ],
    steps: [
      { title: 'They book', desc: 'From your booking page, your website, the chat widget or a link you send. Real availability only.' },
      { title: 'They’re reminded', desc: 'A confirmation with calendar buttons, then reminders before the visit with a link to change it.' },
      { title: 'They arrive', desc: 'A tap on “I’m here” tells the team, so nobody waits at an empty counter.' },
      { title: 'They come back', desc: 'Set up a regular booking, and let the waitlist offer any time that frees up.' },
    ],
    related: [{ label: '“I’m here” check-in', href: '/product/check-in' }, { label: 'Table reservations', href: '/product/reservations' }, { label: 'Customer accounts', href: '/product/customer-accounts' }],
    cta: 'Start taking bookings',
  },
  reservations: {
    icon: 'utensils', color: PINK, mock: 'reservations', subtitle: 'Table reservations', isNew: true,
    title: 'Every table booked, every guest expected',
    hero: 'A table booking page on your own address, a day sheet and a live floor plan for the team, deposits for bigger groups and tools that cut no-shows. Every booking sits beside the guest’s messages.',
    features: [
      { icon: 'calendar', title: 'A booking page for tables', desc: 'Guests choose party size, date and time, where they’d like to sit and the occasion, and add a note. Embed it on your website too.' },
      { icon: 'kanban', title: 'The night on one sheet', desc: 'Bookings by time with a covers strip, showing who’s booked, arriving soon, late, here and seated.' },
      { icon: 'layout', title: 'A live floor plan', desc: 'Draw your rooms and tables, set which ones push together, and see what’s free, booked, seated or out of action.' },
      { icon: 'users', title: 'Covers and pacing', desc: 'Cap the guests seated at once and the guests arriving each interval, so the kitchen isn’t hit all at once.' },
      { icon: 'target', title: 'The right table, picked for you', desc: 'Each booking gets the smallest free table that fits, or tables pushed together for bigger groups. Or pick one yourself.' },
      { icon: 'door', title: 'Walk-ins in a tap', desc: 'Seat a walk-in at a free table straight from the floor plan.' },
      { icon: 'bolt', title: 'Deposits for bigger groups', desc: 'Per guest or per booking, from the party size and on the days you choose, paid by card through your own Stripe account.' },
      { icon: 'userx', title: 'No-show tools', desc: 'Mark unseated tables as no-shows after a set time, ask repeat no-shows for a deposit, or have them call to book.' },
      { icon: 'mail', title: 'Confirmations and reminders', desc: 'A confirmation email with change, cancel and add-to-calendar buttons, then a reminder before they come.' },
      { icon: 'hand', title: '“I’m here” arrivals', desc: 'Guests tap “I’m here” on their booking page. The team gets an alert and the table glows on the floor plan.' },
      { icon: 'user', title: 'Guest notes that stay put', desc: 'VIP, allergies, birthday and notes on the guest’s profile, with their visits and no-shows beside every conversation.' },
      { icon: 'phone', title: 'Missed calls get your booking link', desc: 'Callers you miss during service get a text with your table booking link, so they can book while they’re keen.' },
    ],
    steps: [
      { title: 'A guest books', desc: 'Party size, date, time, seating and occasion, on your page or your website. Online bookings stay within your covers and pacing.' },
      { title: 'They get the details', desc: 'A confirmation email with buttons to change, cancel or add it to their calendar, then a reminder before they come.' },
      { title: 'You run the night', desc: 'The day sheet and floor plan show who’s due, who’s late and which tables are free, including walk-ins.' },
      { title: 'They arrive', desc: 'A tap on “I’m here” marks them as arrived and lights up their table, so the host can seat them straight away.' },
    ],
    related: [{ label: '“I’m here” check-in', href: '/product/check-in' }, { label: 'Colvy for restaurants', href: '/for/restaurants' }, { label: 'Online booking', href: '/product/booking' }],
    cta: 'Start taking table bookings',
  },
  'check-in': {
    icon: 'hand', color: GREEN, mock: 'checkin', subtitle: '“I’m here” check-in', isNew: true,
    title: 'Know the moment they walk in',
    hero: 'From 30 minutes before an in-person booking, the guest’s booking page shows an “I’m here” button. One tap alerts your team and marks them as arrived, so nobody waits at an empty counter.',
    features: [
      { icon: 'hand', title: 'One big button', desc: 'On the booking page linked from their confirmation. No app, no sign-in, nothing to download.' },
      { icon: 'timer', title: 'Shows at the right time', desc: 'From 30 minutes before an in-person booking until it ends. Earlier that day, the page says when it’ll appear.' },
      { icon: 'bell', title: 'Your team hears about it', desc: 'A bell alert and a push to the team’s phones, which opens the guest’s conversation so you can reply.' },
      { icon: 'chat', title: 'A note in the conversation', desc: 'The arrival is written into the guest’s thread, so anyone looking at it knows they’re here.' },
      { icon: 'layout', title: 'Marked as arrived', desc: 'Tables show “Here” with the time on the day sheet and glow on the floor plan. Appointments get a “Here” chip.' },
      { icon: 'lock', title: 'Told once', desc: 'A second tap, or a second phone, doesn’t alert the team again. The page tells the guest you know they’re here.' },
    ],
    steps: [
      { title: 'They book', desc: 'A table or an in-person appointment, online or by your team. Their confirmation links to their booking page.' },
      { title: 'They arrive', desc: 'From 30 minutes before, the page shows “I’m here”. They tap it from the car park or the door.' },
      { title: 'You know', desc: 'The bell, a push and a note in the chat. Their table or booking shows them as here.' },
      { title: 'You’re ready', desc: 'Seat them, call them through or pop out to say hello, without anyone queuing at the desk.' },
    ],
    related: [{ label: 'Table reservations', href: '/product/reservations' }, { label: 'Online booking', href: '/product/booking' }],
    cta: 'Turn on online bookings',
  },
  jobs: {
    icon: 'briefcase', color: BLUE, mock: 'jobs', subtitle: 'Jobs & quotes', isNew: true,
    title: 'From quote to sign-off, in one place',
    hero: 'Send quotes customers view and accept online, then run every job on a list, a board or a calendar. Assign the team with clash checks, and capture checklists, photos, signatures and time on site.',
    features: [
      { icon: 'pen', title: 'Quotes with GST', desc: 'Labour, materials, travel and fees from your price list or a template, with GST included or added, a discount and your terms.' },
      { icon: 'send', title: 'Accepted online', desc: 'Send by text, email or link. Customers see every line and the GST, then accept with their name or decline with a reason.' },
      { icon: 'bolt', title: 'A deposit on accept', desc: 'Ask for a deposit with the quote and the customer pays it by card when they accept, through your Stripe account.' },
      { icon: 'kanban', title: 'List, board and calendar', desc: 'See every job as a list, drag it across a board from New to Completed, or plan the month on a calendar.' },
      { icon: 'users', title: 'Assign with clash checks', desc: 'Colvy checks each person’s other jobs, bookings and calendar first, and the job blocks their time once it’s set.' },
      { icon: 'clipboard', title: 'Checklists', desc: 'Add a saved checklist in one go. Each tick records who did it and when.' },
      { icon: 'image', title: 'Before and after photos', desc: 'Photos go on the job, with a copy in your media gallery.' },
      { icon: 'pen', title: 'Customer signature', desc: 'The customer signs on your screen. You can require it before a job is completed.' },
      { icon: 'timer', title: 'Work timer', desc: 'Start puts the job in progress. Finish stops the clock and completes it.' },
      { icon: 'mappin', title: 'My jobs', desc: 'Each person sees their own jobs by day, with directions to the address.' },
      { icon: 'inbox', title: 'Started from the chat', desc: 'Turn a conversation, a booking or a form response into a job, with the customer’s details carried over.' },
      { icon: 'lock', title: 'Prices for the office only', desc: 'A setting limits field staff to the jobs they’re on, without prices or quotes.' },
    ],
    steps: [
      { title: 'Quote', desc: 'Build it from your price list, add GST and terms, and send it by text, email or link.' },
      { title: 'Accept', desc: 'The customer accepts online, pays a deposit if you asked for one, and the job moves to Scheduled.' },
      { title: 'Assign', desc: 'Pick the team. Colvy flags a clash, and everyone added gets a notification.' },
      { title: 'Do the job', desc: 'Timer, checklist, photos and the customer’s signature, all on the job from your phone.' },
    ],
    related: [{ label: 'Colvy for service businesses', href: '/for/service-businesses' }, { label: 'Payments', href: '/product/payments' }, { label: 'Customer accounts', href: '/product/customer-accounts' }],
    cta: 'Start sending quotes',
  },
  'customer-accounts': {
    icon: 'key', color: CYAN, mock: 'portal', subtitle: 'Customer accounts', isNew: true,
    title: 'Give every customer their own account',
    hero: 'A “Your account” page at your own address. Customers sign in with a code, no password, and see what’s coming up, their quotes and jobs, orders and receipts, payments due and their messages with you.',
    features: [
      { icon: 'smartphone', title: 'Sign in with a code', desc: 'A 6-digit code by email or text to the address you have for them. No password to forget.' },
      { icon: 'calendar', title: 'Coming up', desc: 'Bookings, table reservations and deliveries, with a link to change or cancel.' },
      { icon: 'briefcase', title: 'Quotes and jobs', desc: 'Quotes waiting for them, to view and accept, and how their jobs are going.' },
      { icon: 'receipt', title: 'Orders and receipts', desc: 'In-store and online orders, each with a printable receipt or tax invoice.' },
      { icon: 'link', title: 'Payments due', desc: 'Payment links still waiting, deposits for a table or booking being held, and an accepted quote’s deposit, all paid by card.' },
      { icon: 'repeat', title: 'Book again', desc: 'What they’ve booked before, with one tap to book it again, details filled in. For tables, the same party size.' },
      { icon: 'chat', title: 'Messages', desc: 'Their conversation with you, and they can reply. Your team is alerted like any other message.' },
      { icon: 'bell', title: 'Marketing preferences', desc: 'They choose whether they get your marketing by email and by text, and update their name.' },
      { icon: 'shield', title: 'Private, and yours to shape', desc: 'Only what’s linked to their own email or mobile, with no card numbers shown. Switch each section on or off.' },
    ],
    steps: [
      { title: 'Turn it on', desc: 'In Settings, switch on customer accounts and choose the sections. Copy your link.' },
      { title: 'Share the link', desc: 'Your booking and quote pages link to it, or send yourname.colvy.com/account yourself.' },
      { title: 'They sign in', desc: 'With a code by email or text, or straight from a booking or quote link you sent.' },
      { title: 'They help themselves', desc: 'Book again, pay a deposit, accept a quote, open a receipt or reply to you, any time.' },
    ],
    related: [{ label: 'Receipts & tax invoices', href: '/product/receipts' }, { label: 'Jobs & quotes', href: '/product/jobs' }, { label: 'Online booking', href: '/product/booking' }],
    cta: 'Open customer accounts',
  },
  receipts: {
    icon: 'receipt', color: INDIGO, mock: 'receipt', subtitle: 'Receipts & tax invoices', isNew: true,
    title: 'Every receipt, ready when they need it',
    hero: 'Every order opens a receipt your customer can print or save as a PDF, in their account or from a private link you send them. When you have an ABN and the sale includes GST, it’s a tax invoice, with the GST shown.',
    features: [
      { icon: 'tag', title: 'In-store sales', desc: 'Sales through Prexty POS on your WooCommerce store, with the outlet they bought at.' },
      { icon: 'cart', title: 'Online orders', desc: 'WooCommerce and Shopify orders. A WooCommerce order also links to the order in your shop, for returns or changes.' },
      { icon: 'link', title: 'Paid payment links', desc: 'A receipt for every payment link they’ve paid, with the card receipt from Stripe.' },
      { icon: 'receipt', title: 'Tax invoice or receipt', desc: 'Titled “Tax invoice” with your ABN when the sale includes GST. Otherwise it’s a receipt.' },
      { icon: 'chart', title: 'GST shown', desc: 'Prices include GST, as Australian customers expect, with the GST on its own line.' },
      { icon: 'printer', title: 'Print or save as PDF', desc: 'One button, a clean page with your logo and details, ready for their records.' },
      { icon: 'send', title: 'Send a receipt', desc: 'From the Orders page or an order in the inbox, email or text the customer a private link to their receipt or tax invoice.' },
      { icon: 'key', title: 'Always in their account', desc: 'With customer accounts on, every receipt waits under Orders and receipts, so nobody has to ask for a copy.' },
      { icon: 'user', title: 'Matched to the customer', desc: 'Orders are matched by the customer’s email or mobile, so add one to in-store sales and they’ll find it later.' },
    ],
    steps: [
      { title: 'Add your ABN', desc: 'In your business details. It’s what turns a receipt with GST into a tax invoice.' },
      { title: 'Turn on accounts', desc: 'Switch on customer accounts with the Orders and receipts section.' },
      { title: 'They sign in', desc: 'With a 6-digit code by email or text. Their orders are matched to their email or mobile.' },
      { title: 'They print it', desc: 'Open any order and print it or save it as a PDF, whenever they need it.' },
    ],
    related: [{ label: 'Customer accounts', href: '/product/customer-accounts' }, { label: 'Orders', href: '/product/orders' }, { label: 'Payments', href: '/product/payments' }],
    cta: 'Open customer accounts',
  },
  calendar: {
    icon: 'calendar', color: BLUE, mock: 'calendar', subtitle: 'Calendar',
    title: 'Bookings and reminders, connected',
    hero: 'Schedule bookings, events and reminders tied to your conversations — so nothing is double-booked or forgotten.',
    features: [
      { icon: 'calendar', title: 'Bookings & events', desc: 'Schedule right from a conversation.' },
      { icon: 'bell', title: 'Reminders', desc: 'Nudges so nothing is missed.' },
      { icon: 'inbox', title: 'Tied to chats', desc: 'Every booking linked to its customer.' },
      { icon: 'user', title: 'Shared team view', desc: 'Everyone sees what’s on.' },
    ],
    cta: 'Keep the schedule in sync',
  },
  tasks: {
    icon: 'kanban', color: PURPLE, mock: 'tasks', subtitle: 'Tasks',
    title: 'Turn any chat into a to-do',
    hero: 'Create a task from any conversation, assign it and set a due date — so what you agreed to actually happens.',
    features: [
      { icon: 'kanban', title: 'Tasks from chats', desc: 'One click from message to to-do.' },
      { icon: 'user', title: 'Assign owners', desc: 'Give every task a clear owner.' },
      { icon: 'calendar', title: 'Due dates', desc: 'Keep work on schedule.' },
      { icon: 'bell', title: 'Reminders', desc: 'Nudges so nothing slips.' },
    ],
    cta: 'Turn talk into action',
  },
  broadcasts: {
    icon: 'megaphone', color: CORAL, mock: 'broadcasts', subtitle: 'Email & SMS campaigns',
    title: 'Reach everyone at once',
    hero: 'Email and SMS campaigns to opted-in customers, built with Colvy AI or designed block by block, with every reply back in the shared inbox and a report in orders and revenue.',
    features: [
      { icon: 'ai', title: 'Build it with Colvy AI', desc: 'Describe it; get the audience, the text, the email, products and a time.' },
      { icon: 'pen', title: 'Email designer', desc: 'Drag-and-drop blocks, a real phone preview and pre-send checks.' },
      { icon: 'phone', title: 'SMS from your number', desc: 'Australian number, phone preview, parts and cost before you send.' },
      { icon: 'target', title: 'Smart audiences', desc: 'Bought a product, lapsed, an outlet, tags, clicked before, abandoned carts.' },
      { icon: 'send', title: 'Send a test', desc: 'To up to five emails or mobiles before it goes out.' },
      { icon: 'chat', title: 'Two-way replies', desc: 'Every reply opens a conversation in the inbox.' },
      { icon: 'chart', title: 'Who clicked and ordered', desc: 'Opens, clicks, replies, STOPs, orders and revenue per person.' },
      { icon: 'bell', title: 'One-tap follow-ups', desc: 'Re-send to non-openers, nudge clickers who didn’t buy.' },
      { icon: 'lock', title: 'Consent built in', desc: 'STOPs, unsubscribes and bounces left out of every send.' },
    ],
    cta: 'Send campaigns people reply to',
  },
  automation: {
    icon: 'target', color: TEAL, mock: 'automation', subtitle: 'Automation',
    title: 'Let the routine run itself',
    hero: 'Auto-route conversations, send follow-ups, request reviews and trigger actions on the events that matter — set it once, it runs always.',
    features: [
      { icon: 'target', title: 'Auto-routing', desc: 'Send each chat to the right team.' },
      { icon: 'bell', title: 'Follow-ups', desc: 'Nudge quotes and check-ins on autopilot.' },
      { icon: 'link', title: 'Event triggers', desc: 'When this happens, do that.' },
      { icon: 'lock', title: 'You stay in control', desc: 'Test, pause or tweak anytime.' },
      { icon: 'calendar', title: 'Scheduled replies', desc: 'Queue a message for the right moment, on any channel.' },
      { icon: 'inbox', title: 'Reopens on new activity', desc: 'A closed chat comes back to Open when the customer writes or orders.' },
    ],
    cta: 'Automate the busywork',
  },
}

// ── helpers (shared look with the main landing) ──────────────────────────────
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold })
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [threshold])
  return { ref, v }
}
function BigReveal({ text }: { text: string }) {
  const { ref, v } = useReveal(0.35)
  const words = text.split(' ')
  return (
    <span ref={ref as any} style={{ display: 'inline' }}>
      {words.map((w, i) => (
        <span key={i}>
          <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: '0.14em', marginBottom: '-0.14em' }}>
            <span style={{ display: 'inline-block', transform: v ? 'translateY(0)' : 'translateY(112%)', opacity: v ? 1 : 0, transition: `transform 0.65s cubic-bezier(0.16,1,0.3,1) ${i * 0.07}s, opacity 0.5s ${i * 0.07}s` }}>{w}</span>
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  )
}
const SunIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>)
const MoonIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>)

export default function FeaturePage() {
  const params = useParams()
  const feature = (params?.feature as string) || 'ideas'
  const page = PAGES[feature] || PAGES.ideas
  const color: string = page.color
  const mockKind: MockKind = (page.mock as MockKind) || 'ideas'
  const [dark, setDark] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    let raf = 0
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { setScrollY(window.scrollY); raf = 0 }) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { l?.subscription?.unsubscribe(); window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const go = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try {
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (co?.slug) window.location.href = `https://${co.slug}.colvy.com/admin`
      else await redirectToUserAdmin(user.id)
    } catch { await redirectToUserAdmin(user.id) }
  }

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes wordIn { from{opacity:0;transform:translateY(0.4em)} to{opacity:1;transform:translateY(0)} }
        .fp-navlink:hover { color:${color} !important; }
        .fp-card,.fp-navlink,.fp-btn { transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .fp-card:hover { transform:translateY(-6px); }
        .fp-btn:hover { transform:translateY(-2px); }
        @media (max-width:900px){ .fp-hero{ grid-template-columns:1fr !important; } .fp-desktop{ display:none !important; } }
      `}</style>

      <SellioStyles />
      {/* NAV */}
      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '92vh', display: 'flex', alignItems: 'center', padding: 'clamp(84px, 12vw, 120px) 24px 70px', overflow: 'hidden', background: dark ? 'linear-gradient(180deg, #10111b 0%, #0a0b12 60%)' : `linear-gradient(180deg, ${color}12 0%, #ffffff 58%)` }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)' }} />
        <div aria-hidden style={{ position: 'absolute', top: '-12%', left: '-8%', width: 460, height: 460, background: color, borderRadius: '46% 54% 60% 40% / 45% 45% 55% 55%', opacity: dark ? 0.16 : 0.22, transform: `translateY(${scrollY * 0.12}px)` }} />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <div className="fp-hero" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
            <div style={{ maxWidth: 560 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 15px', borderRadius: 999, marginBottom: 22, background: color + '1a', border: `1px solid ${color}44`, color, fontSize: 13, fontWeight: 800 }}><FeatureIcon name={page.icon} color={color} size={15} /> {page.subtitle}{page.isNew && <span style={{ marginLeft: 2, padding: '2px 8px', borderRadius: 999, background: color, color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.02em' }}>New</span>}</div>
              <h1 style={{ fontSize: 'clamp(40px, 5.6vw, 74px)', fontWeight: 900, lineHeight: 1.0, letterSpacing: '-0.04em', margin: '0 0 22px' }}><BigReveal text={page.title} />{!/[.!?]$/.test(page.title) && <span style={{ color }}>.</span>}</h1>
              <p style={{ fontSize: 'clamp(16px, 1.7vw, 20px)', color: muted, lineHeight: 1.6, maxWidth: 520, margin: '0 0 32px' }}>{page.hero}</p>
              <div className="sl-ctas">
                <SPill accent={color} onClick={go} cta="feature_hero_start">{page.cta}</SPill>
                <SGhost href="#explore">See all features</SGhost>
              </div>
              <STrust accent={color} />
            </div>
            <div style={{ position: 'relative', transform: `translateY(${scrollY * -0.04}px)` }}>
              <div aria-hidden style={{ position: 'absolute', inset: -20, borderRadius: 34, background: `linear-gradient(135deg, ${color}, ${color}88)`, opacity: dark ? 0.4 : 0.22, filter: 'blur(28px)' }} />
              <div style={{ position: 'relative' }}>
                <FeatureMockup kind={mockKind} accent={color} dark={dark} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES — bento grid on a soft band in the page's colour */}
      <section style={{ padding: 'clamp(72px, 10vw, 120px) 24px', background: dark ? '#0d0e17' : `linear-gradient(180deg, ${color}0f, ${color}05)` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SHead eyebrow={page.subtitle} title="Everything you need" grey="No cobbling tools together" accent={color} dark={dark} />
          <SBento items={page.features} accent={color} dark={dark} />
        </div>
      </section>

      {/* HOW IT WORKS — dark, numbered, like the landing */}
      {page.steps && (
        <SSteps title="How it works" grey="Set it up once. It runs every day" steps={page.steps} accent={color} onGo={go}
          after={page.related ? <SLinkRow label="Goes well with" links={page.related} /> : undefined} />
      )}

      <SeoFaqSection path={`product/${feature}`} accent={color} dark={dark} />

      <SCta title={`Ready to try ${page.subtitle}?`} sub="Set up in about 45 minutes. Free forever for small teams." accent={color} onGo={go} user={user} />

      {/* Every feature, grouped by the job it does (compact; swipeable on phones) */}
      <div id="explore" style={{ scrollMarginTop: 70 }}>
        <SExplore current={`/product/${feature}`} accent={color} dark={dark} />
      </div>

      <MarketingFooter dark={dark} />
    </div>
  )
}
