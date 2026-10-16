'use client'

import { useState } from 'react'
import { DEFAULT_HOURS, type WeekHours } from '@/lib/booking-time'
import { VIC_PUBLIC_HOLIDAYS } from '@/lib/holidays'
import WeekHoursEditor from './WeekHoursEditor'
import { card, btnGhost, input, label, hint, Toggle } from './shared'

// When people can book: business hours, which teammates take bookings (and
// their own hours / days off), and closed dates.

const ZONES = ['Australia/Melbourne', 'Australia/Sydney', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth', 'Australia/Hobart', 'Pacific/Auckland', 'Asia/Kathmandu', 'Asia/Singapore', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC']

export default function AvailabilityTab({ settings, setSettings, staff, locations = [] }: { settings: any; setSettings: (s: any) => void; staff: { id: string; name: string }[]; locations?: { id: string; label: string }[] }) {
  const [openStaff, setOpenStaff] = useState<string | null>(null)
  const [closedDate, setClosedDate] = useState('')
  const [closedLabel, setClosedLabel] = useState('')
  const zones = ZONES.includes(settings.timezone) ? ZONES : [settings.timezone, ...ZONES]
  const anyBookable = staff.some(s => settings.staff?.[s.id]?.bookable)

  const setStaff = (id: string, patch: any) => {
    const cur = settings.staff?.[id] || { bookable: false, hours: null, off: [], locations: [] }
    setSettings({ ...settings, staff: { ...(settings.staff || {}), [id]: { ...cur, ...patch } } })
  }
  const outletName = (id: string) => locations.find(l => l.id === id)?.label
  // Public holidays still to come that aren't listed yet (Victoria).
  const todayStr = todayIn(settings.timezone || 'Australia/Melbourne')
  const listed = new Set((settings.closed || []).map((c: any) => c.date))
  const holidays = VIC_PUBLIC_HOLIDAYS.filter(h => h.date >= todayStr && !listed.has(h.date))
  const addHolidays = () => setSettings({ ...settings, closed: [...(settings.closed || []), ...holidays].sort((a: any, b: any) => a.date.localeCompare(b.date)) })

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={sectionTitle}>Business hours</div>
            <div style={hint}>When bookings can start and finish. Staff use these unless they have their own hours.</div>
          </div>
          <div style={{ width: 240 }}>
            <span style={label}>Timezone</span>
            <select value={settings.timezone} onChange={e => setSettings({ ...settings, timezone: e.target.value })} style={input}>
              {zones.map(z => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>
        <WeekHoursEditor value={settings.hours || DEFAULT_HOURS} onChange={hours => setSettings({ ...settings, hours })} />
      </section>

      <section style={card}>
        <div style={sectionTitle}>Who takes bookings</div>
        <div style={{ ...hint, marginBottom: 12 }}>
          {anyBookable
            ? 'Customers can choose one of these people or “anyone available”. A person is busy when they have a booking or a calendar event assigned to them.'
            : 'Nobody is switched on, so bookings go to the business as a whole — one booking at a time, on business hours. Switch people on to let customers book them individually (several bookings can then run at once).'}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {staff.map(s => {
            const st = settings.staff?.[s.id] || { bookable: false, hours: null, off: [], locations: [] }
            const at: string[] = (st.locations || []).filter((id: string) => outletName(id))
            const expanded = openStaff === s.id
            return (
              <div key={s.id} style={{ border: '1px solid var(--border, #f1f1f1)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Toggle on={!!st.bookable} onChange={v => setStaff(s.id, { bookable: v })} />
                  <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{s.name}</span>
                  {st.bookable && (
                    <span style={{ fontSize: 12, color: 'var(--slate, #6b7280)' }}>
                      {locations.length > 1 && at.length ? `${at.map(outletName).join(', ')} · ` : ''}{st.hours ? 'Own hours' : 'Business hours'}{st.off?.length ? ` · ${st.off.length} day${st.off.length > 1 ? 's' : ''} off` : ''}
                    </span>
                  )}
                  {st.bookable && <button type="button" onClick={() => setOpenStaff(expanded ? null : s.id)} style={{ ...btnGhost, height: 30, fontSize: 12.5 }}>{expanded ? 'Done' : 'Hours & days off'}</button>}
                </div>
                {st.bookable && expanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f5f5f5' }}>
                    {locations.length > 1 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={label}>Takes bookings at</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label={`Outlets ${s.name} takes bookings at`}>
                          <button type="button" aria-pressed={!at.length} onClick={() => setStaff(s.id, { locations: [] })} style={outletChip(!at.length)}>Any outlet</button>
                          {locations.map(l => {
                            const on = at.includes(l.id)
                            return <button key={l.id} type="button" aria-pressed={on} onClick={() => setStaff(s.id, { locations: on ? at.filter(x => x !== l.id) : [...at, l.id] })} style={outletChip(on)}>{l.label}</button>
                          })}
                        </div>
                        <div style={hint}>When a customer picks an outlet, only people who work there are offered (and “anyone available” picks from them).</div>
                      </div>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!st.hours} onChange={e => setStaff(s.id, { hours: e.target.checked ? JSON.parse(JSON.stringify(settings.hours || DEFAULT_HOURS)) : null })} />
                      Different hours from the business
                    </label>
                    {st.hours && <WeekHoursEditor value={st.hours as WeekHours} onChange={hours => setStaff(s.id, { hours })} />}
                    <div style={{ marginTop: 12 }}>
                      <span style={label}>Days off</span>
                      <DateList dates={st.off || []} onChange={off => setStaff(s.id, { off })} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {!staff.length && <div style={{ fontSize: 13, color: '#9ca3af' }}>No teammates yet.</div>}
        </div>
      </section>

      <section style={card}>
        <div style={sectionTitle}>Closed dates</div>
        <div style={{ ...hint, marginBottom: 12 }}>Public holidays, stocktake days, holidays — no one can book these days.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input type="date" value={closedDate} onChange={e => setClosedDate(e.target.value)} style={{ ...input, width: 160 }} />
          <input value={closedLabel} onChange={e => setClosedLabel(e.target.value)} placeholder="Label (optional) e.g. Christmas" style={{ ...input, width: 220 }} />
          <button type="button" disabled={!closedDate} onClick={() => {
            if (!closedDate || settings.closed?.some((c: any) => c.date === closedDate)) return
            setSettings({ ...settings, closed: [...(settings.closed || []), { date: closedDate, label: closedLabel }].sort((a: any, b: any) => a.date.localeCompare(b.date)) })
            setClosedDate(''); setClosedLabel('')
          }} style={btnGhost}>Add</button>
          {holidays.length > 0 && (
            <button type="button" onClick={addHolidays} style={btnGhost} title={holidays.map(h => `${fmtDay(h.date)} · ${h.label}`).join('\n')}>
              Add Victorian public holidays ({holidays.length})
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(settings.closed || []).map((c: any) => (
            <span key={c.date} style={chip}>
              {fmtDay(c.date)}{c.label ? ` · ${c.label}` : ''}
              <button type="button" aria-label={`Remove ${fmtDay(c.date)}`} onClick={() => setSettings({ ...settings, closed: settings.closed.filter((x: any) => x.date !== c.date) })} style={chipX}>×</button>
            </span>
          ))}
          {!(settings.closed || []).length && <span style={{ fontSize: 13, color: '#9ca3af' }}>None</span>}
        </div>
      </section>
    </div>
  )
}

function DateList({ dates, onChange }: { dates: string[]; onChange: (d: string[]) => void }) {
  const [d, setD] = useState('')
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input type="date" value={d} onChange={e => setD(e.target.value)} style={{ ...input, width: 160 }} />
        <button type="button" disabled={!d} onClick={() => { if (d && !dates.includes(d)) onChange([...dates, d].sort()); setD('') }} style={btnGhost}>Add</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {dates.map(x => <span key={x} style={chip}>{fmtDay(x)}<button type="button" aria-label={`Remove ${fmtDay(x)}`} onClick={() => onChange(dates.filter(y => y !== x))} style={chipX}>×</button></span>)}
      </div>
    </div>
  )
}

const todayIn = (tz: string) => new Date().toLocaleDateString('en-CA', { timeZone: tz })
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const outletChip = (on: boolean): React.CSSProperties => ({ height: 32, padding: '0 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${on ? 'var(--coral, #ff7a6b)' : 'var(--border, #e5e7eb)'}`, background: on ? 'color-mix(in srgb, var(--coral, #ff7a6b) 10%, #fff)' : '#fff', color: on ? 'color-mix(in srgb, var(--coral, #ff7a6b) 80%, #000)' : 'var(--ink, #111)' })
const sectionTitle: React.CSSProperties = { fontWeight: 800, fontSize: 15, color: 'var(--ink, #111)' }
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '4px 6px 4px 10px', borderRadius: 999, background: '#f3f4f6', color: '#374151' }
const chipX: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 15, lineHeight: 1, padding: 0 }
