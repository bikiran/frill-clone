'use client'

// Shared bits for the Reservations screens (app/admin/reservations/*): state
// pills, the party stepper, day labels in the business's time zone and the
// styles that sit on top of AdminKit's ak-* pieces and the Jobs dialog.

import { useEffect, useRef, useState } from 'react'
import { fmtTime, apiRaw as _apiRaw } from '@/components/jobs/shared'
export { api, apiRaw, Dialog, useToast, Toast, SetupNote, Icon, JB_CSS, useJobsCompany as useResCompany, fmtTime, fmtDay, dayKeyIn } from '@/components/jobs/shared'

export type ResState = 'booked' | 'due' | 'late' | 'seated' | 'completed' | 'no_show' | 'cancelled' | 'pending'
export type Reservation = {
  id: string; startsAt: string; endsAt: string; party: number; status: string; state: ResState
  name: string; phone: string; email: string; notes: string; internalNotes: string; seating: string | null; occasion: string
  seatedAt: string | null; completedAt: string | null; contactId: string | null; conversationId: string | null
  source: string; createdAt: string; cancelledAt: string | null; cancelReason: string | null; confirmedByGuest: boolean
  manageUrl: string | null; guest: { visits: number; noShows: number; lastVisit: string | null } | null
  /** Phase 2: the table(s) it has, and a deposit (cents, 'pending' | 'paid' | 'refunded'…). */
  tables?: { id: string; label: string }[]
  deposit?: { cents: number; status: string } | null
}

export const money = (cents: number) => `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`
/** "T4", "T4 + T5": short table names for chips. A label that's a number gets a T. */
export const tableName = (label: string) => (/^\d+[a-z]?$/i.test(label) ? `T${label}` : label)
export const tablesText = (t?: { label: string }[] | null) => (t || []).map(x => tableName(x.label)).join(' + ')

export function TableChip({ tables, missing }: { tables?: { id: string; label: string }[]; missing?: boolean }) {
  if (tables && tables.length) return <span className="rs-tbl" title={`Table ${tables.map(t => t.label).join(' + ')}`}>{tablesText(tables)}</span>
  if (missing) return <span className="rs-tbl none" title="No table yet">No table</span>
  return null
}

type Choice = { id: string; label: string; area_id: string | null; min_party: number; max_party: number; free: boolean; fits: boolean; unavailable: boolean }

/**
 * Pick the table(s) for a party at a time: "Colvy chooses" (null: the
 * smallest free table that fits, as online), or particular tables — several
 * pushed together if needed. Taken tables are shown but can't be picked.
 */
export function TablePicker({ companyId, at, party, excludeId, value, onChange, allowNone, currentIds }: {
  companyId: string; at: string | null; party: number; excludeId?: string | null
  value: string[] | null; onChange: (v: string[] | null) => void; allowNone?: boolean; currentIds?: string[]
}) {
  const [list, setList] = useState<Choice[] | null>(null)
  const [suggested, setSuggested] = useState<string[] | null>(null)
  const [setup, setSetup] = useState(false)
  const seq = useRef(0)
  useEffect(() => {
    if (!at) { setList([]); return }
    const mine = ++seq.current
    setList(null)
    const t = setTimeout(async () => {
      const r = await _apiRaw(`/api/reservations?companyId=${companyId}&op=tables&at=${encodeURIComponent(at)}&party=${party}${excludeId ? `&exclude=${excludeId}` : ''}`)
      if (mine !== seq.current) return
      if (!r.ok) { setList([]); return }
      setSetup(!!r.data.setup); setList(r.data.tables || []); setSuggested(r.data.suggested || null)
    }, 150)
    return () => clearTimeout(t)
  }, [companyId, at, party, excludeId])
  if (setup) return null
  if (list === null) return <div className="rs-tpick" aria-busy="true"><span className="rs-tsk" /><span className="rs-tsk" /><span className="rs-tsk" /></div>
  if (!list.length) return <p className="ak-hint" style={{ margin: 0 }}>{at ? 'No tables on your floor plan yet.' : 'Pick a time to see the tables.'}</p>
  const byId = new Map(list.map(t => [t.id, t]))
  const sugText = suggested ? suggested.map(id => tableName(byId.get(id)?.label || '')).join(' + ') : ''
  const toggle = (id: string) => {
    const cur = value || []
    onChange(cur.includes(id) ? (cur.length > 1 ? cur.filter(x => x !== id) : null) : [...cur, id])
  }
  const seats = (value || []).reduce((n, id) => n + (byId.get(id)?.max_party || 0), 0)
  return (
    <div className="rs-tpick-w">
      <div className="rs-tpick" role="group" aria-label="Table">
        <button type="button" className={`rs-tp auto${value === null ? ' on' : ''}`} onClick={() => onChange(null)} aria-pressed={value === null}>
          <b>Colvy chooses</b><small>{sugText ? `Best fit: ${sugText}` : 'No table free that fits'}</small>
        </button>
        {allowNone && (
          <button type="button" className={`rs-tp${value && !value.length ? ' on' : ''}`} onClick={() => onChange([])} aria-pressed={!!value && !value.length}>
            <b>No table</b><small>Sort it later</small>
          </button>
        )}
        {list.map(t => {
          const on = !!value?.includes(t.id)
          const mine = !!currentIds?.includes(t.id)
          const off = !t.free && !mine
          return (
            <button key={t.id} type="button" className={`rs-tp${on ? ' on' : ''}${off ? ' taken' : ''}${!t.fits ? ' nofit' : ''}`} disabled={off} onClick={() => toggle(t.id)} aria-pressed={on}
              title={off ? (t.unavailable ? 'Out of action' : 'Taken then') : `${t.min_party}–${t.max_party} guests`}>
              <b>{tableName(t.label)}</b><small>{off ? (t.unavailable ? 'Out' : 'Taken') : `${t.min_party === t.max_party ? t.max_party : `${t.min_party}–${t.max_party}`} seats`}</small>
            </button>
          )
        })}
      </div>
      {value && value.length > 0 && seats < party && <p className="ak-hint" style={{ margin: '6px 0 0', color: '#b45309' }}>Those tables seat {seats}, for a party of {party}. Add another table, or squeeze in.</p>}
      {value && value.length > 1 && seats >= party && <p className="ak-hint" style={{ margin: '6px 0 0' }}>Pushed together: {value.map(id => tableName(byId.get(id)?.label || '')).join(' + ')}.</p>}
    </div>
  )
}

