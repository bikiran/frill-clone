'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Standalone Phones landing page. Grounded in the real calling product:
// browser calling, click-to-dial, buy/port local numbers assigned per
// business location, call recording and AI call summaries on the thread.

const GREEN = '#00c48c', PURPLE = '#7c5cff', PINK = '#ff4d8d', BLUE = '#2b59ff', INK = '#0f1119'
const ACCENT = GREEN

const FEATURES = [
  { icon: 'globe', title: 'Browser calling', desc: 'Make and take calls from any tab — no handsets, no PBX.' },
  { icon: 'phone', title: 'Click-to-dial', desc: 'Call any customer in one click, straight from the thread.' },
  { icon: 'pin', title: 'Local numbers', desc: 'Buy a number in any capital, or bring and port your own.' },
  { icon: 'camera', title: 'Recording & transcription', desc: 'Every call recorded and transcribed, attached to the thread.' },
  { icon: 'ai', title: 'AI call summaries', desc: 'A tidy summary and follow-ups written up for you.' },
  { icon: 'chat', title: 'Missed-call text-back', desc: 'Auto-text callers you miss so no lead slips away.' },
]

const BANDS = [
  { tag: 'Context first', title: 'Know the caller before you say hello', body: 'The moment the phone rings, the caller is identified and their past chats, orders and notes are on screen — so every call starts informed instead of cold.', bullets: ['Caller identified on every ring', 'Orders & past chats on screen', 'Notes saved straight to the thread'], icon: 'user' },
  { tag: 'After the call', title: 'Every call, written up for you', body: 'Calls are recorded, transcribed and summarised automatically, with follow-up tasks created so nothing slips between the call and the next step.', bullets: ['Auto recording & transcription', 'AI summary on the thread', 'Follow-up tasks created'], icon: 'pen' },
]

// Every phone feature — each links to its own /phones/[slug] page.
const ALL_FEATURES: { slug: string; name: string; icon: string; desc: string }[] = [
  { slug: 'click-to-dial', name: 'Click to Dial', icon: 'phone', desc: 'One-click calling from any tab' },
  { slug: 'browser-dialer', name: 'Browser Dialer', icon: 'globe', desc: 'Call without leaving the browser' },
  { slug: 'hd-audio', name: 'HD Audio', icon: 'bolt', desc: 'Crystal-clear call quality' },
  { slug: 'numbers-porting', name: 'Numbers & Porting', icon: 'pin', desc: 'Local numbers, or bring your own' },
  { slug: 'mobile-app', name: 'Mobile App', icon: 'phone', desc: 'Colvy on iOS & Android' },
  { slug: 'warm-transfer', name: 'Warm Transfer', icon: 'user', desc: 'Brief a colleague, then transfer' },
  { slug: 'call-forwarding', name: 'Call Forwarding', icon: 'link', desc: 'Forward to any number or device' },
  { slug: 'cascade-ring', name: 'Cascade Ring', icon: 'bell', desc: 'Ring devices in sequence' },
  { slug: 'simultaneous-ring', name: 'Simultaneous Ring', icon: 'target', desc: 'Ring everyone at once' },
  { slug: 'ivr', name: 'IVR & Auto-Attendant', icon: 'target', desc: 'Route callers to the right team' },
  { slug: 'ai-call-intelligence', name: 'AI Call Intelligence', icon: 'ai', desc: 'Caller context before you answer' },
  { slug: 'ai-actions', name: 'AI Actions', icon: 'bolt', desc: 'Auto-tasks & updates after calls' },
  { slug: 'call-recording', name: 'Call Recording', icon: 'camera', desc: 'Record, transcribe & summarise' },
  { slug: 'call-reporting', name: 'Call Reporting', icon: 'chart', desc: 'Dashboards & call insights' },
  { slug: 'missed-call-text-back', name: 'Missed Call Text Back', icon: 'chat', desc: 'Auto-SMS a missed caller' },
  { slug: 'voicemail', name: 'Voicemail', icon: 'inbox', desc: 'Transcribed & summarised' },
  { slug: 'voip', name: 'VoIP Phone System', icon: 'phone', desc: 'A cloud phone system, built in' },
  { slug: 'international', name: 'International Calling', icon: 'globe', desc: 'Call 100+ countries' },
  { slug: 'command-centre', name: 'Command Centre', icon: 'kanban', desc: 'Live dashboard with AI agents' },
]

