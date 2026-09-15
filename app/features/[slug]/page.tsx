'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Individual platform feature pages (/features/[slug]), one per capability on the
// Features overview. Data-driven, mirroring the phones/ai templates. Grounded in
// the real product; no fabricated metrics.

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', TEAL = '#0d9488', INDIGO = '#4f46e5', INK = '#0f1119'

type Band = { tag: string; title: string; body: string; bullets: string[] }
type Feat = {
  accent: string; eyebrow: string; name: string; title: string; sub: string; heroChips: string[]
  features: { icon: string; title: string; desc: string }[]
  bands: Band[]
  stats: { big: string; label: string }[]
  ctaHead: string
}

const FT: Record<string, Feat> = {
  inbox: {
    accent: TEAL, eyebrow: 'Shared inbox', name: 'Shared Inbox', title: 'Every channel, one shared inbox',
    sub: 'SMS, WhatsApp, email, chat, social and calls thread into one place your whole team works from — each message beside the full customer story.',
    heroChips: ['All channels', 'One thread', 'Team-ready'],
    features: [
      { icon: 'inbox', title: 'One thread per customer', desc: 'Every channel in a single conversation.' },
      { icon: 'user', title: 'Full context', desc: 'History and profile beside each chat.' },
      { icon: 'target', title: 'Assign & @mention', desc: 'Route work and loop in teammates.' },
      { icon: 'bolt', title: 'Saved replies', desc: 'Answer common questions in a tap.' },
    ],
    bands: [
      { tag: 'Unified', title: 'Stop switching tabs', body: 'No more hopping between a helpdesk, a phone app and three social inboxes. Every message lands in one place, threaded by customer.', bullets: ['All channels in one inbox', 'Threaded by customer', 'Full history in view'] },
      { tag: 'Together', title: 'Work as a team', body: 'Assign conversations, leave internal notes and @mention the right person, so nothing is “someone else’s job”.', bullets: ['Assignment & statuses', 'Internal notes', '@mentions'] },
    ],
    stats: [{ big: '6+', label: 'channels, one inbox' }, { big: 'Team', label: 'assignment' }, { big: '45 min', label: 'to set up' }],
    ctaHead: 'Bring every channel together',
  },
  crm: {
    accent: BLUE, eyebrow: 'Contacts & CRM', name: 'Contacts & CRM', title: 'A CRM beside every chat',
    sub: 'A full profile, history and lifetime value next to every conversation — so you always know exactly who you’re talking to.',
    heroChips: ['Full profile', 'History', 'Lifetime value'],
    features: [
      { icon: 'user', title: 'Rich profiles', desc: 'Contact details, tags and notes in one place.' },
      { icon: 'inbox', title: 'Full history', desc: 'Every past conversation, on the profile.' },
      { icon: 'tag', title: 'Orders & spend', desc: 'What they’ve bought and their value.' },
      { icon: 'pen', title: 'Custom fields & tags', desc: 'Model your customers your way.' },
    ],
    bands: [
      { tag: 'Know your people', title: 'The customer, in full', body: 'Open any conversation and their whole relationship with you is right there — orders, notes, past chats and lifetime value.', bullets: ['Profile beside every chat', 'Orders and spend', 'Tags and custom fields'] },
      { tag: 'One source of truth', title: 'No more scattered contacts', body: 'Your customer records live with your conversations, not in a separate CRM you forget to update. And it’s yours to export anytime.', bullets: ['Contacts + conversations together', 'Always up to date', 'Export anytime'] },
    ],
    stats: [{ big: '1', label: 'profile per customer' }, { big: 'Full', label: 'history' }, { big: 'Yours', label: 'to export' }],
    ctaHead: 'Know every customer',
  },
  gallery: {
    accent: PURPLE, eyebrow: 'Media gallery', name: 'Media Gallery', title: 'Every photo and file, organised',
    sub: 'All the images and documents customers send, collected per contact and searchable — so you never dig through a thread again.',
    heroChips: ['All media', 'Per customer', 'Searchable'],
    features: [
      { icon: 'folder', title: 'Auto-collected', desc: 'Every attachment gathered for you.' },
      { icon: 'search', title: 'Searchable', desc: 'Find the file you need in seconds.' },
      { icon: 'camera', title: 'Photos & files', desc: 'Images, PDFs and documents together.' },
      { icon: 'user', title: 'Per contact', desc: 'Organised by the customer who sent it.' },
    ],
    bands: [
      { tag: 'Never buried', title: 'Attachments you can actually find', body: 'The photo of the damaged item, the signed form, the spec sheet — all collected in one gallery instead of lost somewhere in a long thread.', bullets: ['Auto-collected per contact', 'Images and documents', 'One organised place'] },
      { tag: 'Fast', title: 'Search, don’t scroll', body: 'Filter and search the gallery to surface exactly what you need, right when you need it.', bullets: ['Search across media', 'Filter by customer', 'Open in a click'] },
    ],
    stats: [{ big: 'All', label: 'media collected' }, { big: 'Per', label: 'customer' }, { big: 'Searchable', label: 'instantly' }],
    ctaHead: 'Keep every file in reach',
  },
  notes: {
    accent: PINK, eyebrow: 'Notes', name: 'Notes', title: 'Team notes on any thread',
    sub: 'Leave internal notes and @mention teammates on any conversation — visible to your team, never to the customer.',
    heroChips: ['Internal only', '@mentions', 'On any thread'],
    features: [
      { icon: 'pen', title: 'Internal notes', desc: 'Add context only your team can see.' },
      { icon: 'user', title: '@mention teammates', desc: 'Pull the right person into a thread.' },
      { icon: 'lock', title: 'Never customer-visible', desc: 'Notes stay strictly internal.' },
      { icon: 'bell', title: 'Notify the right person', desc: 'Mentions send an instant nudge.' },
    ],
    bands: [
      { tag: 'In context', title: 'Talk to your team where the work is', body: 'Instead of copying a conversation into chat somewhere else, leave a note right on the thread — with the full context attached.', bullets: ['Notes on any conversation', 'Full context attached', 'Team-only visibility'] },
      { tag: 'In the loop', title: 'Everyone who needs to know, knows', body: '@mention a colleague and they’re notified with a link straight to the thread — no forwarding, no re-explaining.', bullets: ['@mention to notify', 'Direct link to the thread', 'No re-explaining'] },
    ],
    stats: [{ big: 'Internal', label: 'only' }, { big: '@mentions', label: 'built in' }, { big: '1', label: 'thread, all context' }],
    ctaHead: 'Collaborate in context',
  },
  orders: {
    accent: CORAL, eyebrow: 'Orders', name: 'Orders', title: 'Live orders, right in the chat',
    sub: 'See WooCommerce and Shopify orders, status and tracking beside the conversation — and answer “where’s my order?” without leaving the thread.',
    heroChips: ['WooCommerce', 'Shopify', 'Live tracking'],
    features: [
      { icon: 'tag', title: 'Live orders', desc: 'Order details and status in the thread.' },
      { icon: 'target', title: 'WISMO answers', desc: 'Tracking pulled in automatically.' },
      { icon: 'plug', title: 'Woo & Shopify', desc: 'Two-way sync with your store.' },
      { icon: 'chart', title: 'Order history', desc: 'Everything they’ve bought, in view.' },
    ],
    bands: [
      { tag: 'In view', title: 'Support with the order on screen', body: 'No alt-tabbing to your store admin. The customer’s live order, items and tracking sit right beside the conversation.', bullets: ['Live order details', 'Tracking in the thread', 'Full purchase history'] },
      { tag: 'Connected', title: 'Two-way sync with your store', body: 'Orders, customers and status stay in sync with WooCommerce and Shopify, so what you see is always current.', bullets: ['WooCommerce & Shopify', 'Always current', 'Answer WISMO instantly'] },
    ],
    stats: [{ big: 'Live', label: 'orders in chat' }, { big: '2-way', label: 'store sync' }, { big: 'WISMO', label: 'handled' }],
    ctaHead: 'Put orders in the inbox',
  },
  payments: {
    accent: GREEN, eyebrow: 'Payments', name: 'Payments', title: 'Get paid in the thread',
    sub: 'Send a secure payment link or invoice and record the sale on the conversation — no detour to a separate checkout.',
    heroChips: ['Payment links', 'Invoices', 'Recorded sales'],
    features: [
      { icon: 'link', title: 'Secure links', desc: 'Send by SMS or email; they pay on their device.' },
      { icon: 'tag', title: 'Invoices', desc: 'Bill and get paid in a few taps.' },
      { icon: 'bolt', title: 'In the thread', desc: 'No bouncing to another tool.' },
      { icon: 'chart', title: 'Recorded sales', desc: 'Every sale tied to the conversation.' },
    ],
    bands: [
      { tag: 'No detour', title: 'Checkout inside the conversation', body: 'Build the order, send a secure payment link, and the customer pays on their phone — all without leaving the chat.', bullets: ['Secure payment links', 'Pay on any device', 'Card data handled by Stripe'] },
      { tag: 'On the record', title: 'Every sale, attributed', body: 'Sales are recorded against the conversation that drove them, so you can see which chats actually make money.', bullets: ['Sales on the thread', 'Revenue per conversation', 'Clear reporting'] },
    ],
    stats: [{ big: 'Secure', label: 'payment links' }, { big: 'In-chat', label: 'checkout' }, { big: 'Stripe', label: 'powered' }],
    ctaHead: 'Take payment where you talk',
  },
  links: {
    accent: CYAN, eyebrow: 'Link reports', name: 'Link Reports', title: 'See who clicked what',
    sub: 'Track opens and clicks on the links you send, per conversation — so you know who’s engaged and who to follow up with.',
    heroChips: ['Opens & clicks', 'Per conversation', 'Smarter follow-up'],
    features: [
      { icon: 'link', title: 'Tracked links', desc: 'Every link you send, measured.' },
      { icon: 'chart', title: 'Opens & clicks', desc: 'See exactly what got engagement.' },
      { icon: 'user', title: 'Per contact', desc: 'Know which customer clicked.' },
      { icon: 'bell', title: 'Follow-up signals', desc: 'Reach out while interest is warm.' },
    ],
    bands: [
      { tag: 'Know what lands', title: 'Which links actually get clicked', body: 'Send a quote, a product or a booking link and see whether it was opened — no more guessing if your message got through.', bullets: ['Open & click tracking', 'Per conversation', 'At a glance'] },
      { tag: 'Act on it', title: 'Follow up on real interest', body: 'A click is a buying signal. Reach out to the people who engaged, at the moment they’re paying attention.', bullets: ['Spot warm leads', 'Time your follow-up', 'Close more'] },
    ],
    stats: [{ big: 'Per-link', label: 'insight' }, { big: 'Opens', label: '& clicks' }, { big: 'Smarter', label: 'follow-ups' }],
    ctaHead: 'Measure every link',
  },
  insights: {
    accent: INDIGO, eyebrow: 'Insights', name: 'Insights', title: 'See what your conversations do',
    sub: 'Analytics on volume, response times, resolution and the revenue conversations drive — so you can staff and improve with data, not hunches.',
    heroChips: ['Response times', 'Resolution', 'Revenue'],
    features: [
      { icon: 'chart', title: 'Conversation analytics', desc: 'Volume and trends over time.' },
      { icon: 'bolt', title: 'Response times', desc: 'See how fast you really reply.' },
      { icon: 'tag', title: 'Revenue per chat', desc: 'Tie conversations to sales.' },
      { icon: 'user', title: 'By team & person', desc: 'Understand who handles what.' },
    ],
    bands: [
      { tag: 'The numbers', title: 'Run on data, not hunches', body: 'See where time goes, how fast you respond and which hours are busiest — so you can staff and prioritise with confidence.', bullets: ['Volume & response times', 'Busy-period insight', 'Per-channel breakdowns'] },
      { tag: 'Coach', title: 'Improve with real evidence', body: 'Track resolution and revenue by person and team to set targets and coach with actual performance.', bullets: ['Per-person metrics', 'Revenue attribution', 'Set and track targets'] },
    ],
    stats: [{ big: 'Live', label: 'dashboards' }, { big: 'Per', label: 'team & person' }, { big: 'Revenue', label: 'visible' }],
    ctaHead: 'Measure what matters',
  },
  calendar: {
    accent: BLUE, eyebrow: 'Calendar', name: 'Calendar', title: 'Bookings and reminders, connected',
    sub: 'Schedule bookings, events and reminders tied to your conversations — so nothing is double-booked or forgotten.',
    heroChips: ['Bookings', 'Events', 'Reminders'],
    features: [
      { icon: 'calendar', title: 'Bookings & events', desc: 'Schedule right from a conversation.' },
      { icon: 'bell', title: 'Reminders', desc: 'Nudges so nothing is missed.' },
      { icon: 'inbox', title: 'Tied to chats', desc: 'Every booking linked to its customer.' },
      { icon: 'user', title: 'Shared team view', desc: 'Everyone sees what’s on.' },
    ],
    bands: [
      { tag: 'In context', title: 'Schedule without leaving the thread', body: 'Book an appointment or set a reminder straight from the conversation, with the customer and context already attached.', bullets: ['Book from a chat', 'Linked to the customer', 'No copy-paste'] },
      { tag: 'On time', title: 'Never miss a date', body: 'Reminders keep bookings and follow-ups on track, and a shared view keeps the whole team aligned.', bullets: ['Automatic reminders', 'Shared calendar', 'No double-booking'] },
    ],
    stats: [{ big: 'Bookings', label: '& events' }, { big: 'Reminders', label: 'built in' }, { big: '1', label: 'shared calendar' }],
    ctaHead: 'Keep the schedule in sync',
  },
  tasks: {
    accent: PURPLE, eyebrow: 'Tasks', name: 'Tasks', title: 'Turn any chat into a to-do',
    sub: 'Create a task from any conversation, assign it and set a due date — so what you agreed to actually happens.',
    heroChips: ['From any chat', 'Assign', 'Due dates'],
    features: [
      { icon: 'kanban', title: 'Tasks from chats', desc: 'One click from message to to-do.' },
      { icon: 'user', title: 'Assign owners', desc: 'Give every task a clear owner.' },
      { icon: 'calendar', title: 'Due dates', desc: 'Keep work on schedule.' },
      { icon: 'bell', title: 'Reminders', desc: 'Nudges so nothing slips.' },
    ],
    bands: [
      { tag: 'Nothing slips', title: 'Promises become tasks', body: 'When a conversation creates a to-do, capture it in a click — with an owner, a due date and a link back to the customer.', bullets: ['Create from any message', 'Owner & due date', 'Linked to the chat'] },
      { tag: 'In sync', title: 'Your team on the same page', body: 'Tasks sit beside your conversations so everyone can see what’s outstanding and who’s on it.', bullets: ['Shared task view', 'Reminders that nudge', 'Nothing forgotten'] },
    ],
    stats: [{ big: '1-click', label: 'to a task' }, { big: 'Assign', label: '& track' }, { big: '0', label: 'dropped balls' }],
    ctaHead: 'Turn talk into action',
  },
  broadcasts: {
    accent: CORAL, eyebrow: 'Broadcasts', name: 'Broadcasts', title: 'Reach everyone at once',
    sub: 'Send SMS, email and WhatsApp broadcasts to opted-in customers — and every reply lands back in the shared inbox.',
    heroChips: ['SMS · email · WhatsApp', 'Segments', 'Replies in-inbox'],
    features: [
      { icon: 'megaphone', title: 'One composer', desc: 'Compose once, send across channels.' },
      { icon: 'target', title: 'Segments', desc: 'Target by history, tags or activity.' },
      { icon: 'chat', title: 'Two-way replies', desc: 'Responses land in the inbox.' },
      { icon: 'lock', title: 'Opt-out handling', desc: 'Consent managed automatically.' },
    ],
    bands: [
      { tag: 'Right people', title: 'Message the customers who matter', body: 'Segment your audience and send to exactly the right people across the channels they actually read.', bullets: ['SMS, email and WhatsApp', 'Behaviour-based segments', 'Schedule or send now'] },
      { tag: 'Two-way', title: 'A broadcast that talks back', body: 'Replies flow into the shared inbox like any other conversation, so a campaign can become a sale or a support win.', bullets: ['Replies in the inbox', 'Full context per person', 'Automatic opt-outs'] },
    ],
    stats: [{ big: '3-in-1', label: 'channels' }, { big: '2-way', label: 'replies' }, { big: 'Built-in', label: 'opt-out' }],
    ctaHead: 'Broadcast, and stay in one inbox',
  },
  automation: {
    accent: TEAL, eyebrow: 'Automation', name: 'Automation', title: 'Let the routine run itself',
    sub: 'Auto-route conversations, send follow-ups, request reviews and trigger actions on the events that matter — set it once, it runs always.',
    heroChips: ['Auto-route', 'Follow-ups', 'Triggers'],
    features: [
      { icon: 'target', title: 'Auto-routing', desc: 'Send each chat to the right team.' },
      { icon: 'bell', title: 'Follow-ups', desc: 'Nudge quotes and check-ins on autopilot.' },
      { icon: 'link', title: 'Event triggers', desc: 'When this happens, do that.' },
      { icon: 'lock', title: 'You stay in control', desc: 'Test, pause or tweak anytime.' },
    ],
    bands: [
      { tag: 'Runs itself', title: 'Automate the busywork', body: 'Routing, follow-ups, review requests and tagging happen on their own, so your team spends time on people, not admin.', bullets: ['Auto-route & assign', 'Automatic follow-ups', 'Trigger on any event'] },
      { tag: 'Simple', title: 'Powerful, not complicated', body: 'Build flows in plain steps, test them safely and adjust as your process changes.', bullets: ['Plain-language steps', 'Test before you ship', 'Edit anytime'] },
    ],
    stats: [{ big: 'No-code', label: 'automations' }, { big: 'Any', label: 'event' }, { big: 'Runs', label: 'itself' }],
    ctaHead: 'Automate the busywork',
  },
}

