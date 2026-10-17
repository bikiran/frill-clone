'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  ALL_DAY, DAYS, DAY_LABEL, daySummary, isAllDay, readTimeFormat, saveTimeFormat, timeOptions,
  type BusinessHours, type DayHours, type TimeFormat,
} from '@/lib/week-hours'

// Weekly opening hours: a 12-hour / 24-hour switch, then one compact row per
// day (name, open switch, hours). Times are picked from 15-minute lists shown
// in the chosen format; what's stored stays 24-hour "HH:MM" (lib/week-hours).
//
// Narrow (phones, and anything under 640px wide): each row is one line
// ("Monday  [on]  10:00 am – 5:30 pm  v"); tap the hours (or switch a closed day
// on) to open that day's pickers, 24 hours and Copy to all days. Under 330px the
// day names shorten ("Mon"); under 270px (320px phones) 12-hour times do too
// ("10am – 5:30pm"), so the closing time is never cut off.
// Wide (640px+, where both pickers, the chip and the copy button fit): the
// pickers sit in the row itself. Container queries pick the layout, so it fits
// whatever card it's placed in.

const DEFAULT_TIMES = { from: '09:00', to: '17:00' }

const Chevron = () => <svg className="bhe-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
const CopyIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
const ClockIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>

function TimeSelect({ value, kind, fmt, label, onChange }: { value: string; kind: 'from' | 'to'; fmt: TimeFormat; label: string; onChange: (v: string) => void }) {
  const shown = kind === 'to' && value === '00:00' ? '24:00' : value
  return (
    <select className="bhe-time" value={shown} aria-label={label} onChange={e => onChange(e.target.value)}>
      {timeOptions(kind, fmt, value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export default function BusinessHoursEditor({ value, onChange, ariaLabel = 'Business hours' }: { value: BusinessHours; onChange: (next: BusinessHours) => void; ariaLabel?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [fmt, setFmt] = useState<TimeFormat>('12h')   // Australian default
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const lastTimes = useRef<Record<string, { from: string; to: string }>>({})
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => { const saved = readTimeFormat(); if (saved) setFmt(saved) }, [])
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])

  const choose = (f: TimeFormat) => { setFmt(f); saveTimeFormat(f) }
  const day = (d: string): DayHours => value[d] || { open: false, ...DEFAULT_TIMES }
  const patch = (d: string, p: Partial<DayHours>) => onChange({ ...value, [d]: { ...day(d), ...p } })

  const setAllDay = (d: string, on: boolean) => {
    const cur = day(d)
    if (on) {
      if (!isAllDay(cur)) lastTimes.current[d] = { from: cur.from, to: cur.to }
      patch(d, { open: true, ...ALL_DAY })
    } else {
      patch(d, { ...(lastTimes.current[d] || DEFAULT_TIMES) })
    }
  }

  const copyToAll = (d: string) => {
    const src = day(d)
    const next: BusinessHours = { ...value }
    for (const k of DAYS) next[k] = { ...day(k), open: src.open, from: src.from, to: src.to }
    onChange(next)
    setNotice(`Copied ${DAY_LABEL[d].slice(0, 3)} to all days`)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 3000)
  }

  return (
    <div className="bhe" role="group" aria-label={ariaLabel}>
      <style>{CSS}</style>
      <div className="bhe-bar">
        {/* Arrow keys move between the two, like any radio group. */}
        <div className="bhe-seg" role="radiogroup" aria-label="Time format"
          onKeyDown={e => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
            e.preventDefault()
            const next: TimeFormat = fmt === '12h' ? '24h' : '12h'
            choose(next)
            ;(e.currentTarget.querySelector(`[data-fmt="${next}"]`) as HTMLButtonElement | null)?.focus()
          }}>
          {(['12h', '24h'] as const).map(f => (
            <button key={f} type="button" role="radio" data-fmt={f} aria-checked={fmt === f} tabIndex={fmt === f ? 0 : -1} className={fmt === f ? 'on' : ''} onClick={() => choose(f)}>
              {f === '12h' ? '12-hour' : '24-hour'}
            </button>
          ))}
        </div>
        <span className="bhe-notice" role="status" aria-live="polite">{notice}</span>
      </div>

      <div className="bhe-list">
        {DAYS.map(d => {
          const h = day(d)
          const allDay = isAllDay(h)
          const open = !!h.open
          const isOpenRow = expanded === d && open
          const editId = `bhe-${uid}-${d}`
          const label = DAY_LABEL[d]
          return (
            <div key={d} className="bhe-row" data-day={d} data-state={!open ? 'closed' : allDay ? 'allday' : 'open'} data-expanded={isOpenRow ? '1' : '0'}>
              <span className="bhe-day"><span className="bhe-long">{label}</span><span className="bhe-short">{label.slice(0, 3)}</span></span>
              <button type="button" role="switch" aria-checked={open} aria-label={`Open on ${label}`} className="bhe-switch"
                onClick={() => { patch(d, { open: !open }); setExpanded(open ? (expanded === d ? null : expanded) : d) }}>
                <span className="bhe-knob" />
              </button>

              {/* Phones: the day's hours on one line; tap to change them. */}
              <button type="button" className="bhe-sum" disabled={!open} aria-expanded={open ? isOpenRow : undefined} aria-controls={open ? editId : undefined}
                aria-label={open ? `${label}: ${daySummary(h, fmt)}. Change hours` : `${label}: closed`}
                onClick={() => setExpanded(e => e === d ? null : d)}>
                <span className="bhe-sum-text"><span className="bhe-full">{daySummary(h, fmt)}</span><span className="bhe-compact">{daySummary(h, fmt, true)}</span></span>
                {open && <Chevron />}
              </button>
              {!open && <span className="bhe-closed">Closed</span>}

              {open && (
                <div className="bhe-edit" id={editId}>
                  {allDay ? (
                    <span className="bhe-24text"><ClockIcon />Open 24 hours</span>
                  ) : (
                    <span className="bhe-times">
                      <TimeSelect value={h.from} kind="from" fmt={fmt} label={`${label} opening time`} onChange={v => patch(d, { from: v })} />
                      <span className="bhe-dash" aria-hidden>–</span>
                      <TimeSelect value={h.to} kind="to" fmt={fmt} label={`${label} closing time`} onChange={v => patch(d, { to: v })} />
                    </span>
                  )}
                  <span className="bhe-actions">
                    <label className={`bhe-chip${allDay ? ' on' : ''}`}>
                      <input type="checkbox" checked={allDay} aria-label={`Open 24 hours on ${label}`} onChange={e => setAllDay(d, e.target.checked)} />
                      <span>24 hours</span>
                    </label>
                    <button type="button" className="bhe-copy" onClick={() => copyToAll(d)} aria-label={`Copy to all days: ${label}’s hours`} title="Copy to all days">
                      <CopyIcon /><span className="bhe-copy-text">Copy to all days</span>
                    </button>
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const CSS = `
.bhe{container-type:inline-size;--bhe-coral:var(--coral,#ff7a6b);--bhe-ink:#0d0d0d;--bhe-muted:#9ca3af;--bhe-line:#ececef}
.bhe-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;min-height:34px}
.bhe-seg{display:inline-flex;background:#f3f3f5;border-radius:10px;padding:3px;flex-shrink:0}
.bhe-seg button{border:none;background:transparent;color:#6b6b70;font:inherit;font-size:13px;font-weight:700;padding:6px 12px;border-radius:8px;cursor:pointer;line-height:1.2;transition:background .15s,color .15s,box-shadow .15s}
.bhe-seg button.on{background:#fff;color:var(--bhe-ink);box-shadow:0 1px 2px rgba(16,24,40,.08),0 1px 3px rgba(16,24,40,.06)}
.bhe-seg button:focus-visible,.bhe-switch:focus-visible,.bhe-sum:focus-visible,.bhe-copy:focus-visible,.bhe-time:focus-visible,.bhe-chip:focus-within{outline:2px solid var(--bhe-coral);outline-offset:2px}
.bhe-notice{font-size:12.5px;font-weight:600;color:#067647;text-align:right;min-width:0}
.bhe-list{border:1px solid var(--bhe-line);border-radius:14px;background:#fff;overflow:hidden}
.bhe-row{display:grid;grid-template-columns:84px 38px minmax(0,1fr);align-items:center;column-gap:10px;padding:0 12px;min-height:48px}
.bhe-row+.bhe-row{border-top:1px solid #f3f3f5}
.bhe-day{font-size:14px;font-weight:600;color:var(--bhe-ink);white-space:nowrap}
.bhe-short,.bhe-compact{display:none}
.bhe-switch{width:38px;height:22px;border-radius:11px;border:none;padding:0;background:#d1d5db;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
.bhe-switch[aria-checked="true"]{background:var(--bhe-coral)}
.bhe-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.18);transition:transform .2s}
.bhe-switch[aria-checked="true"] .bhe-knob{transform:translateX(16px)}
.bhe-sum{display:flex;align-items:center;justify-content:space-between;gap:6px;width:calc(100% + 16px);min-width:0;min-height:40px;margin:4px -8px;border:none;border-radius:10px;background:none;padding:0 8px;font:inherit;font-size:14px;color:var(--bhe-ink);cursor:pointer;text-align:left}
.bhe-sum:disabled{cursor:default;color:var(--bhe-muted)}
.bhe-sum-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.bhe-chev{flex-shrink:0;color:var(--bhe-muted);transition:transform .2s}
.bhe-row[data-expanded="1"] .bhe-chev{transform:rotate(180deg)}
.bhe-closed{display:none;font-size:14px;color:var(--bhe-muted)}
.bhe-edit{grid-column:1/-1;display:none;flex-direction:column;gap:10px;margin:0 0 12px;padding:12px;border-radius:12px;background:#fafafa;border:1px solid #f0f0f2;animation:bheIn .18s cubic-bezier(.22,1,.36,1) both}
.bhe-row[data-expanded="1"] .bhe-edit{display:flex}
.bhe-times{display:flex;align-items:center;gap:8px;min-width:0}
.bhe-times .bhe-time{flex:1 1 0;min-width:0}
.bhe-dash{color:var(--bhe-muted);flex-shrink:0}
.bhe-time{appearance:none;-webkit-appearance:none;font:inherit;font-size:14px;color:var(--bhe-ink);background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center;border:1px solid #e5e5e5;border-radius:10px;padding:8px 30px 8px 11px;cursor:pointer;font-variant-numeric:tabular-nums;min-height:38px}
.bhe-24text{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:var(--bhe-ink)}
.bhe-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bhe-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:999px;border:1px solid #e5e5e5;background:#fff;font-size:13px;font-weight:600;color:#4b5563;cursor:pointer;user-select:none;white-space:nowrap}
.bhe-chip input{width:15px;height:15px;margin:0;accent-color:var(--bhe-coral);cursor:pointer}
.bhe-chip.on{border-color:var(--bhe-coral);background:#fff4f1;color:var(--bhe-ink)}
.bhe-copy{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px solid #e5e5e5;background:#fff;font:inherit;font-size:13px;font-weight:600;color:#4b5563;cursor:pointer;white-space:nowrap}
.bhe-copy:hover,.bhe-chip:hover{border-color:#d4d4d8}
@keyframes bheIn{from{opacity:0;transform:translate3d(0,-3px,0)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.bhe-edit{animation:none}.bhe-switch,.bhe-knob,.bhe-chev{transition:none}}
@container (max-width:329px){
  .bhe-row{grid-template-columns:36px 38px minmax(0,1fr);column-gap:7px;padding:0 8px}
  .bhe-long{display:none}.bhe-short{display:inline}
  .bhe-sum{gap:4px}
  .bhe-edit{padding:10px}
  .bhe-times{gap:5px}
  .bhe-time{font-size:13px;padding:8px 22px 8px 8px;background-position:right 7px center}
}
@container (max-width:269px){
  .bhe-full{display:none}.bhe-compact{display:inline}
}
@container (min-width:640px){
  .bhe-row{grid-template-columns:104px 38px minmax(0,1fr);column-gap:14px;padding:0 16px;min-height:56px}
  .bhe-sum{display:none}
  .bhe-closed{display:block}
  .bhe-edit,.bhe-row[data-expanded="1"] .bhe-edit{grid-column:auto;display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:12px;margin:0;padding:8px 0;background:none;border:none;animation:none}
  .bhe-times{flex:0 1 auto;min-width:0}
  .bhe-times .bhe-time{flex:0 1 auto;width:124px;min-width:108px}
  .bhe-24text{min-height:38px}
  .bhe-actions{flex-wrap:nowrap}
  .bhe-copy{padding:7px 9px}
  .bhe-copy-text{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
}
`
