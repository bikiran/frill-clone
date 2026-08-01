'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import OmniInboxDemo from '@/components/OmniInboxDemo'
import MarketingFooter from '@/components/MarketingFooter'

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold })
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  return { ref, v }
}

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
)
const Check = ({ c }: { c: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="20 6 9 17 4 12" /></svg>
)

const CHANNELS = [
  { n: 'WhatsApp', c: '#25D366' }, { n: 'Instagram', c: '#E1306C' }, { n: 'Messenger', c: '#0084FF' },
  { n: 'Email', c: '#8b5cf6' }, { n: 'SMS', c: '#0891b2' }, { n: 'Live chat', c: '#ff7a6b' },
]

// Deep-dive blocks. `mock` renders a small themed visual for the section.
const BLOCKS = (dark: boolean, card: string, border: string, ink: string, sub: string) => [
  {
    id: 'inbox', tag: 'Shared inbox', color: '#ff7a6b',
    title: 'One inbox for every channel',
    body: 'WhatsApp, Instagram, Messenger, email, SMS and website chat land in a single shared queue. Assign threads to teammates, leave private notes, @mention colleagues and never lose a conversation between apps again.',
    points: ['Assign, snooze and resolve like a team', 'Private notes, @mentions and internal tasks', 'Typing indicators, read receipts and reactions'],
    mock: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[['SR', 'Sam Rivera', 'Do you still have the 4ft…', '#25D366', '2'], ['MO', 'Mia Okafor', 'Thanks — order received!', '#E1306C', ''], ['JL', 'Jon Lee', 'Can I get a refund on…', '#8b5cf6', '1']].map(([in_, nm, msg, cl, b]) => (
          <div key={nm} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${border}` }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: cl, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{in_}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{nm}</div>
              <div style={{ fontSize: 11.5, color: sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg}</div>
            </div>
            {b && <span style={{ minWidth: 18, height: 18, borderRadius: 999, background: '#ff5247', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{b}</span>}
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'crm', tag: 'Built-in CRM', color: '#6366f1',
    title: 'A full customer profile beside every chat',
    body: 'Every conversation is tied to a contact record — lifetime value, order history, tags, notes and the outlet they belong to. Your team answers with context, not guesswork.',
    points: ['Lifetime value, orders and marketing consent', 'Custom tags, fields and relationship links', 'Merged identity across phone, email and socials'],
    mock: (
      <div style={{ padding: 18, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#a78bfa)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>SR</div>
          <div><div style={{ fontSize: 14, fontWeight: 700, color: ink }}>Sam Rivera</div><div style={{ fontSize: 12, color: sub }}>VIP · Sydney outlet</div></div>
        </div>
        {[['Lifetime value', '$4,280'], ['Orders', '17'], ['Avg. order', '$251']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: `1px solid ${border}`, fontSize: 12.5 }}><span style={{ color: sub }}>{k}</span><span style={{ color: ink, fontWeight: 700 }}>{v}</span></div>
        ))}
      </div>
    ),
  },
  {
    id: 'gallery', tag: 'Unified media gallery', color: '#8b5cf6',
    title: 'Send the right photo in one tap',
    body: 'Keep a categorised library of product photos and videos. Drop them straight into a chat, add internal notes with @mentions, and reuse them across every channel.',
    points: ['Categorised photos & videos, fully searchable', 'One-tap share into any conversation', 'Notes & @mentions per item for your team'],
    mock: (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {['#6366f1', '#25D366', '#f59e0b', '#ec4899', '#0891b2', '#10b981'].map((c, i) => (
          <div key={i} style={{ position: 'relative', paddingTop: '78%', borderRadius: 10, background: `linear-gradient(135deg,${c}bb,${c}55)`, overflow: 'hidden' }}>
            {i === 1 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3" /></svg></div>}
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'woo', tag: 'Advanced WooCommerce', color: '#96588a',
    title: 'Orders, refunds & carts — in the thread',
    body: 'Look up a live WooCommerce order, issue a refund, or recover an abandoned cart without switching tabs. The customer’s purchase history sits right next to the conversation.',
    points: ['Live order lookup & one-click refunds', 'Abandoned-cart recovery messages', 'Full order history synced to the contact'],
    mock: (
      <div style={{ padding: 16, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>Order #10428</span><span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: '#10b98118', color: '#10b981' }}>PAID</span></div>
        {[['4ft Reef Tank', '$899'], ['Protein Skimmer', '$149'], ['Shipping', '$0']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', color: sub }}><span>{k}</span><span style={{ color: ink }}>{v}</span></div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, paddingTop: 8, marginTop: 4, borderTop: `1px solid ${border}`, color: ink }}><span>Total</span><span>$1,048</span></div>
        <button style={{ width: '100%', marginTop: 12, padding: '9px', borderRadius: 10, border: `1px solid ${border}`, background: 'transparent', color: '#96588a', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Refund order</button>
      </div>
    ),
  },
  {
    id: 'links', tag: 'Link generator & reports', color: '#0891b2',
    title: 'Trackable links that prove ROI',
    body: 'Generate short links for products, payments or bookings and see exactly who clicked, how many unique customers engaged, and which orders each link influenced.',
    points: ['Branded short links per product or outlet', 'Clicks, unique recipients & conversions', 'Revenue attributed back to each link'],
    mock: (
      <div style={{ padding: 16, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${border}` }}>
        <div style={{ fontSize: 11.5, color: sub, marginBottom: 12 }}>colvy.link/reef-sale · last 7 days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
          {[40, 62, 55, 88, 74, 96, 68].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '5px 5px 0 0', background: 'linear-gradient(180deg,#0891b2,#0891b266)', animation: `oi-grow 1.2s ${i * 0.08}s cubic-bezier(0.16,1,0.3,1) both` }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          {[['312', 'Clicks'], ['184', 'Unique'], ['$2.1k', 'Revenue']].map(([v, k]) => (
            <div key={k}><div style={{ fontSize: 15, fontWeight: 800, color: ink }}>{v}</div><div style={{ fontSize: 10.5, color: sub }}>{k}</div></div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'insights', tag: 'Customer & location insights', color: '#10b981',
    title: 'Know your customers and your outlets',
    body: 'See spend, order frequency and behaviour by customer and by location. Location-aware analytics keep each outlet’s numbers — and each customer’s history — where they belong.',
    points: ['Per-customer spend & retention', 'Per-outlet performance & comparisons', 'Location-aware content and reporting'],
    mock: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['$38.4k', 'Sydney', '#10b981', '+12%'], ['$29.1k', 'Melbourne', '#6366f1', '+8%'], ['842', 'Repeat buyers', '#ff7a6b', '+21%'], ['4.8★', 'Avg. rating', '#f59e0b', '+0.3']].map(([v, k, c, d]) => (
          <div key={k} style={{ padding: 14, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${border}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: ink }}>{v}</div>
            <div style={{ fontSize: 11, color: sub }}>{k}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: c as string, marginTop: 4 }}>{d}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'tasks', tag: 'Tasks, calendar & automations', color: '#f59e0b',
    title: 'Turn chats into things that get done',
    body: 'Spin any message into an assignable task, colour-code it, set it to repeat, and see it on a calendar. Automate replies and follow-ups so nothing slips.',
    points: ['One-click task from any conversation', 'Recurring tasks & calendar view', 'Auto-replies and scheduled follow-ups'],
    mock: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[['Call Sam re: reef tank', '#ff7a6b', true], ['Ship order #10428', '#10b981', true], ['Follow up abandoned cart', '#f59e0b', false]].map(([t, c, done]) => (
          <div key={t as string} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 12, background: (c as string) + (dark ? '18' : '12'), border: `1px solid ${border}` }}>
            <span style={{ width: 16, height: 16, borderRadius: 5, border: `2px solid ${c}`, background: done ? (c as string) : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: ink, textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{t}</span>
          </div>
        ))}
      </div>
    ),
  },
]

export default function InboxCrmPage() {
  const [user, setUser] = useState<any>(null)
  const [dark, setDark] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const hero = useInView()
  const chans = useInView()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { l?.subscription?.unsubscribe(); window.removeEventListener('scroll', onScroll) }
  }, [])

  const go = async () => {
    if (!user) { window.location.href = '/signup'; return }
    try {
      const { data: co } = await (supabase as any).from('companies').select('slug').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (co?.slug) window.location.href = `https://${co.slug}.colvy.com/admin`
      else await redirectToUserAdmin(user.id)
    } catch { await redirectToUserAdmin(user.id) }
  }

  const bg = dark ? '#080808' : '#ffffff'
  const text = dark ? '#f0f0f0' : '#0d0d0d'
  const sub = dark ? 'rgba(240,240,240,0.55)' : 'rgba(13,13,13,0.55)'
  const dim = dark ? 'rgba(240,240,240,0.3)' : 'rgba(13,13,13,0.35)'
  const card = dark ? 'rgba(255,255,255,0.04)' : '#f8f8f8'
  const border = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)'
  const navBg = scrollY > 30 ? (dark ? 'rgba(8,8,8,0.9)' : 'rgba(255,255,255,0.92)') : 'transparent'
  const blocks = BLOCKS(dark, card, border, text, sub)

  return (
    <div style={{ background: bg, color: text, fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif', minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s,color 0.3s' }}>
      <style>{`
        @keyframes iu { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:none} }
        @keyframes ifloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes oi-grow { from{transform:scaleY(0);transform-origin:bottom} to{transform:scaleY(1)} }
        .iu1{animation:iu .7s .05s both} .iu2{animation:iu .7s .15s both} .iu3{animation:iu .7s .25s both} .iu4{animation:iu .7s .35s both}
        .grad{background:linear-gradient(135deg,#ff7a6b,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .lift{transition:all .3s cubic-bezier(0.16,1,0.3,1)} .lift:hover{transform:translateY(-4px)}
        .cta{transition:all .25s} .cta:hover{transform:scale(1.04);box-shadow:0 0 34px rgba(255,122,107,0.4)}
        .orbx{position:absolute;border-radius:50%;filter:blur(70px);pointer-events:none}
        .demo-float{animation:ifloat 7s ease-in-out infinite}
        @media(max-width:820px){ .split{grid-template-columns:1fr !important} .split-rev>div:first-child{order:2} }
        .im-menu{display:none}
        @media(min-width:900px){ .im-menu{display:flex} }
        @media(max-width:420px){ .im-signin{display:none} }
      `}</style>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: navBg, borderBottom: `1px solid ${scrollY > 30 ? border : 'transparent'}`, backdropFilter: scrollY > 30 ? 'blur(20px)' : 'none', transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/landing" style={{ fontWeight: 800, fontSize: 20, color: '#ff7a6b', textDecoration: 'none' }}>Colvy</a>

          {/* Center menu (desktop) */}
          <div className="im-menu" style={{ alignItems: 'center', gap: 4 }}>
            {[
              { label: 'Inbox & CRM', href: '/inbox-crm', active: true },
              { label: 'Ideas', href: '/features/ideas' },
              { label: 'Roadmap', href: '/features/roadmap' },
              { label: 'Announcements', href: '/features/announcements' },
              { label: 'Knowledgebase', href: '/features/knowledgebase' },
              { label: 'Pricing', href: '/pricing' },
            ].map((n: any) => (
              <a key={n.label} href={n.href} style={{ padding: '8px 13px', borderRadius: 10, fontSize: 14, fontWeight: n.active ? 700 : 500, color: n.active ? '#ff7a6b' : sub, textDecoration: 'none', transition: 'all 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {n.label}
              </a>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setDark(!dark)} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${border}`, background: card, color: text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {dark ? '☀' : '☾'}
            </button>
            {!user && <a href="/signin" style={{ fontSize: 14, fontWeight: 500, color: sub, textDecoration: 'none' }} className="im-signin">Sign in</a>}
            <button onClick={go} className="cta" style={{ padding: '9px 20px', borderRadius: 12, background: '#ff7a6b', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', border: 'none' }}>
              {user ? 'Dashboard →' : 'Get started free'}
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section ref={hero.ref as any} style={{ position: 'relative', padding: '132px 24px 60px', overflow: 'hidden', textAlign: 'center' }}>
        <div className="orbx" style={{ width: 620, height: 620, background: 'radial-gradient(circle,rgba(255,122,107,0.18) 0%,transparent 65%)', top: '-8%', left: '0%', transform: `translateY(${scrollY * 0.2}px)` }} />
        <div className="orbx" style={{ width: 520, height: 520, background: 'radial-gradient(circle,rgba(99,102,241,0.16) 0%,transparent 65%)', top: '4%', right: '0%', transform: `translateY(${scrollY * 0.3}px)` }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)'} 1px,transparent 1px)`, backgroundSize: '60px 60px', WebkitMaskImage: 'radial-gradient(ellipse at center,black 35%,transparent 72%)', maskImage: 'radial-gradient(ellipse at center,black 35%,transparent 72%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <div className="iu1" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, marginBottom: 28, background: 'rgba(255,122,107,0.1)', border: '1px solid rgba(255,122,107,0.25)', color: '#ff7a6b', fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} /> Omnichannel inbox · CRM · commerce
          </div>
          <h1 className="iu2" style={{ fontSize: 'clamp(38px,7vw,68px)', fontWeight: 900, lineHeight: 1.08, letterSpacing: '-0.03em', marginBottom: 22 }}>
            Talk to customers<br />where they are.<br /><span className="grad">Sell without leaving.</span>
          </h1>
          <p className="iu3" style={{ fontSize: 'clamp(16px,2vw,20px)', color: sub, lineHeight: 1.7, marginBottom: 34, maxWidth: 620, margin: '0 auto 34px' }}>
            Colvy unifies WhatsApp, Instagram, Messenger, email, SMS and live chat into one shared inbox — with a built-in CRM, media gallery, WooCommerce, trackable links and location insights behind every message.
          </p>
          <div className="iu4" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 12 }}>
            <button onClick={go} className="cta" style={{ padding: '14px 32px', borderRadius: 16, background: 'linear-gradient(135deg,#ff7a6b,#ff5247)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none' }}>
              {user ? 'Go to Dashboard →' : 'Start free — no credit card'}
            </button>
            <a href="#inbox" style={{ padding: '14px 28px', borderRadius: 16, border: `1px solid ${border}`, background: card, color: text, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>See how it works ↓</a>
          </div>
        </div>

        <div className="demo-float" style={{ position: 'relative', marginTop: 52, opacity: hero.v ? 1 : 0, transform: hero.v ? 'none' : 'translateY(40px)', transition: 'all 0.9s cubic-bezier(0.16,1,0.3,1)' }}>
          <OmniInboxDemo dark={dark} />
        </div>
      </section>

      {/* CHANNELS */}
      <section ref={chans.ref as any} style={{ padding: '48px 24px', borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, background: dark ? '#050505' : '#fafafa' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: dim, marginBottom: 22 }}>Every channel your customers already use</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {CHANNELS.map((c, i) => (
              <span key={c.n} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${border}`, fontSize: 14, fontWeight: 600, color: text, opacity: chans.v ? 1 : 0, transform: chans.v ? 'none' : 'translateY(14px)', transition: `all 0.5s ${i * 0.06}s` }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.c }} /> {c.n}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* DEEP-DIVE BLOCKS */}
      {blocks.map((b, i) => {
        const rev = i % 2 === 1
        return (
          <Block key={b.id} b={b} rev={rev} dark={dark} card={card} border={border} text={text} sub={sub} />
        )
      })}

      {/* CTA */}
      <section style={{ padding: '90px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', padding: '64px 40px', borderRadius: 28, background: 'linear-gradient(135deg,rgba(255,122,107,0.12),rgba(167,139,250,0.12))', border: `1px solid ${border}`, position: 'relative', overflow: 'hidden' }}>
          <div className="orbx" style={{ width: 380, height: 380, background: 'radial-gradient(circle,rgba(255,122,107,0.2) 0%,transparent 65%)', top: '-30%', left: '30%' }} />
          <h2 style={{ position: 'relative', fontSize: 'clamp(28px,5vw,44px)', fontWeight: 900, marginBottom: 12, color: text }}>Bring every conversation together</h2>
          <p style={{ position: 'relative', fontSize: 17, color: sub, marginBottom: 8 }}>Free to start · setup in minutes · no credit card</p>
          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 28 }}>
            <button onClick={go} className="cta" style={{ padding: '14px 36px', borderRadius: 16, background: 'linear-gradient(135deg,#ff7a6b,#ff5247)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none' }}>
              {user ? 'Go to Dashboard →' : 'Get started — it’s free'}
            </button>
            <a href="/pricing" style={{ padding: '14px 24px', borderRadius: 16, border: `1px solid ${border}`, background: 'transparent', color: sub, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>See pricing →</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <MarketingFooter dark={dark} />
    </div>
  )
}

function Block({ b, rev, dark, card, border, text, sub }: any) {
  const { ref, v } = useInView()
  return (
    <section id={b.id} ref={ref as any} style={{ padding: '80px 24px', background: rev ? (dark ? '#0a0a0a' : '#f8f8f8') : 'transparent', borderTop: rev ? `1px solid ${border}` : 'none', borderBottom: rev ? `1px solid ${border}` : 'none' }}>
      <div className={`split ${rev ? 'split-rev' : ''}`} style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
        <div style={{ opacity: v ? 1 : 0, transform: v ? 'none' : 'translateY(24px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 999, background: b.color + '18', border: `1px solid ${b.color}33`, color: b.color, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>{b.tag}</div>
          <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15, color: text, marginBottom: 16 }}>{b.title}</h2>
          <p style={{ fontSize: 16, color: sub, lineHeight: 1.7, marginBottom: 22 }}>{b.body}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {b.points.map((p: string) => (
              <div key={p} style={{ display: 'flex', gap: 10, fontSize: 14.5, color: text, lineHeight: 1.5 }}><Check c={b.color} />{p}</div>
            ))}
          </div>
        </div>
        <div style={{ opacity: v ? 1 : 0, transform: v ? 'none' : 'translateY(30px) scale(0.98)', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s' }}>
          <div style={{ padding: 18, borderRadius: 20, background: dark ? 'rgba(255,255,255,0.03)' : '#fff', border: `1px solid ${border}`, boxShadow: dark ? '0 20px 50px rgba(0,0,0,0.4)' : '0 20px 50px rgba(0,0,0,0.08)' }}>
            {b.mock}
          </div>
        </div>
      </div>
    </section>
  )
}
