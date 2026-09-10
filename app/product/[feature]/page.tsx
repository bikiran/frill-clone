'use client'

import { useParams } from 'next/navigation'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin } from '@/lib/redirect'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Feature deep-dive page (ideas / roadmap / announcements / knowledgebase),
// re-skinned to match the main landing's bold, bright system.

const CORAL = '#ff6a4d'
const BLUE = '#2b59ff'
const YELLOW = '#ffcb45'
const GREEN = '#00c48c'
const INK = '#0f1119'

const PAGES: Record<string, any> = {
  ideas: {
    icon: 'idea', color: CORAL, subtitle: 'Ideas Board',
    title: 'Turn feedback into features',
    hero: 'One beautiful place for all your customer feedback. Collect, prioritize, and act on what matters most.',
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
    icon: 'map', color: BLUE, subtitle: 'Public Roadmap',
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
    icon: 'megaphone', color: GREEN, subtitle: 'Announcements',
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
    icon: 'book', color: YELLOW, subtitle: 'Knowledgebase',
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
}
const ALL = [
  { label: 'Ideas Board', href: '/product/ideas', icon: 'idea', color: CORAL },
  { label: 'Roadmap', href: '/product/roadmap', icon: 'map', color: BLUE },
  { label: 'Announcements', href: '/product/announcements', icon: 'megaphone', color: GREEN },
  { label: 'Knowledgebase', href: '/product/knowledgebase', icon: 'book', color: YELLOW },
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

// ── themed mockups (kept from before) ────────────────────────────────────────
function IdeasMockup({ data, color, dark, border, ink, sub }: any) {
  return (<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{data.map((i: any, idx: number) => (
    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${border}` }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: color + '22', border: `1px solid ${color}40`, color, fontSize: 11, fontWeight: 800 }}><span>▲</span><span>{i.votes}</span></div>
      <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.title}</p><p style={{ margin: 0, fontSize: 11.5, color: sub }}>#{i.tag}</p></div>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, flexShrink: 0, background: color + '20', color }}>{i.status}</span>
    </div>))}</div>)
}
function RoadmapMockup({ data, color, dark, border, ink, sub }: any) {
  return (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>{data.map((col: any) => (
    <div key={col.col} style={{ borderRadius: 12, padding: 10, background: dark ? 'rgba(255,255,255,0.03)' : '#fff', border: `1px solid ${border}` }}>
      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, color }}>{col.col}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{col.items.map((item: string) => (<div key={item} style={{ padding: 8, borderRadius: 8, fontSize: 11.5, background: dark ? 'rgba(255,255,255,0.05)' : color + '10', color: dark ? 'rgba(255,255,255,0.8)' : ink }}>{item}</div>))}</div>
    </div>))}</div>)
}
function AnnouncementMockup({ data, color, dark, border, ink, sub }: any) {
  return (<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{data.map((a: any, i: number) => (
    <div key={i} style={{ padding: 14, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: color + '20', color }}>{a.tag}</span><span style={{ fontSize: 11, color: sub }}>{a.date}</span></div>
      <p style={{ margin: '0 0 8px', fontSize: 13.5, fontWeight: 700, color: ink }}>{a.title}</p>
      <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: sub }}><span>{a.reactions}</span><span>👁 {a.views} views</span></div>
    </div>))}</div>)
}
function KbMockup({ data, color, dark, border, ink, sub }: any) {
  return (<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{data.map((cat: any, i: number) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', border: `1px solid ${border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 20 }}>{cat.category}</span><div><p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: ink }}>{cat.title}</p><p style={{ margin: 0, fontSize: 11.5, color: sub }}>{cat.articles} articles · {cat.views} views</p></div></div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
    </div>))}</div>)
}

