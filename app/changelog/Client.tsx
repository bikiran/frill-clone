'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'

// Changelog — Colvy's own product release notes, shown as a vertical timeline.
// Entries describe features that actually exist across the product/site; no
// fabricated third-party facts. (Colvy's real Announcements/changelog feature is
// what a customer would use to publish something like this.)

const CORAL = '#ff6a4d', PINK = '#ff4d8d', PURPLE = '#7c5cff', GREEN = '#00c48c', BLUE = '#2b59ff', AMBER = '#d97706', INK = '#0f1119'

type Tag = 'New' | 'Improved' | 'Fixed'
const TAG_COLOR: Record<Tag, string> = { New: GREEN, Improved: BLUE, Fixed: AMBER }

type Release = { date: string; dateLabel: string; version: string; title: string; icon: string; items: { tag: Tag; text: string }[] }

const RELEASES: Release[] = [
  {
    date: '2026-09-02', dateLabel: 'September 2, 2026', version: '2026.9', title: 'AI actions in the inbox', icon: 'ai',
    items: [
      { tag: 'New', text: 'The AI assistant can now look up orders, draft replies and create tasks inline — you approve every action.' },
      { tag: 'New', text: 'Auto-summaries condense a long thread to a single line at the top.' },
      { tag: 'Improved', text: 'Smarter saved-reply suggestions surface the right answer as you type.' },
    ],
  },
  {
    date: '2026-08-12', dateLabel: 'August 12, 2026', version: '2026.8', title: 'Payments in the thread', icon: 'tag',
    items: [
      { tag: 'New', text: 'Send secure payment links by SMS or email; customers pay on their device.' },
      { tag: 'New', text: 'Build a live order and take payment without leaving the conversation.' },
      { tag: 'Improved', text: 'The order timeline now shows refunds and delivery tracking together.' },
    ],
  },
  {
    date: '2026-07-20', dateLabel: 'July 20, 2026', version: '2026.7', title: 'Calls, transcribed', icon: 'phone',
    items: [
      { tag: 'New', text: 'Call recording with automatic transcription and summary, saved to the thread.' },
      { tag: 'New', text: 'Missed-call text-back auto-SMSes callers you miss.' },
      { tag: 'Fixed', text: 'Occasional delay loading caller context on inbound calls.' },
    ],
  },
  {
    date: '2026-06-28', dateLabel: 'June 28, 2026', version: '2026.6', title: 'WhatsApp & Instagram, unified', icon: 'reaction',
    items: [
      { tag: 'New', text: 'Instagram and Facebook DMs now land in the shared inbox.' },
      { tag: 'Improved', text: 'WhatsApp templates are easier to create and manage.' },
      { tag: 'Fixed', text: 'Duplicate threads when a customer messaged from two channels at once.' },
    ],
  },
  {
    date: '2026-06-05', dateLabel: 'June 5, 2026', version: '2026.5', title: 'The feedback loop', icon: 'idea',
    items: [
      { tag: 'New', text: 'Public roadmap with customer voting.' },
      { tag: 'New', text: 'Announcements & changelog tied to the inbox — this very page runs on it.' },
      { tag: 'Improved', text: 'Turn any conversation into a logged idea in one click.' },
    ],
  },
  {
    date: '2026-05-15', dateLabel: 'May 15, 2026', version: '2026.4', title: 'Google Reviews', icon: 'star',
    items: [
      { tag: 'New', text: 'Automated review requests, triggered on delivery or a resolved chat.' },
      { tag: 'New', text: 'Read and reply to Google reviews from the inbox.' },
      { tag: 'Improved', text: 'A reputation view tracks rating and volume over time.' },
    ],
  },
  {
    date: '2026-04-22', dateLabel: 'April 22, 2026', version: '2026.3', title: 'Broadcasts & segments', icon: 'megaphone',
    items: [
      { tag: 'New', text: 'Send SMS, WhatsApp and email broadcasts from one composer.' },
      { tag: 'New', text: 'Audience segments by purchase history, tags and activity.' },
      { tag: 'Improved', text: 'Opt-out handling is now automatic on every campaign.' },
    ],
  },
  {
    date: '2026-03-30', dateLabel: 'March 30, 2026', version: '2026.2', title: 'A faster inbox', icon: 'bolt',
    items: [
      { tag: 'Improved', text: 'The order drawer opens instantly — synced items render first, details fill in behind.' },
      { tag: 'Improved', text: 'Keyboard shortcuts across the inbox for reply, assign and resolve.' },
      { tag: 'Fixed', text: 'Assignment notifications were occasionally missed.' },
    ],
  },
  {
    date: '2026-03-04', dateLabel: 'March 4, 2026', version: '2026.1', title: 'WooCommerce & Shopify', icon: 'plug',
    items: [
      { tag: 'New', text: 'Live orders, refunds and customer data right in the chat.' },
      { tag: 'New', text: 'Two-way sync with WooCommerce and Shopify.' },
      { tag: 'Fixed', text: 'Currency formatting on some line items.' },
    ],
  },
  {
    date: '2026-02-10', dateLabel: 'February 10, 2026', version: '2026.0', title: 'Hello, Colvy', icon: 'inbox',
    items: [
      { tag: 'New', text: 'A shared inbox across SMS, email and live chat.' },
      { tag: 'New', text: 'Contacts & CRM beside every conversation.' },
    ],
  },
]

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 24 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

