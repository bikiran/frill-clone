'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import FeatureIcon from '@/components/FeatureIcon'

/**
 * Shared marketing top-nav with Coax-style mega-menus.
 *
 * One component so every marketing page shows the same menu. Self-contained:
 * owns its scroll state, the open dropdown, the mobile sheet, mouse parallax and
 * the signed-in dashboard redirect. Theme-aware via the `dark` prop.
 *
 * Each mega-menu has a left column grid plus a futuristic parallax feature panel
 * on the right (fills the dead space). Switching menus slides the content in.
 * Every item points at a page that exists (the /product/* pages, /product,
 * /inbox-crm with anchors, /pricing, /signup, or the landing #stories section).
 */

const CORAL = '#ff6a4d', BLUE = '#2b59ff', PURPLE = '#7c5cff', GREEN = '#00c48c', PINK = '#ff4d8d', CYAN = '#0891b2', TEAL = '#0d9488', AMBER = '#d97706'

type Item = { icon: string; title: string; desc: string; href: string }
type Feature = { eyebrow: string; title: string; desc: string; icon: string; chips: string[]; href: string; cta: string }
type Menu = { key: string; label: string; accent: string; columns: { heading: string; items: Item[] }[]; feature: Feature }
type Link = { label: string; href: string }

const MENUS: Menu[] = [
  {
    key: 'product', label: 'Product', accent: CORAL,
    columns: [
      { heading: 'Feedback', items: [
        { icon: 'idea', title: 'Ideas & feedback', desc: 'Collect and vote on ideas', href: '/product/ideas' },
        { icon: 'map', title: 'Roadmap', desc: 'Show what you’re building', href: '/product/roadmap' },
        { icon: 'megaphone', title: 'Announcements', desc: 'Release notes & changelog', href: '/product/announcements' },
      ] },
      { heading: 'Engage', items: [
        { icon: 'vote', title: 'Polls & surveys', desc: 'Ask, measure, decide', href: '/product' },
        { icon: 'pen', title: 'Forms', desc: 'Capture structured input', href: '/product' },
        { icon: 'reaction', title: 'Feedback widget', desc: 'Embed on any page', href: '/product' },
      ] },
      { heading: 'Support & docs', items: [
        { icon: 'book', title: 'Help center', desc: 'Self-serve knowledge base', href: '/product/knowledgebase' },
        { icon: 'chart', title: 'Analytics', desc: 'See what customers want', href: '/product' },
        { icon: 'ai', title: 'AI writing', desc: 'Draft articles & replies', href: '/product' },
      ] },
    ],
    feature: { eyebrow: 'The feedback loop', title: 'Build what customers ask for', desc: 'Ideas, roadmap and announcements — connected end to end.', icon: 'idea', chips: ['+147 votes', 'Shipped ✓', 'On the roadmap'], href: '/product', cta: 'Explore the suite' },
  },
  {
    key: 'solutions', label: 'Solutions', accent: AMBER,
    columns: [
      { heading: 'Support & sales', items: [
        { icon: 'inbox', title: 'Customer support', desc: 'Every question, one inbox', href: '/solutions/customer-support' },
        { icon: 'tag', title: 'Sales & conversions', desc: 'Sell right in the chat', href: '/solutions/sales' },
      ] },
      { heading: 'Grow', items: [
        { icon: 'megaphone', title: 'Marketing & campaigns', desc: 'Broadcasts that get replies', href: '/solutions/marketing' },
        { icon: 'star', title: 'Reviews & reputation', desc: 'More reviews, less chasing', href: '/solutions/reviews' },
      ] },
      { heading: 'Build & get paid', items: [
        { icon: 'idea', title: 'Product feedback', desc: 'Ideas, roadmap, changelog', href: '/solutions/feedback' },
        { icon: 'link', title: 'Payments & orders', desc: 'Get paid in the thread', href: '/solutions/payments' },
      ] },
    ],
    feature: { eyebrow: 'One platform', title: 'Every job, one place', desc: 'Support, sales, marketing, feedback and payments — one inbox, one customer history.', icon: 'target', chips: ['Support', 'Sales', 'Feedback'], href: '/solutions', cta: 'Explore solutions' },
  },
  {
    key: 'channels', label: 'Channels', accent: BLUE,
    columns: [
      { heading: 'Inbound', items: [
        { icon: 'inbox', title: 'Shared inbox', desc: 'Every channel, one thread', href: '/inbox-crm' },
        { icon: 'chat', title: 'Live chat widget', desc: 'Capture leads on your site', href: '/channels/chat-widget' },
        { icon: 'pen', title: 'Contact forms', desc: 'Structured enquiries', href: '/channels/forms' },
      ] },
      { heading: 'Social', items: [
        { icon: 'reaction', title: 'Meta DMs', desc: 'Instagram & Messenger', href: '/channels/meta' },
        { icon: 'chat', title: 'WhatsApp', desc: 'Business number or your own', href: '/channels/whatsapp' },
        { icon: 'star', title: 'Google reviews', desc: 'Reply from the same place', href: '/channels/google-reviews' },
      ] },
      { heading: 'Messaging', items: [
        { icon: 'chat', title: 'SMS & MMS', desc: 'Text customers in one place', href: '/channels/sms' },
        { icon: 'mail', title: 'Email', desc: 'In the same thread', href: '/channels/email' },
        { icon: 'megaphone', title: 'Broadcasts', desc: 'Reach everyone at once', href: '/channels/sms' },
      ] },
    ],
    feature: { eyebrow: 'One shared inbox', title: 'Every channel, one thread', desc: 'WhatsApp, Instagram, SMS, email and chat beside one customer profile.', icon: 'inbox', chips: ['WhatsApp', 'Instagram', 'SMS'], href: '/channels', cta: 'Explore channels' },
  },
  {
    key: 'phones', label: 'Phones', accent: GREEN,
    columns: [
      { heading: 'Calling', items: [
        { icon: 'phone', title: 'Click to Dial', desc: 'One-click from any tab', href: '/phones/click-to-dial' },
        { icon: 'globe', title: 'Browser Dialer', desc: 'Call without leaving Colvy', href: '/phones/browser-dialer' },
        { icon: 'bolt', title: 'HD Audio', desc: 'Crystal-clear quality', href: '/phones/hd-audio' },
        { icon: 'phone', title: 'Mobile App', desc: 'Colvy on iOS & Android', href: '/phones/mobile-app' },
      ] },
      { heading: 'Numbers & routing', items: [
        { icon: 'pin', title: 'Numbers & Porting', desc: 'Local numbers or bring yours', href: '/phones/numbers-porting' },
        { icon: 'target', title: 'IVR & Routing', desc: 'Send callers to the right team', href: '/phones/ivr' },
        { icon: 'link', title: 'Call Forwarding', desc: 'Forward to any number', href: '/phones/call-forwarding' },
        { icon: 'globe', title: 'International', desc: 'Call 100+ countries', href: '/phones/international' },
      ] },
      { heading: 'Records & AI', items: [
        { icon: 'camera', title: 'Call Recording', desc: 'Record, transcribe, summarise', href: '/phones/call-recording' },
        { icon: 'ai', title: 'AI Call Intelligence', desc: 'Caller context & summaries', href: '/phones/ai-call-intelligence' },
        { icon: 'chat', title: 'Missed Call Text Back', desc: 'Auto-SMS the caller', href: '/phones/missed-call-text-back' },
        { icon: 'kanban', title: 'Command Centre', desc: 'Live call dashboard', href: '/phones/command-centre' },
      ] },
    ],
    feature: { eyebrow: 'Built-in calling', title: 'Talk, transfer, transcribe', desc: 'A full phone system inside the inbox — every call logged and summarised.', icon: 'phone', chips: ['Live call', 'AI notes', 'Transcribed'], href: '/phones', cta: 'View all phones' },
  },
  {
    key: 'ai', label: 'AI', accent: PURPLE,
    columns: [
      { heading: 'Assist', items: [
        { icon: 'ai', title: 'AI replies', desc: 'Draft answers in a blink', href: '/ai-assistant/ai-replies' },
        { icon: 'book', title: 'Knowledge base', desc: 'Teach it your docs', href: '/ai-assistant/knowledge-base' },
        { icon: 'pen', title: 'Auto-summaries', desc: 'Every thread, TL;DR’d', href: '/ai-assistant/auto-summaries' },
      ] },
      { heading: 'Act', items: [
        { icon: 'bolt', title: 'AI actions', desc: 'Look up orders, take action', href: '/ai-assistant/ai-actions' },
        { icon: 'target', title: 'Auto-routing', desc: 'Right team, every time', href: '/ai-assistant/auto-routing' },
        { icon: 'bell', title: 'Follow-ups', desc: 'Nudge at the right moment', href: '/ai-assistant/follow-ups' },
      ] },
      { heading: 'Automate', items: [
        { icon: 'calendar', title: 'Tasks & reminders', desc: 'Turn chats into to-dos', href: '/ai-assistant/tasks-reminders' },
        { icon: 'link', title: 'Workflows', desc: 'Trigger actions on events', href: '/ai-assistant/workflows' },
        { icon: 'lock', title: 'You stay in control', desc: 'Approve every action', href: '/ai-assistant/human-in-control' },
      ] },
    ],
    feature: { eyebrow: 'Always-on AI', title: 'Replies drafted in a blink', desc: 'An assistant that knows your docs, drafts replies and takes real actions.', icon: 'ai', chips: ['Auto-reply', 'Summarise', 'Take action'], href: '/ai-assistant', cta: 'Meet the AI' },
  },
  {
    key: 'features', label: 'Features', accent: TEAL,
    columns: [
      { heading: 'Inbox & CRM', items: [
        { icon: 'inbox', title: 'Shared inbox', desc: 'Every channel, one thread', href: '/features/inbox' },
        { icon: 'user', title: 'Contacts & CRM', desc: 'Full profile & history', href: '/features/crm' },
        { icon: 'folder', title: 'Media gallery', desc: 'Every photo & file', href: '/features/gallery' },
        { icon: 'pen', title: 'Notes', desc: 'Internal notes & @mentions', href: '/features/notes' },
      ] },
      { heading: 'Commerce', items: [
        { icon: 'tag', title: 'Orders', desc: 'Live orders in the chat', href: '/features/orders' },
        { icon: 'bolt', title: 'Payments', desc: 'Get paid in the thread', href: '/features/payments' },
        { icon: 'link', title: 'Link reports', desc: 'See who clicked what', href: '/features/links' },
        { icon: 'chart', title: 'Insights', desc: 'Conversations & revenue', href: '/features/insights' },
      ] },
      { heading: 'Organise', items: [
        { icon: 'calendar', title: 'Calendar', desc: 'Bookings & reminders', href: '/features/calendar' },
        { icon: 'kanban', title: 'Tasks', desc: 'Turn chats into to-dos', href: '/features/tasks' },
        { icon: 'megaphone', title: 'Broadcasts', desc: 'Reach everyone at once', href: '/features/broadcasts' },
        { icon: 'target', title: 'Automation', desc: 'Trigger actions on events', href: '/features/automation' },
      ] },
    ],
    feature: { eyebrow: 'The platform', title: 'Everything in one inbox', desc: 'Messages, contacts, orders, payments, tasks and insights — on one screen.', icon: 'inbox', chips: ['CRM', 'Orders', 'Payments'], href: '/features', cta: 'Explore features' },
  },
  {
    key: 'integrations', label: 'Integrations', accent: CYAN,
    columns: [
      { heading: 'Commerce', items: [
        { icon: 'tag', title: 'WooCommerce', desc: 'Live orders in the chat', href: '/integrations/woocommerce' },
        { icon: 'tag', title: 'Shopify', desc: 'Orders & customers synced', href: '/integrations/shopify' },
      ] },
      { heading: 'Payments & alerts', items: [
        { icon: 'bolt', title: 'Stripe', desc: 'Take payments in chat', href: '/integrations/stripe' },
        { icon: 'chat', title: 'Slack', desc: 'Get alerts where you work', href: '/integrations/slack' },
      ] },
      { heading: 'Automate & build', items: [
        { icon: 'plug', title: 'Zapier', desc: 'Connect 5,000+ apps', href: '/integrations/zapier' },
        { icon: 'link', title: 'Webhooks & API', desc: 'Build anything custom', href: '/integrations/api' },
      ] },
    ],
    feature: { eyebrow: 'Plays nice', title: 'Connect your whole stack', desc: 'Commerce, payments and the tools you already run — wired into every thread.', icon: 'plug', chips: ['WooCommerce', 'Stripe', 'Shopify'], href: '/integrations', cta: 'Browse integrations' },
  },
  {
    key: 'industries', label: 'Industries', accent: PINK,
    columns: [
      { heading: 'Digital', items: [
        { icon: 'bolt', title: 'SaaS & tech', desc: 'Feedback → roadmap → ship', href: '/industries/saas' },
        { icon: 'star', title: 'Agencies', desc: 'Every client in one place', href: '/industries/agencies' },
      ] },
      { heading: 'Commerce & hospitality', items: [
        { icon: 'tag', title: 'E-commerce', desc: 'Sell inside the chat', href: '/industries/ecommerce' },
        { icon: 'reaction', title: 'Hospitality', desc: 'Bookings & guest comms', href: '/industries/hospitality' },
      ] },
      { heading: 'Service', items: [
        { icon: 'pin', title: 'Real estate', desc: 'Leads & follow-ups in a thread', href: '/industries/real-estate' },
        { icon: 'help', title: 'Healthcare', desc: 'Reminders & patient comms', href: '/industries/healthcare' },
      ] },
    ],
    feature: { eyebrow: 'Made to fit', title: 'Tuned to your industry', desc: 'The same platform, shaped around how your team actually works.', icon: 'star', chips: ['Retail', 'Hospitality', 'SaaS'], href: '/industries', cta: 'See industries' },
  },
]

