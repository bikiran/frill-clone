'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import SeoFaqSection from '@/components/marketing/SeoFaqSection'
import FeatureIcon from '@/components/FeatureIcon'
import ContactSalesModal from '@/components/ContactSalesModal'
import { COMING_SOON } from '@/lib/feature-availability'
import AgentTeamBand from '@/components/AgentTeamBand'
import { VsLogos } from '@/components/marketing/CompareLogos'

// Landing-styled competitor comparison pages (Colvy vs Podium / Gorgias / Gladly
// / Intercom / Zendesk / Freshdesk). Data-driven so every comparison shares the
// same layout: hero + stat tiles, a feature-by-feature table, a "where Colvy
// wins" grid, a migration section and a CTA.
//
// We intentionally do NOT reproduce any competitor's real customer names, quotes
// or results — those belong to them. Copy here is product-level and neutral.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', TEAL = '#12b5a5', INDIGO = '#4f46e5', AMBER = '#d97706', INK = '#0f1119'

// The feature table, in groups. Each row says what Colvy has and, per
// competitor, what we could confirm from their own public pages (pricing,
// product and help pages, checked November 2026). A cell left out shows "—":
// not confirmed either way. ✗ is only for things we're confident they don't
// offer. Plans change, so the table says when it was checked.
type Val = boolean | string
type Slug = 'podium' | 'birdeye' | 'coax' | 'gorgias' | 'zendesk' | 'freshdesk' | 'intercom' | 'gladly' | 'manychat' | 'highlevel' | 'salesforce' | 'aircall' | 'dialpad' | 'ringcentral' | 'krispcall' | 'servicem8' | 'tradify' | 'fresha' | 'timely' | 'mindbody'
// `only`: the row shows on those pages alone. `hide`: it doesn't show on those.
type Row = { label: string; colvy?: Val; v: Partial<Record<Slug, Val>>; only?: readonly Slug[]; hide?: readonly Slug[] }
// The nine competitors checked in the first round. A shorthand for a value
// they all share; competitors added later list only what was checked for them.
const FIRST_NINE = ['podium', 'birdeye', 'coax', 'gorgias', 'zendesk', 'freshdesk', 'intercom', 'gladly', 'manychat'] as const
const ALL_T = (val: Val): Partial<Record<Slug, Val>> => Object.fromEntries(FIRST_NINE.map(k => [k, val]))
const HELPDESKS_T: Partial<Record<Slug, Val>> = { gorgias: true, zendesk: true, freshdesk: true, intercom: true, gladly: true }
// Job apps for trades and cleaners, and booking apps for salons, clinics and
// gyms (checked 14 November 2026). Their pages skip the online-store and
// feedback-board rows, which don't apply, and add rows of their own.
const FIELD = ['servicem8', 'tradify'] as const
const SALON = ['fresha', 'timely', 'mindbody'] as const
const NEW_FIVE = [...FIELD, ...SALON] as const