const ALL = Object.entries(FT).map(([slug, f]) => ({ slug, name: f.name }))

function useReveal(threshold = 0.14) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 28 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

export default function FeatureDetailPage() {
  const params = useParams()
  const slug = (params?.slug as string) || 'inbox'
  const f = FT[slug] || FT['inbox']
  const accent = f.accent
  const [dark, setDark] = useState(false)
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

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: accent, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${accent}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes fsFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .fs-card,.fs-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .fs-card:hover{ transform:translateY(-6px); }
        .fs-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .fs-hero{ grid-template-columns:1fr !important; } .fs-band{ grid-template-columns:1fr !important; } .fs-hero-cta{ flex-wrap:nowrap !important; } .fs-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="fsFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="fs-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 60px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <a href="/features" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: accent, textDecoration: 'none', marginBottom: 14 }}>← Features</a>
            <div style={{ marginBottom: 8 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: accent + '18', color: accent, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}><FeatureIcon name={f.features[0].icon} color={accent} size={15} />{f.eyebrow}</span></div>
            <h1 style={{ fontSize: 'clamp(36px, 5.2vw, 60px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 18px' }}>{f.title}</h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>{f.sub}</p>
            <div className="fs-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="fs-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="fs-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${accent} 0%, ${accent}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${accent}44` }}>
            <img src={`/features/${slug}.jpg`} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${accent}e6 0%, ${accent}59 42%, rgba(10,12,20,0.5) 115%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'fsFloat 6s ease-in-out infinite' }}><FeatureIcon name={f.features[0].icon} color="rgba(255,255,255,0.95)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {f.heroChips.map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.34)', borderRadius: 999, padding: '9px 16px', animation: `fsFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FEATURE GRID */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
          {f.features.map((ft, i) => (
            <Reveal key={ft.title} delay={(i % 4) * 0.05}>
              <div className="fs-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: accent + '16', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={ft.icon} color={accent} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{ft.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{ft.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BANDS */}
      {f.bands.map((b, i) => (
        <section key={b.title} style={{ background: i % 2 ? (dark ? 'rgba(255,255,255,0.02)' : accent + '08') : 'transparent', padding: 'clamp(40px, 6vw, 80px) 24px' }}>
          <div className="fs-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: i % 2 ? 'rtl' : 'ltr' }}>
            <div style={{ direction: 'ltr' }}>
              <Reveal>
                <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: accent }}>{b.tag}</span>
                <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>{b.title}</h2>
                <p style={{ fontSize: 16.5, lineHeight: 1.65, color: muted, margin: '0 0 20px' }}>{b.body}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {b.bullets.map(bl => (
                    <li key={bl} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, fontWeight: 600, color: text }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: accent + '1a', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{bl}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <div style={{ direction: 'ltr' }}>
              <Reveal delay={0.1}>
                <div style={{ position: 'relative', borderRadius: 24, minHeight: 280, overflow: 'hidden', background: `linear-gradient(140deg, ${accent}22, ${accent}05)`, border: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '32px 32px', opacity: 0.5 }} />
                  <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${accent}55`, animation: 'fsFloat 6s ease-in-out infinite' }}>
                    <FeatureIcon name={f.features[Math.min(i + 1, f.features.length - 1)].icon} color="#fff" size={44} />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      {/* MORE FEATURES */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 20px', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>More <span style={{ color: accent }}>features</span></h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 22px', lineHeight: 1.55 }}>One platform, everything in it — explore the rest.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {ALL.filter(a => a.slug !== slug).map(a => (
              <a key={a.slug} href={`/features/${a.slug}`} style={{ fontSize: 13.5, fontWeight: 700, color: text, background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 999, padding: '8px 16px', textDecoration: 'none' }}>{a.name}</a>
            ))}
          </div>
        </Reveal>
      </section>

      {/* STATS */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 24px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {f.stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(22px, 3.6vw, 36px)', fontWeight: 900, letterSpacing: '-0.03em', color: accent }}>{s.big}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${accent}, ${BLUE} 55%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>{f.ctaHead}</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Start free, set up in about 45 minutes — no credit card, cancel anytime.</p>
            <button onClick={go} className="fs-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