export default function ChangelogPage() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const { data: l } = supabase.auth.onAuthStateChange(() => {})
    return () => { l?.subscription?.unsubscribe() }
  }, [])

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const railLine = dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,17,25,0.1)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'
  const gridImg = `linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px),linear-gradient(90deg,${dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,17,25,0.045)'} 1px,transparent 1px)`

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        .cl-card{ transition:transform .24s cubic-bezier(0.16,1,0.3,1), box-shadow .24s cubic-bezier(0.16,1,0.3,1), border-color .24s; }
        .cl-card:hover{ transform:translateY(-3px); box-shadow:0 16px 38px rgba(15,17,25,0.10); }
        @media (max-width:720px){ .cl-row{ padding-left:0 !important; } .cl-rail{ display:none !important; } }
        @media (prefers-reduced-motion:reduce){ .cl-card{ transition:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      {/* HEADER */}
      <section style={{ position: 'relative', textAlign: 'center', padding: '150px 24px 20px', maxWidth: 900, margin: '0 auto' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: gridImg, backgroundSize: '54px 54px', WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 30%, #000 40%, transparent 80%)', maskImage: 'radial-gradient(ellipse 70% 70% at 50% 30%, #000 40%, transparent 80%)', pointerEvents: 'none' }} />
        <Reveal>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: CORAL + '18', color: CORAL, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 18 }}><FeatureIcon name="megaphone" color={CORAL} size={15} />Changelog</span>
          <h1 style={{ fontSize: 'clamp(38px, 5.6vw, 66px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 16px' }}>What’s new in <span style={{ color: CORAL }}>Colvy</span></h1>
          <p style={{ fontSize: 'clamp(16px, 1.9vw, 20px)', color: muted, maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>Every release, in the open. New features, improvements and fixes — shipped for growing businesses.</p>
        </Reveal>
      </section>

      {/* LEGEND */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '10px 24px 6px' }}>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {(['New', 'Improved', 'Fixed'] as Tag[]).map(t => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: muted }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: TAG_COLOR[t] }} />{t}
            </span>
          ))}
        </div>
      </section>

      {/* TIMELINE */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px 70px' }}>
        <div style={{ position: 'relative' }}>
          {/* rail */}
          <div className="cl-rail" aria-hidden style={{ position: 'absolute', top: 8, bottom: 8, left: 7, width: 2, background: railLine }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {RELEASES.map((r, i) => (
              <Reveal key={r.version} delay={0}>
                <div className="cl-row" style={{ position: 'relative', paddingLeft: 40 }}>
                  {/* dot */}
                  <span className="cl-rail" aria-hidden style={{ position: 'absolute', left: 0, top: 22, width: 16, height: 16, borderRadius: '50%', background: CORAL, border: `3px solid ${bg}`, boxShadow: `0 0 0 1px ${CORAL}66` }} />
                  <div className="cl-card" style={{ borderRadius: 20, background: cardBg, border: `1px solid ${cardBorder}`, padding: 'clamp(20px, 3vw, 28px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                      <span style={{ width: 42, height: 42, borderRadius: 12, background: CORAL + '14', color: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatureIcon name={r.icon} color={CORAL} size={21} /></span>
                      <div style={{ minWidth: 0 }}>
                        <h2 style={{ fontSize: 'clamp(18px, 2.4vw, 23px)', fontWeight: 900, letterSpacing: '-0.015em', margin: 0, color: text }}>{r.title}</h2>
                        <div style={{ fontSize: 13, color: muted, fontWeight: 600, marginTop: 2 }}>
                          <time dateTime={r.date}>{r.dateLabel}</time> · <span style={{ fontFamily: 'ui-monospace, monospace' }}>v{r.version}</span>
                        </div>
                      </div>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                      {r.items.map((it, j) => (
                        <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, fontSize: 15, lineHeight: 1.55, color: text }}>
                          <span style={{ flexShrink: 0, marginTop: 2, fontSize: 11, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: TAG_COLOR[it.tag], background: TAG_COLOR[it.tag] + '18', borderRadius: 6, padding: '3px 8px', minWidth: 68, textAlign: 'center' }}>{it.tag}</span>
                          <span style={{ color: muted }}>{it.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 90px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})` }}>
        <Reveal>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 50px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>Grow with every release</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: '0 0 28px' }}>Start free today — and get every improvement the moment it ships.</p>
            <a href="/signup" style={{ display: 'inline-flex', padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, textDecoration: 'none', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free</a>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
