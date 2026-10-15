'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { WhyLink } from '@/components/WhyAgent'
import { TIMELINE_FILTERS, type TimelineEvent, type TimelineGroup, type TimelineSummary } from '@/lib/customer-timeline'

// One customer's whole history — every message on every channel, orders,
// bookings, calls, payments, reviews, tasks and notes, tickets, forms, link
// clicks and AI agent actions — newest first, with an at-a-glance strip on top
// and filter chips. Fed by GET /api/contacts/timeline.
//
//   mode="inline" — sits inside a page (the customer profile, the Contacts
//                   drawer). The page supplies the surrounding card.
//   mode="drawer" — a slide-over from the right (the inbox).

type Msg = {
  id: string; conversation_id: string; sender_type: string; sender_name: string | null; is_ai?: boolean; content: string
  channel: string; created_at: string; attachment_count?: number; conversation_subject: string | null; link?: string
}
type Entry = { key: string; ms: number; m?: Msg; e?: TimelineEvent }
// error: the first page failed (nothing to show). olderError: "Show older"
// failed — what's already on screen stays.
type View = { entries: Entry[]; nextBefore: string | null; hasMore: boolean; loading: boolean; loaded: boolean; error: string; olderError: string }
const EMPTY: View = { entries: [], nextBefore: null, hasMore: false, loading: false, loaded: false, error: '', olderError: '' }
const STEP = 40   // entries revealed per "Show older"

type Props = {
  contactId: string
  contactName?: string
  mode?: 'inline' | 'drawer'
  onClose?: () => void
  compact?: boolean                     // narrow spaces (the Contacts drawer)
  showSummary?: boolean
  profileHref?: string | null           // "Full profile" link in the drawer header
  // Open a conversation in place (the inbox) instead of navigating to it.
  onOpenConversation?: (conversationId: string) => void
  // Change it to re-read the timeline (the page just added a note or task).
  refreshKey?: string | number
}