export default function FeaturePage() {
  const params = useParams()
  const feature = (params?.feature as string) || 'ideas'
  const page = PAGES[feature] || PAGES.ideas
  const color: string = page.color
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
        @media (max-width:900px){ .fp-hero{ grid-template-columns:1fr !important; } .fp-desktop{ display:none !important; } }
      `}</style>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: navBg, backdropFilter: navScrolled ? 'blur(18px)' : 'none', borderBottom: `1px solid ${navScrolled ? cardBorder : 'transparent'}`, transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <img src="/icon-512.png" alt="Colvy" width={32} height={32} style={{ borderRadius: 9, display: 'block' }} />
            <span style={{ fontWeight: 900, fontSize: 22, color: text, letterSpacing: '-0.02em' }}>Colvy</span>
          </a>
          <div className="fp-desktop" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {[{ label: 'Inbox & CRM', href: '/inbox-crm' }, { label: 'Ideas', href: '/product/ideas' }, { label: 'Roadmap', href: '/product/roadmap' }, { label: 'Announcements', href: '/product/announcements' }, { label: 'Pricing', href: '/pricing' }].map((n) => {
              const active = n.href.includes(feature)
              return <a key={n.label} href={n.href} className="fp-navlink" style={{ padding: '8px 14px', borderRadius: 10, fontSize: 14.5, fontWeight: active ? 800 : 600, color: active ? color : muted, textDecoration: 'none' }}>{n.label}</a>
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setDark(!dark)} aria-label="Toggle theme" style={{ width: 38, height: 38, borderRadius: 11, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: text }}>{dark ? <SunIcon /> : <MoonIcon />}</button>
            <button onClick={go} className="fp-btn" style={{ ...btnPrimary, padding: '10px 22px', fontSize: 14.5 }}>{user ? 'Dashboard →' : 'Get started free'}</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '92vh', display: 'flex', alignItems: 'center', padding: '120px 24px 70px', overflow: 'hidden', background: dark ? 'linear-gradient(180deg, #10111b 0%, #0a0b12 60%)' : `linear-gradient(180deg, ${color}12 0%, #ffffff 58%)` }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 80%)' }} />
        <div aria-hidden style={{ position: 'absolute', top: '-12%', left: '-8%', width: 460, height: 460, background: color, borderRadius: '46% 54% 60% 40% / 45% 45% 55% 55%', opacity: dark ? 0.16 : 0.22, transform: `translateY(${scrollY * 0.12}px)` }} />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <div className="fp-hero" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
            <div style={{ maxWidth: 560 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 15px', borderRadius: 999, marginBottom: 22, background: color + '1a', border: `1px solid ${color}44`, color, fontSize: 13, fontWeight: 800 }}><FeatureIcon name={page.icon} color={color} size={15} /> {page.subtitle}</div>
              <h1 style={{ fontSize: 'clamp(40px, 5.6vw, 74px)', fontWeight: 900, lineHeight: 1.0, letterSpacing: '-0.035em', margin: '0 0 22px' }}><BigReveal text={page.title} /></h1>
              <p style={{ fontSize: 'clamp(16px, 1.7vw, 20px)', color: muted, lineHeight: 1.6, maxWidth: 520, margin: '0 0 32px' }}>{page.hero}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                <button onClick={go} className="fp-btn" style={btnPrimary}>{page.cta} <ArrowRight /></button>
                <a href="/product" className="fp-btn" style={btnGhost}>See all features</a>
              </div>
            </div>
            <div style={{ position: 'relative', transform: `translateY(${scrollY * -0.04}px)` }}>
              <div aria-hidden style={{ position: 'absolute', inset: -20, borderRadius: 34, background: `linear-gradient(135deg, ${color}, ${color}88)`, opacity: dark ? 0.4 : 0.22, filter: 'blur(28px)' }} />
              <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', border: `1px solid ${cardBorder}`, background: dark ? '#0e0f18' : '#fafbff', boxShadow: '0 40px 100px rgba(15,17,25,0.22)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 15px', borderBottom: `1px solid ${cardBorder}`, background: cardBg }}>
                  <span style={{ display: 'flex', gap: 6 }}>{['#ff5f57', '#febc2e', '#28c840'].map(c => <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />)}</span>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: 11.5, color: muted }}>yourcompany.colvy.com/{feature === 'knowledgebase' ? 'help' : feature}</span>
                </div>
                <div style={{ padding: 16 }}>
                  {feature === 'ideas' && <IdeasMockup data={page.mockup} color={color} dark={dark} border={cardBorder} ink={text} sub={muted} />}
                  {feature === 'roadmap' && <RoadmapMockup data={page.mockup} color={color} dark={dark} border={cardBorder} ink={text} sub={muted} />}
                  {feature === 'announcements' && <AnnouncementMockup data={page.mockup} color={color} dark={dark} border={cardBorder} ink={text} sub={muted} />}
                  {feature === 'knowledgebase' && <KbMockup data={page.mockup} color={color} dark={dark} border={cardBorder} ink={text} sub={muted} />}
                </div>
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
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Set up in 4 minutes. Free forever for small teams.</p>
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
