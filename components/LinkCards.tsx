'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'

// Boxy cards for the tracked links Colvy sends customers (payment, booking,
// review, product, upload, any link): what it is, where it goes, how many
// times it was opened, and the latest opens with device + city.
// Data comes from /api/links/stats, batched and refreshed every 30s.

// ── Which codes are in a message ───────────────────────────────────────────
const CODE_RE = /https?:\/\/[^\s<>"')]*?\/(?:l|m)\/([A-Za-z0-9_-]{4,16})\b/g
export function linkCodesIn(text: string | null | undefined): string[] {
  if (!text) return []
  const out: string[] = []
  for (const m of text.matchAll(CODE_RE)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

// ── Shared stats store (one request for every card on screen) ─────────────
type Event = { at: string; device?: string; os?: string; browser?: string; city?: string; region?: string; country?: string }
export type LinkStats = { target: string; label?: string | null; kind?: string; type?: string | null; clicks: number; lastClickedAt?: string | null; events: Event[] }

const cache = new Map<string, LinkStats | null>()
const listeners = new Set<() => void>()
let version = 0
const wanted = new Map<string, Set<string>>()   // companyId → codes on screen
let timer: any = null, poll: any = null

const emit = () => { version++; listeners.forEach(l => l()) }

async function fetchCodes(companyId: string, codes: string[]) {
  if (!codes.length) return
  try {
    const { data } = await supabase.auth.getSession()
    const t = data?.session?.access_token
    for (let i = 0; i < codes.length; i += 50) {
      const chunk = codes.slice(i, i + 50)
      const r = await fetch(`/api/links/stats?companyId=${companyId}&codes=${chunk.join(',')}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      if (!r.ok) return
      const d = await r.json()
      for (const c of chunk) cache.set(c, d.links?.[c] || null)
    }
    emit()
  } catch {}
}

function schedule() {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    for (const [cid, codes] of wanted) fetchCodes(cid, [...codes].filter(c => !cache.has(c)))
  }, 60)
  if (!poll && typeof window !== 'undefined') {
    poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      for (const [cid, codes] of wanted) fetchCodes(cid, [...codes])
    }, 30000)
  }
}

export function useLinkStats(companyId: string | null, codes: string[]) {
  const key = codes.join(',')
  useEffect(() => {
    if (!companyId || !codes.length) return
    const set = wanted.get(companyId) || new Set<string>()
    codes.forEach(c => set.add(c)); wanted.set(companyId, set)
    schedule()
    return () => { codes.forEach(c => set.delete(c)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, key])
  useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => version, () => 0)
  return codes.map(c => cache.get(c))
}

// ── What kind of link is it ───────────────────────────────────────────────
type Kind = { label: string; tone: string; bg: string; icon: React.ReactNode }
const I = (d: React.ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
const KINDS: Record<string, Kind> = {
  payment: { label: 'Payment link', tone: '#4f46e5', bg: '#eef2ff', icon: I(<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h3" /></>) },
  booking: { label: 'Booking link', tone: '#0369a1', bg: '#e0f2fe', icon: I(<><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18M8.5 14.5l2.2 2.2 4.3-4.3" /></>) },
  manage: { label: 'Manage booking', tone: '#0369a1', bg: '#e0f2fe', icon: I(<><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></>) },
  review: { label: 'Review request', tone: '#b45309', bg: '#fef3c7', icon: I(<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />) },
  product: { label: 'Product', tone: '#047857', bg: '#d1fae5', icon: I(<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>) },
  checkout: { label: 'Checkout', tone: '#047857', bg: '#d1fae5', icon: I(<><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3h3l2.4 12h11l2-8H7" /></>) },
  upload: { label: 'Upload link', tone: '#7c3aed', bg: '#ede9fe', icon: I(<><path d="M12 15V3M7 8l5-5 5 5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></>) },
  media: { label: 'Photos & files', tone: '#7c3aed', bg: '#ede9fe', icon: I(<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>) },
  form: { label: 'Form', tone: '#be185d', bg: '#fce7f3', icon: I(<><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>) },
  help: { label: 'Help article', tone: '#0f766e', bg: '#ccfbf1', icon: I(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01" /></>) },
  link: { label: 'Link', tone: '#374151', bg: '#f3f4f6', icon: I(<><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></>) },
}

function kindOf(s: LinkStats): Kind {
  const t = (s.target || '').toLowerCase()
  if (s.kind === 'review' || /google\.[a-z.]+\/.*review|g\.page|search\.google|\/r\/[0-9a-f-]{8}/.test(t)) return KINDS.review
  if (/\/booking\/[a-z0-9_-]{16,}/.test(t)) return KINDS.manage
  if (/\/book(\/|\?|$)/.test(t)) return KINDS.booking
  if (/\/pay\/|checkout\.stripe\.com|\/payment/.test(t) || s.type === 'payment') return KINDS.payment
  if (/\/u\/[a-z0-9]{8,}/.test(t)) return KINDS.upload
  if (s.kind === 'media' || s.type === 'image') return KINDS.media
  if (s.type === 'checkout') return KINDS.checkout
  if (s.type === 'product' || /\/product\//.test(t)) return KINDS.product
  if (s.type === 'form') return KINDS.form
  if (s.type === 'help') return KINDS.help
  if (s.type === 'booking') return KINDS.booking
  return KINDS.link
}

function prettyTarget(url: string) {
  try {
    const u = new URL(url)
    const path = decodeURIComponent(u.pathname).replace(/\/$/, '')
    return (u.hostname.replace(/^www\./, '') + (path.length > 1 ? path : '')).slice(0, 80)
  } catch { return url }
}

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function deviceLabel(e: Event) {
  const kind = e.device === 'mobile' ? (e.os === 'iOS' ? 'iPhone' : e.os === 'Android' ? 'Android phone' : 'Phone') : e.device === 'tablet' ? (e.os === 'iOS' ? 'iPad' : 'Tablet') : (e.os && e.os !== 'Unknown' ? `${e.os} computer` : 'Computer')
  return e.browser && e.browser !== 'Unknown' ? `${kind} · ${e.browser}` : kind
}
function placeLabel(e: Event) {
  return [e.city, e.region && e.region.length <= 4 ? e.region : null].filter(Boolean).join(', ') || (e.country === 'AU' ? 'Australia' : e.country) || ''
}
const DeviceIcon = ({ e }: { e: Event }) => e.device === 'desktop'
  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18h2" /></svg>
const PinIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>

// ── The cards ─────────────────────────────────────────────────────────────
export default function LinkCards({ companyId, text, codes: given, title }: { companyId: string | null; text?: string | null; codes?: string[]; title?: string }) {
  const codes = given || linkCodesIn(text)
  const stats = useLinkStats(companyId, codes)
  if (!codes.length) return null
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
      <style>{CSS}</style>
      {codes.map((c, i) => {
        const s = stats[i]
        if (s === null) return null                       // not one of ours
        if (s === undefined) return <div key={c} className="lc-card lc-skel" />
        return <Card key={c} s={s} title={title} />
      })}
    </div>
  )
}

function Card({ s, title }: { s: LinkStats; title?: string }) {
  const [open, setOpen] = useState(false)
  const k = kindOf(s)
  const last = s.events[0]
  const opened = s.clicks > 0
  return (
    <div className="lc-card">
      <button type="button" className="lc-head" onClick={() => setOpen(o => !o)} aria-expanded={open} disabled={!s.events.length}>
        <span className="lc-icon" style={{ background: k.bg, color: k.tone }}>{k.icon}</span>
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <span className="lc-title">{title || s.label || k.label}</span>
          <a className="lc-target" href={s.target} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{prettyTarget(s.target)}</a>
        </span>
        <span className={`lc-badge${opened ? ' on' : ''}`}>{opened ? `${s.clicks} ${s.clicks === 1 ? 'open' : 'opens'}` : 'Not opened'}</span>
      </button>
      {last && (
        <button type="button" className="lc-last" onClick={() => setOpen(o => !o)}>
          <span className="lc-meta"><DeviceIcon e={last} />{deviceLabel(last)}</span>
          {placeLabel(last) && <span className="lc-meta"><PinIcon />{placeLabel(last)}</span>}
          <span className="lc-meta lc-when">{ago(last.at)}</span>
          {s.events.length > 1 && <svg className={`lc-chev${open ? ' up' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>}
        </button>
      )}
      {open && s.events.length > 1 && (
        <div className="lc-list">
          {s.events.map((e, i) => (
            <div key={i} className="lc-row" style={{ animationDelay: `${i * 30}ms` }}>
              <span className="lc-dot" />
              <span className="lc-meta"><DeviceIcon e={e} />{deviceLabel(e)}</span>
              {placeLabel(e) && <span className="lc-meta"><PinIcon />{placeLabel(e)}</span>}
              <span className="lc-meta lc-when">{new Date(e.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          ))}
          {s.clicks > s.events.length && <div style={{ fontSize: 11.5, color: '#9ca3af', padding: '4px 0 2px 14px' }}>+ {s.clicks - s.events.length} earlier</div>}
        </div>
      )}
    </div>
  )
}

const CSS = `
.lc-card{background:#fff;border-radius:16px;color:#111;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06);animation:lcIn .35s cubic-bezier(.22,1,.36,1) backwards;min-width:240px}
.lc-skel{height:64px;background:linear-gradient(90deg,#f3f4f6 25%,#eceef1 50%,#f3f4f6 75%);background-size:400px 100%;animation:lcShim 1.2s linear infinite}
.lc-head{display:flex;align-items:center;gap:11px;width:100%;padding:12px 12px 11px;border:none;background:none;font:inherit;color:inherit;cursor:pointer;text-align:left}
.lc-head:disabled{cursor:default}
.lc-icon{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.lc-title{display:block;font-size:13.5px;font-weight:800;color:#111;line-height:1.25}
.lc-target{display:block;font-size:12px;color:#6b7280;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.lc-target:hover{color:#111;text-decoration:underline}
.lc-badge{flex-shrink:0;font-size:11.5px;font-weight:800;padding:4px 9px;border-radius:999px;background:#f3f4f6;color:#6b7280;white-space:nowrap}
.lc-badge.on{background:#dcfce7;color:#15803d}
.lc-last{display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;padding:8px 12px 10px;border:none;border-top:1px solid #f1f1f3;background:#fafafa;font:inherit;cursor:pointer;text-align:left}
.lc-meta{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;color:#4b5563}
.lc-meta svg{color:#9ca3af}
.lc-when{color:#9ca3af;font-weight:500}
.lc-chev{margin-left:auto;color:#9ca3af;transition:transform .25s cubic-bezier(.22,1,.36,1)}
.lc-chev.up{transform:rotate(180deg)}
.lc-list{padding:4px 12px 10px;background:#fafafa}
.lc-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0 6px 0;border-top:1px dashed #ececef;animation:lcIn .3s cubic-bezier(.22,1,.36,1) backwards}
.lc-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0}
@keyframes lcIn{from{opacity:0;transform:translate3d(0,4px,0)}to{opacity:1;transform:none}}
@keyframes lcShim{from{background-position:-200px 0}to{background-position:200px 0}}
@media (prefers-reduced-motion: reduce){.lc-card,.lc-row{animation:none}}
`

// One-line "opened on iPhone · Melbourne · 2h ago" for cards that draw
// themselves (e.g. the review-request card).
export function LastOpen({ s }: { s: LinkStats | null | undefined }) {
  const e = s?.events?.[0]
  if (!e) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f1f3' }}>
      <style>{CSS}</style>
      <span className="lc-meta"><DeviceIcon e={e} />{deviceLabel(e)}</span>
      {placeLabel(e) && <span className="lc-meta"><PinIcon />{placeLabel(e)}</span>}
      <span className="lc-meta lc-when">{ago(e.at)}</span>
    </div>
  )
}
