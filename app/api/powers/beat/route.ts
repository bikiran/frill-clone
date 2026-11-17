import { NextRequest } from 'next/server'
import { powersDb, powersCaller, loadPowers, roster, eligible, ruleOn, pay, sweepUser, todayIn, json, type Paid } from '@/lib/powers/server'

export const dynamic = 'force-dynamic'

// POST { companyId } — one minute of real use. The page sends it once a
// minute only while the tab is visible and the person has typed, clicked,
// scrolled or touched in the last two minutes; the database counts at most
// one a minute however many tabs are open (powers_beat). Pays:
//   "Active on Colvy today"  the first counted minute of the day
//   "Time in Colvy"          each N counted minutes (the business sets N), up to its daily limit
// Every fifth minute it also checks the person's recent work (replies,
// calls, orders done elsewhere), so rewards turn up without a reload.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = powersDb()
    const caller = await powersCaller(req, db, body.companyId)
    if (!caller.ok) return caller.response
    const st = await loadPowers(db, body.companyId)
    if (!st.enabled || st.missing) return json({ enabled: false, results: [] })
    const team = await roster(db, body.companyId, st.ownerId)
    const me = team.find(m => m.id === caller.userId) || { id: caller.userId, name: caller.name, role: caller.role, locationId: caller.locationId, avatar: null, isOwner: caller.isOwner }
    if (!eligible(st, me)) return json({ enabled: true, results: [] })

    const day = todayIn(st.tz)
    const { data, error } = await db.rpc('powers_beat', { p_company: body.companyId, p_user: caller.userId, p_day: day, p_gap: 50 })
    if (error) return json({ enabled: true, results: [], setup: 'Run migrations/COLVY_V439_POWERS_MORE_WAYS.sql for time-in-app rewards.' })
    const minutes = Number(data?.minutes || 0)
    const results: Paid[] = []
    if (data?.counted) {
      if (minutes === 1 && ruleOn(st, 'active')) {
        const r = await pay(db, body.companyId, st, { userId: caller.userId, rule: 'active', refType: 'day', refId: day, idem: `active:${caller.userId}:${day}` })
        if (r.status === 'ok') results.push(r)
      }
      const every = st.config.rules.time?.every || 60
      if (ruleOn(st, 'time') && minutes % every === 0) {
        const step = minutes / every
        const r = await pay(db, body.companyId, st, { userId: caller.userId, rule: 'time', refType: 'day', refId: day, idem: `time:${caller.userId}:${day}:${step}`, meta: { minutes } })
        if (r.status === 'ok') results.push(r)
      }
      if (minutes % 5 === 0) results.push(...await sweepUser(db, body.companyId, st, me, null))
    }
    return json({ enabled: true, minutes, results })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not count that minute.' }, 500)
  }
}