const ROWS: { group: string; hide?: readonly Slug[]; rows: Row[] }[] = [
  { group: 'Jobs & invoices', rows: [
    { label: 'Quotes accepted online, with a deposit', only: FIELD, v: { servicem8: true, tradify: 'Pro plan' } },
    { label: 'Jobs: schedule, checklists, photos & signatures', only: FIELD, v: { servicem8: true, tradify: 'Pro and Plus plans' } },
    { label: 'Repeating jobs', only: FIELD, v: { servicem8: true, tradify: 'Pro plan' } },
    { label: 'Invoices paid online by card', only: FIELD, v: { servicem8: true, tradify: true } },
    { label: 'Texts chasing overdue invoices', only: FIELD, v: {} },
    { label: 'No monthly cap on jobs', only: FIELD, v: { servicem8: '30 to 1,500+, by plan' } },
    { label: 'Xero, MYOB or QuickBooks sync', colvy: false, only: FIELD, v: { servicem8: true, tradify: true } },
  ] },
  { group: 'Classes, packs & memberships', rows: [
    { label: 'Repeat appointments in one go', only: SALON, v: { fresha: true, mindbody: true } },
    { label: 'Class packs (e.g. 10 classes)', only: SALON, v: { fresha: 'Packages', timely: 'Packages (Boost+)', mindbody: true } },
    { label: 'Memberships billed automatically', only: SALON, v: { fresha: true, mindbody: true } },
    { label: 'Customer accounts', only: SALON, v: { fresha: 'In the Fresha app', timely: true, mindbody: 'Sign-up; branded app add-on' } },
    { label: 'No fee on new clients', only: SALON, v: { fresha: 'Fee on marketplace clients', timely: true, mindbody: 'Fee on Mindbody app clients' } },
    { label: 'Xero or QuickBooks sync', colvy: false, only: SALON, v: { fresha: true, timely: 'Thrive plan' } },
  ] },
  { group: 'Channels', rows: [
    { label: 'SMS on Australian 🇦🇺 numbers', v: { podium: true, birdeye: true, coax: true, gorgias: 'Add-on', zendesk: 'Add-on', freshdesk: 'Add-on', intercom: 'Usage-based', gladly: true, manychat: 'Via your Twilio', highlevel: 'Usage-based', salesforce: 'Add-on, higher plans', aircall: 'Mobile numbers; rates on request', dialpad: '250 a month, pooled', ringcentral: 'Since July 2026; bundles extra', krispcall: 'Billed per message', servicem8: 'Customers reply by link', tradify: '20c a text', fresha: 'Automated texts', timely: 'Two-way on Thrive', mindbody: 'Via AI Concierge' } },
    { label: 'WhatsApp', colvy: COMING_SOON.whatsapp ? 'Coming soon' : true, v: { birdeye: true, coax: true, intercom: 'Usage-based', gladly: true, manychat: true, highlevel: 'Add-on', salesforce: 'Add-on, higher plans', aircall: 'Add-on', fresha: 'Automated messages' } },
    { label: 'Instagram DMs', v: { ...ALL_T(true), highlevel: true, salesforce: 'Custom build' } },
    { label: 'Facebook Messenger', v: { ...ALL_T(true), highlevel: true, salesforce: 'Add-on, higher plans', mindbody: 'Messenger[ai]' } },
    { label: 'Email inbox (Gmail or any mailbox)', v: { podium: true, birdeye: 'Marketing', coax: true, gorgias: true, zendesk: true, freshdesk: true, intercom: true, gladly: true, manychat: 'Basic', highlevel: true, salesforce: true, dialpad: 'Separate Support product', servicem8: 'Job emails; inbox from Growing', tradify: 'Enquiry inbox (Pro)' } },
    { label: 'Phone calls & voicemail', v: { podium: true, birdeye: 'Partial', coax: 'Add-on', gorgias: 'Add-on', zendesk: true, freshdesk: 'Add-on', intercom: 'Usage-based', gladly: true, manychat: false, highlevel: 'Usage-based', salesforce: 'Add-on, higher plans', aircall: true, dialpad: true, ringcentral: true, krispcall: true, servicem8: 'Phone add-on', fresha: 'AI Concierge add-on' } },
    { label: 'Google reviews', v: { podium: true, birdeye: true, coax: true, gorgias: false, zendesk: false, freshdesk: false, intercom: false, gladly: false, manychat: false, highlevel: true, servicem8: 'Review requests', fresha: true, timely: 'Requests (Boost+)' } },
    { label: 'Live chat widget', v: { ...ALL_T(true), highlevel: true, salesforce: 'Pro Suite', dialpad: 'Separate Support product', servicem8: 'Third-party add-on', mindbody: 'AI Concierge web chat' } },
  ] },
  { group: 'AI', rows: [
    { label: 'AI agents that answer on their own', colvy: 'Five, included', v: { podium: 'Paid add-on', birdeye: 'Quote-based', coax: 'Voice: all plans; chat: Enterprise', gorgias: 'Per interaction', zendesk: 'Allowance, then per resolution', freshdesk: 'Per session', intercom: 'Per outcome (Fin)', gladly: 'Per resolution or quote', manychat: 'Manychat AI', highlevel: 'Add-on or per use', salesforce: 'Higher plans, usage-based', aircall: 'Voice agents from A$150/mo', ringcentral: 'AI Receptionist, A$62/mo', servicem8: 'AI Phone Agent (Phone add-on)', fresha: 'AI Concierge add-on', mindbody: 'AI Concierge: Growth, or Core add-on' } },
    { label: 'Name and style each AI agent', v: { podium: 'Name', gorgias: 'Name', zendesk: 'Name', freshdesk: true, intercom: true, gladly: 'Name', highlevel: true, salesforce: 'Higher plans' } },
    { label: 'Call summaries, to-dos & transcripts', v: { podium: true, coax: 'Add-on', gladly: 'Add-on', manychat: false, highlevel: 'Usage-based (Labs)', salesforce: 'Video meetings; calls on higher plans', aircall: 'Professional, or add-on', dialpad: true, ringcentral: 'Depends on plan', krispcall: 'Paid AI add-on', servicem8: 'Recording & transcripts (Phone add-on)', fresha: 'AI Concierge calls' } },
    { label: 'AI campaign builder (audience, copy, timing)', v: { highlevel: 'Email (beta)', salesforce: 'Marketing Cloud add-on', timely: 'AI campaign copy' } },
    { label: 'AI voice typing', v: {} },
  ] },
  { group: 'Sell & deliver', rows: [
    { label: 'WooCommerce orders beside each chat', hide: NEW_FIVE, colvy: 'Woo + Shopify', v: { podium: 'Via Zapier', coax: 'Coming soon', gorgias: true, zendesk: 'Via apps', freshdesk: 'Via apps', intercom: 'Via third-party', manychat: 'Via Zapier' } },
    { label: '“Where’s my order?” automation', hide: NEW_FIVE, v: { coax: true, gorgias: true, highlevel: 'Shipping alerts', salesforce: 'Higher plans, usage-based' } },
    { label: 'POS / ERP integrations', hide: NEW_FIVE, v: { podium: 'Limited', birdeye: 'Limited', coax: true, gorgias: 'Via integrations', zendesk: 'Limited', freshdesk: 'Limited', intercom: 'Limited', gladly: 'Limited', manychat: 'Limited', highlevel: 'Square, QuickBooks', salesforce: 'Via AppExchange (Pro)' } },
    { label: 'Payment links in the chat', v: { podium: true, birdeye: true, coax: true, manychat: 'Buy button (Pro)', highlevel: true, salesforce: 'In email & storefront' } },
    { label: 'Delivery scheduling from the chat', hide: NEW_FIVE, v: {} },
    { label: 'Back-in-stock waitlists & restock texts', hide: NEW_FIVE, v: {} },
    { label: 'Online booking, deposits & reminders', v: { podium: 'Some industries', birdeye: true, coax: 'Via integrations', zendesk: 'Via apps', freshdesk: 'Via apps', intercom: 'Via apps', highlevel: true, salesforce: 'Meeting scheduling', servicem8: true, tradify: 'Enquiry form; reminders (Pro)', fresha: true, timely: true, mindbody: 'Booking & reminders' } },
  ] },
  { group: 'Marketing', rows: [
    { label: 'Email & SMS campaigns', colvy: 'Email + SMS', v: { podium: 'SMS', birdeye: true, coax: 'SMS + Messenger', zendesk: 'Via apps', freshdesk: 'WhatsApp app', intercom: true, gladly: 'Proactive, not marketing', manychat: 'Email; AU SMS via Twilio', highlevel: 'Usage-based', salesforce: 'Email; SMS add-on', servicem8: 'Mailchimp sync', fresha: 'Charged per message', timely: 'SMS (Boost+); email via Mailchimp', mindbody: 'Growth plan only' } },
    { label: 'Campaign reports in orders & revenue', hide: NEW_FIVE, v: { highlevel: 'Email only', salesforce: 'Pipeline revenue' } },
    { label: 'Scheduled replies (edit, send now or cancel)', v: { podium: true, birdeye: true, coax: true, zendesk: 'Add-on', manychat: 'Broadcasts only', highlevel: 'Schedule & cancel', salesforce: 'Email send-later' } },
    { label: 'Polls & surveys', v: { birdeye: true, intercom: true, gorgias: 'CSAT', zendesk: 'CSAT', freshdesk: 'CSAT', highlevel: true, salesforce: 'Add-on, higher plans' } },
  ] },
  { group: 'Team & self-service', rows: [
    { label: 'Help centre / knowledge base', v: { ...HELPDESKS_T, salesforce: 'Knowledge base; help centre on higher plans' } },
    { label: 'iOS & Android app', v: { podium: true, birdeye: true, coax: true, gorgias: true, zendesk: true, freshdesk: true, intercom: true, gladly: 'Mobile browser', manychat: true, highlevel: true, salesforce: true, krispcall: true, servicem8: true, tradify: true, fresha: true, timely: true, mindbody: true } },
    { label: 'Team notes', v: { ...HELPDESKS_T, highlevel: true, salesforce: true } },
    { label: 'Tasks & reminders', v: { highlevel: true, salesforce: true, servicem8: 'Job checklists & tasks', tradify: 'Job tasks (Plus)' } },
    { label: 'Shared calendar', v: { highlevel: true, servicem8: 'Job schedule', tradify: 'Job schedule', fresha: 'Appointment calendar', timely: 'Appointment calendar', mindbody: 'Class & appointment schedule' } },
    { label: 'Shared media gallery, photo markup & video trimming', v: { highlevel: 'Media + image editor', salesforce: 'File sharing', servicem8: 'Job photos & videos', tradify: 'Job photos (Pro)' } },
  ] },
  { group: 'Product feedback', hide: NEW_FIVE, rows: [
    { label: 'Ideas & feedback board', v: { podium: false, birdeye: false, coax: false, gorgias: false, intercom: false, gladly: false, manychat: false, salesforce: 'Higher plans (Experience Cloud)' } },
    { label: 'Public roadmap', v: ALL_T(false) },
    { label: 'Announcements / changelog', v: { ...ALL_T(false), intercom: true } },
  ] },
  { group: 'Local', rows: [
    { label: 'Australian 🇦🇺 phone numbers', v: { podium: true, coax: true, zendesk: 'Limited', manychat: 'Via your Twilio', highlevel: true, salesforce: 'Add-on, higher plans', aircall: 'Local & mobile', dialpad: 'Local, mobile & 1800', ringcentral: 'Local, 1300 & 1800', krispcall: 'Local, mobile & 1800', servicem8: 'Phone add-on' } },
  ] },
]

type Cmp = {
  name: string; accent: string; heroTitle: string; heroAccent: string; heroSub: string
  stats: { big: string; label: string }[]
  tableNote: string
  wins: { t: string; d: string }[]
  checklist: string[]
}

