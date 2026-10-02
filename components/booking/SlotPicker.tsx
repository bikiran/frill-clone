'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// Month calendar + time list for picking a booking slot. Used by the public
// booking page, the customer's reschedule screen and the team's reschedule
// dialog. Times can be shown in the visitor's own timezone or the business's.

export type SlotsResponse = { timezone: string; slots: { start: string; seatsLeft?: number }[] }

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
function dateIn(ms: number, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
  return p.slice(0, 10)
}
function hourIn(ms: number, tz: string) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)))
}
function timeLabel(ms: number, tz: string) {
  return new Date(ms).toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
}
function tzShort(tz: string) {
  try { return new Intl.DateTimeFormat('en-AU', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || tz } catch { return tz }
}
const viewerTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' } }

export default function SlotPicker({ accent = '#ff7a6b', businessTz, fetchSlots, selected, onSelect, reloadKey, compact }: {
  accent?: string
  businessTz: string
  fetchSlots: (from: string, to: string) => Promise<SlotsResponse>
  selected: string | null
  onSelect: (iso: string) => void
  reloadKey?: any
  compact?: boolean
}) {
  const mine = useMemo(viewerTz, [])
  const [tz, setTz] = useState<string>(mine)
  const today = useMemo(() => dateIn(Date.now(), mine), [mine])
  const [month, setMonth] = useState(() => today.slice(0, 7))   // 'YYYY-MM'
  const [slots, setSlots] = useState<{ start: string; seatsLeft?: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [day, setDay] = useState<string | null>(null)
  const autoJumps = useRef(0)

  useEffect(() => { autoJumps.current = 0 }, [reloadKey])

  // Load the visible month (padded a day each side for timezone spill).
  useEffect(() => {
    let live = true
    const [y, m] = month.split('-').map(Number)
    const first = new Date(Date.UTC(y, m - 1, 1))
    const last = new Date(Date.UTC(y, m, 0))
    const from = ymd(new Date(first.getTime() - 86400000))
    const to = ymd(new Date(last.getTime() + 86400000))
    setLoading(true); setError('')
    fetchSlots(from < today ? today : from, to)
      .then(r => {
        if (!live) return
        const list = r.slots || []
        setSlots(list)
        const inMonth = list.filter(s => dateIn(Date.parse(s.start), tz).startsWith(month))
        // Nothing this month on first load → look ahead a few months.
        if (!inMonth.length && autoJumps.current < 3 && month >= today.slice(0, 7)) {
          autoJumps.current++
          setMonth(ymd(new Date(Date.UTC(y, m, 1))).slice(0, 7))
          return
        }
        autoJumps.current = 3
        setDay(d => {
          if (d && inMonth.some(s => dateIn(Date.parse(s.start), tz) === d)) return d
          if (selected) { const sd = dateIn(Date.parse(selected), tz); if (sd.startsWith(month)) return sd }
          return inMonth.length ? dateIn(Date.parse(inMonth[0].start), tz) : null
        })
      })
      .catch(e => { if (live) setError(e?.message || 'Couldn’t load times') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, reloadKey])

  const byDay = useMemo(() => {
    const m = new Map<string, { start: string; seatsLeft?: number }[]>()
    for (const s of slots) {
      const d = dateIn(Date.parse(s.start), tz)
      const l = m.get(d) || []; l.push(s); m.set(d, l)
    }
    return m
  }, [slots, tz])

  const [y, mo] = month.split('-').map(Number)
  const firstDow = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7  // Monday-first
  const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const cells: (string | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${pad(i + 1)}`)]
  const monthLabel = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const canPrev = month > today.slice(0, 7)
  const shift = (n: number) => { autoJumps.current = 3; setDay(null); setMonth(ymd(new Date(Date.UTC(y, mo - 1 + n, 1))).slice(0, 7)) }

  const daySlots = day ? (byDay.get(day) || []) : []
  const groups: [string, typeof daySlots][] = [
    ['Morning', daySlots.filter(s => hourIn(Date.parse(s.start), tz) < 12)],
    ['Afternoon', daySlots.filter(s => { const h = hourIn(Date.parse(s.start), tz); return h >= 12 && h < 17 })],
    ['Evening', daySlots.filter(s => hourIn(Date.parse(s.start), tz) >= 17)],
  ]
  const dayLabel = day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : ''

  return (
    <div className={`bk-picker${compact ? ' bk-compact' : ''}`} style={{ ['--bk-accent' as any]: accent }}>
      <style>{`
        .bk-picker{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:22px}
        @media(max-width:720px){.bk-picker{grid-template-columns:1fr}}
        .bk-compact.bk-picker{grid-template-columns:1fr}
        .bk-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
        .bk-day{aspect-ratio:1;max-height:46px;border-radius:999px;border:none;background:transparent;font-size:14px;font-weight:500;color:#9ca3af;cursor:default;display:flex;align-items:center;justify-content:center;position:relative;font-family:inherit}
        .bk-day.on{background:color-mix(in srgb,var(--bk-accent) 12%,#fff);color:color-mix(in srgb,var(--bk-accent) 75%,#000);font-weight:700;cursor:pointer}
        .bk-day.on:hover{background:color-mix(in srgb,var(--bk-accent) 22%,#fff)}
        .bk-day.sel{background:var(--bk-accent)!important;color:#fff!important}
        .bk-day.today::after{content:'';position:absolute;bottom:5px;width:4px;height:4px;border-radius:50%;background:currentColor}
        .bk-time{width:100%;padding:11px 8px;border-radius:10px;border:1.5px solid color-mix(in srgb,var(--bk-accent) 35%,#fff);background:#fff;color:color-mix(in srgb,var(--bk-accent) 80%,#000);font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;transition:all .12s}
        .bk-time:hover{border-color:var(--bk-accent)}
        .bk-time.sel{background:var(--bk-accent);border-color:var(--bk-accent);color:#fff}
        .bk-times{max-height:380px;overflow-y:auto;padding-right:2px}
      `}</style>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5, color: '#111' }}>{monthLabel}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => shift(-1)} style={navBtn(!canPrev)}>‹</button>
            <button type="button" aria-label="Next month" onClick={() => shift(1)} style={navBtn(false)}>›</button>
          </div>
        </div>
        <div className="bk-cal-grid" style={{ marginBottom: 6 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em', padding: '4px 0' }}>{d}</div>)}
        </div>
        <div className="bk-cal-grid" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity .15s' }}>
          {cells.map((c, i) => {
            if (!c) return <div key={`e${i}`} />
            const on = byDay.has(c)
            return (
              <button key={c} type="button" disabled={!on} onClick={() => setDay(c)}
                className={`bk-day${on ? ' on' : ''}${c === day ? ' sel' : ''}${c === today ? ' today' : ''}`}>
                {Number(c.slice(8))}
              </button>
            )
          })}
        </div>
        <div style={{ marginTop: 14, fontSize: 12.5, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>🌏</span>
          {mine === businessTz
            ? <span>Times in {tzShort(businessTz)}</span>
            : (
              <select value={tz} onChange={e => setTz(e.target.value)} style={{ border: 'none', background: 'transparent', color: '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                <option value={mine}>Your time ({tzShort(mine)})</option>
                <option value={businessTz}>Business time ({tzShort(businessTz)})</option>
              </select>
            )}
        </div>
      </div>

      <div>
        {error ? <div style={{ color: '#b91c1c', fontSize: 13.5 }}>{error}</div>
          : loading && !slots.length ? <div style={{ color: '#9ca3af', fontSize: 13.5, paddingTop: 6 }}>Finding times…</div>
          : !day ? <div style={{ color: '#6b7280', fontSize: 13.5, paddingTop: 6, lineHeight: 1.5 }}>{byDay.size ? 'Pick a day to see times.' : 'No times available this month — try the next one.'}</div>
          : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: '#111', marginBottom: 10 }}>{dayLabel}</div>
              <div className="bk-times">
                {groups.filter(([, l]) => l.length).map(([label, list]) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{label}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(auto-fill,minmax(92px,1fr))' : '1fr 1fr', gap: 6 }}>
                      {list.map(s => (
                        <button key={s.start} type="button" onClick={() => onSelect(s.start)} className={`bk-time${selected === s.start ? ' sel' : ''}`}>
                          {timeLabel(Date.parse(s.start), tz)}
                          {s.seatsLeft != null && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, opacity: 0.75 }}>{s.seatsLeft} left</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
      </div>
    </div>
  )
}

const navBtn = (disabled: boolean): React.CSSProperties => ({
  width: 32, height: 32, borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff', fontSize: 18, lineHeight: 1,
  color: disabled ? '#d1d5db' : '#374151', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
})

export { tzShort, viewerTz, timeLabel }
