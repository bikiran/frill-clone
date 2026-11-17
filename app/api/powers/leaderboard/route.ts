import { NextRequest } from 'next/server'
import { powersDb, powersCaller, loadPowers, roster, eligible, todayIn, json } from '@/lib/powers/server'
import { periodStart, levelFor } from '@/lib/powers/config'
import { addDays } from '@/lib/booking-time'

export const dynamic = 'force-dynamic'

// GET ?companyId&period=week|month&board=xp|resolve|task|job|thanks|challenge
// The leaderboard for this week or month, in the business's time zone.
// Names, levels and counts only, never customers or messages. The business
// chooses: everyone ranked, team totals only (no names), or off.

const BOARDS = ['xp', 'resolve', 'task', 'job', 'thanks', 'feedback', 'challenge'] as const

export async function GET(req: NextRequest) {
  try {
    const db = powersDb()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    const caller = await powersCaller(req, db, companyId)
    if (!caller.ok) return caller.response
    const st = await loadPowers(db, companyId!)
    if (!st.enabled || st.missing) return json({ error: 'Colvy Powers is off for this workspace.' }, 409)
    const mode = st.config.leaderboard
    if (mode === 'off') return json({ mode: 'off', rows: [] })

    const period = sp.get('period') === 'month' ? 'month' : 'week'
    const board = (BOARDS as readonly string[]).includes(sp.get('board') || '') ? sp.get('board')! : 'xp'
    const today = todayIn(st.tz)
    const since = periodStart(today, period)
    const until = period === 'week' ? addDays(since, 7) : nextMonth(since)
    const [team, totals] = await Promise.all([
      roster(db, companyId!, st.ownerId),
      db.rpc('powers_leaderboard', { p_company: companyId, p_since: since, p_until: until, p_user: null }),
    ])
    if (totals.error) throw totals.error
    const people = team.filter(m => eligible(st, m))
    const by = new Map<string, any>((totals.data || []).map((r: any) => [r.user_id, r]))
    const score = (id: string) => Number(by.get(id)?.[board] || 0)

    const teamTotal = people.reduce((n, m) => n + score(m.id), 0)
    if (mode === 'team') return json({ mode, period, board, since, until, team: { total: teamTotal, people: people.length }, rows: [] })

    const { data: wallets } = await db.from('powers_wallets').select('user_id, xp').eq('company_id', companyId)
    const xpOf = new Map<string, number>((wallets || []).map((w: any) => [w.user_id, w.xp]))
    const rows = people
      .map(m => ({ id: m.id, name: m.name, avatar: m.avatar, score: score(m.id), level: levelFor(xpOf.get(m.id) || 0).level, me: m.id === caller.userId }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    let rank = 0, prev = -1
    rows.forEach((r: any, i) => { if (r.score !== prev) { rank = i + 1; prev = r.score } r.rank = rank })
    return json({ mode, period, board, since, until, team: { total: teamTotal, people: people.length }, rows })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not load the leaderboard.' }, 500)
  }
}

function nextMonth(first: string) {
  const [y, m] = first.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}