const CMP: Record<string, Cmp> = {
  // Job apps for trades and cleaners. From each vendor's Australian pricing,
  // feature and help pages (servicem8.com/au, tradifyhq.com/au), checked 14
  // November 2026. ServiceM8 prices are AUD with GST; Tradify's are AUD per
  // user before GST.
  servicem8: {
    name: 'ServiceM8', accent: BLUE, heroTitle: 'The ServiceM8 alternative with', heroAccent: 'every customer chat in one place', heroSub: 'ServiceM8 is job management software for tradies, with plans priced by how many jobs you do each month. Colvy runs your quotes, jobs, invoices and repeating work from the same inbox as your calls, texts, emails, website chat, Instagram and Messenger, with no cap on jobs.',
    stats: [{ big: 'No', label: 'cap on jobs a month' }, { big: '3,000', label: 'SMS a month included' }, { big: '5', label: 'AI agents in the plan' }],
    tableNote: 'ServiceM8 is a mature job app for trades: quoting, scheduling, checklists, photos, signatures, recurring jobs, and sync with Xero, QuickBooks Online and MYOB, which Colvy doesn’t have. Its column shows its Australian pricing and feature pages on servicem8.com. Colvy is built around the conversation: every channel in one inbox, with the quote, job and invoice beside it.',
    wins: [
      { t: 'No cap on jobs', d: 'ServiceM8’s plans are priced by jobs a month: 50 on Starter ($29), 150 on Growing ($79), 500 on Premium ($149) and 1,500+ on Premium Plus ($349), in AUD with GST. Colvy doesn’t count jobs: quote, schedule and invoice as many as you win.' },
      { t: 'Texts included, with real replies', d: 'ServiceM8’s two-way SMS sends each text with a “Reply here” link to a web page. In Colvy, customers simply reply to your text. Colvy’s Inbox plan includes 3,000 SMS a month for A$179, GST included; ServiceM8 includes 3,000 on Premium Plus, at $349.' },
      { t: 'Every channel in one inbox', d: 'Calls, texts, email, live chat on your website, Instagram and Messenger land in one Colvy inbox, beside the customer’s quotes and jobs. ServiceM8 lists website chat as a third-party add-on with its own fees.' },
      { t: 'AI that answers for you', d: 'ServiceM8’s Office Agent Pro is $49 a month, and its AI Phone Agent comes with the Connect Plus phone plan. Colvy’s Inbox plan includes five AI agents that answer questions, take bookings and ask for reviews, within limits you set.' },
      { t: 'Invoices that chase themselves', d: 'Send the invoice for the balance by text or email, with the deposit already taken off. Customers pay by card online, and if it’s still unpaid, Colvy texts a reminder 1, 7 and 14 days after the due date.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD with GST included. Cancel anytime.' },
    ],
    checklist: ['Quotes customers accept online, with a deposit', 'Jobs with checklists, photos, time and signatures', 'Invoices paid online, with automatic reminders', 'Repeating jobs: weekly, fortnightly, monthly', 'Calls, SMS, email, chat and social in one inbox', 'Online booking with deposits and reminders', 'Five AI agents included', 'No lock-in contracts — cancel anytime'],
  },
  tradify: {
    name: 'Tradify', accent: CYAN, heroTitle: 'The Tradify alternative with', heroAccent: 'one price for the whole crew', heroSub: 'Tradify is job management software for tradies, priced per user. Colvy gives your whole team quotes, jobs, invoices and repeating work, in the same inbox as your calls, texts, emails, website chat, Instagram and Messenger, at one AUD price.',
    stats: [{ big: '1', label: 'price for the whole team' }, { big: '3,000', label: 'SMS a month included' }, { big: 'A$179', label: 'a month, GST included' }],
    tableNote: 'Tradify is built for tradies, with quoting, scheduling, timesheets, progress invoicing, recurring jobs on Pro, and sync with QuickBooks Online, Xero and MYOB, which Colvy doesn’t have. Its column shows its Australian pricing and feature pages on tradifyhq.com. Colvy adds every customer channel in one inbox, with the quote, job and invoice beside the conversation.',
    wins: [
      { t: 'One price for the whole crew', d: 'Tradify is priced per user: $52 AUD a user a month on Pro, before GST, so a team of five pays $260 a month plus GST. Colvy’s Inbox plan is one price for unlimited team members: A$179 a month, or A$149 a month billed yearly, GST included.' },
      { t: 'Texts included', d: 'Texts from Tradify cost 20c each. Colvy’s Inbox and Everything plans include 3,000 SMS a month, then prepaid credits from A$0.15 a text.' },
      { t: 'Customers book themselves', d: 'Tradify’s enquiry form brings requests in for you to schedule. Colvy adds a booking page where customers pick a time for a service at their address, pay a deposit if you ask for one, and get reminders.' },
      { t: 'Every channel in one inbox', d: 'Calls, texts, email, live chat on your website, Instagram and Messenger land in one Colvy inbox, beside the customer’s quotes and jobs.' },
      { t: 'Repeating jobs and AI in one plan', d: 'Tradify’s recurring jobs start on Pro, and its SmartTools AI is on Plus only. Colvy’s repeating jobs, invoices with automatic reminders and five AI agents all come with the Inbox plan.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD with GST included. Cancel anytime.' },
    ],
    checklist: ['Quotes customers accept online, with a deposit', 'Jobs with checklists, photos, time and signatures', 'Invoices paid online, with automatic reminders', 'Repeating jobs: weekly, fortnightly, monthly', 'Customers book online, at their address', 'Calls, SMS, email, chat and social in one inbox', 'One price for unlimited team members, GST included', 'No lock-in contracts — cancel anytime'],
  },
  // Booking apps for salons, clinics and gyms. From each vendor's own pricing,
  // feature and help pages, checked 14 November 2026: Timely's Australian
  // prices (ex GST) and Mindbody's /en-au pages. fresha.com showed us US
  // pricing, so the Fresha copy names no AUD price.
  fresha: {
    name: 'Fresha', accent: PURPLE, heroTitle: 'The Fresha alternative with', heroAccent: 'no fees on new clients', heroSub: 'Fresha is booking software for salons, spas and clinics, with a marketplace that charges a fee when it brings you a new client. Colvy gives you a booking page, packs and memberships, and every client channel in one inbox: texts, calls, email, website chat, Instagram and Messenger.',
    stats: [{ big: '$0', label: 'new-client fees' }, { big: '3,000', label: 'SMS a month included' }, { big: '1', label: 'price for the whole team' }],
    tableNote: 'Fresha is a full booking platform: online booking with deposits, memberships and packages, Google review replies in every plan, and Xero and QuickBooks connections. Its column shows fresha.com, which showed us US pricing, so check Fresha’s Australian prices. Colvy adds two-way texting, calls, email, live chat and social in one inbox, at one AUD price for the team.',
    wins: [
      { t: 'No fees on new clients', d: 'When a new client finds you on Fresha’s marketplace, Fresha charges a one-time fee: 20%, with a $6 minimum, on the pricing page we saw. Colvy doesn’t run a marketplace, so it never charges you for a new client.' },
      { t: 'Texts included', d: 'Fresha includes 100 automated texts a month (per team member on its Team plan), then charges for each one, and charges for every marketing text. Colvy’s Inbox plan includes 3,000 SMS a month, then prepaid credits from A$0.15 a text.' },
      { t: 'Real two-way texting', d: 'Fresha’s client chat runs in the Fresha app. With Colvy, clients text your Australian number, call it, email, chat on your website or message you on Instagram and Messenger, and your team answers it all from one inbox.' },
      { t: 'AI agents included', d: 'Fresha’s AI Concierge is an add-on, priced per location. Colvy’s Inbox plan includes five AI agents that answer questions, take bookings and ask for reviews, within limits you set.' },
      { t: 'One price for the team', d: 'Fresha’s Team plan is priced per team member. Colvy’s Inbox plan is one price for unlimited team members: A$179 a month, or A$149 a month billed yearly, GST included.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD with GST included. Cancel anytime.' },
    ],
    checklist: ['Online booking with deposits and reminders', 'Packs and memberships that renew automatically', 'Repeat appointments in one go', 'Calls, SMS, email, chat and social in one inbox', 'Review requests and Google review replies', 'Client accounts for bookings and passes', 'Five AI agents included', 'No marketplace fees on new clients'],
  },
  timely: {
    name: 'Timely', accent: PINK, heroTitle: 'The Timely alternative with', heroAccent: 'every channel in one inbox', heroSub: 'Timely is booking and payment software for hair and beauty businesses. Colvy gives you online booking, deposits, packs and memberships, plus two-way texting, calls, email, website chat, Instagram and Messenger in one inbox, at one AUD price for the team.',
    stats: [{ big: '1', label: 'inbox for every channel' }, { big: '3,000', label: 'SMS a month included' }, { big: '5', label: 'AI agents included' }],
    tableNote: 'Timely is a popular booking system for salons, with online booking and deposits on every plan, unlimited team members, no new-client fees, and Xero and QuickBooks on its Thrive plan. Its column shows its Australian pricing and feature pages on gettimely.com. Colvy adds two-way texting, calls, email, live chat and social in one inbox, with packs and memberships on your booking page.',
    wins: [
      { t: 'Two-way texting, included', d: 'Timely’s dedicated number for two-way texts is on its Thrive plan. In Colvy, clients text your Australian number and your team replies from the shared inbox, with 3,000 SMS a month on the Inbox plan.' },
      { t: 'Texts to use your way', d: 'Timely includes one to three texts per booking, depending on the plan, then charges for extras. Colvy’s 3,000 SMS a month go wherever you need them: reminders, replies or campaigns.' },
      { t: 'Every channel in one inbox', d: 'Timely adds booking buttons to Instagram, Facebook and Messenger. Colvy brings the messages in too: calls, texts, email, live chat on your website, Instagram and Messenger, all answered from one inbox.' },
      { t: 'Packs and memberships', d: 'Sell packs (“10 visits for $150”) and memberships that renew automatically, from your booking page and paid into your own Stripe account. Clients use them when they book and see what’s left in their account.' },
      { t: 'AI agents that answer for you', d: 'Colvy’s Inbox plan includes five AI agents that answer questions, take bookings and ask for reviews, within limits you set, and hand over to your team when they should.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD with GST included. Cancel anytime.' },
    ],
    checklist: ['Online booking with deposits and reminders', 'Packs and memberships that renew automatically', 'Repeat appointments in one go', 'Two-way texts on your Australian number', 'Calls, SMS, email, chat and social in one inbox', 'Review requests and Google review replies', 'Five AI agents included', 'No lock-in contracts — cancel anytime'],
  },
  mindbody: {
    name: 'Mindbody', accent: INDIGO, heroTitle: 'The Mindbody alternative with', heroAccent: 'campaigns and AI in one plan', heroSub: 'Mindbody is business software for fitness, wellness and beauty, priced per location, with email and SMS marketing on its top plan. Colvy gives gyms and studios class booking, class packs, memberships, campaigns and five AI agents, with every channel in one inbox, at one AUD price.',
    stats: [{ big: 'A$179', label: 'a month, GST included' }, { big: '5', label: 'AI agents included' }, { big: '3,000', label: 'SMS a month included' }],
    tableNote: 'Mindbody is a deep studio platform: class scheduling, memberships and class packs with autopay, a branded app add-on and the Mindbody marketplace app. Its column shows its Australian pricing and feature pages on mindbodyonline.com. Colvy keeps classes, packs and memberships in the same place as every conversation with your members.',
    wins: [
      { t: 'Campaigns without the top plan', d: 'Mindbody includes email and SMS marketing on its Growth plan, A$369 a month per location. Colvy’s Inbox plan includes email and SMS campaigns and 3,000 texts a month, for A$179 a month, or A$149 billed yearly, GST included.' },
      { t: 'AI included', d: 'Mindbody’s AI Concierge is included on Growth, an add-on on Core, and not offered on Go. Colvy’s Inbox plan includes five AI agents that answer questions, take bookings and ask for reviews, within limits you set.' },
      { t: 'Class packs and memberships', d: 'Sell “10 classes for $150” packs and memberships that renew automatically, from your booking page and paid into your own Stripe account. Members use them when they book, and see classes left and their next renewal in their account.' },
      { t: 'No fees on new members', d: 'When a new client first buys through the Mindbody app, Mindbody charges a 20% fee, with a cap. Colvy doesn’t run a marketplace, so it never charges you for a new client.' },
      { t: 'Every channel in one inbox', d: 'Calls, texts, email, live chat on your website, Instagram and Messenger land in one Colvy inbox, so your front desk answers members from one place.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD with GST included. Cancel anytime.' },
    ],
    checklist: ['Class timetable with online booking', 'Class packs and memberships that renew automatically', 'Members see classes left in their account', 'Email and SMS campaigns, 3,000 texts a month', 'Calls, SMS, email, chat and social in one inbox', 'Review requests and Google review replies', 'Five AI agents included', 'No lock-in contracts — cancel anytime'],
  },
  // KrispCall: from its plans, pricing and help pages on krispcall.com and
  // help.krispcall.com, checked 13 November 2026. Its prices are shown with a
  // plain "$", so the copy doesn't name a currency for them.
  krispcall: {
    name: 'KrispCall', accent: TEAL, heroTitle: 'The KrispCall alternative with', heroAccent: 'one price for the whole team', heroSub: 'KrispCall is a cloud phone system priced per user, with calls and texts billed per minute and per message on its Starter and Advance plans. Colvy puts your Australian business number in a shared inbox with SMS, email, live chat and social, at one AUD price for the team, with 3,000 texts a month included.',
    stats: [{ big: '1', label: 'price for the whole team' }, { big: '3,000', label: 'SMS a month included' }, { big: 'A$35', label: 'for just a business number' }],
    tableNote: 'KrispCall is a cloud phone system with Australian local, mobile and 1800 numbers, call recording on every plan, and phone trees (IVR) and call transfer from its Advance plan. Its column shows its plans and help pages on krispcall.com. Colvy adds texting, email, live chat and social in the same inbox, at one price for the team.',
    wins: [
      { t: 'One price for the whole team', d: 'KrispCall prices each user: Starter is $15 a user a month ($12 billed annually) for up to 5 users, and Advance is $40 ($32 billed annually) for up to 50. Colvy’s Inbox plan is one price for unlimited team members: A$179 a month, or A$149 a month billed yearly, GST included.' },
      { t: 'Texts included', d: 'On KrispCall’s Starter and Advance plans, calls and texts are billed per minute and per message; its Max plan includes 1,000 SMS segments a user a month for US and Canadian numbers. Colvy’s Inbox and Everything plans include 3,000 SMS a month, then prepaid credits from A$0.15 a text.' },
      { t: 'Press-1 menus without the upgrade', d: 'KrispCall’s phone trees (IVR) and call transfer start on its Advance plan. Colvy’s press-1 menu, with an after-hours menu, is part of call routing on the Inbox and Everything plans.' },
      { t: 'Call summaries in the plan', d: 'KrispCall’s call transcription and AI summaries are part of a paid AI add-on. Colvy records, transcribes and summarises calls on the Inbox and Everything plans, and drafts the follow-up tasks for you.' },
      { t: 'Just need a number?', d: 'Colvy’s Business number plan is A$35 a month: one Australian local or mobile number that forwards to your mobile, voicemail, every call in the Colvy app, and 100 call minutes included, then 20c a minute.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD with GST included. Cancel anytime.' },
    ],
    checklist: ['Calls, SMS, email, social and live chat in one inbox', 'One price for unlimited team members, GST included', '3,000 SMS a month included', 'Call recording, transcripts and AI summaries', 'Press-1 menus, forwarding and ring groups', 'AI receptionist and five AI agents', 'Australian 🇦🇺 numbers, support and AUD pricing', 'No lock-in contracts — cancel anytime'],
  },
  // Phone systems. Facts from each vendor's own Australian pricing, feature
  // and help pages, checked 13 November 2026.
  aircall: {
    name: 'Aircall', accent: GREEN, heroTitle: 'The Aircall alternative built for', heroAccent: 'the whole conversation', heroSub: 'Aircall is a cloud phone system priced per licence, with a three-licence minimum. Colvy puts your business number in a shared inbox with SMS, email, live chat and social, with call summaries and an AI receptionist, at one AUD price for the team.',
    stats: [{ big: '1', label: 'price for the whole team' }, { big: '3,000', label: 'SMS a month included' }, { big: 'AUD', label: 'GST included' }],
    tableNote: 'Aircall is a capable cloud phone system, with IVR, forwarding, warm transfers and call recording on every plan. Its column shows the Essentials and Professional plans on aircall.io/en-au. Colvy adds texting, email, live chat and social in the same inbox, at one price for the team.',
    wins: [
      { t: 'One price for the whole team', d: 'Aircall prices each licence, with a minimum of three: from A$45 per licence a month, billed annually. Colvy’s Inbox plan is one price for unlimited team members: A$179 a month, or A$149 a month billed yearly, GST included.' },
      { t: 'Texts included', d: 'In Australia, Aircall can text only from mobile numbers, and outbound SMS is charged per segment at rates on request. Colvy’s Inbox and Everything plans include 3,000 SMS a month, then prepaid credits from A$0.15 a text.' },
      { t: 'Call summaries in the plan', d: 'Aircall includes AI call summaries from its Professional plan (A$75 per licence a month); on Essentials they’re an add-on. Colvy records, transcribes and summarises calls on the Inbox and Everything plans.' },
      { t: 'Every channel, one inbox', d: 'Calls sit beside SMS, email, live chat, Instagram and Messenger, with the customer’s orders and bookings in the same conversation.' },
      { t: 'An AI receptionist in the plan', d: 'Aircall’s AI Voice Agents start from A$150 a month. Colvy’s Inbox plan comes with the AI receptionist; its calls use your metered call minutes like any other call.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD with GST included. Cancel anytime.' },
    ],
    checklist: ['Calls, SMS, email, social and live chat in one inbox', 'One price for unlimited team members, GST included', '3,000 SMS a month included', 'Call recording, transcripts and AI summaries', 'Press-1 menus, forwarding and ring groups', 'AI receptionist and five AI agents', 'Australian 🇦🇺 numbers, support and AUD pricing', 'No lock-in contracts — cancel anytime'],
  },
  dialpad: {
    name: 'Dialpad', accent: PURPLE, heroTitle: 'The Dialpad alternative with', heroAccent: 'every channel in one inbox', heroSub: 'Dialpad’s phone system is priced per user, and its live chat and digital channels are a separate product. Colvy puts calls, SMS, email, live chat and social in one shared inbox, with store orders and AI agents, at one AUD price for the team.',
    stats: [{ big: '1', label: 'inbox for every channel' }, { big: '3,000', label: 'SMS a month included' }, { big: 'AUD', label: 'one price, GST included' }],
    tableNote: 'Dialpad includes AI transcripts and call recaps on every phone plan, and offers Australian local, mobile and 1800 numbers. Its column shows Dialpad Connect, its phone system, on dialpad.com/au. Colvy adds texting, email, live chat, social and store orders in the same inbox, at one price for the team.',
    wins: [
      { t: 'One price, not per user', d: 'Dialpad’s phone system is priced per user: from A$20 a user a month billed annually, or A$32 monthly, on Standard. Colvy’s Inbox plan is one price for unlimited team members: A$179 a month, or A$149 a month billed yearly, GST included.' },
      { t: 'Chat and email in the same inbox', d: 'On Dialpad, live chat and other digital channels are part of its separate Support product, from A$99 per user a month billed annually. Colvy’s Inbox plan has calls, SMS, email, live chat, Instagram and Messenger in one inbox.' },
      { t: 'More texts included', d: 'Dialpad’s phone plans list 250 outbound SMS a month, pooled across the account. Colvy’s Inbox and Everything plans include 3,000 SMS a month, then prepaid credits from A$0.15 a text.' },
      { t: 'Store orders beside every call', d: 'WooCommerce and Shopify orders sit next to the conversation, so whoever answers sees what the caller bought, with delivery scheduling from the same thread.' },
      { t: 'Reviews and feedback built in', d: 'Reply to Google reviews from the inbox, and run an ideas board, public roadmap and announcements for your customers.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD with GST included. Cancel anytime.' },
    ],
    checklist: ['Calls, SMS, email, social and live chat in one inbox', 'One price for unlimited team members, GST included', '3,000 SMS a month included', 'Call recording, transcripts and AI summaries', 'WooCommerce and Shopify orders beside every chat', 'AI receptionist and five AI agents', 'Australian 🇦🇺 numbers, support and AUD pricing', 'No lock-in contracts — cancel anytime'],
  },
  ringcentral: {
    name: 'RingCentral', accent: CORAL, heroTitle: 'The RingCentral alternative for', heroAccent: 'small Australian teams', heroSub: 'RingCentral’s RingEX is a business phone platform priced per user, with prices shown before GST. Colvy puts your number in a shared inbox with SMS, email, live chat and social, with an AI receptionist and call summaries, at one AUD price with GST included.',
    stats: [{ big: '1', label: 'price for the whole team' }, { big: '3,000', label: 'SMS a month included' }, { big: 'GST', label: 'included in our prices' }],
    tableNote: 'RingCentral is a large business phone platform with local, 1300 and 1800 numbers and plans priced per user. Its column shows RingEX on ringcentral.com/au. Colvy adds texting, email, live chat, social and store orders in the same inbox, at one price for the team.',
    wins: [
      { t: 'One price, GST included', d: 'RingEX is priced per user and by team size, from A$22.99 per user a month on Essentials billed annually, with prices shown before GST. Colvy’s Inbox plan is one price for unlimited team members: A$179 a month, or A$149 a month billed yearly, GST included.' },
      { t: 'Texting included', d: 'RingCentral launched domestic SMS in Australia in July 2026, on SMS-capable licences and mobile numbers, with SMS bundles sold separately. Colvy’s Inbox and Everything plans include 3,000 SMS a month.' },
      { t: 'An AI receptionist in the plan', d: 'RingCentral’s AI Receptionist is A$62 a month for the account with 100 minutes, then A$0.80 a minute. Colvy’s Inbox plan comes with the AI receptionist; its calls use your metered call minutes like any other call.' },
      { t: 'Press-1 menus on the Inbox plan', d: 'On RingEX, multi-level IVR starts from the Standard plan. Colvy’s press-1 menu, with an after-hours menu, is part of call routing on the Inbox and Everything plans.' },
      { t: 'Every channel, one inbox', d: 'Calls sit beside SMS, email, live chat, Instagram and Messenger, with the customer’s orders and bookings in the same conversation.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD with GST included. Cancel anytime, with no annual contract.' },
    ],
    checklist: ['Calls, SMS, email, social and live chat in one inbox', 'One price for unlimited team members, GST included', '3,000 SMS a month included', 'Call recording, transcripts and AI summaries', 'Press-1 menus, forwarding and ring groups', 'AI receptionist and five AI agents', 'Australian 🇦🇺 numbers, support and AUD pricing', 'No lock-in contracts — cancel anytime'],
  },
  podium: {
    name: 'Podium', accent: GREEN, heroTitle: 'The Podium alternative built for', heroAccent: 'Australian 🇦🇺 business', heroSub: 'More channels, AI that learns from every chat, Australian support and real results — everything Podium locks behind contracts and add-ons, Colvy includes.',
    stats: [{ big: 'No', label: 'lock-in contracts' }, { big: 'Every', label: 'channel included' }, { big: '45 min', label: 'to set up' }],
    tableNote: 'Colvy covers more channels, deeper AI and genuine Australian 🇦🇺 support.',
    wins: [
      { t: 'One conversation, nothing siloed', d: 'Every channel lives in one thread per customer — SMS, calls, email, Instagram, Messenger, reviews. Not separate inboxes.' },
      { t: 'Email and SMS campaigns', d: 'Build a campaign with Colvy AI, send it by text and email, and see who clicked, replied and ordered. Replies land in the same inbox.' },
      { t: 'An AI team, included', d: 'Five AI agents for support, bookings, sales follow-ups, late orders and reviews are part of the plan, start as drafts and check your real orders and calendar first.' },
      { t: 'Australian 🇦🇺 support team', d: 'Talk to real people in Australia, during Australian business hours, with pricing in AUD.' },
      { t: 'Save thousands a year', d: 'No long contracts, no hidden fees, cancel anytime — fair pricing at any size.' },
      { t: 'Better review results', d: 'AI-powered review requests hit at exactly the right moment to grow your Google rating.' },
    ],
    checklist: ['Contacts and channels moved across for you', 'SMS and webchat work exactly how you expect', 'Google Review requests, better timed', 'Phone calls with AI transcription & summaries', 'Instagram, Messenger and email in the same inbox', 'Colvy AI answers mundane and complex questions 24/7', 'Australian 🇦🇺 support team when you need them', 'No long-term contracts — cancel anytime'],
  },
  gorgias: {
    name: 'Gorgias', accent: PURPLE, heroTitle: 'The Gorgias alternative built for', heroAccent: 'Australian 🇦🇺 business', heroSub: 'More than a helpdesk. Every channel, five AI agents in the plan, Google reviews, email and SMS campaigns, payments and an Australian support team, in one place.',
    stats: [{ big: '5 AI agents', label: 'included in the plan' }, { big: 'All-in-one', label: 'not just tickets' }, { big: '45 min', label: 'to set up' }],
    tableNote: 'Colvy goes beyond helpdesk tickets with full communications, AI and Australian 🇦🇺 support.',
    wins: [
      { t: 'More than a helpdesk', d: 'Gorgias is a support ticket system. Colvy covers sales, support, marketing, reviews and payments in one place.' },
      { t: 'Real phone calls, not add-ons', d: 'Calls, voicemail and call intelligence are included natively. Gorgias treats phone as a paid add-on.' },
      { t: 'Google Reviews built in', d: 'Automate review requests and respond from the inbox. Gorgias has no review management.' },
      { t: 'AI agents in the plan', d: 'Colvy’s five AI agents are included, not charged per automated interaction, and they check orders, stock and tracking before they reply.' },
      { t: 'Email and SMS campaigns built in', d: 'Sales, new stock and win-backs by text and email, built with Colvy AI, with reports in orders and revenue. No separate marketing tool needed.' },
      { t: 'Australian 🇦🇺 numbers and support', d: 'Texts and calls on Australian numbers, a support team in Australia and pricing in AUD.' },
    ],
    checklist: ['Every customer gets one conversation thread', 'Phone, SMS, email and social in the same inbox', 'Google Review requests automated after every order', 'Five AI agents included, starting as drafts', 'Call summaries, to-dos and transcripts on every call', 'Email and SMS campaigns with revenue reports', 'Orders beside every chat for WooCommerce and Shopify', 'No long-term contracts — cancel anytime'],
  },
  freshdesk: {
    name: 'Freshdesk', accent: CYAN, heroTitle: 'The Freshdesk alternative that', heroAccent: 'does it all', heroSub: 'Freshdesk is a helpdesk with phone and AI as paid extras. Colvy is a complete communication platform with every channel, five AI agents, Google reviews, campaigns, payments and Australian support in one plan.',
    stats: [{ big: 'Every', label: 'channel included' }, { big: '$0', label: 'add-on fees' }, { big: '45 min', label: 'to set up' }],
    tableNote: 'Freshdesk adds phone and its AI agent as paid extras. Colvy includes every channel and the AI agents in one plan.',
    wins: [
      { t: 'All channels included, no add-ons', d: 'Phone is a paid add-on on Freshdesk. Colvy includes calls, SMS, social, email and chat in one plan.' },
      { t: 'Google Reviews built in', d: 'Automate requests and respond from the same inbox. Freshdesk has no review management.' },
      { t: 'AI agents in the plan', d: 'Freshdesk’s AI agent is priced per session. Colvy’s five AI agents are included, and they check orders, tracking and your calendar before they reply.' },
      { t: 'Call intelligence included', d: 'Every call summarised, with suggested to-dos, a recording and a transcript, right in the customer’s conversation.' },
      { t: 'Email and SMS campaigns', d: 'Send sales and updates by text and email, built with Colvy AI, and see who clicked, replied and ordered.' },
      { t: 'Australian 🇦🇺 support team', d: 'Real humans in Australia who understand your market.' },
    ],
    checklist: ['Phone, SMS, email and social all included', 'Google Reviews automated and managed in one place', 'AI assistant handles WISMO and common questions 24/7', 'Call intelligence transcribes and summarises every call', 'Secure payment links, PCI-compliant', 'Integrations with WooCommerce, Shopify, Stripe and more', 'Australian 🇦🇺 support team available when you need them', 'No per-agent pricing — add your whole team'],
  },
  zendesk: {
    name: 'Zendesk', accent: BLUE, heroTitle: 'The Zendesk alternative built for', heroAccent: 'Australian 🇦🇺 business', heroSub: 'Threads, not tickets. Every channel and five AI agents included. Set up in 45 minutes, not weeks. Colvy replaces Zendesk with simplicity, speed and AI.',
    stats: [{ big: 'Threads', label: 'not tickets' }, { big: '45 min', label: 'setup vs weeks' }, { big: '$0', label: 'add-on fees' }],
    tableNote: 'Zendesk charges for AI resolutions beyond an allowance, and for numbers and minutes. Colvy includes the AI agents and 3,000 texts a month in the plan.',
    wins: [
      { t: 'Threads, not tickets', d: 'Zendesk forces every interaction into a ticket. Colvy gives each customer one conversation thread across all channels.' },
      { t: 'Set up in 45 minutes, not weeks', d: 'Zendesk needs lengthy implementation and training. Colvy gets you set up in a single session.' },
      { t: 'AI agents in the plan', d: 'Zendesk bills AI resolutions past an allowance. Colvy’s five AI agents are included, and every reply starts as a draft until you trust it.' },
      { t: 'Email and SMS campaigns', d: 'Send sales, reminders and win-backs by text and email from the same place you answer customers, with reports in orders and revenue.' },
      { t: 'Google Reviews management', d: 'Automate requests and respond from your inbox. Zendesk has no Google Reviews feature.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and pricing in AUD.' },
    ],
    checklist: ['Every customer gets one conversation thread — no ticket numbers', 'Phone, SMS, social and email in one inbox', 'Five AI agents included, starting as drafts', 'Call summaries, to-dos and transcripts on every call', 'Google Reviews automated and managed in one place', 'Email and SMS campaigns with revenue reports', 'Secure payment links built in', 'Set-up help from the Colvy team'],
  },
  intercom: {
    name: 'Intercom', accent: CORAL, heroTitle: 'The Intercom alternative —', heroAccent: 'true omnichannel', heroSub: 'Intercom is chat-first, bills phone and SMS by usage and charges per AI outcome. Colvy is a true omnichannel platform where every channel and five AI agents are included.',
    stats: [{ big: 'Calls', label: 'built in, not add-on' }, { big: 'Every', label: 'channel included' }, { big: '45 min', label: 'to set up' }],
    tableNote: 'Intercom is built around chat. Colvy is built around every channel your customers use.',
    wins: [
      { t: 'True omnichannel', d: 'Intercom is chat-first and bills phone and SMS by usage. Colvy includes calls, 3,000 texts a month and every other channel in the plan.' },
      { t: 'Calls built in', d: 'Voice, voicemail and call intelligence are included — not a paid add-on.' },
      { t: 'AI agents, not per-outcome fees', d: 'Fin is charged per outcome. Colvy’s five AI agents are included, check your orders and calendar first, and start as drafts for your team.' },
      { t: 'Google Reviews management', d: 'Automate requests and respond from your inbox. Intercom has no review management.' },
      { t: 'Payments in the thread', d: 'Send a link and get paid without leaving the conversation.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, local numbers, pricing in AUD.' },
    ],
    checklist: ['Chat, calls, SMS, social and email all included', 'AI assistant handles common questions and WISMO 24/7', 'Call intelligence transcribes and summarises every call', 'Google Reviews automated and managed in one place', 'Secure payment links built in', 'Integrations with WooCommerce, Shopify, Stripe and more', 'No add-on tax for phone or SMS', 'Set up in about 45 minutes'],
  },
  gladly: {
    name: 'Gladly', accent: PINK, heroTitle: 'The Gladly alternative —', heroAccent: 'without enterprise contracts', heroSub: 'Gladly is built for large, US-centred contact centres. Colvy gives teams of every size the same customer timeline, with Australian 🇦🇺 support, local numbers, campaigns and no lock-in contracts.',
    stats: [{ big: 'Fair', label: 'published pricing' }, { big: 'No', label: 'lock-in contracts' }, { big: '45 min', label: 'to set up' }],
    tableNote: 'Gladly is aimed at large contact centres. Colvy is built in Australia 🇦🇺 for teams of every size.',
    wins: [
      { t: 'Fair pricing', d: 'Fair, flat pricing for teams of every size — no enterprise contracts or minimums unless you want one.' },
      { t: 'No lock-in', d: 'Month-to-month, cancel anytime, with custom terms for larger teams if you want them.' },
      { t: 'Australian 🇦🇺 support & numbers', d: 'Local team, Australian numbers and pricing in AUD.' },
      { t: 'Google Reviews built in', d: 'Automate requests and respond from your inbox. Gladly has no review management.' },
      { t: 'Marketing campaigns, too', d: 'Gladly’s proactive messages aren’t meant for marketing. Colvy sends email and SMS campaigns and reports them in orders and revenue.' },
      { t: 'Live the same afternoon', d: 'Set up in 45 minutes, not a multi-month enterprise rollout.' },
    ],
    checklist: ['Every channel included at fair, published pricing', 'AI assistant handles common questions and WISMO 24/7', 'Call intelligence transcribes and summarises every call', 'Google Reviews automated and managed in one place', 'Secure payment links built in', 'Australian 🇦🇺 support team and local numbers', 'No lock-in contracts — cancel anytime', 'Set up in about 45 minutes'],
  },
  coax: {
    name: 'Coax', accent: TEAL, heroTitle: 'The Coax alternative with a', heroAccent: 'built-in feedback loop', heroSub: 'Everything Coax does for conversations — plus a built-in ideas board, public roadmap and changelog, so your product and comms live in one lively platform.',
    stats: [{ big: '1', label: 'platform for comms + product' }, { big: 'Every', label: 'channel included' }, { big: '45 min', label: 'to set up' }],
    tableNote: 'Colvy matches Coax on conversations — and adds the product-feedback suite Coax doesn’t have.',
    wins: [
      { t: 'A built-in feedback board', d: 'Capture, prioritise and vote on ideas right inside Colvy. Coax has no ideas board.' },
      { t: 'A public roadmap', d: 'Show customers what’s planned, in progress and shipped — build trust in the open. Coax has none.' },
      { t: 'Announcements & changelog', d: 'Post release notes and auto-notify the customers who asked. Tied to the inbox, not a separate tool.' },
      { t: 'The full loop', d: 'Idea → roadmap → announcement, connected to conversations so customers hear back when their idea ships.' },
      { t: 'One platform, one bill', d: 'Run support, sales and your product roadmap in one place instead of bolting on a feedback tool.' },
      { t: 'AI agents for chat and calls, in the plan', d: 'Coax includes AI voice agents on every plan and lists its messaging AI agent on the Enterprise plan. Colvy’s Inbox and Everything plans include five AI agents across chat, social, email and calls.' },
    ],
    checklist: ['SMS, calls, email and social, like Coax', 'Plus a built-in ideas & feedback board', 'A public roadmap customers can follow', 'Announcements & changelog tied to the inbox', 'Polls & surveys to validate decisions', 'Call intelligence on every call', 'Australian 🇦🇺 support and local numbers', 'No lock-in contracts — cancel anytime'],
  },
  manychat: {
    name: 'ManyChat', accent: INDIGO, heroTitle: 'The ManyChat alternative that', heroAccent: 'closes the loop', heroSub: 'ManyChat automates chat-marketing flows. Colvy is a full inbox, CRM, calls and feedback platform — real conversations and real revenue, not just automations.',
    stats: [{ big: 'Inbox', label: '+ CRM, not just flows' }, { big: 'Every', label: 'channel included' }, { big: '45 min', label: 'to set up' }],
    tableNote: 'ManyChat is built for chat-marketing flows. Colvy is a full communication + feedback platform.',
    wins: [
      { t: 'A real shared inbox', d: 'A true team inbox with a CRM profile beside every chat — not just automated flows.' },
      { t: 'Voice calls included', d: 'Calls, voicemail and call intelligence are built in. ManyChat is messaging-only.' },
      { t: 'A feedback suite built in', d: 'Ideas board, roadmap and changelog to build what customers ask for. ManyChat has none.' },
      { t: 'Sell and get paid in chat', d: 'Live orders, payment links and recorded sales — right in the thread.' },
      { t: 'AI agents with live data', d: 'Five AI agents check your real orders, stock and calendar before they reply, and hand anything tricky to your team.' },
      { t: 'Australian 🇦🇺 support', d: 'Local team, local numbers, pricing in AUD.' },
    ],
    checklist: ['A real team inbox with CRM, not just flows', 'Voice calls, voicemail and call intelligence', 'Ideas board, roadmap and changelog built in', 'Payments and recorded sales in the thread', 'AI that reads orders and takes action', 'Google Reviews automated and managed', 'Australian 🇦🇺 support and local numbers', 'No lock-in contracts — cancel anytime'],
  },
  highlevel: {
    name: 'HighLevel', accent: BLUE, heroTitle: 'The HighLevel alternative built for', heroAccent: 'the business itself', heroSub: 'HighLevel is built mainly for marketing agencies that set up and resell accounts for their clients. Colvy is the shared inbox, phone and CRM a business runs itself, with five AI agents, store orders and a customer feedback suite.',
    stats: [{ big: '5', label: 'AI agents in the plan' }, { big: '3,000', label: 'SMS a month included' }, { big: 'AUD', label: 'published pricing' }],
    tableNote: 'HighLevel is broad and agency-first, with calls, SMS, email and AI billed on usage from a prepaid wallet. Colvy is built for the business that talks to the customers, with store orders, deliveries and a feedback suite in the same inbox.',
    wins: [
      { t: 'Built for your business, not an agency', d: 'No sub-accounts or reselling to manage. Your team connects its channels and starts replying in about 45 minutes.' },
      { t: 'AI agents in the plan', d: 'HighLevel’s AI Employee is $20–$97 USD a month per sub-account, or pay-per-use. Colvy’s Inbox and Everything plans include five AI agents for support, bookings, sales, orders and reviews.' },
      { t: 'Texts included, then prepaid', d: 'HighLevel bills calls, texts and email on usage from a prepaid wallet. Colvy’s Inbox and Everything plans include 3,000 SMS a month, then prepaid credits from A$0.15 a text.' },
      { t: 'Store orders beside every chat', d: 'WooCommerce and Shopify orders sit next to the conversation, with delivery scheduling and back-in-stock texts from the same thread.' },
      { t: 'A customer feedback suite', d: 'An ideas board, a public roadmap and announcements, tied to the inbox, so customers see what you build next.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD. HighLevel publishes its prices in USD.' },
    ],
    checklist: ['SMS, calls, email, social and live chat in one inbox', 'Five AI agents on the Inbox and Everything plans', '3,000 SMS a month included', 'WooCommerce and Shopify orders beside every chat', 'Delivery scheduling and back-in-stock texts', 'Ideas board, roadmap and announcements', 'Australian 🇦🇺 support, numbers and AUD pricing', 'No lock-in contracts — cancel anytime'],
  },
  salesforce: {
    name: 'Salesforce', accent: CYAN, heroTitle: 'The Salesforce alternative built for', heroAccent: 'small teams', heroSub: 'Salesforce is a CRM platform that grows by editions and add-ons: messaging, calls and Agentforce service agents sit above its small-business suites. Colvy puts SMS, calls, social, email and live chat in one shared inbox with a CRM and five AI agents, at one price in AUD.',
    stats: [{ big: 'Flat', label: 'price, unlimited team' }, { big: '5', label: 'AI agents in the plan' }, { big: '45 min', label: 'to set up' }],
    tableNote: 'Salesforce’s column is for its small-business suites, Starter and Pro. “Higher plans” means Service Cloud Core (A$273 per user a month) or above, where messaging, calls and Agentforce are added on.',
    wins: [
      { t: 'One price for the whole team', d: 'Salesforce prices each suite per user, per month: from A$35 for Starter and A$140 for Pro, which is billed annually on a contract. Colvy’s Inbox and Everything plans are one monthly price with unlimited team members.' },
      { t: 'Texts and calls in the inbox', d: 'On Salesforce, SMS, WhatsApp, Messenger and calls are add-ons on higher editions. Colvy’s Inbox plan has SMS and voice calls in the same inbox as live chat, with 3,000 texts a month included.' },
      { t: 'AI agents included', d: 'Agentforce for Service isn’t part of Starter or Pro, and on higher editions it’s billed per conversation or by Flex Credits. Colvy’s Inbox and Everything plans include five AI agents for support, bookings, sales, orders and reviews.' },
      { t: 'Store orders beside every chat', d: 'WooCommerce and Shopify orders sit next to the conversation, with delivery scheduling and back-in-stock texts from the same thread.' },
      { t: 'Reviews and feedback built in', d: 'Reply to Google reviews from the inbox, and run an ideas board, public roadmap and announcements for your customers.' },
      { t: 'Australian 🇦🇺 support & pricing', d: 'Local team, Australian numbers and prices in AUD. Cancel anytime, with no annual contract.' },
    ],
    checklist: ['SMS, calls, email, social and live chat in one inbox', 'One monthly price, unlimited team members', 'Five AI agents on the Inbox and Everything plans', '3,000 SMS a month included', 'WooCommerce and Shopify orders beside every chat', 'Google reviews, ideas board and roadmap built in', 'Australian 🇦🇺 support, numbers and AUD pricing', 'No lock-in contracts — cancel anytime'],
  },
  birdeye: {
    name: 'Birdeye', accent: AMBER, heroTitle: 'The Birdeye alternative built for', heroAccent: 'every team size', heroSub: 'Birdeye is a US reputation platform with quote-based pricing. Colvy brings reviews, messaging, a full business phone, campaigns and a built-in feedback suite together, with Australian 🇦🇺 support and published prices.',
    stats: [{ big: 'Fair', label: 'published pricing' }, { big: 'Every', label: 'channel included' }, { big: '45 min', label: 'to set up' }],
    tableNote: 'Birdeye leads on reviews and surveys. Colvy matches that and adds a full business phone, store orders and a product-feedback suite, at published prices.',
    wins: [
      { t: 'A full business phone', d: 'Make and take calls from the browser and the app, with voicemail, recordings, AI summaries and to-dos in the customer’s conversation.' },
      { t: 'Reviews, plus everything else', d: 'Automate and reply to Google reviews like Birdeye — then handle SMS, calls and email in the same thread.' },
      { t: 'A built-in feedback suite', d: 'Ideas board, roadmap and announcements to build what customers ask for. Birdeye has none.' },
      { t: 'Published pricing, no forced contract', d: 'Prices on the website and month-to-month, with custom terms for larger teams. Birdeye’s pricing is quote-based.' },
      { t: 'Australian 🇦🇺 support & numbers', d: 'Local team, Australian numbers and pricing in AUD.' },
      { t: 'Sell and get paid in chat', d: 'Live orders, payment links and recorded sales — right in the conversation.' },
    ],
    checklist: ['Google Reviews automated and managed', 'SMS, webchat, email and social in one inbox', 'Voice calls with AI transcription & summaries', 'Surveys plus a full ideas / roadmap feedback suite', 'Payments — send a link, get paid in the thread', 'Australian 🇦🇺 support team and local numbers', 'No enterprise contracts — cancel anytime', 'Set up in about 45 minutes'],
  },
}

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 28 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

