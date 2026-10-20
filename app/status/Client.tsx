'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import FeatureIcon from '@/components/FeatureIcon'
import { COLVY_CONTACT } from '@/lib/colvy-contact'
import {
  HEALTH_LABEL, INCIDENT_HISTORY_DAYS, INCIDENT_IMPACT_LABEL, INCIDENT_STATUS_LABEL, STATUS_COMPONENTS, dayKey, lastDays,
  type DayStatus, type Health, type OverallLevel, type PublicIncident, type PublicStatus,
} from '@/lib/status-health'

// System status page. Everything here comes from live checks made on the
// server (lib/status-server.ts, cached for about a minute): component states,
// incidents the Colvy team has posted, and the 30-day history recorded every
// five minutes. Where there's no recent data it says so instead of claiming
// "operational".

const CORAL = '#ff6a4d', PINK = '#ff4d8d', PURPLE = '#7c5cff', GREEN = '#12b76a', INK = '#0f1119'
const AMBER = '#f59e0b', RED = '#ef4444', SLATE = '#64748b'
const REFRESH_MS = 60_000
const TZ = 'Australia/Sydney'

const HEALTH_COLOR: Record<Health, string> = { operational: GREEN, degraded: AMBER, outage: RED, unknown: SLATE }
const OVERALL_COLOR: Record<OverallLevel, string> = { operational: GREEN, partial: SLATE, degraded: AMBER, outage: RED, unknown: SLATE }
const DAY_COLOR: Record<DayStatus, string> = { operational: GREEN, degraded: AMBER, outage: RED, none: SLATE }
const DAY_LABEL: Record<DayStatus, string> = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage', none: 'No data' }
const IMPACT_COLOR: Record<string, string> = { minor: AMBER, major: RED, critical: RED }
const COMPONENT_NAME: Record<string, string> = Object.fromEntries(STATUS_COMPONENTS.map(c => [c.key, c.name]))
const ICON: Record<string, string> = Object.fromEntries(STATUS_COMPONENTS.map(c => [c.key, c.icon]))