// Real Australian local area codes offered when buying a number.
const NUMBERS = ['Sydney 02', 'Melbourne 03', 'Brisbane 07', 'Gold Coast 07', 'Perth 08', 'Adelaide 08', 'Canberra 02', 'Hobart 03', 'Darwin 08']

const STEPS = [
  { title: 'Get a number', desc: 'Buy a local number in any capital, or port the one you already use.' },
  { title: 'Call from the browser', desc: 'Dial in one click from any conversation — nothing to install.' },
  { title: 'Every call logged', desc: 'Recording, transcript and an AI summary land on the thread.' },
  { title: 'Missed calls text back', desc: 'Anyone you miss gets an automatic text so the lead isn’t lost.' },
]

const FAQS = [
  { q: 'Do I need special hardware?', a: 'No — calls run in your browser. No handsets, no PBX, nothing to install.' },
  { q: 'Can I keep my existing number?', a: 'Buy a new local number in any Australian capital, or bring and port the number you already use.' },
  { q: 'Are calls recorded and transcribed?', a: 'Yes — calls are recorded and transcribed, with an AI summary attached to the conversation. You control recording.' },
  { q: 'Can different locations have their own numbers?', a: 'Yes. Assign numbers per business location so each site rings and dials from its own local number.' },
]

const STATS = [{ big: '0', label: 'hardware needed' }, { big: 'Every', label: 'call logged & summarised' }, { big: 'Local', label: 'numbers in every capital' }]

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

