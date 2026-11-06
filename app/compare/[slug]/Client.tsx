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
type Slug = 'podium' | 'birdeye' | 'coax' | 'gorgias' | 'zendesk' | 'freshdesk' | 'intercom' | 'gladly' | 'manychat'
type Row = { label: string; colvy?: Val; v: Partial<Record<Slug, Val>> }
const ALL_T = (val: Val): Record<Slug, Val> => ({ podium: val, birdeye: val, coax: val, gorgias: val, zendesk: val, freshdesk: val, intercom: val, gladly: val, manychat: val })
const HELPDESKS_T: Partial<Record<Slug, Val>> = { gorgias: true, zendesk: true, freshdesk: true, intercom: true, gladly: true }

const ROWS: { group: string; rows: Row[] }[] = [
  { group: 'Channels', rows: [
    { label: 'SMS on Australian 🇦🇺 numbers', v: { podium: true, birdeye: true, coax: true, gorgias: 'Add-on', zendesk: 'Add-on', freshdesk: 'Add-on', intercom: 'Usage-based', gladly: true, manychat: 'Via your Twilio' } },
    { label: 'WhatsApp', colvy: COMING_SOON.whatsapp ? 'Coming soon' : true, v: { birdeye: true, coax: true, intercom: 'Usage-based', gladly: true, manychat: true } },
    { label: 'Instagram DMs', v: ALL_T(true) },
    { label: 'Facebook Messenger', v: ALL_T(true) },
    { label: 'Email inbox (Gmail or any mailbox)', v: { podium: true, birdeye: 'Marketing', coax: true, gorgias: true, zendesk: true, freshdesk: true, intercom: true, gladly: true, manychat: 'Basic' } },
    { label: 'Phone calls & voicemail', v: { podium: true, birdeye: 'Partial', coax: 'Add-on', gorgias: 'Add-on', zendesk: true, freshdesk: 'Add-on', intercom: 'Usage-based', gladly: true, manychat: false } },
    { label: 'Google reviews', v: { podium: true, birdeye: true, coax: true, gorgias: false, zendesk: false, freshdesk: false, intercom: false, gladly: false, manychat: false } },
    { label: 'Live chat widget', v: ALL_T(true) },
  ] },
  { group: 'AI', rows: [
    { label: 'AI agents that answer on their own', colvy: 'Five, included', v: { podium: 'Paid add-on', birdeye: 'Quote-based', coax: 'Enterprise plan', gorgias: 'Per interaction', zendesk: 'Allowance, then per resolution', freshdesk: 'Per session', intercom: 'Per outcome (Fin)', gladly: 'Per resolution or quote', manychat: 'Manychat AI' } },
    { label: 'Name and style each AI agent', v: { podium: 'Name', gorgias: 'Name', zendesk: 'Name', freshdesk: true, intercom: true, gladly: 'Name' } },
    { label: 'Call summaries, to-dos & transcripts', v: { podium: true, coax: 'Add-on', gladly: 'Add-on', manychat: false } },
    { label: 'AI campaign builder (audience, copy, timing)', v: {} },
    { label: 'AI voice typing', v: {} },
  ] },
  { group: 'Sell & deliver', rows: [
    { label: 'WooCommerce orders beside each chat', colvy: 'Woo + Shopify', v: { podium: 'Via Zapier', coax: 'Coming soon', gorgias: true, zendesk: 'Via apps', freshdesk: 'Via apps', intercom: 'Via third-party', manychat: 'Via Zapier' } },
    { label: '“Where’s my order?” automation', v: { coax: true, gorgias: true } },
    { label: 'POS / ERP integrations', v: { podium: 'Limited', birdeye: 'Limited', coax: true, gorgias: 'Via integrations', zendesk: 'Limited', freshdesk: 'Limited', intercom: 'Limited', gladly: 'Limited', manychat: 'Limited' } },
    { label: 'Payment links in the chat', v: { podium: true, birdeye: true, coax: true, manychat: 'Buy button (Pro)' } },
    { label: 'Delivery scheduling from the chat', v: {} },
    { label: 'Back-in-stock waitlists & restock texts', v: {} },
    { label: 'Online booking, deposits & reminders', v: { podium: 'Some industries', birdeye: true, coax: 'Via integrations', zendesk: 'Via apps', freshdesk: 'Via apps', intercom: 'Via apps' } },
  ] },
  { group: 'Marketing', rows: [
    { label: 'Email & SMS campaigns', colvy: 'Email + SMS', v: { podium: 'SMS', birdeye: true, coax: 'SMS + Messenger', zendesk: 'Via apps', freshdesk: 'WhatsApp app', intercom: true, gladly: 'Proactive, not marketing', manychat: 'Email; AU SMS via Twilio' } },
    { label: 'Campaign reports in orders & revenue', v: {} },
    { label: 'Scheduled replies (edit, send now or cancel)', v: { podium: true, birdeye: true, coax: true, zendesk: 'Add-on', manychat: 'Broadcasts only' } },
    { label: 'Polls & surveys', v: { birdeye: true, intercom: true, gorgias: 'CSAT', zendesk: 'CSAT', freshdesk: 'CSAT' } },
  ] },
  { group: 'Team & self-service', rows: [
    { label: 'Help centre / knowledge base', v: { ...HELPDESKS_T } },
    { label: 'iOS & Android app', v: { podium: true, birdeye: true, coax: true, gorgias: true, zendesk: true, freshdesk: true, intercom: true, gladly: 'Mobile browser', manychat: true } },
    { label: 'Team notes', v: { ...HELPDESKS_T } },
    { label: 'Tasks & reminders', v: {} },
    { label: 'Shared calendar', v: {} },
    { label: 'Shared media gallery, photo markup & video trimming', v: {} },
  ] },
  { group: 'Product feedback', rows: [
    { label: 'Ideas & feedback board', v: { podium: false, birdeye: false, coax: false, gorgias: false, intercom: false, gladly: false, manychat: false } },
    { label: 'Public roadmap', v: ALL_T(false) },
    { label: 'Announcements / changelog', v: { ...ALL_T(false), intercom: true } },
  ] },
  { group: 'Local', rows: [
    { label: 'Australian 🇦🇺 phone numbers', v: { podium: true, coax: true, zendesk: 'Limited', manychat: 'Via your Twilio' } },
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
      { t: 'AI agents and calls in the plan', d: 'Coax lists its AI agent on its Enterprise plan and calls as an add-on. Colvy includes five AI agents and calls with AI summaries.' },
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
            {ROWS.map(g => (
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
