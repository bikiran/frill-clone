'use client'

// A date and time, Sellio style: a grey field that opens a calendar (quick
// picks, a month grid, a time row) instead of the browser's datetime-local
// box. The value is the same local "YYYY-MM-DDTHH:mm" string datetime-local
// uses, so it drops in where one of those was. mode="date" is a day alone
// ("YYYY-MM-DD", like <input type="date">): no time row, and picking a day
// closes it.

import { useMemo, useRef, useState } from 'react'
import Popover from '@/components/composer/Popover'

const pad = (n: number) => String(n).padStart(2, '0')
export const toLocalValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const parse = (v?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v || '')
  return m ? new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0) : null
}
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export type QuickPick = { label: string; at: () => Date }

export default function DateTimeField({ id, label, value, onChange, min, disabled, placeholder, defaultTime = '09:00', quick = [], mode = 'datetime', clearable = true }: {
  id?: string
  /** What it is, for screen readers ("Goes live", "Ends"). */
  label: string
  value: string
  onChange: (v: string) => void
  /** Nothing before this (same format as value). */
  min?: string
  disabled?: boolean
  placeholder?: string
  /** The time a newly picked day starts with, "HH:mm". */
  defaultTime?: string
  quick?: QuickPick[]
  /** 'date': a day alone, "YYYY-MM-DD". */
  mode?: 'datetime' | 'date'
  /** An × in the field and Clear in the calendar (off for a required date). */
  clearable?: boolean
}) {
  const dateOnly = mode === 'date'
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const cur = parse(value)
  const minD = parse(min)
  const [view, setView] = useState(() => { const d = cur || new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const openIt = () => { const d = parse(value) || new Date(); setView(new Date(d.getFullYear(), d.getMonth(), 1)); setOpen(true) }

  const [dh, dm] = defaultTime.split(':').map(n => Number(n) || 0)
  const h24 = cur ? cur.getHours() : dh
  const mi = cur ? cur.getMinutes() : dm
  const emit = (d: Date) => onChange(dateOnly ? dayKey(d) : toLocalValue(d))
  const pickDay = (day: Date) => { emit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h24, mi)); if (dateOnly) setOpen(false) }
  const setTime = (h: number, m: number) => {
    const base = cur || new Date()
    emit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m))
  }

  // Six weeks from the Monday on or before the 1st; a last week wholly in the
  // next month is dropped.
  const days = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1)
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7))
    const all = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    return all[35].getMonth() !== view.getMonth() ? all.slice(0, 35) : all
  }, [view])
  const todayKey = dayKey(new Date())
  const selKey = cur ? dayKey(cur) : ''
  const minKey = minD ? dayKey(minD) : ''
  const minMonth = minD ? new Date(minD.getFullYear(), minD.getMonth(), 1).getTime() : -Infinity
  const canPrev = new Date(view.getFullYear(), view.getMonth() - 1, 1).getTime() >= minMonth

  const thisYear = new Date().getFullYear()
  const shown = !cur ? ''
    : dateOnly ? cur.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', ...(cur.getFullYear() !== thisYear ? { year: 'numeric' } : {}) })
      : cur.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(cur.getFullYear() !== thisYear ? { year: 'numeric' } : {}), hour: 'numeric', minute: '2-digit' })
  const h12 = h24 % 12 || 12
  const pm = h24 >= 12
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5)
  if (!minutes.includes(mi)) { minutes.push(mi); minutes.sort((a, b) => a - b) }

  return (
    <div className={`dtf${disabled ? ' off' : ''}`}>
      <style>{DTF_CSS}</style>
      <button id={id} ref={btnRef} type="button" className="dtf-field" disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`${label}: ${shown || 'not set'}`} onClick={() => (open ? setOpen(false) : openIt())}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4.5" width="18" height="16.5" rx="3" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></svg>
        <span className={shown ? 'dtf-v' : 'dtf-ph'}>{shown || placeholder || (dateOnly ? 'Pick a date' : 'Pick a date and time')}</span>
      </button>
      {clearable && value && !disabled && (
        <button type="button" className="dtf-x" aria-label={`Clear ${label.toLowerCase()}`} title="Clear" onClick={() => onChange('')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btnRef} width={316} padding={14} radius={22} align="start" label={label}>
        {/* data-keeps-menus: a menu behind it (the bell) stays open while a day is picked. */}
        <div className="dtf-pop" data-keeps-menus="">
          {quick.length > 0 && (
            <div className="dtf-quick">
              {quick.map(q => {
                const at = q.at()
                const off = !!minD && (dateOnly ? dayKey(at) < minKey : at < minD)
                const on = !!cur && (dateOnly ? dayKey(at) : toLocalValue(at)) === value
                return <button key={q.label} type="button" className={`dtf-chip${on ? ' on' : ''}`} disabled={off} onClick={() => { emit(at); setView(new Date(at.getFullYear(), at.getMonth(), 1)); if (dateOnly) setOpen(false) }}>{q.label}</button>
              })}
            </div>
          )}
          <div className="dtf-month">
            <b>{view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
            <span>
              <button type="button" className="dtf-nav" aria-label="Previous month" disabled={!canPrev} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <button type="button" className="dtf-nav" aria-label="Next month" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
              </button>
            </span>
          </div>
          <div className="dtf-grid" role="grid" aria-label={view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
            {WEEK.map((w, i) => <span key={i} className="dtf-wd" aria-hidden>{w}</span>)}
            {days.map(d => {
              const k = dayKey(d)
              const out = d.getMonth() !== view.getMonth()
              const off = !!minKey && k < minKey
              return (
                <button key={k} type="button" disabled={off} data-autofocus={k === (selKey || todayKey) || undefined}
                  className={`dtf-day${out ? ' out' : ''}${k === todayKey ? ' today' : ''}${k === selKey ? ' on' : ''}`}
                  aria-pressed={k === selKey} aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  onClick={() => pickDay(d)}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          {!dateOnly && <div className="dtf-time">
            <span className="dtf-time-l">Time</span>
            <select className="dtf-sel" aria-label="Hour" value={h12} onChange={e => { const h = Number(e.target.value) % 12; setTime(pm ? h + 12 : h, mi) }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="dtf-colon" aria-hidden>:</span>
            <select className="dtf-sel" aria-label="Minute" value={mi} onChange={e => setTime(h24, Number(e.target.value))}>
              {minutes.map(m => <option key={m} value={m}>{pad(m)}</option>)}
            </select>
            <div className="dtf-ampm" role="group" aria-label="Morning or afternoon">
              <button type="button" aria-pressed={!pm} onClick={() => pm && setTime(h24 - 12, mi)}>am</button>
              <button type="button" aria-pressed={pm} onClick={() => !pm && setTime(h24 + 12, mi)}>pm</button>
            </div>
          </div>}
          <div className="dtf-foot">
            {clearable && value ? <button type="button" className="dtf-clear" onClick={() => { onChange(''); setOpen(false) }}>Clear</button> : <span />}
            <button type="button" className="dtf-done" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      </Popover>
    </div>
  )
}

const DTF_CSS = `
.dtf{position:relative;min-width:0;--dtf-fill:#f4f4f5;--dtf-soft:#71717a}
[data-theme="dark"] .dtf,[data-theme="dark"] .dtf-pop{--dtf-fill:#2a2a2e;--dtf-soft:#a1a1aa}
.dtf-field{display:flex;align-items:center;gap:10px;width:100%;min-width:0;height:46px;padding:0 42px 0 14px;border:none;border-radius:14px;background:var(--dtf-fill);color:var(--ink);font:inherit;font-size:14.5px;font-weight:600;text-align:left;cursor:pointer;box-sizing:border-box}
.dtf-field svg{flex-shrink:0;color:var(--dtf-soft)}
.dtf-field:hover{filter:brightness(.98)}
.dtf-field:focus-visible,.dtf-field[aria-expanded="true"]{outline:none;box-shadow:0 0 0 2px color-mix(in srgb,var(--coral,#ff7a6b) 45%,transparent)}
.dtf-field:disabled{opacity:.55;cursor:default}
.dtf-v,.dtf-ph{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dtf-ph{color:var(--dtf-soft);font-weight:500}
.dtf-x{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:transparent;color:var(--dtf-soft);cursor:pointer;padding:0}
.dtf-x:hover{background:color-mix(in srgb,var(--dtf-soft) 16%,transparent);color:var(--ink)}
/* Covers the popover's padding too, so every click inside is inside it. */
.dtf-pop{--dtf-fill:#f4f4f5;--dtf-soft:#71717a;color:var(--ink);margin:-14px;padding:14px}
.dtf-quick{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.dtf-chip{height:32px;padding:0 12px;border:none;border-radius:999px;background:var(--dtf-fill);color:var(--ink);font:inherit;font-size:13px;font-weight:650;cursor:pointer;white-space:nowrap}
.dtf-chip:hover{filter:brightness(.97)}
.dtf-chip.on{background:color-mix(in srgb,var(--coral,#ff7a6b) 14%,var(--card,#fff));color:var(--coral,#ff7a6b)}
.dtf-chip:disabled{opacity:.4;cursor:default}
.dtf-month{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.dtf-month b{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;font-weight:750;letter-spacing:-.015em}
.dtf-month span{display:flex;gap:4px}
.dtf-nav{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:var(--dtf-fill);color:var(--ink);cursor:pointer;padding:0}
.dtf-nav:disabled{opacity:.35;cursor:default}
.dtf-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;justify-items:center}
.dtf-wd{width:38px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;color:var(--dtf-soft)}
.dtf-day{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:none;color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;font-variant-numeric:tabular-nums;padding:0}
.dtf-day:hover{background:var(--dtf-fill)}
.dtf-day.out{color:color-mix(in srgb,var(--dtf-soft) 70%,transparent);font-weight:500}
.dtf-day.today{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--coral,#ff7a6b) 55%,transparent);color:var(--coral,#ff7a6b)}
.dtf-day.on{background:var(--coral,#ff7a6b);color:#fff;box-shadow:0 4px 10px -4px color-mix(in srgb,var(--coral,#ff7a6b) 70%,transparent)}
.dtf-day:disabled{opacity:.3;cursor:default;background:none}
.dtf-day:focus-visible,.dtf-chip:focus-visible,.dtf-nav:focus-visible{outline:2px solid color-mix(in srgb,var(--coral,#ff7a6b) 55%,transparent);outline-offset:1px}
.dtf-time{display:flex;align-items:center;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid color-mix(in srgb,var(--dtf-soft) 20%,transparent)}
.dtf-time-l{flex:1;font-size:13.5px;font-weight:650}
.dtf-sel{height:36px;min-width:54px;padding:0 24px 0 12px;border:none;border-radius:999px;background:var(--dtf-fill) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 9px center;color:var(--ink);font:inherit;font-size:14px;font-weight:650;cursor:pointer;-webkit-appearance:none;appearance:none;font-variant-numeric:tabular-nums}
[data-theme="dark"] .dtf-sel{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23d4d4d8' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")}
.dtf-colon{font-weight:700;color:var(--dtf-soft)}
.dtf-ampm{display:inline-flex;padding:3px;gap:2px;margin-left:4px;border-radius:999px;background:var(--dtf-fill)}
.dtf-ampm button{height:30px;padding:0 10px;border:none;border-radius:999px;background:none;color:var(--dtf-soft);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.dtf-ampm button[aria-pressed="true"]{background:var(--card,#fff);color:var(--ink);box-shadow:0 1px 3px rgba(16,24,40,.14)}
.dtf-foot{display:flex;align-items:center;justify-content:space-between;margin-top:14px}
.dtf-clear{height:36px;padding:0 6px;border:none;background:none;color:var(--dtf-soft);font:inherit;font-size:13.5px;font-weight:650;cursor:pointer}
.dtf-clear:hover{color:#dc2626}
.dtf-done{height:38px;padding:0 20px;border:none;border-radius:999px;background:var(--coral,#ff7a6b);color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12)}
`