// ── Icons (24px grid, stroke) ────────────────────────────────────────────────
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const svg = (size: number, children: React.ReactNode, filled = false) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...(filled ? { fill: 'currentColor' } : P)}>{children}</svg>
)
const ICONS: Record<string, (s: number) => React.ReactNode> = {
  chat: s => svg(s, <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  sms: s => svg(s, <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>),
  email: s => svg(s, <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></>),
  bubble: s => svg(s, <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />),
  instagram: s => svg(s, <><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>),
  order: s => svg(s, <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>),
  sale: s => svg(s, <><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><path d="M7 7h.01" /></>),
  payment: s => svg(s, <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>),
  booking: s => svg(s, <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  call: s => svg(s, <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />),
  voicemail: s => svg(s, <><circle cx="5.5" cy="11.5" r="4.5" /><circle cx="18.5" cy="11.5" r="4.5" /><path d="M5.5 16h13" /></>),
  review: s => svg(s, <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />),
  task: s => svg(s, <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>),
  note: s => svg(s, <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  ticket: s => svg(s, <><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v2M13 11v2M13 17v2" /></>),
  form: s => svg(s, <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M8 11h8M8 15h5" /></>),
  link: s => svg(s, <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>),
  media: s => svg(s, <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>),
  agent: s => svg(s, <path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z" />, true),
  audit: s => svg(s, <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  clip: s => svg(s, <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />),
  play: s => svg(s, <polygon points="6 4 20 12 6 20 6 4" />, true),
  arrow: s => svg(s, <path d="M5 12h14M13 6l6 6-6 6" />),
  close: s => svg(s, <path d="M18 6 6 18M6 6l12 12" />),
}

// Channel → label, icon, accent. Accents are mid-tones that read on both the
// light and dark admin; their tint comes from color-mix, never a fixed pastel.
const CH: Record<string, { label: string; icon: string; color: string }> = {
  chat:      { label: 'Live chat', icon: 'chat',      color: '#16a34a' },
  widget:    { label: 'Live chat', icon: 'chat',      color: '#16a34a' },
  sms:       { label: 'SMS',       icon: 'sms',       color: '#d97706' },
  email:     { label: 'Email',     icon: 'email',     color: '#4f46e5' },
  facebook:  { label: 'Messenger', icon: 'bubble',    color: '#2563eb' },
  messenger: { label: 'Messenger', icon: 'bubble',    color: '#2563eb' },
  instagram: { label: 'Instagram', icon: 'instagram', color: '#db2777' },
  whatsapp:  { label: 'WhatsApp',  icon: 'bubble',    color: '#16a34a' },
  call:      { label: 'Phone',     icon: 'call',      color: '#2563eb' },
  phone:     { label: 'Phone',     icon: 'call',      color: '#2563eb' },
  note:      { label: 'Note',      icon: 'note',      color: '#ca8a04' },
  form:      { label: 'Contact form', icon: 'form',   color: '#4f46e5' },
}
const ch = (c: string) => CH[c] || { label: c ? c[0].toUpperCase() + c.slice(1) : 'Message', icon: 'chat', color: '#6b7280' }

const ACT: Record<string, { icon: string; color: string }> = {
  order:   { icon: 'order',   color: '#059669' },
  sale:    { icon: 'sale',    color: '#0d9488' },
  payment: { icon: 'payment', color: '#0891b2' },
  booking: { icon: 'booking', color: '#7c3aed' },
  call:    { icon: 'call',    color: '#2563eb' },
  review:  { icon: 'review',  color: '#d97706' },
  comment: { icon: 'bubble',  color: '#db2777' },
  task:    { icon: 'task',    color: '#ea580c' },
  note:    { icon: 'note',    color: '#ca8a04' },
  ticket:  { icon: 'ticket',  color: '#e11d48' },
  form:    { icon: 'form',    color: '#4f46e5' },
  link:    { icon: 'link',    color: '#0284c7' },
  media:   { icon: 'media',   color: '#0d9488' },
  agent:   { icon: 'agent',   color: 'var(--coral)' },
  audit:   { icon: 'audit',   color: '#6b7280' },
}
const TONE: Record<string, string> = { good: '#16a34a', warn: '#d97706', bad: '#dc2626', muted: 'var(--slate)' }
const tint = (c: string, pct = 14) => `color-mix(in srgb, ${c} ${pct}%, transparent)`

// Times are the viewer's, except a booking's, which are in its own time zone
// (`tz`) — as on the Bookings page and in what the customer was sent.
const inZone = (ms: number, o: Intl.DateTimeFormatOptions, tz?: string) => {
  try { return new Date(ms).toLocaleString('en-AU', { ...o, timeZone: tz }) } catch { return new Date(ms).toLocaleString('en-AU', o) }
}
const timeOf = (ms: number, tz?: string) => inZone(ms, { hour: 'numeric', minute: '2-digit' }, tz)
const dateTime = (iso: string, tz?: string) => inZone(Date.parse(iso), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }, tz)
const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
const dayLabel = (ms: number, now: number) => {
  if (dayKey(ms) === dayKey(now)) return 'Today'
  if (dayKey(ms) === dayKey(now - 864e5)) return 'Yesterday'
  const d = new Date(ms)
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })
}
const ago = (iso: string, now: number) => {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(mins)) return ''
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24); if (days < 31) return `${days}d ago`
  const months = Math.floor(days / 30.4); if (months < 12) return `${months} mo ago`
  const years = Math.floor(days / 365); return `${years} yr${years === 1 ? '' : 's'} ago`
}
const money = (n: number, cur: string) => { try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur || 'AUD', maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n) } catch { return `$${n.toFixed(2)}` } }
const AT_LABEL: Record<string, string> = { booking: 'For', task: 'Due', payment: 'Paid' }
const EMPTY_COPY: Record<string, string> = {
  all: 'Nothing here yet.', messages: 'No messages yet.', orders: 'No orders yet.', bookings: 'No bookings yet.', calls: 'No calls yet.',
  reviews: 'No reviews yet.', payments: 'No payments yet.', tasks: 'No tasks or notes yet.',
}

// In the stream: a day heading, a run of messages from one conversation, or
// one event.
type Block =
  | { type: 'day'; key: string; label: string }
  | { type: 'thread'; key: string; conv: string; channel: string; subject: string | null; msgs: Msg[] }
  | { type: 'event'; key: string; e: TimelineEvent; ms: number }

