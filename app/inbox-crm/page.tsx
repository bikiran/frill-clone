'use client'

import { useEffect, useState, useRef, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import OmniInboxDemo from '@/components/OmniInboxDemo'
import MarketingFooter from '@/components/MarketingFooter'

// ─────────────────────────────────────────────────────────────────────────────
// Inbox & CRM product page — matches the main landing's bold, bright, full-bleed
// system (logo nav, big type, colour bands, big-text reveal, sleek device,
// parallax, gradient CTA), keeping all the deep-dive content.
// ─────────────────────────────────────────────────────────────────────────────

const CORAL = '#ff6a4d'
const BLUE = '#2b59ff'
const YELLOW = '#ffcb45'
const GREEN = '#00c48c'
const PURPLE = '#7c5cff'
const PINK = '#ff4d8d'
const CYAN = '#0891b2'
const INK = '#0f1119'

const HERO_VERBS = ['Sell', 'Reply', 'Upsell', 'Support', 'Close']

const CHANNELS = [
  { n: 'WhatsApp', c: '#25D366' }, { n: 'Instagram', c: '#E1306C' }, { n: 'Messenger', c: '#0084FF' },
  { n: 'Email', c: PURPLE }, { n: 'SMS', c: CYAN }, { n: 'Live chat', c: CORAL }, { n: 'Website forms', c: GREEN },
]

const CAPS = [
  { c: CORAL, t: 'Calls & voicemail', d: 'Make, receive and log calls with context and AI summaries.', p: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z' },
  { c: BLUE, t: 'Every channel', d: 'WhatsApp, Instagram, Messenger, email, SMS, chat & forms — one thread.', p: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { c: PURPLE, t: 'AI assistant', d: 'Drafts replies in your tone and can handle whole conversations.', p: 'M12 2a3 3 0 0 1 3 3v1a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z M5 11h14 M5 11a7 7 0 0 0 14 0 M9 21h6' },
  { c: GREEN, t: 'Customer context', d: 'Who’s messaging, their orders and history — before you reply.', p: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { c: PINK, t: 'Payments & orders', d: 'Send payment links, take orders and issue refunds in-thread.', p: 'M1 4h22v16H1z M1 10h22' },
  { c: YELLOW, t: 'Google reviews', d: 'Request reviews automatically and reply from the same inbox.', p: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { c: CYAN, t: 'Link tracking', d: 'Trackable links with clicks, unique customers and revenue.', p: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7' },
  { c: CORAL, t: 'Automations', d: 'Workflows and follow-ups that run while you sleep or are away.', p: 'M12 2v4 M12 18v4 M4.9 4.9l2.8 2.8 M16.3 16.3l2.8 2.8 M2 12h4 M18 12h4 M4.9 19.1l2.8-2.8 M16.3 7.7l2.8-2.8' },
]

const AISTEPS = [
  { n: '01', c: PURPLE, t: 'Start in the Playground', d: 'Test your assistant in a safe space. Ask it anything and tune its knowledge until you’re happy.' },
  { n: '02', c: BLUE, t: 'Turn on draft replies', d: 'It drafts responses for you to approve. You stay in control while it learns your tone and style.' },
  { n: '03', c: GREEN, t: 'Let it answer everything', d: 'Once it acts like an employee, let it handle incoming questions. Step in only when you want to.' },
]

// Deep-dive blocks with themed mocks. Colours are overridden to the brand
// palette per index in the render.
const BLOCKS = (dark: boolean, border: string, ink: string, sub: string) => [
  { id: 'inbox', tag: 'Shared inbox', title: 'One inbox for every channel',
    body: 'WhatsApp, Instagram, Messenger, email, SMS and website chat land in a single shared queue. Assign threads to teammates, leave private notes, @mention colleagues and never lose a conversation between apps again.',
    points: ['Assign, snooze and resolve like a team', 'Private notes, @mentions and internal tasks', 'Typing indicators, read receipts and reactions'],
    mock: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 420 }}>
        {[['SR', 'Sam Rivera', 'Do you still have the 4ft…', '#25D366', '2'], ['MO', 'Mia Okafor', 'Thanks — order received!', '#E1306C', ''], ['JL', 'Jon Lee', 'Can I get a refund on…', PURPLE, '1']].map(([in_, nm, msg, cl, b]) => (
          <div key={nm} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 14, background: dark ? '#171826' : '#fff', border: `1px solid ${border}`, boxShadow: '0 8px 24px rgba(15,17,25,0.06)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: cl, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{in_}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>{nm}</div>
              <div style={{ fontSize: 11.5, color: sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg}</div>
            </div>
            {b && <span style={{ minWidth: 18, height: 18, borderRadius: 999, background: '#ff5247', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{b}</span>}
          </div>
        ))}
      </div>
    ) },
  { id: 'crm', tag: 'Built-in CRM', title: 'A full customer profile beside every chat',
    body: 'Every conversation is tied to a contact record — lifetime value, order history, tags, notes and the outlet they belong to. Your team answers with context, not guesswork.',
    points: ['Lifetime value, orders and marketing consent', 'Custom tags, fields and relationship links', 'Merged identity across phone, email and socials'],
    mock: (
      <div style={{ padding: 18, borderRadius: 16, background: dark ? '#171826' : '#fff', border: `1px solid ${border}`, width: '100%', maxWidth: 360, boxShadow: '0 14px 40px rgba(15,17,25,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: `linear-gradient(135deg,${CORAL},${PURPLE})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>SR</div>
          <div><div style={{ fontSize: 14, fontWeight: 700, color: ink }}>Sam Rivera</div><div style={{ fontSize: 12, color: sub }}>VIP · Sydney outlet</div></div>
        </div>
        {[['Lifetime value', '$4,280'], ['Orders', '17'], ['Avg. order', '$251']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: `1px solid ${border}`, fontSize: 12.5 }}><span style={{ color: sub }}>{k}</span><span style={{ color: ink, fontWeight: 700 }}>{v}</span></div>
        ))}
      </div>
    ) },
  { id: 'gallery', tag: 'Unified media gallery', title: 'Send the right photo in one tap',
    body: 'Keep a categorised library of product photos and videos. Drop them straight into a chat, add internal notes with @mentions, and reuse them across every channel.',
    points: ['Categorised photos & videos, fully searchable', 'One-tap share into any conversation', 'Notes & @mentions per item for your team'],
    mock: (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, width: '100%', maxWidth: 360 }}>
        {[BLUE, GREEN, YELLOW, PINK, CYAN, PURPLE].map((c, i) => (
          <div key={i} style={{ position: 'relative', paddingTop: '80%', borderRadius: 12, background: `linear-gradient(135deg,${c}dd,${c}66)`, overflow: 'hidden' }}>
            {i === 1 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3" /></svg></div>}
          </div>
        ))}
      </div>
    ) },
  { id: 'woo', tag: 'Advanced WooCommerce', title: 'Orders, refunds & carts — in the thread',
    body: 'Look up a live WooCommerce order, issue a refund, or recover an abandoned cart without switching tabs. The customer’s purchase history sits right next to the conversation.',
    points: ['Live order lookup & one-click refunds', 'Abandoned-cart recovery messages', 'Full order history synced to the contact'],
    mock: (
      <div style={{ padding: 18, borderRadius: 16, background: dark ? '#171826' : '#fff', border: `1px solid ${border}`, width: '100%', maxWidth: 340, boxShadow: '0 14px 40px rgba(15,17,25,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>Order #10428</span><span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: GREEN + '22', color: GREEN }}>PAID</span></div>
        {[['4ft Reef Tank', '$899'], ['Protein Skimmer', '$149'], ['Shipping', '$0']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', color: sub }}><span>{k}</span><span style={{ color: ink }}>{v}</span></div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, paddingTop: 8, marginTop: 4, borderTop: `1px solid ${border}`, color: ink }}><span>Total</span><span>$1,048</span></div>
        <button style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 10, border: 'none', background: PINK, color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>Refund order</button>
      </div>
    ) },
  { id: 'links', tag: 'Link generator & reports', title: 'Trackable links that prove ROI',
    body: 'Generate short links for products, payments or bookings and see exactly who clicked, how many unique customers engaged, and which orders each link influenced.',
    points: ['Branded short links per product or outlet', 'Clicks, unique recipients & conversions', 'Revenue attributed back to each link'],
    mock: (
      <div style={{ padding: 18, borderRadius: 16, background: dark ? '#171826' : '#fff', border: `1px solid ${border}`, width: '100%', maxWidth: 360, boxShadow: '0 14px 40px rgba(15,17,25,0.08)' }}>
        <div style={{ fontSize: 11.5, color: sub, marginBottom: 12 }}>colvy.link/reef-sale · last 7 days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
          {[40, 62, 55, 88, 74, 96, 68].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '5px 5px 0 0', background: `linear-gradient(180deg,${CYAN},${CYAN}66)`, animation: `oi-grow 1.2s ${i * 0.08}s cubic-bezier(0.16,1,0.3,1) both` }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          {[['312', 'Clicks'], ['184', 'Unique'], ['$2.1k', 'Revenue']].map(([v, k]) => (
            <div key={k}><div style={{ fontSize: 15, fontWeight: 800, color: ink }}>{v}</div><div style={{ fontSize: 10.5, color: sub }}>{k}</div></div>
          ))}
        </div>
      </div>
    ) },
  { id: 'insights', tag: 'Customer & location insights', title: 'Know your customers and your outlets',
    body: 'See spend, order frequency and behaviour by customer and by location. Location-aware analytics keep each outlet’s numbers — and each customer’s history — where they belong.',
    points: ['Per-customer spend & retention', 'Per-outlet performance & comparisons', 'Location-aware content and reporting'],
    mock: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', maxWidth: 360 }}>
        {[['$38.4k', 'Sydney', GREEN, '+12%'], ['$29.1k', 'Melbourne', BLUE, '+8%'], ['842', 'Repeat buyers', CORAL, '+21%'], ['4.8★', 'Avg. rating', YELLOW, '+0.3']].map(([v, k, c, d]) => (
          <div key={k} style={{ padding: 15, borderRadius: 14, background: dark ? '#171826' : '#fff', border: `1px solid ${border}`, boxShadow: '0 8px 24px rgba(15,17,25,0.05)' }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: ink }}>{v}</div>
            <div style={{ fontSize: 11, color: sub }}>{k}</div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: c as string, marginTop: 4 }}>{d}</div>
          </div>
        ))}
      </div>
    ) },
  { id: 'tasks', tag: 'Tasks, calendar & automations', title: 'Turn chats into things that get done',
    body: 'Spin any message into an assignable task, colour-code it, set it to repeat, and see it on a calendar. Automate replies and follow-ups so nothing slips.',
    points: ['One-click task from any conversation', 'Recurring tasks & calendar view', 'Auto-replies and scheduled follow-ups'],
    mock: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 360 }}>
        {[['Call Sam re: reef tank', CORAL, true], ['Ship order #10428', GREEN, true], ['Follow up abandoned cart', YELLOW, false]].map(([t, c, done]) => (
          <div key={t as string} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: dark ? '#171826' : '#fff', border: `1px solid ${border}`, boxShadow: '0 8px 24px rgba(15,17,25,0.05)' }}>
            <span style={{ width: 18, height: 18, borderRadius: 6, border: `2px solid ${c}`, background: done ? (c as string) : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: ink, textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{t}</span>
          </div>
        ))}
      </div>
    ) },
]
const BLOCK_ACCENTS = [CORAL, BLUE, PURPLE, PINK, CYAN, GREEN, YELLOW]

// ── hooks / helpers ──────────────────────────────────────────────────────────
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
function Reveal({ children, delay = 0, y = 34 }: { children: ReactNode; delay?: number; y?: number }) {
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
function Parallax({ strength = 0.06, children }: { strength?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [y, setY] = useState(0)
  useEffect(() => {
    let raf = 0
    const on = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (el) { const r = el.getBoundingClientRect(); setY(((r.top + r.height / 2) - window.innerHeight / 2) * -strength) }
        raf = 0
      })
    }
    on(); window.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf) }
  }, [strength])
  return <div ref={ref} style={{ transform: `translateY(${y}px)`, willChange: 'transform' }}>{children}</div>
}
function useCycle(len: number, ms: number) {
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI(v => (v + 1) % len), ms); return () => clearInterval(t) }, [len, ms])
  return i
}
function RotatingWord({ words, color }: { words: string[]; color?: string }) {
  const i = useCycle(words.length, 1900)
  return <span key={i} style={{ color, display: 'inline-block', animation: 'wordIn 0.55s cubic-bezier(0.16,1,0.3,1)' }}>{words[i]}</span>
}

