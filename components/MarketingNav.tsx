'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import FeatureIcon from '@/components/FeatureIcon'

/**
 * Shared marketing top-nav with Coax-style mega-menus.
 *
 * One component so every marketing page (landing, pricing, product, inbox-crm)
 * shows the exact same menu — the inconsistent per-page navs were the source of
 * the earlier routing confusion. Self-contained: it owns its scroll state, the
 * open dropdown, the mobile sheet, and the signed-in dashboard redirect. It's
 * theme-aware via the `dark` prop; the host page owns the theme and passes
 * `onToggleDark` so the toggle keeps controlling the whole page.
 *
 * Menu items only ever point at pages that actually exist (the four /product/*
 * marketing pages, /product, /inbox-crm, /pricing) so nothing 404s.
 */

const CORAL = '#ff6a4d'

type Item = { icon: string; title: string; desc: string; href: string }
type Menu = { key: string; label: string; columns: { heading: string; items: Item[] }[]; footer: { label: string; href: string } }

const MENUS: Menu[] = [
  {
    key: 'product',
    label: 'Product',
    columns: [
      {
        heading: 'Feedback',
        items: [
          { icon: 'idea', title: 'Ideas & feedback', desc: 'Collect and vote on ideas', href: '/product/ideas' },
          { icon: 'map', title: 'Roadmap', desc: 'Show what you’re building', href: '/product/roadmap' },
          { icon: 'megaphone', title: 'Announcements', desc: 'Release notes & changelog', href: '/product/announcements' },
          { icon: 'book', title: 'Help center', desc: 'Self-serve knowledge base', href: '/product/knowledgebase' },
        ],
      },
      {
        heading: 'Engage',
        items: [
          { icon: 'vote', title: 'Polls & surveys', desc: 'Ask, measure, decide', href: '/product' },
          { icon: 'pen', title: 'Forms', desc: 'Capture structured input', href: '/product' },
          { icon: 'reaction', title: 'Feedback widget', desc: 'Embed on any page', href: '/product' },
          { icon: 'chart', title: 'Analytics', desc: 'See what customers want', href: '/product' },
        ],
      },
    ],
    footer: { label: 'View all products', href: '/product' },
  },
  {
    key: 'inbox',
    label: 'Inbox & CRM',
    columns: [
      {
        heading: 'Channels',
        items: [
          { icon: 'inbox', title: 'Shared inbox', desc: 'Every channel, one thread', href: '/inbox-crm' },
          { icon: 'chat', title: 'SMS & WhatsApp', desc: 'Text customers in one place', href: '/inbox-crm' },
          { icon: 'phone', title: 'Voice calls', desc: 'Call history & context', href: '/inbox-crm#calls' },
          { icon: 'mail', title: 'Email', desc: 'In the same thread', href: '/inbox-crm' },
        ],
      },
      {
        heading: 'Grow revenue',
        items: [
          { icon: 'user', title: 'Contacts & CRM', desc: 'A profile beside every chat', href: '/inbox-crm#crm' },
          { icon: 'tag', title: 'Payments & orders', desc: 'Sell inside the chat', href: '/inbox-crm#woo' },
          { icon: 'bolt', title: 'Automations', desc: 'Route, reply & follow up', href: '/inbox-crm#tasks' },
          { icon: 'ai', title: 'AI assistant', desc: 'Draft replies instantly', href: '/inbox-crm#tasks' },
        ],
      },
    ],
    footer: { label: 'Explore Inbox & CRM', href: '/inbox-crm' },
  },
]

const SunIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>)
const MoonIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>)
const Chevron = ({ open }: { open: boolean }) => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9" /></svg>)
const MenuIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>)
const CloseIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)