export default function CustomerTimeline({ contactId, contactName, mode = 'inline', onClose, compact = false, showSummary = true, profileHref, onOpenConversation, refreshKey }: Props) {
  const [filter, setFilter] = useState<'all' | TimelineGroup>('all')
  const [views, setViews] = useState<Record<string, View>>({})
  const [summary, setSummary] = useState<TimelineSummary | null>(null)
  const [groups, setGroups] = useState<string[] | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [linkedCount, setLinkedCount] = useState(0)
  const [olderConversations, setOlderConversations] = useState(false)
  const [shown, setShown] = useState(STEP)
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(0)
  // Ignore answers for a contact we've since moved away from.
  const alive = useRef(contactId)
  const filterRef = useRef<'all' | TimelineGroup>('all')   // the chip in use, for refreshes

  const load = useCallback(async (f: string, before: string | null) => {
    const forContact = contactId
    setViews(v => ({ ...v, [f]: { ...(v[f] || EMPTY), loading: true, ...(before ? { olderError: '' } : { error: '' }) } }))
    try {
      const q = new URLSearchParams({ contactId })
      if (f !== 'all') q.set('types', f)
      if (before) q.set('before', before)
      if (!before && f === 'all' && showSummary) q.set('summary', '1')
      const res = await authFetch(`/api/contacts/timeline?${q}`)
      const d = await res.json().catch(() => ({}))
      if (alive.current !== forContact) return
      if (!res.ok) throw new Error(d.error === 'Not authorized' ? 'You don’t have access to this customer’s history.' : 'Couldn’t load the history.')
      if (d.summary !== undefined) setSummary(d.summary)
      if (Array.isArray(d.groups)) setGroups(d.groups)
      if (d.companyId) setCompanyId(d.companyId)
      if (typeof d.linkedCount === 'number') setLinkedCount(d.linkedCount)
      if (typeof d.olderConversations === 'boolean') setOlderConversations(d.olderConversations)
      const fresh: Entry[] = [
        ...(d.messages || []).map((m: Msg) => ({ key: 'm-' + m.id, ms: Date.parse(m.created_at), m })),
        ...(d.activity || []).map((e: TimelineEvent) => ({ key: 'e-' + e.id, ms: Date.parse(e.date), e })),
      ].filter(x => Number.isFinite(x.ms))
      setNow(Date.now())
      setViews(v => {
        const prev = before ? (v[f]?.entries || []) : []
        const seen = new Set(prev.map(x => x.key))
        const entries = [...prev, ...fresh.filter(x => !seen.has(x.key))].sort((a, b) => b.ms - a.ms)
        return { ...v, [f]: { entries, nextBefore: d.nextBefore || null, hasMore: !!d.hasMore, loading: false, loaded: true, error: '', olderError: '' } }
      })
    } catch (e) {
      if (alive.current !== forContact) return
      // An older page failing keeps everything already loaded, and its cursor.
      setViews(v => {
        const error = (e as Error)?.message || 'Couldn’t load the history.'
        return { ...v, [f]: { ...(v[f] || EMPTY), loading: false, loaded: true, ...(before ? { olderError: error } : { error }) } }
      })
    }
  }, [contactId, showSummary])

  // A different customer starts from scratch.
  useEffect(() => {
    alive.current = contactId
    filterRef.current = 'all'
    setViews({}); setSummary(null); setGroups(null); setFilter('all'); setShown(STEP); setOpenThreads(new Set())
    load('all', null)
  }, [contactId, load])

  // Something changed on the page: re-read what's on screen (and the numbers).
  const lastRefresh = useRef(refreshKey)
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return
    lastRefresh.current = refreshKey
    const f = filterRef.current
    setViews(v => ({ [f]: { ...(v[f] || EMPTY), loaded: true } }))
    load('all', null)
    if (f !== 'all') load(f, null)
  }, [refreshKey, load])

  // Each filter reads only its own kinds, once, then stays cached.
  const pick = (f: 'all' | TimelineGroup) => {
    filterRef.current = f
    setFilter(f); setShown(STEP)
    const v = views[f]
    if (!v || (!v.loaded && !v.loading)) load(f, null)
  }

  // Esc closes the drawer.
  useEffect(() => {
    if (mode !== 'drawer' || !onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  const view = views[filter] || EMPTY
  const visible = view.entries.slice(0, shown)
  const canShowMore = shown < view.entries.length || view.hasMore
  const showOlder = () => {
    if (shown < view.entries.length) { setShown(s => s + STEP); return }
    if (view.hasMore && !view.loading) { load(filter, view.nextBefore); setShown(s => s + STEP) }
  }
  // After a failed "Show older": the same page again (more were already revealed).
  const retryOlder = () => { if (view.hasMore && !view.loading) load(filter, view.nextBefore) }

  // Build the stream: day headings, conversation runs, events.
  const blocks: Block[] = []
  let lastDay = ''
  for (const x of visible) {
    const dk = dayKey(x.ms)
    if (dk !== lastDay) { blocks.push({ type: 'day', key: 'd-' + dk, label: dayLabel(x.ms, now || x.ms) }); lastDay = dk }
    if (x.m) {
      const prev = blocks[blocks.length - 1]
      if (prev?.type === 'thread' && prev.conv === x.m.conversation_id) prev.msgs.unshift(x.m)
      else blocks.push({ type: 'thread', key: 't-' + x.m.id, conv: x.m.conversation_id, channel: x.m.channel, subject: x.m.conversation_subject, msgs: [x.m] })
    } else if (x.e) blocks.push({ type: 'event', key: x.key, e: x.e, ms: x.ms })
  }

  const chips = TIMELINE_FILTERS.filter(f => f.key === 'all' || !groups || groups.includes(f.key))

  // "Open" — an inbox conversation opens in place when the host can do that.
  const go = (href: string) => {
    const m = href.match(/^\/admin\/inbox\?conversation=([\w-]+)$/)
    if (m && onOpenConversation) return <button type="button" className="ctl-open" onClick={() => onOpenConversation(m[1])}>Open {ICONS.arrow(12)}</button>
    return <Link href={href} className="ctl-open">Open {ICONS.arrow(12)}</Link>
  }

  const tiles: { label: string; value: string; sub?: string }[] = []
  if (summary) {
    // orderCount is null when this member can't see orders: the value is then
    // payments alone, and "No orders yet" wouldn't be true.
    if (summary.lifetimeValue != null) tiles.push({ label: 'Lifetime value', value: money(summary.lifetimeValue, summary.currency), sub: summary.orderCount == null ? 'Payments only' : summary.orderCount ? `${summary.orderCount} order${summary.orderCount === 1 ? '' : 's'}` : 'No orders yet' })
    tiles.push({ label: 'First seen', value: summary.firstSeen ? new Date(summary.firstSeen).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—', sub: summary.firstSeen && now ? ago(summary.firstSeen, now) : undefined })
    tiles.push({ label: 'Last contact', value: summary.lastContact && now ? ago(summary.lastContact.at, now) : '—', sub: summary.lastContact ? ch(summary.lastContact.channel).label : undefined })
    tiles.push({ label: 'Open tasks', value: String(summary.openTasks), sub: summary.openTasks ? 'To do' : 'All clear' })
    const nb = summary.nextBooking
    if (!groups || groups.includes('bookings')) tiles.push({ label: 'Next booking', value: nb ? inZone(Date.parse(nb.at), { weekday: 'short', day: 'numeric', month: 'short' }, nb.tz) : 'None', sub: nb ? [timeOf(Date.parse(nb.at), nb.tz), nb.service].filter(Boolean).join(' · ') : undefined })
    if (summary.avgRating != null) tiles.push({ label: 'Reviews', value: `${summary.avgRating}★`, sub: `${summary.reviewCount} review${summary.reviewCount === 1 ? '' : 's'}` })
  }
  const channelLabels = Array.from(new Set((summary?.channels || []).filter(c => !['note', 'woocommerce', 'shopify', 'pos', 'prexty'].includes(c)).map(c => ch(c).label)))

  const body = (
    <div className={`ctl${compact ? ' ctl-compact' : ''}`}>
      <style>{CSS}</style>

      {/* At a glance */}
      {showSummary && (summary ? (
        <div className="ctl-glance">
          <div className="ctl-tiles">
            {tiles.map(t => (
              <div key={t.label} className="ctl-tile">
                <p className="ctl-k">{t.label}</p>
                <p className="ctl-v">{t.value}</p>
                {t.sub && <p className="ctl-s">{t.sub}</p>}
              </div>
            ))}
          </div>
          {channelLabels.length > 0 && <p className="ctl-reach">Reached on {channelLabels.join(' · ')}</p>}
        </div>
      ) : !views.all?.loaded ? <div className="ctl-tiles">{[0, 1, 2, 3].map(i => <div key={i} className="ctl-tile ctl-ghost" />)}</div> : null)}

      {/* Filters */}
      <div className="ctl-chips" role="tablist" aria-label="Show">
        {chips.map(f => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key}
            className={`ctl-chip${filter === f.key ? ' on' : ''}`} onClick={() => pick(f.key)}>{f.label}</button>
        ))}
      </div>

      {/* Stream */}
      {view.error ? (
        <div className="ctl-empty">
          <p>{view.error}</p>
          <button type="button" className="ctl-more" onClick={() => load(filter, null)}>Try again</button>
        </div>
      ) : !view.loaded ? (
        <div className="ctl-stream">{[0, 1, 2].map(i => <div key={i} className="ctl-row"><span className="ctl-ico ctl-ghost" /><div className="ctl-body"><div className="ctl-ghost" style={{ height: 12, width: '55%', borderRadius: 6 }} /><div className="ctl-ghost" style={{ height: 10, width: '80%', borderRadius: 6, marginTop: 8 }} /></div></div>)}</div>
      ) : blocks.length === 0 ? (
        <div className="ctl-empty"><p>{EMPTY_COPY[filter] || EMPTY_COPY.all}</p></div>
      ) : (
        <div className="ctl-stream">
          {blocks.map(b => {
            if (b.type === 'day') return <p key={b.key} className="ctl-day">{b.label}</p>

            if (b.type === 'thread') {
              const c = ch(b.channel)
              const open = openThreads.has(b.key)
              const hidden = open ? 0 : Math.max(0, b.msgs.length - 4)
              const msgs = b.msgs.slice(hidden)
              return (
                <div key={b.key} className="ctl-row">
                  <span className="ctl-ico" style={{ color: c.color, background: tint(c.color) }}>{ICONS[c.icon](15)}</span>
                  <div className="ctl-body">
                    <div className="ctl-top">
                      <span className="ctl-title">{c.label}{b.subject ? <span className="ctl-sub"> · {b.subject}</span> : null}</span>
                      {go(`/admin/inbox?conversation=${b.conv}`)}
                    </div>
                    {hidden > 0 && (
                      <button type="button" className="ctl-earlier" onClick={() => setOpenThreads(s => new Set(s).add(b.key))}>
                        Show {hidden} earlier message{hidden === 1 ? '' : 's'}
                      </button>
                    )}
                    <div className="ctl-msgs">
                      {msgs.map(m => {
                        if (m.sender_type === 'system') return <p key={m.id} className="ctl-sys">{m.content}</p>
                        // AI replies are saved as the business's, flagged is_ai.
                        const ai = !!m.is_ai || m.sender_type === 'ai'
                        const team = ai || m.sender_type === 'agent'
                        // A contact-form submission is every field, one per
                        // line, with what they asked for last: show it whole.
                        const whole = m.channel === 'form' && m.sender_type === 'visitor'
                        return (
                          <div key={m.id} className={`ctl-msg${team ? ' team' : ''}`}>
                            <div className={`ctl-bubble${whole ? ' ctl-whole' : ''}`}>
                              {ai && <span className="ctl-ai">{ICONS.agent(10)} AI</span>}
                              {m.content || (m.attachment_count ? '' : '…')}
                              {!!m.attachment_count && <span className="ctl-att">{ICONS.clip(11)} {m.attachment_count} attachment{m.attachment_count === 1 ? '' : 's'}</span>}
                            </div>
                            <p className="ctl-meta">{m.sender_name ? `${m.sender_name} · ` : ''}{timeOf(Date.parse(m.created_at))}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            }

            const e = b.e
            const isMissed = e.kind === 'call' && e.tone === 'bad'
            const t = e.kind === 'call' && e.status === 'Voicemail' ? { icon: 'voicemail', color: '#9333ea' } : isMissed ? { icon: 'call', color: '#dc2626' } : ACT[e.kind] || { icon: 'audit', color: '#6b7280' }
            return (
              <div key={b.key} className="ctl-row">
                <span className="ctl-ico" style={{ color: t.color, background: tint(t.color) }}>{(ICONS[t.icon] || ICONS.audit)(15)}</span>
                <div className="ctl-body">
                  <div className="ctl-top">
                    <span className="ctl-title">{e.title}</span>
                    {e.status && <span className="ctl-pill" style={{ color: TONE[e.tone || 'muted'], background: tint(e.tone && e.tone !== 'muted' ? TONE[e.tone] : '#6b7280', 13) }}>{e.status}</span>}
                    <span className="ctl-time">{timeOf(b.ms)}</span>
                  </div>
                  {e.at && <p className="ctl-at">{AT_LABEL[e.kind] || 'At'} {dateTime(e.at, e.tz)}</p>}
                  {e.detail && <p className="ctl-detail">{e.detail}</p>}
                  <div className="ctl-acts">
                    <span className="ctl-src">{e.source}</span>
                    {e.recordingUrl && <a className="ctl-open" href={e.recordingUrl} target="_blank" rel="noreferrer">{ICONS.play(10)} Recording</a>}
                    {e.runId && <WhyLink companyId={companyId} runId={e.runId} style={{ fontSize: 12 }} />}
                    {e.link && go(e.link)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view.loaded && !view.error && view.olderError ? (
        <div className="ctl-empty">
          <p>{view.olderError}</p>
          <button type="button" className="ctl-more" onClick={retryOlder} disabled={view.loading}>{view.loading ? 'Loading…' : 'Try again'}</button>
        </div>
      ) : view.loaded && !view.error && canShowMore ? (
        <button type="button" className="ctl-more" onClick={showOlder} disabled={view.loading}>
          {view.loading ? 'Loading…' : 'Show older'}
        </button>
      ) : view.loaded && !view.error && olderConversations && blocks.length > 0 && ['all', 'messages', 'tasks'].includes(filter) ? (
        <p className="ctl-reach" style={{ textAlign: 'center' }}>Messages from older conversations aren’t shown here — find them in the inbox.</p>
      ) : null}
    </div>
  )

  if (mode !== 'drawer') return body

  return (
    <div className="ctl-overlay" onClick={onClose} role="presentation">
      <style>{DRAWER_CSS}</style>
      <div className="ctl-panel" role="dialog" aria-modal="true" aria-label="Customer timeline" onClick={e => e.stopPropagation()}>
        <div className="ctl-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2>Customer timeline</h2>
            <p>{contactName || 'This customer'}{linkedCount > 1 ? ` · ${linkedCount} linked contacts` : ''}</p>
          </div>
          {profileHref && <Link href={profileHref} className="ctl-open" style={{ whiteSpace: 'nowrap' }}>Full profile {ICONS.arrow(12)}</Link>}
          {onClose && <button type="button" className="ctl-x" onClick={onClose} aria-label="Close">{ICONS.close(15)}</button>}
        </div>
        <div className="ctl-scroll">{body}</div>
      </div>
    </div>
  )
}

const CSS = `
.ctl { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ctl p { margin: 0; }
.ctl-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; }
.ctl-compact .ctl-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ctl-tile { min-width: 0; min-height: 58px; padding: 10px 12px; border-radius: 12px; background: var(--canvas); border: 1px solid var(--border); }
.ctl-k { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--slate); }
.ctl-v { margin-top: 3px !important; font-size: 16px; font-weight: 800; color: var(--ink); letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctl-s { margin-top: 1px !important; font-size: 11.5px; color: var(--slate); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ctl-reach { margin-top: 8px !important; font-size: 12px; color: var(--slate); }
.ctl-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.ctl-chips::-webkit-scrollbar { display: none; }
.ctl-chip { flex-shrink: 0; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--slate); font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.ctl-chip:hover { color: var(--ink); }
.ctl-chip.on { background: var(--ink); border-color: var(--ink); color: var(--card); }
.ctl-stream { display: flex; flex-direction: column; }
.ctl-day { margin: 10px 0 4px !important; font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--slate); }
.ctl-day:first-child { margin-top: 0 !important; }
.ctl-row { position: relative; display: flex; gap: 12px; padding: 8px 0; min-width: 0; }
.ctl-row::before { content: ''; position: absolute; left: 15px; top: 0; bottom: 0; width: 2px; background: var(--border); }
.ctl-day + .ctl-row::before { top: 14px; }
.ctl-ico { position: relative; z-index: 1; flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 3px var(--card); background: var(--card); }
.ctl-body { flex: 1; min-width: 0; padding-top: 5px; }
.ctl-top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
.ctl-title { flex: 1 1 auto; min-width: 0; font-size: 13.5px; font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
.ctl-sub { font-weight: 500; color: var(--slate); }
.ctl-pill { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.ctl-time { font-size: 11.5px; color: var(--slate); white-space: nowrap; }
.ctl-at { margin-top: 3px !important; font-size: 12.5px; font-weight: 600; color: var(--ink); }
.ctl-detail { margin-top: 3px !important; font-size: 12.5px; line-height: 1.5; color: var(--slate); overflow-wrap: anywhere; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.ctl-acts { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
.ctl-src { font-size: 10.5px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--slate); }
.ctl-open { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: none; background: none; font: inherit; font-size: 12px; font-weight: 700; color: var(--coral); text-decoration: none; cursor: pointer; }
.ctl-open:hover { text-decoration: underline; }
.ctl-earlier { margin-top: 6px; padding: 0; border: none; background: none; font-size: 12px; font-weight: 600; color: var(--slate); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.ctl-msgs { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.ctl-msg { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.ctl-msg.team { align-items: flex-end; }
.ctl-bubble { max-width: 85%; padding: 8px 12px; border-radius: 14px 14px 14px 4px; background: var(--canvas); border: 1px solid var(--border); color: var(--ink); font-size: 13px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical; overflow: hidden; }
.ctl-msg.team .ctl-bubble { border-radius: 14px 14px 4px 14px; background: var(--coral); border-color: transparent; color: #fff; }
.ctl-bubble.ctl-whole { -webkit-line-clamp: none; }
.ctl-ai { display: inline-flex; align-items: center; gap: 3px; margin-right: 6px; font-size: 10px; font-weight: 800; letter-spacing: .04em; opacity: .85; }
.ctl-att { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 11.5px; opacity: .8; }
.ctl-meta { margin: 2px 4px 0 !important; font-size: 10.5px; color: var(--slate); }
.ctl-sys { align-self: center; max-width: 90%; font-size: 11.5px; color: var(--slate); background: var(--canvas); padding: 3px 10px; border-radius: 999px; text-align: center; overflow-wrap: anywhere; }
.ctl-empty { padding: 26px 10px; text-align: center; font-size: 13px; color: var(--slate); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.ctl-more { align-self: center; padding: 8px 18px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); color: var(--ink); font-size: 12.5px; font-weight: 700; cursor: pointer; }
.ctl-more:disabled { opacity: .6; cursor: default; }
.ctl-ghost { background: linear-gradient(90deg, var(--canvas), var(--border), var(--canvas)); background-size: 200% 100%; animation: ctlShimmer 1.2s ease-in-out infinite; border-color: transparent; }
@keyframes ctlShimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }
.ctl-compact .ctl-row { gap: 10px; }
.ctl-compact .ctl-bubble { max-width: 94%; font-size: 12.5px; }
@media (max-width: 520px) { .ctl-bubble { max-width: 94%; } .ctl-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .ctl-ghost { animation: none; } }
`

const DRAWER_CSS = `
@keyframes ctlIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
.ctl-overlay { position: fixed; inset: 0; z-index: 420; display: flex; justify-content: flex-end; background: rgba(0,0,0,.4); }
.ctl-panel { width: 520px; max-width: 100vw; height: 100%; display: flex; flex-direction: column; background: var(--card); box-shadow: -12px 0 40px rgba(0,0,0,.16); animation: ctlIn .18s ease-out; }
.ctl-head { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--card); }
.ctl-head h2 { margin: 0; font-size: 17px; font-weight: 800; color: var(--ink); }
.ctl-head p { margin: 2px 0 0; font-size: 12px; color: var(--slate); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctl-x { flex-shrink: 0; width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--border); background: var(--card); color: var(--slate); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.ctl-scroll { flex: 1; overflow-y: auto; padding: 16px 20px 28px; }
@media (max-width: 520px) { .ctl-head { padding: 14px 16px; } .ctl-scroll { padding: 14px 16px 24px; } }
@media (prefers-reduced-motion: reduce) { .ctl-panel { animation: none; } }
`