export const STATE_LABEL: Record<ResState, string> = {
  booked: 'Booked', due: 'Arriving soon', late: 'Late', seated: 'Seated', completed: 'Finished', no_show: 'No-show', cancelled: 'Cancelled', pending: 'Holding',
}
const STATE_TONE: Record<ResState, string> = {
  booked: 'blue', due: 'amber', late: 'red', seated: 'green', completed: '', no_show: 'red', cancelled: '', pending: 'amber',
}
export function StateTag({ state }: { state: ResState }) {
  return <span className={`ak-tag ${STATE_TONE[state] || ''}`}>{STATE_LABEL[state] || state}</span>
}

export const SEATING: Record<string, string> = { indoor: 'Inside', outdoor: 'Outside', bar: 'At the bar' }
export const SOURCE: Record<string, string> = { page: 'Online', phone: 'Phone', manual: 'Team', walk_in: 'Walk-in', sms: 'Text', integration: 'Integration' }

// ── Plain dates ("2026-11-14") ──────────────────────────────────────────────
export const addDays = (ymd: string, n: number) => {
  const t = new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000)
  return t.toISOString().slice(0, 10)
}
export const dayLabel = (ymd: string, today: string, long = false) => {
  if (ymd === today) return 'Today'
  if (ymd === addDays(today, 1)) return 'Tomorrow'
  if (ymd === addDays(today, -1)) return 'Yesterday'
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'short', timeZone: 'UTC' }).replace(',', '')
}
export const dayShort = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' })
export const dayNum = (ymd: string) => Number(ymd.slice(8, 10))
export const timeOf = (iso: string, tz: string) => fmtTime(iso, tz)
export const covers = (n: number) => `${n} ${n === 1 ? 'guest' : 'guests'}`

export function PartyStepper({ value, onChange, min = 1, max = 500, id }: { value: number; onChange: (n: number) => void; min?: number; max?: number; id?: string }) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, Math.round(n) || min)))
  return (
    <div className="rs-step" role="group" aria-label="Party size">
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label="One fewer">−</button>
      <input id={id} inputMode="numeric" value={value} onChange={e => set(Number(e.target.value.replace(/\D/g, '')))} aria-label="Guests" />
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label="One more">+</button>
    </div>
  )
}

