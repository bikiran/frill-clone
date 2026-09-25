'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import MarketingFooter from '@/components/MarketingFooter'
import MarketingNav from '@/components/MarketingNav'
import FeatureMockup, { MockKind } from '@/components/FeatureMockups'
import FeatureIcon from '@/components/FeatureIcon'

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
    hero: 'SMS, WhatsApp, email, chat, social and calls thread into one place your whole team works from — each message beside the full customer story.',
    features: [
      { icon: 'inbox', title: 'One thread per customer', desc: 'Every channel in a single conversation.' },
      { icon: 'user', title: 'Full context', desc: 'History and profile beside each chat.' },
      { icon: 'target', title: 'Assign & @mention', desc: 'Route work and loop in teammates.' },
      { icon: 'bolt', title: 'Saved replies', desc: 'Answer common questions in a tap.' },
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
    title: 'Every photo and file, organised',
    hero: 'All the images and documents customers send, collected per contact and searchable — so you never dig through a thread again.',
    features: [
      { icon: 'folder', title: 'Auto-collected', desc: 'Every attachment gathered for you.' },
      { icon: 'search', title: 'Searchable', desc: 'Find the file you need in seconds.' },
      { icon: 'camera', title: 'Photos & files', desc: 'Images, PDFs and documents together.' },
      { icon: 'user', title: 'Per contact', desc: 'Organised by the customer who sent it.' },
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
    icon: 'megaphone', color: CORAL, mock: 'broadcasts', subtitle: 'Broadcasts',
    title: 'Reach everyone at once',
    hero: 'Send SMS, email and WhatsApp broadcasts to opted-in customers — and every reply lands back in the shared inbox.',
    features: [
      { icon: 'megaphone', title: 'One composer', desc: 'Compose once, send across channels.' },
      { icon: 'target', title: 'Segments', desc: 'Target by history, tags or activity.' },
      { icon: 'chat', title: 'Two-way replies', desc: 'Responses land in the inbox.' },
      { icon: 'lock', title: 'Opt-out handling', desc: 'Consent managed automatically.' },
    ],
    cta: 'Broadcast, and stay in one inbox',
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
    ],
    cta: 'Automate the busywork',
  },
}
const ALL = [
  { label: 'Ideas Board', href: '/product/ideas', icon: 'idea', color: CORAL },
  { label: 'Roadmap', href: '/product/roadmap', icon: 'map', color: BLUE },
  { label: 'Announcements', href: '/product/announcements', icon: 'megaphone', color: GREEN },
  { label: 'Knowledgebase', href: '/product/knowledgebase', icon: 'book', color: YELLOW },
  { label: 'Shared Inbox', href: '/product/inbox', icon: 'inbox', color: TEAL },
  { label: 'Contacts & CRM', href: '/product/crm', icon: 'user', color: BLUE },
  { label: 'Media Gallery', href: '/product/gallery', icon: 'folder', color: PURPLE },
  { label: 'Notes', href: '/product/notes', icon: 'pen', color: PINK },
  { label: 'Orders', href: '/product/orders', icon: 'tag', color: CORAL },
  { label: 'Payments', href: '/product/payments', icon: 'bolt', color: GREEN },
  { label: 'Link Reports', href: '/product/links', icon: 'link', color: CYAN },
  { label: 'Insights', href: '/product/insights', icon: 'chart', color: INDIGO },
  { label: 'Calendar', href: '/product/calendar', icon: 'calendar', color: BLUE },
  { label: 'Tasks', href: '/product/tasks', icon: 'kanban', color: PURPLE },
  { label: 'Broadcasts', href: '/product/broadcasts', icon: 'megaphone', color: CORAL },
  { label: 'Automation', href: '/product/automation', icon: 'target', color: TEAL },
]

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
function Reveal({ children, delay = 0, y = 30 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
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
const ArrowRight = ({ s = 16 }: { s?: number }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>)
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
  const canvas = dark ? '#0e0f18' : '#fff6f2'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const navScrolled = scrollY > 30
  const navBg = navScrolled ? (dark ? 'rgba(10,11,18,0.82)' : 'rgba(255,255,255,0.85)') : 'transparent'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: color, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${color}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes wordIn { from{opacity:0;transform:translateY(0.4em)} to{opacity:1;transform:translateY(0)} }
        .fp-navlink:hover { color:${color} !important; }
        .fp-card,.fp-navlink,.fp-btn { transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .fp-card:hover { transform:translateY(-6px); }
        .fp-btn:hover { transform:translateY(-2px); }
        @media (max-width:900px){ .fp-hero{ grid-template-columns:1fr !important; } .fp-desktop{ display:none !important; } .fp-hero-cta{ flex-wrap:nowrap !important; align-items:stretch !important; } .fp-hero-cta > *{ flex:1 1 0 !important; min-width:0 !important; justify-content:center !important; text-align:center !important; padding-left:14px !important; padding-right:14px !important; } }
      `}</style>

      {/* NAV */}
      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '92vh', display: 'flex', alignItems: 'center', padding: 'clamp(84px, 12vw, 120px) 24px 70px', overflow: 'hidden', background: dark ? 'linear-gradient(180deg, #10111b 0%, #0a0b12 60%)' : `linear-gradient(180deg, ${color}12 0%, #ffffff 58%)` }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)' }} />
        <div aria-hidden style={{ position: 'absolute', top: '-12%', left: '-8%', width: 460, height: 460, background: color, borderRadius: '46% 54% 60% 40% / 45% 45% 55% 55%', opacity: dark ? 0.16 : 0.22, transform: `translateY(${scrollY * 0.12}px)` }} />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <div className="fp-hero" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
            <div style={{ maxWidth: 560 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 15px', borderRadius: 999, marginBottom: 22, background: color + '1a', border: `1px solid ${color}44`, color, fontSize: 13, fontWeight: 800 }}><FeatureIcon name={page.icon} color={color} size={15} /> {page.subtitle}</div>
              <h1 style={{ fontSize: 'clamp(40px, 5.6vw, 74px)', fontWeight: 900, lineHeight: 1.0, letterSpacing: '-0.035em', margin: '0 0 22px' }}><BigReveal text={page.title} /></h1>
              <p style={{ fontSize: 'clamp(16px, 1.7vw, 20px)', color: muted, lineHeight: 1.6, maxWidth: 520, margin: '0 0 32px' }}>{page.hero}</p>
              <div className="fp-hero-cta" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <button onClick={go} className="fp-btn" style={btnPrimary}>{page.cta} <ArrowRight /></button>
                <a href="/product" className="fp-btn" style={btnGhost}>See all features</a>
              </div>
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

      {/* FEATURES GRID */}
      <section style={{ padding: 'clamp(64px, 9vw, 110px) 24px', background: canvas, borderTop: `1px solid ${cardBorder}`, borderBottom: `1px solid ${cardBorder}` }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <Reveal><div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 'clamp(30px, 4.6vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 12px', color: text }}>Everything you need</h2>
            <p style={{ fontSize: 18, color: muted, margin: 0 }}>No compromises. No cobbling tools together.</p>
          </div></Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {page.features.map((f: any, i: number) => (
              <Reveal key={f.title} delay={(i % 3) * 0.06}>
                <div className="fp-card" style={{ padding: 26, borderRadius: 20, background: cardBg, border: `1px solid ${cardBorder}`, height: '100%' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: color + '18', border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><FeatureIcon name={f.icon} color={color} size={26} /></div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: text, margin: '0 0 8px' }}>{f.title}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: 'relative', padding: 'clamp(64px, 9vw, 120px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${color}, ${color}bb)`, overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', top: -50, left: '8%', width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: -70, right: '8%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <Reveal>
            <div style={{ display: 'inline-flex', marginBottom: 16, padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.16)' }}><FeatureIcon name={page.icon} color="#fff" size={40} /></div>
            <h2 style={{ fontSize: 'clamp(30px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.04, margin: '0 0 14px' }}>Ready to try {page.subtitle}?</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Set up in about 45 minutes. Free forever for small teams.</p>
            <button onClick={go} className="fp-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started free <ArrowRight /></button>
          </Reveal>
        </div>
      </section>

      {/* Other features */}
      <section style={{ padding: 'clamp(56px, 8vw, 90px) 24px', background: bg }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted, margin: '0 0 32px' }}>Explore all features</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {ALL.filter(f => !f.href.includes(feature)).map(f => (
              <a key={f.label} href={f.href} className="fp-card" style={{ padding: 22, borderRadius: 18, textAlign: 'center', background: cardBg, border: `1px solid ${cardBorder}`, textDecoration: 'none' }}>
                <div style={{ display: 'inline-flex', marginBottom: 12, padding: 12, borderRadius: 14, background: f.color + '18', border: `1px solid ${f.color}33` }}><FeatureIcon name={f.icon} color={f.color} size={26} /></div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: f.color }}>{f.label}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
