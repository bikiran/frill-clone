'use client'

// Shared bits for the Reservations screens (app/admin/reservations/*): state
// pills, the party stepper, day labels in the business's time zone and the
// styles that sit on top of AdminKit's ak-* pieces and the Jobs dialog.

import { fmtTime } from '@/components/jobs/shared'
export { api, apiRaw, Dialog, useToast, Toast, SetupNote, Icon, JB_CSS, useJobsCompany as useResCompany, fmtTime, fmtDay, dayKeyIn } from '@/components/jobs/shared'

export type ResState = 'booked' | 'due' | 'late' | 'seated' | 'completed' | 'no_show' | 'cancelled' | 'pending'
export type Reservation = {
  id: string; startsAt: string; endsAt: string; party: number; status: string; state: ResState
  name: string; phone: string; email: string; notes: string; internalNotes: string; seating: string | null; occasion: string
  seatedAt: string | null; completedAt: string | null; contactId: string | null; conversationId: string | null
  source: string; createdAt: string; cancelledAt: string | null; cancelReason: string | null; confirmedByGuest: boolean
  manageUrl: string | null; guest: { visits: number; noShows: number; lastVisit: string | null } | null
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
`