// Fixed locale and time zone, so the server and the browser render the same text.
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-AU', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
const fmtDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => { const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true) }, { threshold }); if (ref.current) o.observe(ref.current); return () => o.disconnect() }, [threshold])
  return { ref, v }
}
function Reveal({ children, delay = 0, y = 22 }: { children: ReactNode; delay?: number; y?: number }) {
  const { ref, v } = useReveal()
  return <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : `translateY(${y}px)`, transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s` }}>{children}</div>
}

function BannerIcon({ level }: { level: OverallLevel }) {
  const p = { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (level === 'operational') return <svg {...p}><polyline points="20 6 9 17 4 12" /></svg>
  if (level === 'outage') return <svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
  if (level === 'degraded') return <svg {...p}><line x1="12" y1="7" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
  return <svg {...p}><line x1="6" y1="12" x2="18" y2="12" /></svg>
}

export default function StatusPage({ initial }: { initial: PublicStatus | null }) {
  const [dark, setDark] = useState(false)
  const [s, setS] = useState<PublicStatus | null>(initial)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const { data: l } = supabase.auth.onAuthStateChange(() => {})
    return () => { l?.subscription?.unsubscribe() }
  }, [])
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const res = await fetch('/api/status', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const next = await res.json()
        if (alive && next?.overall) { setS(next); setFailed(false) }
      } catch { if (alive) setFailed(true) }
    }
    if (!initial) load()
    const t = setInterval(load, REFRESH_MS)
    return () => { alive = false; clearInterval(t) }
  }, [initial])

  const bg = dark ? '#0a0b12' : '#ffffff'
  const text = dark ? '#f4f5fb' : INK
  const muted = dark ? 'rgba(244,245,251,0.62)' : 'rgba(15,17,25,0.6)'
  const cardBg = dark ? 'rgba(255,255,255,0.045)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,17,25,0.09)'
  const font = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif'

  const level: OverallLevel = s?.overall.status || 'unknown'
  const bc = OVERALL_COLOR[level]
  const title = s?.overall.title || (failed ? 'Status unavailable' : 'Checking current status…')
  const sub = s ? s.overall.sub : failed ? 'We couldn’t reach our status checks. Please try again shortly.' : ''
  const active = s?.incidents?.active || []
  const history = s?.history || null

  const StatusPill = ({ h }: { h: Health }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 700, color: HEALTH_COLOR[h], whiteSpace: 'nowrap' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: HEALTH_COLOR[h], boxShadow: `0 0 0 3px ${HEALTH_COLOR[h]}26` }} />{HEALTH_LABEL[h]}
    </span>
  )

  const IncidentCard = ({ i, open }: { i: PublicIncident; open: boolean }) => {
    const c = open ? (IMPACT_COLOR[i.impact] || AMBER) : SLATE
    const updates = [...i.updates].reverse()
    return (
      <div style={{ borderRadius: 18, border: `1px solid ${open ? c + '55' : cardBorder}`, background: open ? `linear-gradient(150deg, ${c}14, ${c}05)` : cardBg, padding: 'clamp(16px, 3vw, 22px)', marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: text, minWidth: 0, overflowWrap: 'anywhere' }}>{i.title}</h3>
          <span style={{ fontSize: 12, fontWeight: 800, color: c, padding: '3px 10px', borderRadius: 999, background: c + '1f', whiteSpace: 'nowrap' }}>{INCIDENT_STATUS_LABEL[i.status]}{open ? ` · ${INCIDENT_IMPACT_LABEL[i.impact]}` : ''}</span>
        </div>
        <p style={{ fontSize: 13, color: muted, margin: '6px 0 0' }}>
          {open ? `Started ${fmtTime(i.started_at)}` : `${fmtTime(i.started_at)} to ${i.resolved_at ? fmtTime(i.resolved_at) : 'now'}`}
          {i.components.length > 0 && <> · Affects {i.components.map(k => COMPONENT_NAME[k] || k).join(', ')}</>}
        </p>
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {(open ? updates : updates.slice(0, 1)).map((u, n) => (
            <div key={n} style={{ borderLeft: `2px solid ${n === 0 ? c : cardBorder}`, paddingLeft: 12 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: text, margin: 0 }}>{INCIDENT_STATUS_LABEL[u.status]} <span style={{ fontWeight: 500, color: muted }}>· {fmtTime(u.at)}</span></p>
              <p style={{ fontSize: 14, color: text, margin: '3px 0 0', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{u.message}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Past incidents, day by day (Sydney days), for the last 14 days.
  const today = s ? dayKey(s.generatedAt) : null
  const days = today ? lastDays(today, INCIDENT_HISTORY_DAYS).reverse() : []
  const pastByDay = (day: string) => (s?.incidents?.recent || []).filter(i => dayKey(i.resolved_at || i.started_at) === day)

  return (
    <div style={{ background: bg, color: text, fontFamily: font, minHeight: '100vh', overflowX: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        .st-row{ transition:background .16s; }
        .st-row:hover{ background:${dark ? 'rgba(255,255,255,0.03)' : 'rgba(15,17,25,0.02)'}; }
        .st-bars{ display:grid; grid-template-columns:repeat(30, minmax(0,1fr)); gap:2px; margin-top:10px; }
        .st-bar{ height:22px; border-radius:3px; }
        @media (min-width:560px){ .st-bars{ gap:3px } .st-bar{ height:26px } }
        @media (prefers-reduced-motion:reduce){ .st-row{ transition:none !important } }
      `}</style>

      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      <section style={{ maxWidth: 820, margin: '0 auto', padding: 'clamp(100px, 13vw, 150px) 16px 20px' }}>
        {/* Overall banner */}
        <Reveal>
          <div role="status" aria-live="polite" style={{ borderRadius: 22, overflow: 'hidden', border: `1px solid ${bc}44`, background: `linear-gradient(150deg, ${bc}1a, ${bc}08)`, padding: 'clamp(20px, 4vw, 34px)', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: bc, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BannerIcon level={level} />
            </span>
            <div style={{ minWidth: 0, flex: '1 1 220px' }}>
              <h1 style={{ fontSize: 'clamp(24px, 3.6vw, 34px)', fontWeight: 900, letterSpacing: '-0.025em', margin: '0 0 4px' }}>{title}</h1>
              {sub && <p style={{ fontSize: 14, color: muted, margin: '0 0 2px', lineHeight: 1.5 }}>{sub}</p>}
              <p style={{ fontSize: 13, color: muted, margin: 0 }}>{s ? `Last checked ${fmtTime(s.generatedAt)}` : ''}</p>
            </div>
          </div>
        </Reveal>

        {/* Open incidents */}
        {active.length > 0 && (
          <Reveal delay={0.03}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', margin: '30px 0 0' }}>{active.length === 1 ? 'Current incident' : 'Current incidents'}</h2>
            {active.map(i => <IncidentCard key={i.id} i={i} open />)}
          </Reveal>
        )}

        {/* Components */}
        <Reveal delay={0.05}>
          <div style={{ marginTop: 22, borderRadius: 20, border: `1px solid ${cardBorder}`, background: cardBg, overflow: 'hidden' }}>
            {(s?.components || STATUS_COMPONENTS.map(c => ({ ...c, status: 'unknown' as Health, note: '', latencyMs: null }))).map((c, i) => {
              const bars = history?.components[c.key]
              const up = history?.uptime[c.key]
              return (
                <div key={c.key} className="st-row" style={{ padding: '16px 20px', borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 11, background: CORAL + '14', color: CORAL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FeatureIcon name={ICON[c.key] || 'link'} color={CORAL} size={20} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 700, color: text }}>{c.name}</div>
                      <div style={{ fontSize: 13, color: muted }}>{c.desc}</div>
                      {s && c.note && <div style={{ fontSize: 12.5, color: c.status === 'operational' ? muted : HEALTH_COLOR[c.status], marginTop: 2, fontWeight: c.status === 'operational' ? 500 : 600 }}>{c.note}{c.latencyMs != null ? ` · ${c.latencyMs} ms` : ''}</div>}
                    </div>
                    {s ? <StatusPill h={c.status} /> : <span style={{ fontSize: 13, color: muted }}>Checking…</span>}
                  </div>
                  {bars && (
                    <div>
                      <div className="st-bars" role="img" aria-label={`${c.name}, last 30 days${up != null ? `: ${up}% uptime` : ''}`}>
                        {bars.map(d => <span key={d.day} className="st-bar" title={`${fmtDay(d.day)}: ${DAY_LABEL[d.status]}`} style={{ background: DAY_COLOR[d.status], opacity: d.status === 'none' ? 0.28 : 0.9 }} />)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: muted, marginTop: 5 }}>
                        <span>30 days ago</span>
                        <span>{up != null ? `${up}% uptime` : 'No data yet'}</span>
                        <span>Today</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {history && (
            <p style={{ fontSize: 12, color: muted, margin: '10px 2px 0', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {(['operational', 'degraded', 'outage', 'none'] as DayStatus[]).map(k => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: DAY_COLOR[k], opacity: k === 'none' ? 0.28 : 0.9 }} />{DAY_LABEL[k]}</span>
              ))}
            </p>
          )}
        </Reveal>

        {/* Past incidents */}
        {s?.incidents && (
          <Reveal delay={0.05}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', margin: '40px 0 14px' }}>Past incidents</h2>
            <div style={{ borderRadius: 20, border: `1px solid ${cardBorder}`, background: cardBg, overflow: 'hidden' }}>
              {days.map((d, i) => {
                const list = pastByDay(d)
                return (
                  <div key={d} style={{ padding: '13px 20px', borderTop: i === 0 ? 'none' : `1px solid ${cardBorder}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: text }}>{fmtDay(d)}</span>
                      {!list.length && <span style={{ fontSize: 13.5, color: muted }}>No incidents reported</span>}
                    </div>
                    {list.map(x => <IncidentCard key={x.id} i={x} open={false} />)}
                  </div>
                )
              })}
            </div>
          </Reveal>
        )}

        <p style={{ fontSize: 13, color: muted, margin: '16px 2px 0', lineHeight: 1.6 }}>
          Checked automatically about once a minute. For help with something that isn’t working, reach us at <a href={COLVY_CONTACT.mailHref} style={{ color: CORAL, fontWeight: 700, textDecoration: 'none' }}>{COLVY_CONTACT.email}</a> or call or text <a href={COLVY_CONTACT.telHref} style={{ color: CORAL, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>{COLVY_CONTACT.phoneDisplay}</a>.
        </p>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(48px, 8vw, 84px) 24px', textAlign: 'center', background: `linear-gradient(135deg, ${CORAL}, ${PINK} 60%, ${PURPLE})`, marginTop: 40 }}>
        <Reveal>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4.6vw, 44px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 12px' }}>Reliable by design</h2>
            <p style={{ fontSize: 16.5, color: 'rgba(255,255,255,0.9)', margin: '0 0 26px' }}>One dependable place for every customer conversation. Start free — no card.</p>
            <a href="/signup" style={{ display: 'inline-flex', padding: '16px 38px', borderRadius: 999, background: '#fff', color: INK, fontWeight: 900, fontSize: 17, textDecoration: 'none', boxShadow: '0 14px 40px rgba(0,0,0,0.2)' }}>Start free</a>
          </div>
        </Reveal>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}