const Check = ({ c }: { c: string }) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>)
const Cross = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e0625a" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)

export default function ComparePage() {
  const params = useParams()
  const slug = (params?.slug as string) || 'podium'
  const c = CMP[slug] || CMP.podium
  const accent = c.accent
  const [dark, setDark] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    return () => { l?.subscription?.unsubscribe() }
  }, [])

  const go = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try {
      const hostname = window.location.hostname
      if (hostname.includes('localhost') || hostname.includes('vercel.app')) { window.location.href = '/admin'; return }
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (co?.slug) { window.location.href = boardUrl(co.slug, '/admin'); return }
      await redirectToUserAdmin(user.id)
    } catch { await redirectToUserAdmin(user.id) }
  }
  const scrollToTable = () => document.getElementById('cmp-table')?.scrollIntoView({ behavior: 'smooth' })

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const rowLine = dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,17,25,0.07)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: accent, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${accent}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  const cell = (v: Val | undefined) => v === true ? <Check c={GREEN} /> : v === false ? <Cross />
    : v === undefined ? <span title="Not confirmed from their public pages" style={{ fontSize: 15, color: muted, opacity: 0.7 }}>—</span>
    : <span style={{ fontSize: 12.5, color: muted, fontWeight: 600, lineHeight: 1.3 }}>{v}</span>
  const sl = (slug in CMP ? slug : 'podium') as Slug

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        .cmp-card,.cmp-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .cmp-card:hover{ transform:translateY(-5px); }
        .cmp-btn:hover{ transform:translateY(-2px); }
        .cmp-row:hover{ background:${dark ? 'rgba(255,255,255,0.03)' : accent + '07'} !important; }
        @media (max-width:760px){ .cmp-hero-cta{ flex-wrap:wrap !important; } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section style={{ position: 'relative', textAlign: 'center', padding: 'clamp(100px, 13vw, 150px) 24px 50px', background: dark ? 'linear-gradient(180deg,#10111b,#0a0b12 80%)' : `linear-gradient(180deg, ${accent}0d 0%, #ffffff 80%)` }}>
        <Reveal>
          <a href="/compare" style={{ display: 'inline-block', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: accent, background: accent + '16', padding: '6px 14px', borderRadius: 999, textDecoration: 'none', marginBottom: 18 }}>← Compare</a>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}><VsLogos slug={slug} name={c.name} accent={accent} size={56} variant="vs" muted={muted} /></div>
          <h1 style={{ fontSize: 'clamp(34px, 5.4vw, 64px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 auto 16px', maxWidth: 900 }}>{c.heroTitle} <span style={{ color: accent }}>{c.heroAccent}</span></h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 640, margin: '0 auto 28px', lineHeight: 1.6 }}>{c.heroSub}</p>
          <div className="cmp-hero-cta" style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={go} className="cmp-btn" style={btnPrimary}>Start 14-day free trial</button>
            <button onClick={scrollToTable} className="cmp-btn" style={btnGhost}>See full comparison →</button>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${c.stats.length}, 1fr)`, gap: 16, maxWidth: 760, margin: '44px auto 0' }}>
            {c.stats.map(s => (
              <div key={s.label} style={{ borderRadius: 20, padding: '24px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 900, letterSpacing: '-0.03em', color: accent }}>{s.big}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* FEATURE TABLE */}
      <section id="cmp-table" style={{ maxWidth: 1000, margin: '0 auto', padding: '50px 24px 20px', scrollMarginTop: 80 }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Colvy vs {c.name}: <span style={{ color: accent }}>feature by feature</span></h2>
          <p style={{ fontSize: 16, color: muted, margin: '0 0 26px', maxWidth: 620, lineHeight: 1.55 }}>{c.tableNote}</p>
        </Reveal>
        <Reveal delay={0.05}>
          <div style={{ borderRadius: 20, border: `1px solid ${cardBorder}`, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', background: accent + '12', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: muted }}>
              <div style={{ padding: '14px 18px' }}>Feature</div>
              <div style={{ padding: '14px 12px', textAlign: 'center', color: accent }}>Colvy</div>
              <div style={{ padding: '14px 12px', textAlign: 'center' }}>{c.name}</div>
            </div>
            {ROWS.map(g => ({ ...g, rows: g.hide?.includes(sl) ? [] : g.rows.filter(r => (!r.only || r.only.includes(sl)) && !r.hide?.includes(sl)) })).filter(g => g.rows.length).map(g => (
              <div key={g.group} role="rowgroup">
                <div style={{ padding: '16px 18px 8px', borderTop: `1px solid ${rowLine}`, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent }}>{g.group}</div>
                {g.rows.map(r => (
                  <div key={r.label} className="cmp-row" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', alignItems: 'center', borderTop: `1px solid ${rowLine}`, transition: 'background 0.15s' }}>
                    <div style={{ padding: '13px 18px', fontSize: 14, fontWeight: 600, color: text }}>{r.label}</div>
                    <div style={{ padding: '13px 12px', display: 'flex', justifyContent: 'center', textAlign: 'center' }}>{r.colvy === undefined ? <Check c={GREEN} /> : cell(r.colvy)}</div>
                    <div style={{ padding: '13px 12px', display: 'flex', justifyContent: 'center', textAlign: 'center' }}>{cell(r.v[sl])}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: muted, margin: '14px 4px 0' }}>
            Checked against {c.name}’s own website and help pages in November 2026. ✓ available · ✗ not offered · — we couldn’t confirm it either way. Plans and prices change, so check with {c.name} before you decide.
          </p>
        </Reveal>
      </section>

      {/* WHERE COLVY WINS */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '50px 24px' }}>
        <Reveal><h2 style={{ fontSize: 'clamp(26px, 3.6vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 6px' }}>Where Colvy <span style={{ color: accent }}>wins</span></h2>
          <p style={{ textAlign: 'center', fontSize: 16, color: muted, margin: '0 0 34px' }}>Key areas where Colvy outperforms {c.name} for Australian 🇦🇺 businesses.</p></Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 18 }}>
          {c.wins.map((w, i) => (
            <Reveal key={w.t} delay={(i % 3) * 0.05}>
              <div className="cmp-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: accent + '16', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Check c={accent} /></div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: text }}>{w.t}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{w.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* AI AGENTS — Colvy's own, no claims about the competitor's */}
      <AgentTeamBand dark={dark} title="Five AI agents included, not bolted on" />

      {/* SWITCHING OFFER — money back + free migration */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '10px 24px 20px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 6px' }}>Already paid {c.name}? <span style={{ color: accent }}>You won’t lose a cent</span></h2>
          <p style={{ textAlign: 'center', fontSize: 16, color: muted, maxWidth: 620, margin: '0 auto 30px', lineHeight: 1.55 }}>Switching mid-contract shouldn’t cost you. We make the move painless — and free.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 18 }}>
          {[
            { icon: 'tag', t: 'We’ll cover your unused balance', d: `On a yearly plan with ${c.name}? Send us proof of payment and we’ll credit the remaining months as free time on Colvy — or carry your subscription over. You don’t pay twice.` },
            { icon: 'bolt', t: 'Free help to switch', d: `Our team helps you move from ${c.name} to Colvy — importing your contacts and setting up your channels and a new Australian number — at no cost.` },
          ].map((o, i) => (
            <Reveal key={o.t} delay={i * 0.06}>
              <div className="cmp-card" style={{ height: '100%', borderRadius: 20, padding: 28, background: `linear-gradient(150deg, ${accent}14, ${accent}05)`, border: `1px solid ${accent}33` }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={o.icon} color="#fff" size={23} /></div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 7px', color: text }}>{o.t}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{o.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p style={{ textAlign: 'center', fontSize: 12.5, color: muted, margin: '18px auto 0', maxWidth: 640, lineHeight: 1.55 }}>Balance credit is offered at Colvy’s discretion on sighting valid proof of a current annual payment — <button onClick={() => setContactOpen(true)} style={{ color: accent, textDecoration: 'none', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>talk to us</button> and we’ll sort it out.</p>
        </Reveal>
      </section>

      {/* MIGRATION / CHECKLIST */}
      <section style={{ background: dark ? 'rgba(255,255,255,0.02)' : accent + '08', padding: 'clamp(48px, 7vw, 88px) 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: 28 }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Everything you have now, <span style={{ color: accent }}>plus more</span></h2>
            <p style={{ fontSize: 16.5, color: muted, margin: 0, maxWidth: 620, lineHeight: 1.6 }}>Switching from {c.name} to Colvy means keeping what works and gaining what was missing.</p>
          </Reveal>
          <Reveal delay={0.05}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '12px 28px' }}>
              {c.checklist.map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, fontWeight: 600, color: text }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: accent + '1a', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><Check c={accent} /></span>{item}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <SeoFaqSection path={`compare/${slug}`} accent={accent} dark={dark} />

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${accent}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>Switch in about 45 minutes</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Our team helps you switch. Keep your reviews and your customers — just lose the limitations.</p>
            <div className="cmp-hero-cta" style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={go} className="cmp-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Grab a free trial</button>
              <button onClick={() => setContactOpen(true)} className="cmp-btn" style={{ padding: '16px 32px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', color: '#fff', fontWeight: 800, fontSize: 16, border: '1px solid rgba(255,255,255,0.4)', textDecoration: 'none', cursor: 'pointer' }}>Book a demo</button>
            </div>
          </div>
        </Reveal>
      </section>

      <ContactSalesModal open={contactOpen} onClose={() => setContactOpen(false)} dark={dark} source="compare" title="Talk to sales" />

      <MarketingFooter dark={dark} />
    </div>
  )
}
