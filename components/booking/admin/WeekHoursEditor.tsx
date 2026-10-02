'use client'

import { DAY_ORDER, DAY_LABEL, type WeekHours, type DayKey } from '@/lib/booking-time'
import { Toggle, input } from './shared'

// Opening hours for a week: each day on/off with one or more time ranges.

export default function WeekHoursEditor({ value, onChange }: { value: WeekHours; onChange: (v: WeekHours) => void }) {
  const set = (k: DayKey, ranges: { start: string; end: string }[]) => onChange({ ...value, [k]: ranges })
  const copyToWeekdays = (k: DayKey) => {
    const next = { ...value }
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri'] as DayKey[]) next[d] = value[k].map(r => ({ ...r }))
    onChange(next)
  }
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {DAY_ORDER.map(k => {
        const ranges = value[k] || []
        const open = ranges.length > 0
        return (
          <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: '1px solid #f5f5f5', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 140, paddingTop: 5 }}>
              <Toggle on={open} onChange={v => set(k, v ? [{ start: '09:00', end: '17:00' }] : [])} />
              <span style={{ fontWeight: 600, fontSize: 13.5, color: open ? 'var(--ink, #111)' : '#9ca3af' }}>{DAY_LABEL[k]}</span>
            </div>
            <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 6 }}>
              {!open && <span style={{ fontSize: 13, color: '#9ca3af', paddingTop: 7 }}>Closed</span>}
              {ranges.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="time" value={r.start} step={300} onChange={e => set(k, ranges.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} style={{ ...input, width: 118 }} />
                  <span style={{ color: '#9ca3af' }}>–</span>
                  <input type="time" value={r.end} step={300} onChange={e => set(k, ranges.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} style={{ ...input, width: 118 }} />
                  {r.end <= r.start && <span style={{ fontSize: 11.5, color: '#dc2626' }}>End must be after start</span>}
                  <button type="button" onClick={() => set(k, ranges.filter((_, j) => j !== i))} title="Remove" style={iconBtn}>×</button>
                  {i === ranges.length - 1 && (
                    <>
                      <button type="button" onClick={() => set(k, [...ranges, { start: r.end < '20:00' ? r.end : '13:00', end: r.end < '20:00' ? addHour(r.end, 2) : '17:00' }])} title="Add a break / second range" style={iconBtn}>＋</button>
                      {k === 'mon' && <button type="button" onClick={() => copyToWeekdays(k)} style={{ ...iconBtn, width: 'auto', padding: '0 8px', fontSize: 12 }}>Copy to Tue–Fri</button>}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function addHour(t: string, n: number) {
  const [h, m] = t.split(':').map(Number)
  return `${String(Math.min(23, h + n)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const iconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', background: '#fff', color: 'var(--slate, #6b7280)', cursor: 'pointer', fontSize: 15, lineHeight: 1, fontFamily: 'inherit' }
