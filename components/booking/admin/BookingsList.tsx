'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import SlotPicker from '@/components/booking/SlotPicker'
import { api, money, card, btn, btnGhost, input, Modal, Toggle } from './shared'
import { PinIcon, CheckIcon, ChatIcon, CalendarIcon, XIcon, LinkIcon } from '@/components/booking/icons'

// The team's list of online bookings, grouped by day: filters (status, date
// range, search, sort), a roomy card per booking, and its actions — chat,
// move, cancel (+ refund), done, no-show, copy the customer's link.

const STATUS: Record<string, { label: string; bg: string; c: string; bar: string }> = {
  confirmed: { label: 'Confirmed', bg: '#ecfdf5', c: '#047857', bar: '#22c55e' },
  pending: { label: 'Awaiting payment', bg: '#fffbeb', c: '#b45309', bar: '#f59e0b' },
  cancelled: { label: 'Cancelled', bg: '#fef2f2', c: '#dc2626', bar: '#f87171' },
  completed: { label: 'Completed', bg: '#eff6ff', c: '#1d4ed8', bar: '#60a5fa' },
  no_show: { label: 'No-show', bg: '#f3f4f6', c: '#4b5563', bar: '#9ca3af' },
  expired: { label: 'Expired', bg: '#f3f4f6', c: '#6b7280', bar: '#d1d5db' },
}
const PAY: Record<string, string> = { paid: 'Paid', refunded: 'Refunded', partially_refunded: 'Part refunded', pending: 'Unpaid' }
const RANGES: [string, string][] = [['all', 'All dates'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['7d', 'Next 7 days'], ['week', 'This week'], ['month', 'This month']]
const SORTS: [string, string][] = [['start', 'Start time (earliest)'], ['start_desc', 'Start time (latest)'], ['booked', 'Recently booked']]
const SOURCE: Record<string, string> = { widget: 'Chat widget', embed: 'Website', invite: 'Personal link', link: 'Shared link' }

const PhoneIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
const MailIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2" /><path d="m3 6 9 7 9-7" /></svg>
const SearchIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
const DotsIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>

const initials = (n: string) => (n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

export default function BookingsList({ companyId, bookings, timezone, scope, setScope, reload, flash }: {
  companyId: string; bookings: any[]; timezone: string
  scope: string; setScope: (s: string) => void; reload: () => void; flash: (m: string) => void
}) {
  const [search, setSearch] = useState('')
  const [range, setRange] = useState('all')
  const [sort, setSort] = useState('start')
  const [cancelling, setCancelling] = useState<any | null>(null)
  const [moving, setMoving] = useState<any | null>(null)
  const [noShow, setNoShow] = useState<any | null>(null)

  const dayOf = (iso: string | number) => new Date(iso).toLocaleDateString('en-CA', { timeZone: timezone })
  const today = dayOf(Date.now())
  const tomorrow = dayOf(Date.now() + 86400000)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const now = Date.now()
    const wkEnd = (() => { const d = new Date(`${today}T12:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; return dayOf(d.getTime() + (6 - dow) * 86400000) })()
    let list = bookings.filter(b => {
      if (q && ![b.customer_name, b.customer_email, b.customer_phone, b.service_name, b.staff_name, b.address].some(v => String(v || '').toLowerCase().includes(q))) return false
      const d = dayOf(b.starts_at)
      if (range === 'today') return d === today
      if (range === 'tomorrow') return d === tomorrow
      if (range === '7d') return Date.parse(b.starts_at) >= now - 86400000 && Date.parse(b.starts_at) < now + 7 * 86400000
      if (range === 'week') return d >= today && d <= wkEnd
      if (range === 'month') return d.slice(0, 7) === today.slice(0, 7)
      return true
    })
    list = [...list].sort((a, b) => sort === 'booked' ? Date.parse(b.created_at) - Date.parse(a.created_at)
      : sort === 'start_desc' ? Date.parse(b.starts_at) - Date.parse(a.starts_at) : Date.parse(a.starts_at) - Date.parse(b.starts_at))
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, search, range, sort, timezone])

  const groups = useMemo(() => {
    if (sort === 'booked') return [['__booked', rows]] as [string, any[]][]
    const m = new Map<string, any[]>()
    for (const b of rows) { const k = dayOf(b.starts_at); const l = m.get(k) || []; l.push(b); m.set(k, l) }
    return [...m.entries()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, timezone])

  const act = async (b: any, action: string) => {
    try { await api('/api/bookings', { method: 'PATCH', json: { companyId, id: b.id, action } }); flash(action === 'complete' ? 'Marked completed' : action === 'no_show' ? 'Marked as no-show' : 'Updated'); reload() }
    catch (e: any) { flash(e.message) }
  }

  const dayTitle = (k: string) => k === '__booked' ? 'Most recently booked' : k === today ? 'Today' : k === tomorrow ? 'Tomorrow' : new Date(`${k}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
  const dayChip = (iso: string) => {
    const d = dayOf(iso)
    if (d === today) return ['Today', new Date(iso).toLocaleDateString('en-AU', { timeZone: timezone, day: 'numeric', month: 'short' })]
    if (d === tomorrow) return ['Tomorrow', new Date(iso).toLocaleDateString('en-AU', { timeZone: timezone, day: 'numeric', month: 'short' })]
    return [new Date(iso).toLocaleDateString('en-AU', { timeZone: timezone, weekday: 'short' }), new Date(iso).toLocaleDateString('en-AU', { timeZone: timezone, day: 'numeric', month: 'short' })]
  }

  return (
    <div>
      <style>{CSS}</style>
      <div className="bl-filters">
        <div className="bl-pills">
          {[['upcoming', 'Upcoming'], ['past', 'Past'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l]) => (
            <button key={k} onClick={() => setScope(k)} className={`bl-pill${scope === k ? ' on' : ''}`}>{l}</button>
          ))}
        </div>
        <div className="bl-right">
          <label className="bl-search"><SearchIcon /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, service…" /></label>
          <label className="bl-select"><CalendarIcon size={15} /><select value={range} onChange={e => setRange(e.target.value)} aria-label="Date range">{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
      </div>

      {!groups.length || !rows.length ? (
        <div className="bl-empty">
          <span className="bl-empty-ic"><CalendarIcon size={26} /></span>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink,#111)', marginBottom: 4 }}>{search || range !== 'all' ? 'No bookings match' : scope === 'upcoming' ? 'No upcoming bookings yet' : 'Nothing here'}</div>
          <div style={{ fontSize: 13.5, color: 'var(--slate,#6b7280)' }}>{search || range !== 'all' ? 'Try a different search or date range.' : scope === 'upcoming' ? 'Share your booking link to get started.' : ''}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 22 }}>
          {groups.map(([day, list], gi) => (
            <section key={day}>
              <div className="bl-group">
                <div><b>{dayTitle(day)}</b><span> · {list.length} booking{list.length === 1 ? '' : 's'}</span></div>
                {gi === 0 && (
                  <label className="bl-sort">Sort by
                    <select value={sort} onChange={e => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  </label>
                )}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {list.map((b, i) => <Row key={b.id} b={b} i={i} t={t} dayChip={dayChip} onAct={act} onMove={setMoving} onCancel={setCancelling} onNoShow={setNoShow} flash={flash} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {cancelling && <CancelDialog companyId={companyId} b={cancelling} onClose={() => setCancelling(null)} onDone={m => { setCancelling(null); flash(m); reload() }} />}
      {noShow && <NoShowDialog companyId={companyId} b={noShow} onClose={() => setNoShow(null)} onDone={m => { setNoShow(null); flash(m); reload() }} />}
      {moving && <MoveDialog companyId={companyId} b={moving} timezone={timezone} onClose={() => setMoving(null)} onDone={m => { setMoving(null); flash(m); reload() }} />}
    </div>
  )
}

function Row({ b, i, t, dayChip, onAct, onMove, onCancel, onNoShow, flash }: {
  b: any; i: number; t: (iso: string) => string; dayChip: (iso: string) => string[]
  onAct: (b: any, a: string) => void; onMove: (b: any) => void; onCancel: (b: any) => void; onNoShow: (b: any) => void; flash: (m: string) => void
}) {
  const st = STATUS[b.status] || STATUS.confirmed
  const past = Date.parse(b.ends_at) < Date.now()
  const live = b.status === 'confirmed' && Date.parse(b.starts_at) <= Date.now() && !past
  const [dTop, dSub] = dayChip(b.starts_at)
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off)
  }, [menu])
  const where = b.address || b.location_label
  const answers = Array.isArray(b.answers) ? b.answers.filter((a: any) => a?.value) : []
  const visits = b.visits || 0
  const cancelled = b.status === 'cancelled' || b.status === 'expired'

  return (
    <article className="bl-card" style={{ ['--bar' as any]: st.bar, animationDelay: `${Math.min(i, 8) * 35}ms` }}>
      <div className="bl-when">
        <div className="bl-day">{dTop}<span>{dSub}</span></div>
        <div className={`bl-time${cancelled ? ' x' : ''}`}>{t(b.starts_at)}</div>
        <div className="bl-end">{t(b.ends_at)}</div>
        {live && <div className="bl-now">● Now</div>}
      </div>
      <div className="bl-body">
        <div className="bl-top">
          <span className="bl-av">{initials(b.customer_name)}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="bl-name">
              {b.customer_name || 'Customer'}
              {b.contact_id && <span className={`bl-tag${visits ? ' ret' : ''}`}>{visits ? `Returning · ${visits + 1} visits` : 'New customer'}</span>}
            </div>
            <div className="bl-contact">
              {b.customer_phone && <a href={`tel:${b.customer_phone}`}><PhoneIcon />{b.customer_phone}</a>}
              {b.customer_email && <a href={`mailto:${b.customer_email}`}><MailIcon />{b.customer_email}</a>}
              {where && <span title={where}><PinIcon size={13} />{where}</span>}
            </div>
          </div>
          <div className="bl-actions">
            {b.conversation_id && <Link href={`/admin/inbox?conversation=${b.conversation_id}`} className="bl-btn"><ChatIcon size={14} /> Chat</Link>}
            {b.status === 'confirmed' && !past && <button onClick={() => onMove(b)} className="bl-btn"><CalendarIcon size={14} /> Move</button>}
            {b.status === 'confirmed' && past && <button onClick={() => onAct(b, 'complete')} className="bl-btn"><CheckIcon size={14} strokeWidth={2.6} /> Done</button>}
            {(b.status === 'confirmed' || b.status === 'pending') && !past && <button onClick={() => onCancel(b)} className="bl-btn danger">Cancel</button>}
            <div ref={ref} style={{ position: 'relative' }}>
              <button onClick={() => setMenu(m => !m)} className="bl-btn icon" aria-label="More actions"><DotsIcon /></button>
              {menu && (
                <div className="bl-menu" role="menu">
                  {b.manage_url && <button onClick={() => { navigator.clipboard?.writeText(b.manage_url).then(() => flash('Customer’s booking link copied')); setMenu(false) }}><LinkIcon size={14} /> Copy customer’s link</button>}
                  {b.status === 'confirmed' && past && <button onClick={() => { setMenu(false); onNoShow(b) }}><XIcon size={13} /> Mark no-show</button>}
                  {b.status === 'confirmed' && !past && <button onClick={() => { setMenu(false); onAct(b, 'complete') }}><CheckIcon size={14} /> Mark done</button>}
                  {(b.status === 'completed' || b.status === 'no_show') && <button onClick={() => { setMenu(false); onAct(b, 'confirm') }}>Undo {b.status === 'completed' ? 'done' : 'no-show'}</button>}
                  {(b.status === 'confirmed' || b.status === 'pending') && past && <button className="danger" onClick={() => { setMenu(false); onCancel(b) }}>Cancel booking</button>}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="bl-svc">{b.service_name}{b.staff_name ? <span> with {b.staff_name}</span> : null}</div>
        {answers.length > 0 && <div className="bl-ans">{answers.map((a: any, j: number) => <span key={j}><em>{a.label}:</em> {a.value}</span>)}</div>}
        {b.notes && <div className="bl-note">“{b.notes}”</div>}
        <div className="bl-tags">
          <span className="bl-chip" style={{ background: st.bg, color: st.c }}>{st.label}</span>
          {b.status === 'confirmed' && b.customer_confirmed_at && <span className="bl-chip" style={{ background: '#ecfdf5', color: '#047857' }} title="Replied C to the reminder"><CheckIcon size={11} strokeWidth={3} /> Customer confirmed</span>}
          {b.status === 'confirmed' && !b.customer_confirmed_at && (b.reminder_24h_at || b.reminder_2h_at) && <span className="bl-chip">Reminded</span>}
          {b.amount_due_cents > 0 && PAY[b.payment_status] && (
            <span className="bl-chip" style={{ background: b.payment_status === 'paid' ? '#eef2ff' : undefined, color: b.payment_status === 'paid' ? '#4338ca' : undefined }}>{PAY[b.payment_status]} {money(b.payment_status === 'refunded' || b.payment_status === 'partially_refunded' ? b.refunded_cents : b.amount_due_cents, b.currency)}</span>
          )}
          {b.price_cents > b.amount_due_cents && b.status !== 'cancelled' && <span className="bl-chip">{money(b.price_cents - (b.payment_status === 'paid' ? b.amount_due_cents : 0), b.currency)} due on the day</span>}
          {SOURCE[b.source] && <span className="bl-chip">{SOURCE[b.source]}</span>}
        </div>
      </div>
    </article>
  )
}

const CSS = `
.bl-filters{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.bl-pills{display:flex;gap:8px;flex-wrap:wrap}
.bl-pill{height:38px;padding:0 16px;border-radius:12px;border:1px solid transparent;background:#f3f4f6;color:#4b5563;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:background .2s,color .2s,transform .15s}
.bl-pill:hover{background:#eceef1}
.bl-pill:active{transform:scale(.97)}
.bl-pill.on{background:color-mix(in srgb,var(--coral,#ff7a6b) 13%,#fff);color:color-mix(in srgb,var(--coral,#ff7a6b) 80%,#000);border-color:color-mix(in srgb,var(--coral,#ff7a6b) 25%,#fff)}
.bl-right{display:flex;gap:10px;margin-left:auto;flex-wrap:wrap}
.bl-search,.bl-select{display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-radius:12px;border:1px solid var(--border,#e5e7eb);background:#fff;color:#9ca3af}
.bl-search input{border:none;outline:none;font:inherit;font-size:14px;width:220px;background:transparent;color:var(--ink,#111)}
.bl-select select{border:none;outline:none;font:inherit;font-size:14px;font-weight:600;background-color:transparent;color:var(--ink,#111);cursor:pointer;padding-right:22px}
.bl-search:focus-within{border-color:var(--coral,#ff7a6b);box-shadow:0 0 0 3px rgba(255,122,107,.12)}
@media(max-width:720px){.bl-right{margin-left:0;width:100%}.bl-search{flex:1}.bl-search input{width:100%}}
.bl-group{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;font-size:16px;color:var(--slate,#6b7280)}
.bl-group b{color:var(--ink,#111);font-weight:800}
.bl-sort{display:flex;align-items:center;gap:8px;font-size:13px}
.bl-sort select{height:36px;border-radius:10px;border:1px solid var(--border,#e5e7eb);background-color:#fff;font:inherit;font-size:13px;font-weight:600;color:var(--ink,#111);padding:0 28px 0 10px;cursor:pointer}
.bl-card{display:grid;grid-template-columns:150px minmax(0,1fr);background:#fff;border:1px solid var(--border,#ececec);border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.03);overflow:hidden;position:relative;animation:blIn .4s cubic-bezier(.22,1,.36,1) backwards;transition:box-shadow .25s,transform .25s cubic-bezier(.22,1,.36,1)}
.bl-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--bar)}
.bl-card:hover{box-shadow:0 12px 30px -18px rgba(0,0,0,.28)}
.bl-when{padding:18px 16px 18px 26px;border-right:1px solid #f1f1f3}
.bl-day{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;line-height:1.35}
.bl-day span{display:block}
.bl-time{font-size:22px;font-weight:800;color:var(--ink,#111);margin-top:8px;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.bl-time.x{color:#9ca3af;text-decoration:line-through}
.bl-end{font-size:14px;color:#9ca3af;margin-top:2px}
.bl-now{display:inline-block;margin-top:8px;font-size:11px;font-weight:800;color:#c2410c;background:#fff1ee;padding:2px 8px;border-radius:999px}
.bl-body{padding:16px 18px;min-width:0}
.bl-top{display:flex;gap:12px;align-items:flex-start}
.bl-av{width:42px;height:42px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14.5px;background:color-mix(in srgb,var(--coral,#ff7a6b) 12%,#fff);color:color-mix(in srgb,var(--coral,#ff7a6b) 85%,#000)}
.bl-name{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:16.5px;font-weight:800;color:var(--ink,#111)}
.bl-tag{font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:999px;background:#eef2ff;color:#4338ca}
.bl-tag.ret{background:#ecfdf5;color:#047857}
.bl-contact{display:flex;gap:16px;flex-wrap:wrap;margin-top:5px;font-size:13.5px;color:#4b5563}
.bl-contact a,.bl-contact span{display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none;min-width:0;max-width:100%}
.bl-contact a:hover{color:var(--ink,#111)}
.bl-contact svg{color:#9ca3af;flex-shrink:0}
.bl-actions{display:flex;gap:8px;align-items:center;flex-shrink:0}
.bl-btn{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:11px;border:1px solid var(--border,#e5e7eb);background:#fff;color:var(--ink,#111);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;text-decoration:none;transition:background .15s,border-color .15s,transform .15s}
.bl-btn:hover{background:#f8f8f9;border-color:#d9dbe0}
.bl-btn:active{transform:scale(.97)}
.bl-btn.danger{color:#dc2626}
.bl-btn.danger:hover{background:#fef2f2;border-color:#fecaca}
.bl-btn.icon{width:38px;padding:0;justify-content:center;border-color:transparent;color:#6b7280}
.bl-btn.icon:hover{border-color:var(--border,#e5e7eb)}
.bl-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:30;min-width:220px;background:#fff;border:1px solid var(--border,#ececec);border-radius:12px;box-shadow:0 16px 40px -14px rgba(0,0,0,.3);padding:6px;animation:blMenu .18s cubic-bezier(.22,1,.36,1) both;transform-origin:top right}
.bl-menu button{display:flex;align-items:center;gap:8px;width:100%;padding:9px 10px;border:none;background:none;border-radius:8px;text-align:left;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink,#111);cursor:pointer}
.bl-menu button:hover{background:#f5f5f6}
.bl-menu button.danger{color:#dc2626}
.bl-svc{font-size:15px;font-weight:700;color:var(--ink,#111);margin-top:14px}
.bl-svc span{font-weight:500;color:#6b7280}
.bl-ans{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13.5px;color:#4b5563;margin-top:6px}
.bl-ans em{font-style:normal;color:#9ca3af}
.bl-note{font-size:13.5px;color:#4b5563;font-style:italic;margin-top:4px}
.bl-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.bl-chip{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:700;padding:5px 11px;border-radius:999px;background:#f3f4f6;color:#4b5563;white-space:nowrap}
.bl-empty{background:#fff;border:1px solid var(--border,#ececec);border-radius:16px;text-align:center;padding:48px 20px}
.bl-empty-ic{width:54px;height:54px;border-radius:17px;background:var(--peach,#fff1ee);color:var(--coral,#ff7a6b);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px}
@keyframes blIn{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:none}}
@keyframes blMenu{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@media(max-width:860px){.bl-top{flex-wrap:wrap}.bl-actions{width:100%;order:3}}
@media(max-width:640px){
  .bl-card{grid-template-columns:1fr}
  .bl-when{display:flex;align-items:baseline;gap:10px;padding:14px 16px 10px 20px;border-right:none;border-bottom:1px solid #f1f1f3}
  .bl-day span{display:inline;margin-left:4px}
  .bl-time{margin-top:0;font-size:18px}.bl-now{margin:0}
  .bl-actions .bl-btn:not(.icon){flex:1;justify-content:center}
}
@media (prefers-reduced-motion: reduce){.bl-card,.bl-menu{animation:none}}
`

function CancelDialog({ companyId, b, onClose, onDone }: { companyId: string; b: any; onClose: () => void; onDone: (m: string) => void }) {
  const paid = b.payment_status === 'paid'
  const [refund, setRefund] = useState(paid)
  const [notify, setNotify] = useState(true)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true); setError('')
    try {
      const d = await api('/api/bookings', { method: 'PATCH', json: { companyId, id: b.id, action: 'cancel', refund, notify, reason } })
      onDone(d.refundError ? `Cancelled — refund failed: ${d.refundError}` : d.refunded ? `Cancelled and refunded ${money(d.refunded, b.currency)}` : 'Booking cancelled')
    } catch (e: any) { setError(e.message); setBusy(false) }
  }
  return (
    <Modal title="Cancel booking" onClose={onClose} width={460} footer={<>
      <button onClick={onClose} style={btnGhost}>Keep it</button>
      <button onClick={go} disabled={busy} style={{ ...btn, background: '#dc2626' }}>{busy ? 'Cancelling…' : 'Cancel booking'}</button>
    </>}>
      <div style={{ fontSize: 14, marginBottom: 14 }}><b>{b.customer_name}</b> · {b.service_name}</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {paid && (
          <label style={row}><Toggle on={refund} onChange={setRefund} /> Refund {money(b.amount_due_cents - (b.refunded_cents || 0), b.currency)} to their card</label>
        )}
        <label style={row}><Toggle on={notify} onChange={setNotify} /> Let the customer know (SMS / email)</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Reason (optional, included in the note on the conversation)" style={input} />
        {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      </div>
    </Modal>
  )
}

function NoShowDialog({ companyId, b, onClose, onDone }: { companyId: string; b: any; onClose: () => void; onDone: (m: string) => void }) {
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true); setError('')
    try { await api('/api/bookings', { method: 'PATCH', json: { companyId, id: b.id, action: 'no_show', notify } }); onDone(notify ? 'Marked as no-show — sent them a link to rebook' : 'Marked as no-show') }
    catch (e: any) { setError(e.message); setBusy(false) }
  }
  return (
    <Modal title="Mark as no-show" onClose={onClose} width={440} footer={<>
      <button onClick={onClose} style={btnGhost}>Cancel</button>
      <button onClick={go} disabled={busy} style={btn}>{busy ? 'Saving…' : 'Mark no-show'}</button>
    </>}>
      <div style={{ fontSize: 14, marginBottom: 14 }}><b>{b.customer_name}</b> · {b.service_name}</div>
      <label style={row}><Toggle on={notify} onChange={setNotify} /> Send “Sorry we missed you — pick another time?” with a booking link</label>
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 10 }}>{error}</div>}
    </Modal>
  )
}

function MoveDialog({ companyId, b, timezone, onClose, onDone }: { companyId: string; b: any; timezone: string; onClose: () => void; onDone: (m: string) => void }) {
  const [slot, setSlot] = useState<string | null>(null)
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fetchSlots = useCallback((from: string, to: string) => api(`/api/bookings?companyId=${companyId}&op=slots&id=${b.id}&from=${from}&to=${to}`), [companyId, b.id])
  const go = async () => {
    if (!slot) return
    setBusy(true); setError('')
    try { await api('/api/bookings', { method: 'PATCH', json: { companyId, id: b.id, action: 'reschedule', startsAt: slot, notify } }); onDone('Booking moved') }
    catch (e: any) { setError(e.message); setBusy(false) }
  }
  return (
    <Modal title={`Move ${b.customer_name || 'booking'}`} onClose={onClose} width={720} footer={<>
      <label style={{ ...row, marginRight: 'auto' }}><Toggle on={notify} onChange={setNotify} /> Tell the customer</label>
      <button onClick={onClose} style={btnGhost}>Cancel</button>
      <button onClick={go} disabled={!slot || busy} style={btn}>{busy ? 'Moving…' : 'Move booking'}</button>
    </>}>
      <SlotPicker businessTz={timezone} fetchSlots={fetchSlots} selected={slot} onSelect={setSlot} accent="#ff7a6b" />
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 10 }}>{error}</div>}
    </Modal>
  )
}

const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: 'pointer' }