const ArrowRight = ({ s = 16 }: { s?: number }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>)
const SunIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>)
const MoonIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>)
const MenuIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>)
const CloseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)

export default function InboxCrmPage() {
  const [user, setUser] = useState<any>(null)
  const [dark, setDark] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    let raf = 0
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { setScrollY(window.scrollY); raf = 0 }) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { l?.subscription?.unsubscribe(); window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const onHeroMouse = (e: React.MouseEvent) => setMouse({ x: (e.clientX / window.innerWidth - 0.5), y: (e.clientY / window.innerHeight - 0.5) })

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
  const blocks = BLOCKS(dark, cardBorder, text, muted)

  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${CORAL}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes wordIn { from{opacity:0;transform:translateY(0.4em)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:0.25} 50%{opacity:1} }
        @keyframes oi-grow { from{transform:scaleY(0);transform-origin:bottom} to{transform:scaleY(1)} }
        .cv-btn-primary:hover { transform:translateY(-2px); box-shadow:0 16px 42px ${CORAL}66; }
        .cv-btn-primary,.cv-btn-ghost,.cv-card,.cv-navlink { transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .cv-btn-ghost:hover { border-color:${CORAL}; color:${CORAL}; }
        .cv-card:hover { transform:translateY(-6px); }
        .cv-navlink:hover { color:${CORAL} !important; }
        .cv-marquee-track { display:flex; width:max-content; animation:marquee 30s linear infinite; }
        .cv-sm{ display:none; }
        @media (max-width:900px){ .cv-row{ grid-template-columns:1fr !important; } .cv-hero-grid{ grid-template-columns:1fr !important; } .cv-desktop{ display:none !important; } .cv-mobile-toggle{ display:flex !important; } .cv-lg{ display:none !important; } .cv-sm{ display:inline !important; } .cv-hero-cta{ flex-wrap:nowrap !important; } .cv-hero-cta > *{ flex:1 1 0 !important; min-width:0 !important; justify-content:center !important; padding-left:14px !important; padding-right:14px !important; white-space:nowrap !important; } }
        @media (prefers-reduced-motion: reduce){ .cv-marquee-track{ animation:none } }
      `}</style>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: navBg, backdropFilter: navScrolled ? 'blur(18px)' : 'none', borderBottom: `1px solid ${navScrolled ? cardBorder : 'transparent'}`, transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <img src="/icon-512.png" alt="Colvy" width={32} height={32} style={{ borderRadius: 9, display: 'block' }} />
            <span style={{ fontWeight: 900, fontSize: 22, color: text, letterSpacing: '-0.02em' }}>Colvy</span>
          </a>
          <div className="cv-desktop" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {[{ label: 'Inbox & CRM', href: '/inbox-crm', hot: true }, { label: 'Ideas', href: '/product/ideas' }, { label: 'Roadmap', href: '/product/roadmap' }, { label: 'Announcements', href: '/product/announcements' }, { label: 'Pricing', href: '/pricing' }].map((n: any) => (
              <a key={n.label} href={n.href} className="cv-navlink" style={{ padding: '8px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: n.hot ? 800 : 600, color: n.hot ? CORAL : muted, textDecoration: 'none' }}>{n.label}</a>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setDark(!dark)} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{dark ? <SunIcon /> : <MoonIcon />}</button>
            {!user && <a href="/signin" className="cv-desktop" style={{ fontSize: 14.5, fontWeight: 600, color: muted, textDecoration: 'none', padding: '0 6px' }}>Sign in</a>}
            <button onClick={go} className="cv-btn-primary cv-desktop" style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14.5 }}>{user ? 'Dashboard →' : 'Get started free'}</button>
            <button className="cv-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} style={{ display: 'none', width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{mobileOpen ? <CloseIcon /> : <MenuIcon />}</button>
          </div>
        </div>
        {mobileOpen && (
          <div style={{ background: bg, borderTop: `1px solid ${cardBorder}`, padding: '14px 24px 22px' }}>
            {[{ label: 'Inbox & CRM', href: '/inbox-crm' }, { label: 'Ideas', href: '/product/ideas' }, { label: 'Roadmap', href: '/product/roadmap' }, { label: 'Announcements', href: '/product/announcements' }, { label: 'Pricing', href: '/pricing' }, { label: 'Sign in', href: '/signin' }].map(n => (<a key={n.label} href={n.href} onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '13px 0', fontSize: 16, fontWeight: 600, color: text, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` }}>{n.label}</a>))}
            <button onClick={go} style={{ ...btnPrimary, marginTop: 16, width: '100%', justifyContent: 'center' }}>{user ? 'Dashboard →' : 'Get started free'}</button>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section onMouseMove={onHeroMouse} style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '120px 24px 80px', overflow: 'hidden', background: dark ? 'linear-gradient(180deg, #10111b 0%, #0a0b12 60%)' : 'linear-gradient(180deg, #fff4ef 0%, #ffffff 58%)' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)' }} />
        <div aria-hidden style={{ position: 'absolute', top: '-14%', left: '-8%', width: 460, height: 460, background: YELLOW, borderRadius: '46% 54% 60% 40% / 45% 45% 55% 55%', opacity: dark ? 0.16 : 0.5, transform: `translateY(${scrollY * 0.12}px)` }} />
        <div aria-hidden style={{ position: 'absolute', bottom: '-12%', right: '-8%', width: 520, height: 520, background: BLUE, borderRadius: '58% 42% 45% 55% / 55% 48% 52% 45%', opacity: dark ? 0.16 : 0.14, transform: `translateY(${scrollY * -0.08}px)` }} />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1280, margin: '0 auto', width: '100%' }}>
          <div className="cv-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
            <div style={{ maxWidth: 620 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 15px', borderRadius: 999, marginBottom: 24, background: dark ? 'rgba(255,106,77,0.14)' : 'rgba(255,106,77,0.1)', border: `1px solid ${CORAL}44`, color: CORAL, fontSize: 13, fontWeight: 800 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, animation: 'blink 1.6s infinite' }} /> Omnichannel inbox · CRM · commerce
              </div>
              <h1 style={{ fontSize: 'clamp(44px, 6.6vw, 86px)', fontWeight: 900, lineHeight: 0.98, letterSpacing: '-0.035em', margin: '0 0 22px' }}>
                Talk to customers<br />where they are.<br />
                <span><RotatingWord words={HERO_VERBS} color={CORAL} /> without leaving.</span>
              </h1>
              <p style={{ fontSize: 'clamp(16px, 1.7vw, 20px)', color: muted, lineHeight: 1.6, maxWidth: 540, margin: '0 0 32px' }}>
                Colvy unifies WhatsApp, Instagram, Messenger, email, SMS &amp; live chat into one shared inbox — with a built-in CRM, media gallery, WooCommerce, trackable links and location insights behind every message.
              </p>
              <div className="cv-hero-cta" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <button onClick={go} className="cv-btn-primary" style={btnPrimary}>{user ? 'Go to dashboard' : (<><span className="cv-lg">Start free — no card</span><span className="cv-sm">Start free</span></>)} <ArrowRight /></button>
                <a href="#inbox" className="cv-btn-ghost" style={btnGhost}><span className="cv-lg">See how it works ↓</span><span className="cv-sm">How it works ↓</span></a>
              </div>
            </div>

            <div style={{ position: 'relative', transform: `translateY(${scrollY * -0.04}px)` }}>
              <div aria-hidden style={{ position: 'absolute', inset: -22, borderRadius: 40, background: `linear-gradient(135deg, ${CORAL}, ${PINK} 55%, ${PURPLE})`, opacity: dark ? 0.42 : 0.24, filter: 'blur(30px)' }} />
              <div style={{ position: 'relative', borderRadius: 28, padding: 8, background: 'linear-gradient(150deg, #34363f, #0b0c12 62%)', boxShadow: '0 50px 120px rgba(15,17,25,0.34), 0 0 0 1px rgba(255,255,255,0.06) inset', transform: `perspective(1600px) rotateY(${-2 + mouse.x * -3}deg) rotateX(${1 + mouse.y * 2}deg) translate(${mouse.x * -8}px, ${mouse.y * -8}px)`, transition: 'transform 0.3s ease-out' }}>
                <div style={{ position: 'relative', borderRadius: 21, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }}>
                  <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none', background: 'linear-gradient(120deg, rgba(255,255,255,0.14), transparent 30%)' }} />
                  <OmniInboxDemo dark={dark} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CHANNEL MARQUEE */}
      <section style={{ padding: '30px 0 34px', borderTop: `1px solid ${cardBorder}`, borderBottom: `1px solid ${cardBorder}`, background: canvas, overflow: 'hidden' }}>
        <p style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted, margin: '0 0 22px' }}>Every channel your customers already use</p>
        <div style={{ position: 'relative', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)', maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
          <div className="cv-marquee-track">{[...CHANNELS, ...CHANNELS, ...CHANNELS].map((c, i) => (<span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '0 28px', flexShrink: 0 }}><span style={{ width: 11, height: 11, borderRadius: '50%', background: c.c }} /><span style={{ fontSize: 19, fontWeight: 800, color: muted, whiteSpace: 'nowrap' }}>{c.n}</span></span>))}</div>
        </div>
      </section>

      {/* DEEP-DIVE FEATURE BANDS (full-bleed, alternating colour) */}
      {blocks.map((b, i) => {
        const flip = i % 2 === 1
        const color = BLOCK_ACCENTS[i % BLOCK_ACCENTS.length]
        const band = dark ? `${color}14` : `${color}12`
        return (
          <section key={b.id} id={b.id} style={{ background: band, padding: 'clamp(56px, 8vw, 96px) 24px', overflow: 'hidden' }}>
            <div className="cv-row" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(28px, 5vw, 72px)', alignItems: 'center' }}>
              <div style={{ order: flip ? 2 : 1 }}>
                <Reveal>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: color, color: '#fff', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 18 }}>{b.tag}</span>
                  <h2 style={{ fontSize: 'clamp(28px, 4.2vw, 48px)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.06, margin: '0 0 16px', color: text }}><BigReveal text={b.title} /></h2>
                  <p style={{ fontSize: 17, color: muted, lineHeight: 1.65, margin: '0 0 22px', maxWidth: 520 }}>{b.body}</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {b.points.map(p => (<li key={p} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 15.5, fontWeight: 600, color: text }}><span style={{ width: 24, height: 24, borderRadius: '50%', background: color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{p}</li>))}
                  </ul>
                </Reveal>
              </div>
              <div style={{ order: flip ? 1 : 2, display: 'flex', justifyContent: 'center' }}>
                <Parallax strength={flip ? -0.05 : 0.05}><Reveal>{b.mock}</Reveal></Parallax>
              </div>
            </div>
          </section>
        )
      })}

      {/* CAPABILITIES */}
      <section style={{ padding: 'clamp(64px, 9vw, 110px) 24px', background: bg }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 56px' }}>
              <p style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: CORAL, margin: '0 0 12px' }}>Answering fast is how you win</p>
              <h2 style={{ fontSize: 'clamp(30px, 4.6vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0, color: text }}>Everything to reply fast <span style={{ color: CORAL }}>and turn chats into sales</span></h2>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
            {CAPS.map((c, i) => (
              <Reveal key={c.t} delay={(i % 4) * 0.05}>
                <div className="cv-card" style={{ padding: 24, borderRadius: 20, background: cardBg, border: `1px solid ${cardBorder}`, height: '100%' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, background: c.c + '1a', color: c.c, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={c.p} /></svg>
                  </div>
                  <h3 style={{ fontSize: 16.5, fontWeight: 800, color: text, margin: '0 0 6px' }}>{c.t}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: muted, margin: 0 }}>{c.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* AI ASSISTANT */}
      <section style={{ padding: 'clamp(64px, 9vw, 110px) 24px', background: `linear-gradient(155deg, #5b7cf0 0%, #6d6ef0 55%, #8b74f0 100%)` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <p style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.85)', margin: '0 0 12px' }}>AI assistant</p>
              <h2 style={{ fontSize: 'clamp(30px, 4.6vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: 0 }}>Draft and reply <span style={{ color: YELLOW }}>without lifting a finger</span></h2>
              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)', margin: '16px auto 0', maxWidth: 560, lineHeight: 1.6 }}>Your tone, your knowledge, your control. Roll it out at your own pace — from suggestions to full autopilot.</p>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
            {AISTEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08}>
                <div style={{ padding: 26, borderRadius: 20, background: 'rgba(255,255,255,0.96)', height: '100%' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: s.c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, marginBottom: 14 }}>{s.n}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: '0 0 8px' }}>{s.t}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(15,17,25,0.6)', margin: 0 }}>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* BIG CTA */}
      <section style={{ position: 'relative', padding: 'clamp(64px, 9vw, 120px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 55%, ${PURPLE})`, overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', top: -50, left: '6%', width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.14)' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: -70, right: '8%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'relative', maxWidth: 820, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(34px, 6vw, 66px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.02, margin: '0 0 16px' }}>Bring every conversation together</h2>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)', margin: '0 0 8px', fontWeight: 600 }}>Free to start · set up in minutes.</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', margin: '0 0 34px' }}>No credit card · cancel anytime</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
              <button onClick={go} className="cv-btn-primary" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>{user ? 'Go to dashboard' : 'Get started — it’s free'} <ArrowRight /></button>
              <a href="/pricing" style={{ padding: '16px 30px', borderRadius: 999, border: '2px solid rgba(255,255,255,0.6)', background: 'transparent', color: '#fff', fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>See pricing</a>
            </div>
          </Reveal>
        </div>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