const LINKS: Link[] = [
  { label: 'Pricing', href: '/pricing' },
]

// Secondary links tucked into a compact "More" dropdown.
const MORE_LINKS: Link[] = [
  { label: 'Blog', href: '/blog' },
  { label: 'Changelog', href: '/changelog' },
  { label: 'Testimonials', href: '/testimonials' },
  { label: 'Compare', href: '/compare' },
]

const SunIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>)
const MoonIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>)
const Chevron = ({ open }: { open: boolean }) => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s cubic-bezier(0.16,1,0.3,1)' }}><polyline points="6 9 12 15 18 9" /></svg>)
const MenuIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>)
const CloseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)

export default function MarketingNav({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const pathname = usePathname() || ''
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [lastKey, setLastKey] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [mobileSection, setMobileSection] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [par, setPar] = useState({ x: 0, y: 0 })   // mouse parallax, -0.5..0.5
  const closeTimer = useRef<any>(null)
  const moreTimer = useRef<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user || null))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    let raf = 0
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { setScrolled(window.scrollY > 30); raf = 0 }) }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); setMobileOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => { l?.subscription?.unsubscribe(); window.removeEventListener('scroll', onScroll); window.removeEventListener('keydown', onKey); if (raf) cancelAnimationFrame(raf) }
  }, [])

  useEffect(() => { setOpen(null); setMobileOpen(false) }, [pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mobileOpen])

  const text = dark ? '#f4f5fb' : '#0f1119'
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const bg = dark ? '#0a0b12' : '#ffffff'
  const cardBg = dark ? 'rgba(255,255,255,0.05)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,17,25,0.09)'
  const panelBg = dark ? '#12131d' : '#ffffff'
  const hoverBg = dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,17,25,0.035)'
  const solid = scrolled || !!open || mobileOpen
  const navBg = solid ? (dark ? 'rgba(10,11,18,0.85)' : 'rgba(255,255,255,0.88)') : 'transparent'

  const openNow = (k: string) => { if (closeTimer.current) clearTimeout(closeTimer.current); setLastKey(k); setOpen(k); setMoreOpen(false) }
  const toggle = (k: string) => { if (open === k) setOpen(null); else openNow(k) }
  const scheduleClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(null), 130) }
  const onPanelMove = (e: React.MouseEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPar({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 }) }

  const isActive = (k: string) => (k === 'product' && pathname.startsWith('/product')) || (k === 'solutions' && pathname.startsWith('/solutions')) || (k === 'channels' && (pathname.startsWith('/inbox-crm') || pathname.startsWith('/channels'))) || (k === 'phones' && pathname.startsWith('/phones')) || (k === 'integrations' && pathname.startsWith('/integrations')) || (k === 'ai' && pathname.startsWith('/ai-assistant')) || (k === 'features' && pathname.startsWith('/features')) || (k === 'pricing' && pathname.startsWith('/pricing'))
  const moreActive = MORE_LINKS.some(n => pathname.startsWith(n.href))

  const handleDashboard = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try {
      const hostname = window.location.hostname
      if (hostname.includes('localhost') || hostname.includes('vercel.app')) { window.location.href = '/admin'; return }
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (co?.slug) { window.location.href = boardUrl(co.slug, '/admin'); return }
      await redirectToUserAdmin(user.id)
    } catch { await redirectToUserAdmin(user.id) }
  }

  const primaryBtn: React.CSSProperties = { padding: '10px 20px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 14.5, border: 'none', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }
  const panelMenu = MENUS.find(m => m.key === lastKey) || null
  const panelOpen = !!open
  const ax = panelMenu?.accent || CORAL

  return (
    <nav
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: navBg, backdropFilter: solid ? 'blur(18px)' : 'none', WebkitBackdropFilter: solid ? 'blur(18px)' : 'none', borderBottom: `1px solid ${solid ? cardBorder : 'transparent'}`, transition: 'background 0.3s, border-color 0.3s' }}
      onMouseLeave={scheduleClose}
    >
      <style>{`
        .mn-link{transition:color .2s cubic-bezier(0.16,1,0.3,1);font-family:inherit}
        .mn-link:hover{color:${CORAL} !important}
        .mn-item{transition:background .2s cubic-bezier(0.16,1,0.3,1),transform .2s cubic-bezier(0.16,1,0.3,1)}
        .mn-item:hover{background:${hoverBg} !important;transform:translateX(2px)}
        .mn-item:hover .mn-ico{transform:scale(1.08) rotate(-3deg)}
        .mn-ico{transition:transform .25s cubic-bezier(0.34,1.56,0.64,1)}
        .mn-cta{transition:transform .22s cubic-bezier(0.16,1,0.3,1),box-shadow .22s cubic-bezier(0.16,1,0.3,1)}
        .mn-cta:hover{transform:translateY(-1px);box-shadow:0 10px 24px ${CORAL}44}
        .mn-panel{transform-origin:top center;transition:opacity .28s cubic-bezier(0.16,1,0.3,1),transform .34s cubic-bezier(0.16,1,0.3,1);will-change:opacity,transform}
        .mn-panel-open{opacity:1;transform:translateY(0) scale(1)}
        .mn-panel-closed{opacity:0;transform:translateY(-10px) scale(0.985);pointer-events:none}
        /* Slide the content across when switching menus */
        @keyframes mnSlide{from{opacity:0;transform:translateX(34px)}to{opacity:1;transform:none}}
        .mn-slide{animation:mnSlide .34s cubic-bezier(0.16,1,0.3,1) both}
        @keyframes mnItemIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .mn-panel-open .mn-stagger{animation:mnItemIn .42s cubic-bezier(0.16,1,0.3,1) both}
        @keyframes mnFeatIn{from{opacity:0;transform:translateX(20px) scale(.98)}to{opacity:1;transform:none}}
        .mn-feat{animation:mnFeatIn .44s cubic-bezier(0.16,1,0.3,1) both}
        @keyframes mnSheetIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
        .mn-sheet{animation:mnSheetIn .3s cubic-bezier(0.16,1,0.3,1) both}
        .mn-float{transition:transform .25s cubic-bezier(0.16,1,0.3,1)}
        .mn-desktop{display:flex}
        .mn-mtoggle{display:none}
        @media(max-width:1180px){.mn-desktop{display:none !important}.mn-mtoggle{display:flex !important}}
        @media(prefers-reduced-motion:reduce){.mn-cta,.mn-link,.mn-item,.mn-ico,.mn-panel,.mn-float{transition:none !important}.mn-stagger,.mn-slide,.mn-feat,.mn-sheet{animation:none !important}}
      `}</style>

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', flexShrink: 0 }}>
          <img src="/icon-512.png" alt="Colvy" width={32} height={32} style={{ borderRadius: 9, display: 'block' }} />
          <span style={{ fontWeight: 900, fontSize: 22, color: text, letterSpacing: '-0.02em' }}>Colvy</span>
        </a>

        {/* Desktop menu */}
        <div className="mn-desktop" style={{ alignItems: 'center', gap: 0 }}>
          {MENUS.map(m => (
            <button key={m.key} type="button" className="mn-link"
              onMouseEnter={() => openNow(m.key)} onFocus={() => openNow(m.key)}
              onClick={() => toggle(m.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 10px', borderRadius: 10, fontSize: 14, fontWeight: isActive(m.key) ? 800 : 600, color: isActive(m.key) || open === m.key ? CORAL : muted, background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {m.label}<Chevron open={open === m.key} />
            </button>
          ))}
          {LINKS.map(n => (
            <a key={n.label} href={n.href} className="mn-link" style={{ padding: '8px 10px', borderRadius: 10, fontSize: 14, fontWeight: isActive('pricing') && n.label === 'Pricing' ? 800 : 600, color: isActive('pricing') && n.label === 'Pricing' ? CORAL : muted, textDecoration: 'none', whiteSpace: 'nowrap' }}>{n.label}</a>
          ))}
          {/* More: compact dropdown for secondary links */}
          <div style={{ position: 'relative' }} onMouseEnter={() => { if (moreTimer.current) clearTimeout(moreTimer.current); if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(null); setMoreOpen(true) }} onMouseLeave={() => { if (moreTimer.current) clearTimeout(moreTimer.current); moreTimer.current = setTimeout(() => setMoreOpen(false), 160) }}>
            <button type="button" className="mn-link" onClick={() => setMoreOpen(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 10px', borderRadius: 10, fontSize: 14, fontWeight: moreOpen || moreActive ? 800 : 600, color: moreOpen || moreActive ? CORAL : muted, background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              More<Chevron open={moreOpen} />
            </button>
            {/* paddingTop bridges the gap to the button so the menu doesn't vanish mid-hover */}
            <div className={moreOpen ? 'mn-sheet' : ''} style={{ position: 'absolute', top: '100%', right: 0, paddingTop: 8, minWidth: 180, display: moreOpen ? 'block' : 'none' }}>
            <div style={{ background: panelBg, border: `1px solid ${cardBorder}`, borderRadius: 14, boxShadow: '0 18px 40px rgba(15,17,25,0.16)', padding: 8 }}>
              {MORE_LINKS.map(n => (
                <a key={n.label} href={n.href} className="mn-item" style={{ display: 'block', padding: '9px 12px', borderRadius: 10, fontSize: 14, fontWeight: 700, color: pathname.startsWith(n.href) ? CORAL : text, textDecoration: 'none' }}>{n.label}</a>
              ))}
            </div>
            </div>
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button onClick={onToggleDark} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{dark ? <SunIcon /> : <MoonIcon />}</button>
          {user ? (
            <button onClick={handleDashboard} className="mn-cta mn-desktop" style={primaryBtn}>Dashboard →</button>
          ) : (
            <>
              <a href="/signin" className="mn-link mn-desktop" style={{ fontSize: 14, fontWeight: 600, color: muted, textDecoration: 'none', padding: '0 6px' }}>Sign in</a>
              <a href="/signup" className="mn-cta mn-desktop" style={primaryBtn}>Get started</a>
            </>
          )}
          <button className="mn-mtoggle" onClick={() => setMobileOpen(v => !v)} aria-label="Menu" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{mobileOpen ? <CloseIcon /> : <MenuIcon />}</button>
        </div>
      </div>

      {/* Desktop mega-menu panel */}
      {panelMenu && (
        <div className={`mn-desktop mn-panel ${panelOpen ? 'mn-panel-open' : 'mn-panel-closed'}`}
          onMouseEnter={() => openNow(panelMenu.key)} onMouseLeave={scheduleClose} onMouseMove={onPanelMove}
          style={{ position: 'absolute', top: 68, left: 0, right: 0, background: panelBg, borderBottom: `1px solid ${cardBorder}`, boxShadow: '0 24px 50px rgba(15,17,25,0.16)' }}>
          <div key={lastKey || ''} className="mn-slide" style={{ maxWidth: 1440, margin: '0 auto', padding: '26px 24px 26px', display: 'flex', gap: 40, alignItems: 'stretch' }}>
            {/* Left: columns */}
            <div style={{ display: 'flex', gap: 40, flex: '1 1 auto', minWidth: 0 }}>
              {panelMenu.columns.map((col, ci) => (
                <div key={col.heading} style={{ flex: 1, minWidth: 0 }}>
                  <p className="mn-stagger" style={{ margin: '0 12px 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, animationDelay: `${ci * 0.04}s` }}>{col.heading}</p>
                  {col.items.map((it, ii) => (
                    <a key={it.title} href={it.href} className="mn-item mn-stagger" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 12px', borderRadius: 12, textDecoration: 'none', animationDelay: `${ci * 0.04 + (ii + 1) * 0.04}s` }}>
                      <span className="mn-ico" style={{ width: 36, height: 36, borderRadius: 10, background: ax + '16', color: ax, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatureIcon name={it.icon} color={ax} size={18} /></span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: text }}>{it.title}</span>
                        <span style={{ display: 'block', fontSize: 12.5, color: muted, marginTop: 1 }}>{it.desc}</span>
                      </span>
                    </a>
                  ))}
                </div>
              ))}
            </div>

            {/* Right: futuristic parallax feature panel */}
            <a href={panelMenu.feature.href} className="mn-feat" style={{ position: 'relative', flex: '0 0 360px', maxWidth: 360, borderRadius: 20, overflow: 'hidden', textDecoration: 'none', minHeight: 240, background: `linear-gradient(150deg, ${ax} 0%, ${ax}cc 40%, ${dark ? '#0b0c14' : '#171a2b'} 115%)`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, padding: 22 }}>
              {/* glow blobs (parallax) */}
              <div className="mn-float" aria-hidden style={{ position: 'absolute', top: -40, right: -30, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', filter: 'blur(30px)', transform: `translate(${par.x * 26}px, ${par.y * 26}px)` }} />
              <div className="mn-float" aria-hidden style={{ position: 'absolute', bottom: -50, left: -30, width: 170, height: 170, borderRadius: '50%', background: 'rgba(0,0,0,0.22)', filter: 'blur(34px)', transform: `translate(${par.x * -20}px, ${par.y * -20}px)` }} />
              {/* watermark icon (parallax, opposite) */}
              <div className="mn-float" aria-hidden style={{ position: 'absolute', top: 16, right: 16, color: 'rgba(255,255,255,0.9)', transform: `translate(${par.x * -16}px, ${par.y * -16}px)` }}><FeatureIcon name={panelMenu.feature.icon} color="rgba(255,255,255,0.92)" size={40} /></div>
              {/* floating chips (parallax) — in normal flow at the top so they never overlap the copy */}
              <div aria-hidden style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 8, paddingRight: 46 }}>
                {panelMenu.feature.chips.map((c, i) => (
                  <span key={c} className="mn-float" style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 999, padding: '5px 11px', transform: `translate(${par.x * (14 + i * 8)}px, ${par.y * (10 + i * 6)}px)` }}>{c}</span>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>{panelMenu.feature.eyebrow}</p>
                <p style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 900, lineHeight: 1.15, color: '#fff', letterSpacing: '-0.01em' }}>{panelMenu.feature.title}</p>
                <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.88)' }}>{panelMenu.feature.desc}</p>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 800, color: '#fff' }}>{panelMenu.feature.cta} →</span>
              </div>
            </a>
          </div>
        </div>
      )}

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className="mn-sheet" style={{ background: bg, borderTop: `1px solid ${cardBorder}`, padding: '10px 20px 22px', maxHeight: 'calc(100dvh - 68px)', overflowY: 'auto' }}>
          {MENUS.map(m => (
            <div key={m.key} style={{ borderBottom: `1px solid ${cardBorder}` }}>
              <button type="button" onClick={() => setMobileSection(mobileSection === m.key ? null : m.key)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '15px 0', fontSize: 16, fontWeight: 700, color: text, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                {m.label}<Chevron open={mobileSection === m.key} />
              </button>
              {mobileSection === m.key && (
                <div style={{ paddingBottom: 10 }}>
                  {m.columns.flatMap(c => c.items).map(it => (
                    <a key={it.title} href={it.href} onClick={() => setMobileOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 6px', textDecoration: 'none' }}>
                      <span style={{ width: 34, height: 34, borderRadius: 9, background: m.accent + '16', color: m.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatureIcon name={it.icon} color={m.accent} size={17} /></span>
                      <span>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: text }}>{it.title}</span>
                        <span style={{ display: 'block', fontSize: 12, color: muted }}>{it.desc}</span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {[...LINKS, ...MORE_LINKS].map(n => (
            <a key={n.label} href={n.href} onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '15px 0', fontSize: 16, fontWeight: 700, color: text, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` }}>{n.label}</a>
          ))}
          {!user && <a href="/signin" onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '15px 0', fontSize: 16, fontWeight: 600, color: muted, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` }}>Sign in</a>}
          <button onClick={handleDashboard} style={{ ...primaryBtn, marginTop: 16, width: '100%', justifyContent: 'center', padding: '13px 0', fontSize: 15 }}>{user ? 'Dashboard →' : 'Get started free'}</button>
        </div>
      )}
    </nav>
  )
}
