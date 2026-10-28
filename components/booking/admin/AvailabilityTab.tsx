'use client'

import { useState } from 'react'
import { DEFAULT_HOURS, type WeekHours } from '@/lib/booking-time'
import { VIC_PUBLIC_HOLIDAYS } from '@/lib/holidays'
import { outletGaps } from '@/lib/booking-outlets'
import WeekHoursEditor from './WeekHoursEditor'
import { WarnIcon } from '@/components/booking/icons'
import { card, input, label, hint, Toggle } from './shared'

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
  // The list is Victoria's: offered only to a business on Melbourne time.
  const holidays = settings.timezone === 'Australia/Melbourne' ? VIC_PUBLIC_HOLIDAYS.filter(h => h.date >= todayStr && !listed.has(h.date)) : []
  // Outlets nobody is set to (when some people have outlets): everyone is offered there.
  const gaps = locations.length > 1 && anyBookable ? outletGaps(settings, staff.map(s => s.id), locations) : []
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
        {gaps.length > 0 && (
          <div role="status" className="bk-warn">
            <WarnIcon size={15} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>Nobody is set to take bookings at {gaps.map(g => g.label).join(', ')}, so everyone is offered there. Open a person’s “Hours &amp; days off” to choose where they work.</span>
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {staff.map(s => {
            const st = settings.staff?.[s.id] || { bookable: false, hours: null, off: [], locations: [] }
            const at: string[] = (st.locations || []).filter((id: string) => outletName(id))
            const expanded = openStaff === s.id
            return (
              <div key={s.id} className={`bk-staff${st.bookable ? ' on' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Toggle on={!!st.bookable} onChange={v => setStaff(s.id, { bookable: v })} label={`${s.name} takes bookings`} />
                  <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 120 }}>{s.name}</span>
                  {st.bookable && (
                    <span style={{ fontSize: 12, color: 'var(--slate, #6b7280)' }}>
                      {locations.length > 1 && at.length ? `${at.map(outletName).join(', ')} · ` : ''}{st.hours ? 'Own hours' : 'Business hours'}{st.off?.length ? ` · ${st.off.length} day${st.off.length > 1 ? 's' : ''} off` : ''}
                    </span>
                  )}
                  {st.bookable && <button type="button" onClick={() => setOpenStaff(expanded ? null : s.id)} className="cv-btn bk-sm">{expanded ? 'Done' : 'Hours & days off'}</button>}
                </div>
                {st.bookable && expanded && (
                  <div style={{ marginTop: 12, paddingTop: 14, borderTop: '1px solid #f0f0f2' }}>
                    {locations.length > 1 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={label}>Takes bookings at</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label={`Outlets ${s.name} takes bookings at`}>
                          <button type="button" aria-pressed={!at.length} onClick={() => setStaff(s.id, { locations: [] })} className={`bk-pick${!at.length ? ' on' : ''}`}>Any outlet</button>
                          {locations.map(l => {
                            const on = at.includes(l.id)
                            return <button key={l.id} type="button" aria-pressed={on} onClick={() => setStaff(s.id, { locations: on ? at.filter(x => x !== l.id) : [...at, l.id] })} className={`bk-pick${on ? ' on' : ''}`}>{l.label}</button>
                          })}
                        </div>
                        <div style={hint}>When a customer picks an outlet, only people who work there are offered (and “anyone available” picks from them).</div>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                      <Toggle on={!!st.hours} onChange={v => setStaff(s.id, { hours: v ? JSON.parse(JSON.stringify(settings.hours || DEFAULT_HOURS)) : null })} label="Different hours from the business" />
                      Different hours from the business
                    </div>
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
          }} className="cv-btn">Add</button>
          {holidays.length > 0 && (
            <button type="button" onClick={addHolidays} className="cv-btn" title={holidays.map(h => `${fmtDay(h.date)} · ${h.label}`).join('\n')}>
              Add Victorian public holidays ({holidays.length})
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(settings.closed || []).map((c: any) => (
            <span key={c.date} className="bk-chip-x">
              {fmtDay(c.date)}{c.label ? ` · ${c.label}` : ''}
              <button type="button" aria-label={`Remove ${fmtDay(c.date)}`} onClick={() => setSettings({ ...settings, closed: settings.closed.filter((x: any) => x.date !== c.date) })}>×</button>
            </span>
          ))}
          {!(settings.closed || []).length && <span style={{ fontSize: 13.5, color: '#a1a1aa' }}>None yet</span>}
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
        <button type="button" disabled={!d} onClick={() => { if (d && !dates.includes(d)) onChange([...dates, d].sort()); setD('') }} className="cv-btn">Add</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {dates.map(x => <span key={x} className="bk-chip-x">{fmtDay(x)}<button type="button" aria-label={`Remove ${fmtDay(x)}`} onClick={() => onChange(dates.filter(y => y !== x))}>×</button></span>)}
      </div>
    </div>
  )
}

const todayIn = (tz: string) => new Date().toLocaleDateString('en-CA', { timeZone: tz })
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const sectionTitle: React.CSSProperties = { fontWeight: 800, fontSize: 17, letterSpacing: '-.01em', color: 'var(--ink, #111)' }
