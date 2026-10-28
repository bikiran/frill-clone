'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, money, card } from './shared'
import { WarnIcon, ArrowRightIcon } from '@/components/booking/icons'
import EmptyScroll from '@/components/EmptyScroll'

// Today at a glance: headline numbers, then today's bookings in a column per
// person (one column when the business takes bookings as a whole).

type Insights = {
  days: number; visits: number; byDow: number[]; byHour: Record<string, number>
  topServices: { name: string; count: number; revenueCents: number }[]
  repeatRate: number | null; noShowRate: number | null; regulars: number
}

type Stats = {
  today: number; next7: number; newThisWeek: number
  confirmedRate: number | null; remindedCount: number
  noShowRate: number | null; noShows: number
  paidCents30: number; currency: string
}

export default function TodayTab({ companyId, onOpenBookings, reloadKey }: { companyId: string; onOpenBookings: () => void; reloadKey?: any }) {
  const [data, setData] = useState<{ timezone: string; today: any[]; stats: Stats | null; hint?: string; insights?: Insights | null } | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    api(`/api/bookings?companyId=${companyId}&op=today`).then(setData).catch(e => setError(e.message))
  }, [companyId, reloadKey])
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(iv) }, [])

  const tz = data?.timezone || 'Australia/Melbourne'
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()

  const columns = useMemo(() => {
    const m = new Map<string, { name: string; rows: any[] }>()
    for (const b of data?.today || []) {
      const k = b.staff_id || '-'
      const col = m.get(k) || { name: b.staff_name || 'Bookings', rows: [] }
      col.rows.push(b); m.set(k, col)
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [data])

  if (error) return <div style={{ ...card, color: '#b91c1c', fontSize: 13.5 }}>{error}</div>
  if (!data) return <div className="bk-skel-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>{[0, 1, 2, 3].map(i => <div key={i} style={{ ...card, height: 92, background: '#f6f6f7', border: 'none' }} />)}</div>
  if (data.hint) return <div className="bk-warn"><WarnIcon size={16} style={{ marginTop: 1, flexShrink: 0 }} /><span>{data.hint}</span></div>

  const s: Stats = data.stats || { today: 0, next7: 0, newThisWeek: 0, confirmedRate: null, remindedCount: 0, noShowRate: null, noShows: 0, paidCents30: 0, currency: 'aud' }
  const todayLabel = new Date(now).toLocaleDateString('en-AU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div>
      <style>{`
        .td-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:22px}
        .td-tile{animation:tdIn .45s cubic-bezier(.22,1,.36,1) backwards}
        @keyframes tdIn{from{opacity:0;transform:translate3d(0,8px,0)}to{opacity:1;transform:none}}
        .td-cols{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(260px,1fr);gap:12px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x mandatory}
        .td-col{scroll-snap-align:start;padding:12px;border-radius:20px;background:#f4f4f5}
        .td-col-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 4px 10px;font-weight:700;font-size:14px;color:var(--ink,#111)}
        .td-n{min-width:20px;height:20px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:#fff;color:#52525b;font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
        .td-card{display:block;padding:12px 14px;border-radius:16px;background:#fff;text-decoration:none;color:inherit;box-shadow:0 0 0 1px rgba(0,0,0,.04),0 1px 2px rgba(16,24,40,.04);transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s}
        .td-card:hover{transform:translate3d(0,-1px,0);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 8px 20px -12px rgba(0,0,0,.3)}
        .td-card.live{box-shadow:0 0 0 2px var(--coral,#ff7a6b),0 8px 20px -12px rgba(0,0,0,.3)}
        .td-tag{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 7px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap;background:color-mix(in srgb,var(--t) 12%,#fff);color:color-mix(in srgb,var(--t) 78%,#000)}
        .td-tag::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--t)}
        .td-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px}
        .td-h h2{margin:0;font-size:19px;font-weight:800;letter-spacing:-.015em;color:var(--ink,#111)}
        .td-h small{font-size:13.5px;color:#8e8e93}
        .td-ins{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
        .td-bars{display:flex;align-items:flex-end;gap:6px;height:120px;margin-top:14px}
        .td-bar{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px}
        .td-bar i{display:block;width:100%;max-width:34px;border-radius:7px 7px 3px 3px;background:var(--coral,#ff7a6b);opacity:.3;transition:opacity .2s}
        .td-bar.top i{opacity:1}
        .td-bar:hover i{opacity:.8}
        .td-bar b{font-size:11.5px;font-weight:700;color:var(--ink,#111);font-variant-numeric:tabular-nums}
        .td-bar span{font-size:11px;color:var(--slate,#6b7280);white-space:nowrap}
        .td-svc{display:grid;gap:10px;margin-top:12px}
        .td-svc-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;font-size:13px}
        .td-svc-row .n{font-weight:600;color:var(--ink,#111);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .td-svc-row .c{color:var(--slate,#6b7280);font-variant-numeric:tabular-nums;white-space:nowrap}
        .td-svc-row .t{grid-column:1/-1;height:6px;border-radius:999px;background:#f1f1f3;overflow:hidden}
        .td-svc-row .t i{display:block;height:100%;border-radius:999px;background:var(--coral,#ff7a6b)}
        @media (prefers-reduced-motion: reduce){.td-tile{animation:none}}
      `}</style>

      <div className="td-tiles">
        <Tile i={0} label="Today" value={String(s.today)} sub={todayLabel} />
        <Tile i={1} label="Next 7 days" value={String(s.next7)} sub={`${s.newThisWeek} booked this week`} />
        <Tile i={2} label="Confirmed by customers" value={s.confirmedRate == null ? '—' : `${s.confirmedRate}%`} sub={s.remindedCount ? `of ${s.remindedCount} reminded, replied C` : 'after reminders go out'} />
        <Tile i={3} label="No-shows (30 days)" value={s.noShowRate == null ? '—' : `${s.noShowRate}%`} sub={s.noShows ? `${s.noShows} missed` : 'none marked'} />
        <Tile i={4} label="Paid online (30 days)" value={money(s.paidCents30, s.currency)} sub="deposits + full payments" />
      </div>

      <div className="td-h">
        <h2>Today’s schedule</h2>
        <small>{todayLabel}</small>
        <button onClick={onOpenBookings} className="cv-btn bk-sm" style={{ marginLeft: 'auto', alignSelf: 'center' }}>All bookings <ArrowRightIcon size={13} /></button>
      </div>
      {!columns.length ? (
        <div style={{ ...card, padding: '8px 12px' }}>
          <EmptyScroll compact kinds={['calendar']} title="Nothing booked today" line="Today’s bookings show up here, one column per person." />
        </div>
      ) : (
        <div className="td-cols">
          {columns.map(col => (
            <div key={col.name} className="td-col">
              <div className="td-col-h"><span>{col.name}</span><span className="td-n">{col.rows.length}</span></div>
              <div style={{ display: 'grid', gap: 8 }}>
                {col.rows.map(b => {
                  const start = Date.parse(b.starts_at), end = Date.parse(b.ends_at)
                  const live = now >= start && now < end
                  const past = now >= end
                  return (
                    <Link key={b.id} href={b.conversation_id ? `/admin/inbox?conversation=${b.conversation_id}` : '/admin/bookings?tab=bookings'} className={`td-card${live ? ' live' : ''}`}
                      style={{ opacity: past && !live ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, color: '#52525b', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        <span>{t(b.starts_at)} – {t(b.ends_at)}</span>
                        {live && <span className="td-tag" style={tint('#ff7a6b')}>Now</span>}
                        {b.status === 'no_show' && <span className="td-tag" style={tint('#71717a')}>No-show</span>}
                        {b.status === 'completed' && <span className="td-tag" style={tint('#3b82f6')}>Done</span>}
                        {b.status === 'confirmed' && b.customer_confirmed_at && <span className="td-tag" style={tint('#22c55e')}>Confirmed</span>}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 4, color: 'var(--ink,#111)' }}>{b.customer_name || 'Customer'}</div>
                      <div style={{ fontSize: 13, color: '#71717a', marginTop: 2 }}>{b.service_name}{b.address || b.location_label ? ` · ${b.address || b.location_label}` : ''}</div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.insights && data.insights.visits > 0 && <InsightsPanel ins={data.insights} currency={s.currency} />}
    </div>
  )
}

// Last 90 days at a glance: when people come in, what they book, who comes back.
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`

function InsightsPanel({ ins, currency }: { ins: Insights; currency: string }) {
  const hours = Object.keys(ins.byHour).map(Number).sort((a, b) => a - b)
  const hourRange = hours.length ? Array.from({ length: hours[hours.length - 1] - hours[0] + 1 }, (_, i) => hours[0] + i) : []
  const maxDow = Math.max(...ins.byDow), maxHour = Math.max(0, ...hourRange.map(h => ins.byHour[h] || 0))
  const topSvc = ins.topServices[0]?.count || 1
  const busiestDay = maxDow ? DOW[ins.byDow.indexOf(maxDow)] : null
  const busiestHour = maxHour ? hourRange.find(h => (ins.byHour[h] || 0) === maxHour)! : null
  const facts = [
    `${ins.visits} visit${ins.visits === 1 ? '' : 's'}`,
    ins.repeatRate != null ? `${ins.repeatRate}% of customers came back` : '',
    ins.regulars ? `${ins.regulars} regular booking${ins.regulars === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ')
  return (
    <section style={{ marginTop: 26 }} aria-label={`Last ${ins.days} days`}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-.015em' }}>Last {ins.days} days</div>
        <div style={{ fontSize: 13.5, color: '#8e8e93' }}>{facts}</div>
      </div>
      <div className="td-ins">
        <div style={card}>
          <div style={insTitle}>Busiest days</div>
          <div style={insSub}>{busiestDay ? `${busiestDay} is your busiest day` : 'Not enough visits yet'}</div>
          <div className="td-bars" role="list">
            {ins.byDow.map((n, i) => (
              <div key={i} role="listitem" className={`td-bar${n && n === maxDow ? ' top' : ''}`} title={`${DOW[i]}: ${n} visit${n === 1 ? '' : 's'}`} aria-label={`${DOW[i]}: ${n} visit${n === 1 ? '' : 's'}`}>
                <b>{n || ''}</b>
                <i style={{ height: maxDow ? `${Math.max(n ? 6 : 2, Math.round((n / maxDow) * 84))}px` : 2 }} />
                <span>{DOW[i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={insTitle}>Busiest times</div>
          <div style={insSub}>{busiestHour != null ? `Most visits start around ${hourLabel(busiestHour)}` : 'Not enough visits yet'}</div>
          <div className="td-bars" role="list" style={{ gap: hourRange.length > 10 ? 3 : 6 }}>
            {hourRange.map(h => {
              const n = ins.byHour[h] || 0
              return (
                <div key={h} role="listitem" className={`td-bar${n && n === maxHour ? ' top' : ''}`} title={`${hourLabel(h)}: ${n} visit${n === 1 ? '' : 's'}`} aria-label={`${hourLabel(h)}: ${n} visit${n === 1 ? '' : 's'}`}>
                  <b>{n || ''}</b>
                  <i style={{ height: maxHour ? `${Math.max(n ? 6 : 2, Math.round((n / maxHour) * 84))}px` : 2 }} />
                  <span>{hourRange.length > 9 && h % 2 ? '' : hourLabel(h)}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div style={card}>
          <div style={insTitle}>Top services</div>
          <div style={insSub}>Visits and booked value{ins.noShowRate != null ? ` · ${ins.noShowRate}% no-shows` : ''}</div>
          <div className="td-svc">
            {ins.topServices.map(sv => (
              <div key={sv.name} className="td-svc-row">
                <span className="n" title={sv.name}>{sv.name}</span>
                <span className="c">{sv.count} · {money(sv.revenueCents, currency)}</span>
                <span className="t" aria-hidden><i style={{ width: `${Math.max(4, Math.round((sv.count / topSvc) * 100))}%` }} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const insTitle: React.CSSProperties = { fontWeight: 700, fontSize: 15, color: 'var(--ink,#111)' }
const insSub: React.CSSProperties = { fontSize: 13, color: '#8e8e93', marginTop: 2 }

function Tile({ label, value, sub, i }: { label: string; value: string; sub: string; i: number }) {
  return (
    <div className="td-tile" style={{ ...card, padding: '16px 18px', animationDelay: `${i * 50}ms` }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#71717a' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--ink,#111)', margin: '6px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: '#8e8e93' }}>{sub}</div>
    </div>
  )
}

const tint = (c: string) => ({ ['--t' as any]: c }) as React.CSSProperties
