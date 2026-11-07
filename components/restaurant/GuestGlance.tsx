'use client'

// The Inbox contact panel's table history for a restaurant: visits, no-shows,
// the next table and any allergies, with a link to Reservations and Book a
// table (the new-reservation form with this guest chosen). Shows whenever the
// workspace takes reservations (lib/modules); a guest who hasn't booked yet
// gets just the Book a table link.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { restaurantEnabled } from '@/lib/modules'
import { apiRaw } from '@/components/jobs/shared'

const onFor = new Map<string, Promise<boolean>>()
function reservationsOn(companyId: string) {
  if (!onFor.has(companyId)) {
    onFor.set(companyId, (async () => {
      try {
        const { data } = await (supabase as any).from('companies').select('industry, modules').eq('id', companyId).maybeSingle()
        return restaurantEnabled(data)
      } catch { return false }
    })())
  }
  return onFor.get(companyId)!
}
const cache = new Map<string, any>()

export default function GuestGlance({ companyId, contactId }: { companyId: string; contactId: string }) {
  const key = `${companyId}:${contactId}`
  const [d, setD] = useState<any>(() => cache.get(key) || null)
  useEffect(() => {
    let live = true
    setD(cache.get(key) || null)
    ;(async () => {
      if (!(await reservationsOn(companyId))) return
      const r = await apiRaw(`/api/reservations?companyId=${companyId}&op=guest&contactId=${contactId}`)
      if (!live || !r.ok) return
      cache.set(key, r.data)
      setD(r.data)
    })()
    return () => { live = false }
  }, [companyId, contactId, key])
  if (!d) return null
  const book = `/admin/reservations?new=1&contactId=${encodeURIComponent(contactId)}`
  if (!d.reservations?.length) {
    return (
      <div className="gg">
        <div className="gg-h"><b>Tables</b><Link href="/admin/reservations?tab=guests">Open ›</Link></div>
        <p>No table bookings yet.</p>
        <Link href={book} className="gg-book">Book a table</Link>
        <style>{GG_CSS}</style>
      </div>
    )
  }
  const s = d.stats || {}
  const tz = d.timezone || 'Australia/Melbourne'
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)).replace(/ (am|pm)$/i, (m: string) => m.trim().toLowerCase())
  const next = s.nextVisit ? d.reservations.find((r: any) => r.startsAt === s.nextVisit) : null
  return (
    <div className="gg">
      <div className="gg-h">
        <b>Tables</b>
        {d.guest?.profile?.vip && <span className="gg-vip">VIP</span>}
        <Link href={next ? `/admin/reservations?date=${new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(next.startsAt))}` : '/admin/reservations?tab=guests'}>Open ›</Link>
      </div>
      <div className="gg-s">
        <span><b>{s.visits || 0}</b> {s.visits === 1 ? 'visit' : 'visits'}</span>
        <span className={s.noShows ? 'bad' : ''}><b>{s.noShows || 0}</b> no-show{s.noShows === 1 ? '' : 's'}</span>
      </div>
      {next && <p>Next: {fmt(next.startsAt)} · {next.party} {next.party === 1 ? 'guest' : 'guests'}</p>}
      {d.guest?.profile?.allergies && <p className="bad">⚠︎ {d.guest.profile.allergies}</p>}
      <Link href={book} className="gg-book">Book a table</Link>
      <style>{GG_CSS}</style>
    </div>
  )
}

const GG_CSS = `
        .gg{margin-top:14px;padding:12px 14px;border-radius:16px;background:var(--f,#f4f4f5);font-size:13px;color:var(--ink,#111)}
        .gg-h{display:flex;align-items:center;gap:8px}
        .gg-h b{font-size:13.5px;font-weight:700}
        .gg-h a{margin-left:auto;font-size:12.5px;font-weight:650;color:var(--coral);text-decoration:none}
        .gg-vip{height:20px;padding:0 8px;border-radius:999px;background:#ede9fe;color:#6d28d9;font-size:11px;font-weight:700;display:inline-flex;align-items:center}
        .gg-s{display:flex;gap:14px;margin-top:6px;color:var(--mut,#71717a)}
        .gg-s b{color:var(--ink,#111);font-variant-numeric:tabular-nums}
        .gg p{margin:6px 0 0;color:var(--mut,#71717a)}
        .gg .bad,.gg .bad b{color:#b45309;font-weight:650}
        .gg-book{margin-top:10px;width:100%;height:34px;border-radius:999px;box-shadow:0 0 0 1px rgba(15,17,25,.1);background:var(--card,#fff);color:var(--ink,#111);font-size:13px;font-weight:650;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
        .gg-book:hover{box-shadow:0 0 0 1px rgba(255,106,77,.5);color:var(--coral)}
        [data-theme="dark"] .gg{background:rgba(255,255,255,.05)}
        [data-theme="dark"] .gg-book{box-shadow:0 0 0 1px rgba(255,255,255,.1)}
`
