'use client'

// The Inbox contact panel's table history for a restaurant: visits, no-shows,
// the next table and any allergies, with a link to Reservations. Shows only
// when the workspace takes reservations and this person has booked before.

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
  if (!d || !d.reservations?.length) return null
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
      <style>{`
        .gg{margin-top:14px;padding:12px 14px;border-radius:16px;background:var(--f,#f4f4f5);font-size:13px;color:var(--ink,#111)}
        .gg-h{display:flex;align-items:center;gap:8px}
        .gg-h b{font-size:13.5px;font-weight:700}
        .gg-h a{margin-left:auto;font-size:12.5px;font-weight:650;color:var(--coral);text-decoration:none}
        .gg-vip{height:20px;padding:0 8px;border-radius:999px;background:#ede9fe;color:#6d28d9;font-size:11px;font-weight:700;display:inline-flex;align-items:center}
        .gg-s{display:flex;gap:14px;margin-top:6px;color:var(--mut,#71717a)}
        .gg-s b{color:var(--ink,#111);font-variant-numeric:tabular-nums}
        .gg p{margin:6px 0 0;color:var(--mut,#71717a)}
        .gg .bad,.gg .bad b{color:#b45309;font-weight:650}
      `}</style>
    </div>
  )
}
