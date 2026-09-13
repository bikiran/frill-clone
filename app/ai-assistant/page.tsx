'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Standalone AI Assistant landing page. Content is grounded in what the
// assistant actually does (see lib/ai-assistant/tools.ts): look things up,
// draft replies, and take reversible, audited actions with a human in control.

const PURPLE = '#7c5cff', PINK = '#ff4d8d', BLUE = '#2b59ff', GREEN = '#00c48c', INK = '#0f1119'
const ACCENT = PURPLE

const FEATURES = [
  { icon: 'ai', title: 'Drafted replies', desc: 'On-brand answers written for you — send, tweak or discard.' },
  { icon: 'book', title: 'Knowledge base', desc: 'Trained on your docs and help center, so answers are accurate.' },
  { icon: 'bolt', title: 'Real actions', desc: 'Looks up orders, checks stock, creates tasks — inline.' },
  { icon: 'pen', title: 'Auto-summaries', desc: 'Every long thread and call, TL;DR’d in a line.' },
  { icon: 'target', title: 'Auto-routing', desc: 'Sends each conversation to the right person or team.' },
  { icon: 'bell', title: 'Follow-ups', desc: 'Creates reminders and tasks so nothing slips.' },
]

// Concrete, grounded actions the assistant can take.
const ACTIONS = [
  { icon: 'search', label: 'Find a customer or order' },
  { icon: 'tag', label: 'Pull live order status & tracking' },
  { icon: 'inbox', label: 'Check stock and what’s out' },
  { icon: 'calendar', label: 'Create tasks, reminders & events' },
  { icon: 'phone', label: 'Summarise a call' },
  { icon: 'chart', label: 'Pull a quick report' },
  { icon: 'user', label: 'Route to the right teammate' },
  { icon: 'bolt', label: 'Record a sale' },
]

const BANDS = [
  { tag: 'Trained on you', title: 'Answers from your own knowledge', body: 'Point the assistant at your help center and docs. It answers in your voice, with your facts — never generic. When it isn’t sure, it hands off to a human rather than guessing.', bullets: ['Grounded in your content', 'On-brand tone', 'Hands off when unsure'], icon: 'book' },
  { tag: 'You stay in control', title: 'Drafts and suggestions, not surprises', body: 'The assistant proposes; your team decides. Replies are suggestions you can send, edit or discard, and the actions it can take are limited to what you switch on — with every one logged.', bullets: ['Human-in-the-loop by default', 'Only the actions you enable', 'Full audit of every action'], icon: 'lock' },
]

const STEPS = [
  { title: 'Connect your knowledge', desc: 'Point it at your docs, help center and live data — orders, contacts, calls.' },
  { title: 'It drafts and suggests', desc: 'Every thread gets a ready reply and, where useful, an action to take.' },
  { title: 'You approve', desc: 'Send, edit or discard. Turn on the actions you trust; every one is logged.' },
  { title: 'It handles the rest', desc: 'FAQs answered 24/7, threads summarised, follow-ups created automatically.' },
]

const FAQS = [
  { q: 'Does it make things up?', a: 'It answers from your own knowledge base and live data. When it isn’t confident, it hands the conversation to a human instead of guessing.' },
  { q: 'Can it act without me?', a: 'Actions are human-in-the-loop by default. You choose which actions it may take, and every action it performs is recorded in an audit log.' },
  { q: 'What can it actually do?', a: 'Look up customers, orders and tracking, check stock, summarise calls, create tasks, reminders and calendar events, pull quick reports, route conversations, and record sales.' },
  { q: 'How does it stay on-brand?', a: 'It replies in your voice using your own content, so answers read like your team wrote them — because, in effect, they did.' },
]

const STATS = [{ big: '24/7', label: 'always on' }, { big: '1-tap', label: 'to send a draft' }, { big: 'Every', label: 'action audited' }]

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