const pad2 = (n: number) => String(n).padStart(2, '0')
/** "20:40" → "8:40pm" (the way times read across Colvy). */
export const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${pad2(m)}${h < 12 ? 'am' : 'pm'}`
}

/**
 * A time that isn't on the seating grid: a pill that opens a small card with
 * the hours, the minutes (every 5) and am / pm as big tap targets. `value` and
 * `suggest` are "HH:MM" (24-hour); `suggest` is where the card starts when
 * nothing's chosen yet (the time picked on the grid, say).
 */
export function TimePick({ value, onChange, suggest, label = 'Another time' }: { value: string; onChange: (v: string) => void; suggest?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const base = /^\d{2}:\d{2}$/.test(value) ? value : /^\d{2}:\d{2}$/.test(suggest || '') ? suggest! : '19:00'
  const [h24, mi] = base.split(':').map(Number)
  const pm = h24 >= 12, h12 = h24 % 12 || 12
  const set = (h: number, m: number, isPm: boolean) => onChange(`${pad2((h % 12) + (isPm ? 12 : 0))}:${pad2(m)}`)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', out); document.addEventListener('touchstart', out); document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('touchstart', out); document.removeEventListener('keydown', esc, true) }
  }, [open])
  const mins = Array.from({ length: 12 }, (_, i) => i * 5)
  return (
    <div className="rs-tpk" ref={box}>
      <button type="button" className={`rs-tpk-btn${value ? ' on' : ''}${open ? ' open' : ''}`} onClick={() => { if (!value) set(h12, mi - (mi % 5), pm); setOpen(o => !o) }} aria-expanded={open} aria-haspopup="dialog">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        <span>{value ? time12(value) : label}</span>
      </button>
      {value && <button type="button" className="rs-tpk-x" onClick={() => { onChange(''); setOpen(false) }} aria-label="Clear the time">×</button>}
      {open && (
        <div className="rs-tpk-card" role="dialog" aria-label="Pick a time">
          <div className="rs-tpk-top">
            <b>{value ? time12(value) : time12(base)}</b>
            <div className="rs-tpk-ap" role="group" aria-label="Morning or afternoon">
              <button type="button" className={!pm ? 'on' : ''} onClick={() => set(h12, mi, false)} aria-pressed={!pm}>am</button>
              <button type="button" className={pm ? 'on' : ''} onClick={() => set(h12, mi, true)} aria-pressed={pm}>pm</button>
            </div>
          </div>
          <span className="rs-tpk-h">Hour</span>
          <div className="rs-tpk-grid" role="group" aria-label="Hour">
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
              <button key={h} type="button" className={h === h12 ? 'on' : ''} onClick={() => set(h, mi, pm)} aria-pressed={h === h12}>{h}</button>
            ))}
          </div>
          <span className="rs-tpk-h">Minutes</span>
          <div className="rs-tpk-grid" role="group" aria-label="Minutes">
            {mins.map(m => (
              <button key={m} type="button" className={m === mi ? 'on' : ''} onClick={() => set(h12, m, pm)} aria-pressed={m === mi}>:{pad2(m)}</button>
            ))}
          </div>
          <div className="rs-tpk-foot">
            <button type="button" className="ak-btn sm ghost" onClick={() => { onChange(''); setOpen(false) }}>Clear</button>
            <button type="button" className="ak-btn sm dark" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

const OCC_ICON: Record<string, React.ReactNode> = {
  Birthday: <path d="M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M5 16c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 5 0M12 12V8M12 5.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5Z" />,
  Anniversary: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  'Date night': <path d="M8 3h8l-1 7a3 3 0 0 1-6 0L8 3ZM12 13v7M8.5 21h7" />,
  Business: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" /></>,
  Celebration: <path d="M4 20 9 7l8 8L4 20ZM14 4l1 2M19 3l-2 3M20 9l-3 1M12 2v2" />,
}
export const OCCASIONS = Object.keys(OCC_ICON)

/** The occasion as chips (tap again to clear), with "Something else" for anything not on the list. */
export function OccasionPick({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const listed = OCCASIONS.includes(value)
  const [other, setOther] = useState(!!value && !listed)
  const field = useRef<HTMLInputElement>(null)
  return (
    <div className="rs-occ">
      <div className="rs-chips" role="group" aria-label="Occasion">
        {OCCASIONS.map(o => (
          <button key={o} type="button" className={`rs-chip rs-occ-chip${value === o ? ' on' : ''}`} aria-pressed={value === o}
            onClick={() => { setOther(false); onChange(value === o ? '' : o) }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{OCC_ICON[o]}</svg>{o}
          </button>
        ))}
        <button type="button" className={`rs-chip rs-occ-chip${other ? ' on' : ''}`} aria-pressed={other}
          onClick={() => { if (other) { setOther(false); onChange('') } else { setOther(true); if (listed) onChange(''); setTimeout(() => field.current?.focus(), 0) } }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>Something else
        </button>
      </div>
      {other && <input ref={field} id={id} className="ak-field" value={listed ? '' : value} onChange={e => onChange(e.target.value)} maxLength={80} placeholder="What’s the occasion? A farewell, a christening…" aria-label="Occasion" />}
    </div>
  )
}

export const PeopleIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2A6.5 6.5 0 0 1 21.5 20" /></svg>
)

export const RS_CSS = `
.rs-step{display:inline-flex;align-items:center;height:44px;border-radius:14px;background:var(--f);overflow:hidden}
.rs-step button{width:44px;height:44px;border:none;background:none;font:inherit;font-size:20px;font-weight:600;color:var(--ink);cursor:pointer}
.rs-step button:disabled{opacity:.3;cursor:default}
.rs-step button:not(:disabled):hover{background:var(--f2)}
.rs-step input{width:48px;height:44px;border:none;background:none;outline:none;font:inherit;font-size:16px;font-weight:700;text-align:center;color:var(--ink);font-variant-numeric:tabular-nums}
.rs-chips{display:flex;flex-wrap:wrap;gap:6px}
.rs-chip{height:36px;padding:0 14px;border:none;border-radius:999px;background:var(--f);font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;transition:background .15s,box-shadow .15s}
.rs-chip:hover{background:var(--f2)}
.rs-chip.on{background:var(--ink);color:var(--card,#fff)}
.rs-occ{display:flex;flex-direction:column;gap:8px}
.rs-opt{margin-left:4px;font-size:12px;font-weight:500;color:var(--soft)}
.rs-occ-chip{display:inline-flex;align-items:center;gap:7px}
.rs-occ-chip svg{opacity:.75}
.rs-occ-chip.on svg{opacity:1}
.rs-other{position:relative;display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap}
@media(max-width:520px){.rs-other .rs-tpk{position:static}.rs-other .rs-tpk-card{left:0;right:0;width:auto}}
.rs-other>.ak-hint{margin:0}
.rs-tpk{position:relative;display:inline-flex;align-items:center;gap:4px}
.rs-tpk-btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px 0 13px;border:none;border-radius:999px;background:var(--f);font:inherit;font-size:14px;font-weight:650;color:var(--ink);cursor:pointer;transition:background .15s,box-shadow .15s}
.rs-tpk-btn svg{color:var(--soft)}
.rs-tpk-btn:hover,.rs-tpk-btn.open{background:var(--f2)}
.rs-tpk-btn.on{background:var(--ink);color:var(--card,#fff);font-variant-numeric:tabular-nums}
.rs-tpk-btn.on svg{color:color-mix(in srgb,var(--card,#fff) 75%,transparent)}
.rs-tpk-x{width:30px;height:30px;border:none;border-radius:50%;background:none;font-size:20px;line-height:1;color:var(--soft);cursor:pointer}
.rs-tpk-x:hover{background:var(--f);color:var(--ink)}
.rs-tpk-card{position:absolute;left:0;top:calc(100% + 8px);z-index:8;width:min(318px,calc(100vw - 48px));padding:14px;border-radius:20px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 18px 44px rgba(0,0,0,.18);animation:rsTpk .16s cubic-bezier(.22,1,.36,1)}
@keyframes rsTpk{from{opacity:0;transform:translateY(-4px) scale(.98)}}
.rs-tpk-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px}
.rs-tpk-top b{font-size:24px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.rs-tpk-ap{display:inline-flex;padding:3px;border-radius:999px;background:var(--f)}
.rs-tpk-ap button{height:30px;padding:0 13px;border:none;border-radius:999px;background:none;font:inherit;font-size:13px;font-weight:700;color:var(--mut);cursor:pointer}
.rs-tpk-ap button.on{background:var(--card,#fff);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.rs-tpk-h{display:block;margin:4px 0 6px;font-size:11.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--soft)}
.rs-tpk-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-bottom:6px}
.rs-tpk-grid button{height:38px;border:none;border-radius:12px;background:var(--f);font:inherit;font-size:14px;font-weight:650;color:var(--ink);cursor:pointer;font-variant-numeric:tabular-nums;transition:background .12s,transform .1s}
.rs-tpk-grid button:hover{background:var(--f2)}
.rs-tpk-grid button:active{transform:scale(.95)}
.rs-tpk-grid button.on,.rs-tpk-grid button.on:hover{background:var(--ink);color:var(--card,#fff)}
.rs-tpk-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
.rs-slots{display:flex;flex-direction:column;gap:12px}
.rs-slots h4{margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--soft)}
.rs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px}
.rs-slot{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;height:48px;border:none;border-radius:14px;background:var(--f);font:inherit;color:var(--ink);cursor:pointer;transition:background .15s,box-shadow .15s,transform .12s}
.rs-slot b{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.rs-slot small{font-size:11px;color:var(--soft);font-weight:600}
.rs-slot:hover{background:var(--f2)}
.rs-slot:active{transform:scale(.97)}
.rs-slot.off{background:transparent;box-shadow:inset 0 0 0 1.5px var(--f2);color:var(--soft)}
.rs-slot.off b{text-decoration:line-through;text-decoration-thickness:1.5px;text-decoration-color:color-mix(in srgb,var(--soft) 60%,transparent)}
.rs-slot.on{background:var(--ink);color:var(--card,#fff)}
.rs-slot.on small{color:color-mix(in srgb,var(--card,#fff) 70%,transparent)}
.rs-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media(max-width:520px){.rs-two{grid-template-columns:minmax(0,1fr)}}
.rs-hits{position:absolute;left:0;right:0;top:48px;z-index:5;padding:6px;border-radius:16px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 16px 40px rgba(0,0,0,.16)}
.rs-hits button,.rs-picked{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;padding:9px 11px;border:none;border-radius:11px;background:none;font:inherit;text-align:left;cursor:pointer;color:var(--ink)}
.rs-hits button:hover{background:var(--f)}
.rs-hits b,.rs-picked b{font-size:14px;font-weight:650}
.rs-hits span,.rs-picked span{font-size:12.5px;color:var(--mut)}
.rs-picked{flex-direction:row;align-items:center;justify-content:space-between;gap:10px;background:var(--f);border-radius:14px;cursor:default}
.rs-picked>div{display:flex;flex-direction:column;gap:1px;min-width:0}
.rs-check{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.45;cursor:pointer}
.rs-check input{width:18px;height:18px;margin:1px 0 0;accent-color:var(--ink);flex-shrink:0}
.rs-warn{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:color-mix(in srgb,#f59e0b 13%,var(--card,#fff));color:color-mix(in srgb,#b45309 85%,var(--ink));font-size:13.5px;line-height:1.5}
.rs-warn svg{flex-shrink:0;margin-top:1px}
.rs-nav{display:flex;align-items:center;gap:6px}
.rs-nav .ak-icon-btn{font-size:20px;line-height:1}
.rs-date{position:relative;display:inline-flex;align-items:center;height:40px;padding:0 16px;border-radius:999px;background:var(--f);cursor:pointer}
.rs-date b{font-size:14.5px;font-weight:650;white-space:nowrap}
.rs-date input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
.rs-count{font-size:12.5px;font-weight:600;color:var(--mut);white-space:nowrap}
.rs-tbl{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:7px;background:color-mix(in srgb,#e26d3d 14%,var(--card,#fff));color:color-mix(in srgb,#c2410c 88%,var(--ink));font-size:12px;font-weight:750;letter-spacing:.01em;font-variant-numeric:tabular-nums;white-space:nowrap}
.rs-tbl.none{background:transparent;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,#f59e0b 55%,transparent);color:color-mix(in srgb,#b45309 85%,var(--ink))}
.rs-tpick{display:flex;flex-wrap:wrap;gap:6px}
.rs-tp{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:64px;height:50px;padding:0 12px;border:none;border-radius:14px;background:var(--f);font:inherit;color:var(--ink);cursor:pointer;transition:background .15s,transform .12s}
.rs-tp b{font-size:14px;font-weight:750;font-variant-numeric:tabular-nums}
.rs-tp small{font-size:11px;font-weight:600;color:var(--soft);white-space:nowrap}
.rs-tp.auto{align-items:flex-start;min-width:150px}
.rs-tp:hover:not(:disabled){background:var(--f2)}
.rs-tp:active:not(:disabled){transform:scale(.97)}
.rs-tp.on,.rs-tp.on:hover:not(:disabled){background:var(--ink);color:var(--card,#fff)}
.rs-tp.on small{color:color-mix(in srgb,var(--card,#fff) 70%,transparent)}
.rs-tp.nofit:not(.on) b{color:var(--mut)}
.rs-tp.taken{background:transparent;box-shadow:inset 0 0 0 1.5px var(--f2);color:var(--soft);cursor:default}
.rs-tp.taken b{text-decoration:line-through;text-decoration-thickness:1.5px}
.rs-tsk{width:70px;height:50px;border-radius:14px;background:linear-gradient(90deg,var(--f) 25%,var(--f2) 50%,var(--f) 75%);background-size:200% 100%;animation:rsSk 1.2s linear infinite}
@keyframes rsSk{to{background-position:-200% 0}}
`
