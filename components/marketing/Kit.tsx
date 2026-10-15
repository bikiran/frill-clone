'use client'

import { useEffect, useRef, useState, ReactNode, CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { redirectToUserAdmin, boardUrl } from '@/lib/redirect'

// Shared pieces for the newer marketing pages (/for/*, the business-number page
// and the platform page): theme colours, the sign-up/dashboard button handler,
// scroll reveals, the FAQ accordion, the animated workflow rail and the closing
// call-to-action. Older pages keep their own copies; new pages use these.

export const INK = '#0f1119'
export const FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'

export function useShell(accent: string) {
  const [dark, setDark] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUser(data?.session?.user))
    const { data: l } = supabase.auth.onAuthStateChange((_: any, s: any) => setUser(s?.user ?? null))
    return () => { l?.subscription?.unsubscribe() }
  }, [])

  // Signed out → sign up. Signed in → their own dashboard.
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

  const t = {
    dark, user, go, toggleDark: () => setDark(v => !v),
    bg: dark ? '#0a0b12' : '#ffffff',
    soft: dark ? '#0f1019' : '#f7f7f9',
    text: dark ? '#f4f5fb' : INK,
    muted: dark ? 'rgba(244,245,251,0.64)' : 'rgba(15,17,25,0.62)',
    cardBg: dark ? 'rgba(255,255,255,0.045)' : '#ffffff',
    cardBorder: dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)',
    grid: `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`,
  }
  const btnPrimary: CSSProperties = { padding: '15px 30px', borderRadius: 999, background: accent, color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 10px 30px ${accent}55`, fontFamily: 'inherit' }
  const btnGhost: CSSProperties = { padding: '15px 26px', borderRadius: 999, border: `2px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,25,0.12)'}`, background: 'transparent', color: t.text, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit' }
  return { ...t, btnPrimary, btnGhost }
}

export function useReveal(threshold = 0.14) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold })
    if (ref.current) o.observe(ref.current)
    return () => o.disconnect()
  }, [threshold])
  return { ref, v }
}

export function Reveal({ children, delay = 0, y = 28, style }: { children: ReactNode; delay?: number; y?: number; style?: CSSProperties }) {
  const { ref, v } = useReveal()
  return (
    <div ref={ref} className="mk-reveal" style={{ ...style, opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>
      {children}
    </div>
  )
}

export const Arrow = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
)

export function Eyebrow({ children, accent }: { children: ReactNode; accent: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent }}>{children}</span>
}

export function SectionHead({ eyebrow, title, sub, accent, muted, center = true }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; accent: string; muted: string; center?: boolean }) {
  return (
    <div style={{ textAlign: center ? 'center' : 'left', maxWidth: 760, margin: center ? '0 auto 44px' : '0 0 36px' }}>
      {eyebrow && <Eyebrow accent={accent}>{eyebrow}</Eyebrow>}
      <h2 style={{ fontSize: 'clamp(30px, 4.2vw, 50px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.05, margin: '12px 0 14px' }}>{title}</h2>
      {sub && <p style={{ fontSize: 'clamp(16px, 1.5vw, 19px)', lineHeight: 1.6, color: muted, margin: 0 }}>{sub}</p>}
    </div>
  )
}

export function Faq({ q, a, accent, text, muted, cardBg, cardBorder }: { q: string; a: string; accent: string; text: string; muted: string; cardBg: string; cardBorder: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderRadius: 16, background: cardBg, border: `1px solid ${cardBorder}`, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '18px 20px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: text, fontSize: 16, fontWeight: 800, fontFamily: 'inherit' }}>
        {q}
        <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: accent + '18', color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.22s cubic-bezier(0.16,1,0.3,1)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </span>
      </button>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ overflow: 'hidden' }}>
          <p style={{ margin: 0, padding: '0 20px 18px', fontSize: 14.5, lineHeight: 1.65, color: muted }}>{a}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * The journey as a row of steps joined by arrows. A highlight walks along the
 * steps on a loop so it reads as a flow, not a list. Wraps on phones.
 */
export function WorkflowRail({ steps, accent, dark }: { steps: string[]; accent: string; dark: boolean }) {
  const [on, setOn] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setOn(-1); return }
    const id = setInterval(() => setOn(i => (i + 1) % steps.length), 1300)
    return () => clearInterval(id)
  }, [steps.length])
  return (
    <div className="mk-rail" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {steps.map((s, i) => {
        const lit = on === -1 || i <= on
        return (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 13, fontWeight: 800, padding: '7px 13px', borderRadius: 999, whiteSpace: 'nowrap',
              border: `1.5px solid ${lit ? accent : dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,17,25,0.12)'}`,
              background: i === on ? accent : lit ? accent + '14' : 'transparent',
              color: i === on ? '#fff' : lit ? accent : dark ? 'rgba(244,245,251,0.6)' : 'rgba(15,17,25,0.55)',
              transition: 'all 0.45s cubic-bezier(0.16,1,0.3,1)',
            }}>{s}</span>
            {i < steps.length - 1 && <span aria-hidden style={{ color: lit && i < on ? accent : dark ? 'rgba(255,255,255,0.3)' : 'rgba(15,17,25,0.3)', transition: 'color 0.45s', display: 'inline-flex' }}><Arrow size={14} /></span>}
          </span>
        )
      })}
    </div>
  )
}

/** Gentle pointer parallax for a hero composition (sets --mx/--my on the element). */
export function usePointerParallax<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        el.style.setProperty('--mx', String((e.clientX / window.innerWidth - 0.5) * 2))
        el.style.setProperty('--my', String((e.clientY / window.innerHeight - 0.5) * 2))
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf) }
  }, [])
  return ref
}

export function CtaBand({ title, sub, accent, onGo, user, secondary }: { title: string; sub: string; accent: string; onGo: () => void; user: any; secondary?: { label: string; href: string } }) {
  return (
    <section style={{ padding: '30px 24px 90px' }}>
      <Reveal>
        <div style={{ position: 'relative', overflow: 'hidden', maxWidth: 1180, margin: '0 auto', borderRadius: 32, padding: 'clamp(44px, 6vw, 72px) clamp(24px, 5vw, 64px)', background: `linear-gradient(135deg, ${accent}, ${accent}cc 55%, #1f2a6b)`, color: '#fff', textAlign: 'center' }}>
          <div aria-hidden style={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', top: -180, right: -120, filter: 'blur(4px)' }} />
          <div aria-hidden style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', bottom: -160, left: -80 }} />
          <h2 style={{ position: 'relative', fontSize: 'clamp(30px, 4.4vw, 52px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 14px' }}>{title}</h2>
          <p style={{ position: 'relative', fontSize: 'clamp(16px, 1.6vw, 19px)', lineHeight: 1.6, opacity: 0.9, maxWidth: 620, margin: '0 auto 28px' }}>{sub}</p>
          <div style={{ position: 'relative', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onGo} style={{ padding: '15px 30px', borderRadius: 999, background: '#fff', color: accent, fontWeight: 900, fontSize: 16, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
              {user ? 'Go to your dashboard' : 'Start free'} <Arrow />
            </button>
            {secondary && <a href={secondary.href} style={{ padding: '15px 26px', borderRadius: 999, border: '2px solid rgba(255,255,255,0.5)', color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>{secondary.label}</a>}
          </div>
        </div>
      </Reveal>
    </section>
  )
}