function Faq({ q, a, text, muted, cardBg, cardBorder }: { q: string; a: string; text: string; muted: string; cardBg: string; cardBorder: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderRadius: 16, background: cardBg, border: `1px solid ${cardBorder}`, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '18px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: text, fontSize: 16, fontWeight: 800, fontFamily: 'inherit' }}>
        {q}
        <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: ACCENT + '18', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.22s cubic-bezier(0.16,1,0.3,1)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </span>
      </button>
      <div style={{ maxHeight: open ? 220 : 0, transition: 'max-height 0.3s cubic-bezier(0.16,1,0.3,1)', overflow: 'hidden' }}>
        <p style={{ margin: 0, padding: '0 20px 18px', fontSize: 14.5, lineHeight: 1.6, color: muted }}>{a}</p>
      </div>
    </div>
  )
}

export default function AiAssistantPage() {
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
  const btnPrimary: React.CSSProperties = { padding: '15px 30px', borderRadius: 999, background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${ACCENT}55` }
  const btnGhost: React.CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }
  const bubble = (mine: boolean): React.CSSProperties => ({ maxWidth: '82%', alignSelf: mine ? 'flex-end' : 'flex-start', padding: '10px 14px', borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: mine ? ACCENT : (dark ? 'rgba(255,255,255,0.08)' : '#f1f2f7'), color: mine ? '#fff' : text, fontSize: 14, lineHeight: 1.5, fontWeight: 500 })

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes aiFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        .ai-card,.ai-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .ai-card:hover{ transform:translateY(-6px); }
        .ai-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .ai-hero{ grid-template-columns:1fr !important; } .ai-band{ grid-template-columns:1fr !important; } .ai-actions{ grid-template-columns:1fr !important; } .ai-hero-cta{ flex-wrap:nowrap !important; } .ai-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="aiFloat"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="ai-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.02fr 0.98fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: '150px 24px 60px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: ACCENT + '18', color: ACCENT, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="ai" color={ACCENT} size={15} />AI Assistant</span>
            <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 66px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.03, margin: '0 0 18px' }}>An assistant that <span style={{ color: ACCENT }}>does the work</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>Trained on your docs, it drafts replies, summarises threads and takes real actions — looking up orders, creating tasks and more. You stay in control of every one.</p>
            <div className="ai-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="ai-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="ai-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          {/* Chat mock: customer asks, assistant looks it up and drafts a reply */}
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${ACCENT} 0%, ${ACCENT}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${ACCENT}44`, padding: 22 }}>
            <div aria-hidden style={{ position: 'absolute', top: -50, right: -40, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', filter: 'blur(36px)' }} />
            <div style={{ position: 'relative', background: bg, borderRadius: 18, padding: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', animation: 'aiFloat 7s ease-in-out infinite' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${cardBorder}` }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: ACCENT + '20', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><FeatureIcon name="ai" color={ACCENT} size={16} /></span>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: text }}>Colvy Assistant</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: GREEN, display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN }} />online</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={bubble(false)}>Hi, where’s my order #1042? 😊</div>
                <div style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, color: muted, background: dark ? 'rgba(255,255,255,0.05)' : '#f6f2ff', border: `1px solid ${ACCENT}33`, borderRadius: 999, padding: '5px 11px' }}><FeatureIcon name="search" color={ACCENT} size={12} />Looked up order #1042</div>
                <div style={bubble(true)}>It shipped yesterday and is out for delivery today — tracking is on its way to your inbox. 📦</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: ACCENT, borderRadius: 999, padding: '7px 15px' }}>Send</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: text, background: 'transparent', border: `1px solid ${cardBorder}`, borderRadius: 999, padding: '7px 15px' }}>Edit</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FEATURE GRID */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.05}>
              <div className="ai-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: ACCENT + '16', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={f.icon} color={ACCENT} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{f.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BAND 1 */}
      <section style={{ padding: 'clamp(40px, 6vw, 80px) 24px' }}>
        <div className="ai-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <Reveal>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT }}>{BANDS[0].tag}</span>
              <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>{BANDS[0].title}</h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.65, color: muted, margin: '0 0 20px' }}>{BANDS[0].body}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                {BANDS[0].bullets.map(bl => (
                  <li key={bl} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, fontWeight: 600, color: text }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: ACCENT + '1a', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{bl}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <div style={{ position: 'relative', borderRadius: 24, minHeight: 280, overflow: 'hidden', background: `linear-gradient(140deg, ${ACCENT}22, ${ACCENT}05)`, border: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '32px 32px', opacity: 0.5 }} />
              <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${ACCENT}55`, animation: 'aiFloat 6s ease-in-out infinite' }}>
                <FeatureIcon name={BANDS[0].icon} color="#fff" size={44} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* REAL ACTIONS */}
      <section style={{ background: dark ? 'rgba(255,255,255,0.02)' : ACCENT + '08', padding: 'clamp(44px, 6vw, 84px) 24px' }}>
        <div className="ai-actions" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 48, alignItems: 'center' }}>
          <Reveal>
            <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT }}>Not just chat</span>
            <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>Real actions, right in the thread</h2>
            <p style={{ fontSize: 16.5, lineHeight: 1.65, color: muted, margin: 0 }}>Most AI just talks. Colvy’s assistant reaches into your live data to look things up and get things done — with a human approving anything that matters.</p>
          </Reveal>
          <Reveal delay={0.1}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {ACTIONS.map(a => (
                <div key={a.label} className="ai-card" style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 14, padding: '14px 16px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: ACCENT + '16', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatureIcon name={a.icon} color={ACCENT} size={18} /></span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: text, lineHeight: 1.3 }}>{a.label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* BAND 2 — control */}
      <section style={{ padding: 'clamp(40px, 6vw, 80px) 24px' }}>
        <div className="ai-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: 'rtl' }}>
          <div style={{ direction: 'ltr' }}>
            <Reveal>
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT }}>{BANDS[1].tag}</span>
              <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.08, margin: '10px 0 14px', color: text }}>{BANDS[1].title}</h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.65, color: muted, margin: '0 0 20px' }}>{BANDS[1].body}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                {BANDS[1].bullets.map(bl => (
                  <li key={bl} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, fontWeight: 600, color: text }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: ACCENT + '1a', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>{bl}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <div style={{ direction: 'ltr' }}>
            <Reveal delay={0.1}>
              <div style={{ position: 'relative', borderRadius: 24, minHeight: 280, overflow: 'hidden', background: `linear-gradient(140deg, ${ACCENT}22, ${ACCENT}05)`, border: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '32px 32px', opacity: 0.5 }} />
                <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${ACCENT}55`, animation: 'aiFloat 6s ease-in-out infinite' }}>
                  <FeatureIcon name={BANDS[1].icon} color="#fff" size={44} />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: 'clamp(30px, 5vw, 56px) 24px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 8px' }}>How it <span style={{ color: ACCENT }}>works</span></h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 30px', lineHeight: 1.55, textAlign: 'center' }}>From connected to helpful in an afternoon — you decide how much it does.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={(i % 4) * 0.05}>
              <div style={{ height: '100%', borderRadius: 20, padding: '26px 22px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', background: ACCENT, color: '#fff', fontWeight: 900, fontSize: 15, marginBottom: 14 }}>{i + 1}</span>
                <h3 style={{ fontSize: 16.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{s.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: muted, margin: 0 }}>{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(26px, 4.4vw, 42px)', fontWeight: 900, letterSpacing: '-0.03em', color: ACCENT }}>{s.big}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginTop: 4 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '20px 24px 60px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 26px' }}>Questions, answered</h2>
        </Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={(i % 3) * 0.05}>
              <Faq q={f.q} a={f.a} text={text} muted={muted} cardBg={cardBg} cardBorder={cardBorder} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${ACCENT}, ${PINK} 60%, ${BLUE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>Put an assistant on every thread</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Start free, set up in about 45 minutes — no credit card, cancel anytime.</p>
            <button onClick={go} className="ai-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