export default function PhonesPage() {
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

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @keyframes phFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes phRing { 0%,100%{transform:rotate(0)} 20%{transform:rotate(-12deg)} 40%{transform:rotate(12deg)} 60%{transform:rotate(-8deg)} 80%{transform:rotate(8deg)} }
        .ph-card,.ph-btn{ transition:all 0.22s cubic-bezier(0.16,1,0.3,1); }
        .ph-card:hover{ transform:translateY(-6px); }
        .ph-btn:hover{ transform:translateY(-2px); }
        @media (max-width:900px){ .ph-hero{ grid-template-columns:1fr !important; } .ph-band{ grid-template-columns:1fr !important; } .ph-hero-cta{ flex-wrap:nowrap !important; } .ph-hero-cta > *{ flex:1 1 0 !important; justify-content:center !important; white-space:nowrap !important; padding-left:14px !important; padding-right:14px !important; } }
        @media (prefers-reduced-motion:reduce){ [style*="phFloat"],[style*="phRing"]{ animation:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HERO */}
      <section className="ph-hero" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.02fr 0.98fr', gap: 48, alignItems: 'center', maxWidth: 1280, margin: '0 auto', padding: 'clamp(100px, 13vw, 150px) 24px 60px' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 60% at 40% 40%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Reveal>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: ACCENT + '18', color: ACCENT, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="phone" color={ACCENT} size={15} />Phones</span>
            <h1 style={{ fontSize: 'clamp(38px, 5.8vw, 68px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, margin: '0 0 18px' }}>A phone system <span style={{ color: ACCENT }}>inside your inbox</span></h1>
            <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 520, lineHeight: 1.6, margin: '0 0 30px' }}>Make and take business calls right where your messages live. Every call rings with the customer’s full history, and lands recorded, transcribed and summarised.</p>
            <div className="ph-hero-cta" style={{ display: 'flex', gap: 12 }}>
              <button onClick={go} className="ph-btn" style={btnPrimary}>Start free — no card →</button>
              <a href="/pricing" className="ph-btn" style={btnGhost}>See pricing</a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          {/* Hero photo */}
          <div style={{ position: 'relative', borderRadius: 28, minHeight: 340, overflow: 'hidden', background: `linear-gradient(150deg, ${ACCENT} 0%, ${ACCENT}cc 45%, ${dark ? '#0b0c14' : '#171a2b'} 120%)`, boxShadow: `0 30px 70px ${ACCENT}44` }}>
            <img src="/feature/phones.jpg" alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${ACCENT}e6 0%, ${ACCENT}59 42%, rgba(10,12,20,0.5) 115%)` }} />
            <div style={{ position: 'absolute', top: 22, right: 22, color: 'rgba(255,255,255,0.95)', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))', animation: 'phFloat 6s ease-in-out infinite' }}><FeatureIcon name="phone" color="rgba(255,255,255,0.95)" size={54} /></div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, padding: 32 }}>
              {['Click-to-dial', 'Call recording', 'Missed-call text-back'].map((c, i) => (
                <span key={c} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', fontSize: 14, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '9px 16px', animation: `phFloat ${5 + i * 0.6}s ease-in-out ${i * 0.3}s infinite` }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FEATURE GRID */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '10px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.05}>
              <div className="ph-card" style={{ height: '100%', borderRadius: 20, padding: 26, background: cardBg, border: `1px solid ${cardBorder}` }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, background: ACCENT + '16', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FeatureIcon name={f.icon} color={ACCENT} size={23} /></span>
                <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 6px', color: text }}>{f.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, margin: 0 }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ALL PHONE FEATURES */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px 40px' }}>
        <Reveal>
          <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 8px' }}>Every phone feature</h2>
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 28px', lineHeight: 1.55, textAlign: 'center' }}>A complete phone system — explore each capability in depth.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {ALL_FEATURES.map((a, i) => (
            <Reveal key={a.slug} delay={(i % 4) * 0.04}>
              <a href={`/phones/${a.slug}`} className="ph-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 13, height: '100%', borderRadius: 16, padding: '16px 18px', background: cardBg, border: `1px solid ${cardBorder}`, textDecoration: 'none' }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, background: ACCENT + '14', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatureIcon name={a.icon} color={ACCENT} size={20} /></span>
                <span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: text }}>{a.name}</span>
                  <span style={{ display: 'block', fontSize: 13, color: muted, marginTop: 2, lineHeight: 1.45 }}>{a.desc}</span>
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BAND 1 */}
      <section style={{ padding: 'clamp(40px, 6vw, 80px) 24px' }}>
        <div className="ph-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
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
              <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${ACCENT}55`, animation: 'phFloat 6s ease-in-out infinite' }}>
                <FeatureIcon name={BANDS[0].icon} color="#fff" size={44} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* NUMBERS */}
      <section style={{ background: dark ? 'rgba(255,255,255,0.02)' : ACCENT + '08', padding: 'clamp(44px, 6vw, 84px) 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Your numbers, <span style={{ color: ACCENT }}>your cities</span></h2>
            <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 22px', lineHeight: 1.55 }}>Buy a local number in any Australian capital, assign one per location, or bring and port the number you already use.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {NUMBERS.map(n => (
                <span key={n} style={{ fontSize: 13.5, fontWeight: 700, color: text, background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 999, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 7 }}><FeatureIcon name="pin" color={ACCENT} size={13} />{n}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* BAND 2 */}
      <section style={{ padding: 'clamp(40px, 6vw, 80px) 24px' }}>
        <div className="ph-band" style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', direction: 'rtl' }}>
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
                <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 50px ${ACCENT}55`, animation: 'phFloat 6s ease-in-out infinite' }}>
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
          <p style={{ fontSize: 16, color: muted, maxWidth: 560, margin: '0 auto 30px', lineHeight: 1.55, textAlign: 'center' }}>From number to first call in minutes — no hardware, no IT ticket.</p>
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
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '10px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06}>
              <div style={{ textAlign: 'center', borderRadius: 20, padding: '28px 14px', background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 900, letterSpacing: '-0.03em', color: ACCENT }}>{s.big}</div>
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
      <section style={{ padding: 'clamp(48px, 8vw, 96px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${ACCENT}, ${BLUE} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff', margin: '0 0 12px' }}>Add calling to your inbox</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 30px' }}>Start free, set up in about 45 minutes — no credit card, cancel anytime.</p>
            <button onClick={go} className="ph-btn" style={{ padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, border: 'none', cursor: 'pointer', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Get started — it’s free</button>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