export default function MarketingNav({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const pathname = usePathname() || ''
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState<string | null>(null)   // desktop mega-menu target
  const [lastKey, setLastKey] = useState<string | null>(null) // content kept mounted through the close animation
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSection, setMobileSection] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const closeTimer = useRef<any>(null)

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

  // Close everything on route change.
  useEffect(() => { setOpen(null); setMobileOpen(false) }, [pathname])
  // Lock background scroll while the mobile sheet is open.
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

  const openNow = (k: string) => { if (closeTimer.current) clearTimeout(closeTimer.current); setLastKey(k); setOpen(k) }
  const toggle = (k: string) => { if (open === k) setOpen(null); else openNow(k) }
  const scheduleClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(null), 130) }

  const isActive = (k: string) => (k === 'product' && pathname.startsWith('/product')) || (k === 'inbox' && pathname.startsWith('/inbox-crm')) || (k === 'pricing' && pathname.startsWith('/pricing'))

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

  const primaryBtn: React.CSSProperties = { padding: '10px 22px', borderRadius: 999, background: CORAL, color: '#fff', fontWeight: 800, fontSize: 14.5, border: 'none', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }
  // Content stays mounted (keyed by lastKey) so the panel animates OUT, not just in.
  const panelMenu = MENUS.find(m => m.key === lastKey) || null
  const panelOpen = !!open

  return (
    <nav
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: navBg, backdropFilter: solid ? 'blur(18px)' : 'none', WebkitBackdropFilter: solid ? 'blur(18px)' : 'none', borderBottom: `1px solid ${solid ? cardBorder : 'transparent'}`, transition: 'background 0.3s, border-color 0.3s' }}
      onMouseLeave={scheduleClose}
    >
      <style>{`
        .mn-link{transition:color .2s cubic-bezier(0.16,1,0.3,1)}
        .mn-link:hover{color:${CORAL} !important}
        .mn-item{transition:background .2s cubic-bezier(0.16,1,0.3,1),transform .2s cubic-bezier(0.16,1,0.3,1)}
        .mn-item:hover{background:${hoverBg} !important;transform:translateX(2px)}
        .mn-item:hover .mn-ico{transform:scale(1.08) rotate(-3deg)}
        .mn-ico{transition:transform .25s cubic-bezier(0.34,1.56,0.64,1)}
        .mn-cta{transition:transform .22s cubic-bezier(0.16,1,0.3,1),box-shadow .22s cubic-bezier(0.16,1,0.3,1)}
        .mn-cta:hover{transform:translateY(-1px);box-shadow:0 10px 24px ${CORAL}44}
        /* Buttery panel: fade + slide, GPU-composited. Content items stagger in. */
        .mn-panel{transform-origin:top center;transition:opacity .28s cubic-bezier(0.16,1,0.3,1),transform .34s cubic-bezier(0.16,1,0.3,1);will-change:opacity,transform}
        .mn-panel-open{opacity:1;transform:translateY(0) scale(1)}
        .mn-panel-closed{opacity:0;transform:translateY(-10px) scale(0.985);pointer-events:none}
        @keyframes mnItemIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .mn-panel-open .mn-stagger{animation:mnItemIn .42s cubic-bezier(0.16,1,0.3,1) both}
        @keyframes mnSheetIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
        .mn-sheet{animation:mnSheetIn .3s cubic-bezier(0.16,1,0.3,1) both}
        .mn-desktop{display:flex}
        .mn-mtoggle{display:none}
        @media(max-width:900px){.mn-desktop{display:none !important}.mn-mtoggle{display:flex !important}}
        @media(prefers-reduced-motion:reduce){.mn-cta,.mn-link,.mn-item,.mn-ico,.mn-panel{transition:none !important}.mn-stagger,.mn-sheet{animation:none !important}}
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <img src="/icon-512.png" alt="Colvy" width={32} height={32} style={{ borderRadius: 9, display: 'block' }} />
          <span style={{ fontWeight: 900, fontSize: 22, color: text, letterSpacing: '-0.02em' }}>Colvy</span>
        </a>

        {/* Desktop menu */}
        <div className="mn-desktop" style={{ alignItems: 'center', gap: 2 }}>
          {MENUS.map(m => (
            <button key={m.key} type="button" className="mn-link"
              onMouseEnter={() => openNow(m.key)} onFocus={() => openNow(m.key)}
              onClick={() => toggle(m.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: isActive(m.key) ? 800 : 600, color: isActive(m.key) || open === m.key ? CORAL : muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              {m.label}<Chevron open={open === m.key} />
            </button>
          ))}
          <a href="/pricing" className="mn-link" style={{ padding: '8px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: isActive('pricing') ? 800 : 600, color: isActive('pricing') ? CORAL : muted, textDecoration: 'none' }}>Pricing</a>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onToggleDark} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{dark ? <SunIcon /> : <MoonIcon />}</button>
          {user ? (
            <button onClick={handleDashboard} className="mn-cta mn-desktop" style={primaryBtn}>Dashboard →</button>
          ) : (
            <>
              <a href="/signin" className="mn-link mn-desktop" style={{ fontSize: 14.5, fontWeight: 600, color: muted, textDecoration: 'none', padding: '0 6px' }}>Sign in</a>
              <a href="/signup" className="mn-cta mn-desktop" style={primaryBtn}>Get started free</a>
            </>
          )}
          <button className="mn-mtoggle" onClick={() => setMobileOpen(v => !v)} aria-label="Menu" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{mobileOpen ? <CloseIcon /> : <MenuIcon />}</button>
        </div>
      </div>

      {/* Desktop mega-menu panel — kept mounted so it animates in AND out */}
      {panelMenu && (
        <div className={`mn-desktop mn-panel ${panelOpen ? 'mn-panel-open' : 'mn-panel-closed'}`}
          onMouseEnter={() => openNow(panelMenu.key)} onMouseLeave={scheduleClose}
          style={{ position: 'absolute', top: 68, left: 0, right: 0, background: panelBg, borderBottom: `1px solid ${cardBorder}`, boxShadow: '0 24px 50px rgba(15,17,25,0.16)' }}>
          <div key={lastKey || ''}>
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 24px 20px', display: 'flex', gap: 48 }}>
              {panelMenu.columns.map((col, ci) => (
                <div key={col.heading} style={{ flex: 1, minWidth: 0 }}>
                  <p className="mn-stagger" style={{ margin: '0 12px 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, animationDelay: `${ci * 0.04}s` }}>{col.heading}</p>
                  {col.items.map((it, ii) => (
                    <a key={it.title} href={it.href} className="mn-item mn-stagger" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', borderRadius: 12, textDecoration: 'none', animationDelay: `${ci * 0.04 + (ii + 1) * 0.045}s` }}>
                      <span className="mn-ico" style={{ width: 38, height: 38, borderRadius: 10, background: CORAL + '14', color: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatureIcon name={it.icon} color={CORAL} size={19} /></span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: text }}>{it.title}</span>
                        <span style={{ display: 'block', fontSize: 12.5, color: muted, marginTop: 1 }}>{it.desc}</span>
                      </span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${cardBorder}`, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(15,17,25,0.02)' }}>
              <div style={{ maxWidth: 1280, margin: '0 auto', padding: '12px 36px' }}>
                <a href={panelMenu.footer.href} className="mn-link" style={{ fontSize: 13.5, fontWeight: 800, color: CORAL, textDecoration: 'none' }}>{panelMenu.footer.label} →</a>
              </div>
            </div>
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
                      <span style={{ width: 34, height: 34, borderRadius: 9, background: CORAL + '14', color: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatureIcon name={it.icon} color={CORAL} size={17} /></span>
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
          <a href="/pricing" onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '15px 0', fontSize: 16, fontWeight: 700, color: text, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` }}>Pricing</a>
          {!user && <a href="/signin" onClick={() => setMobileOpen(false)} style={{ display: 'block', padding: '15px 0', fontSize: 16, fontWeight: 600, color: muted, textDecoration: 'none', borderBottom: `1px solid ${cardBorder}` }}>Sign in</a>}
          <button onClick={handleDashboard} style={{ ...primaryBtn, marginTop: 16, width: '100%', justifyContent: 'center', padding: '13px 0', fontSize: 15 }}>{user ? 'Dashboard →' : 'Get started free'}</button>
        </div>
      )}
    </nav>
  )
}
