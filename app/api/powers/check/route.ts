import { NextRequest } from 'next/server'
import { powersDb, powersCaller, loadPowers, roster, sweepUser, walletOf, isUuid, json } from '@/lib/powers/server'

export const dynamic = 'force-dynamic'

// POST { companyId, hint?: { type: 'resolve' | 'task', id } }
// "Check my recent work." Sent after closing a conversation or ticking a
// task. The server reads the work itself (lib/powers/server sweepUser) and
// pays what's due, so nothing the browser says is taken on trust; the hint
// only says which piece to look at first. Answers the rewards (and any taken
// back) for the top-bar chip to show.

const last = new Map<string, number>()

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = powersDb()
    const caller = await powersCaller(req, db, body.companyId)
    if (!caller.ok) return caller.response
    const st = await loadPowers(db, body.companyId)
    if (!st.enabled || st.missing) return json({ enabled: false, results: [] })

    const hint = body.hint && ['resolve', 'task'].includes(body.hint.type) && isUuid(body.hint.id) ? { type: body.hint.type, id: body.hint.id } : null
    // A plain check at most every 5 seconds per person; a hinted one always runs.
    const key = `${body.companyId}:${caller.userId}`
    if (!hint && Date.now() - (last.get(key) || 0) < 5000) return json({ enabled: true, results: [], throttled: true })
    last.set(key, Date.now())
    if (last.size > 2000) last.clear()

    const team = await roster(db, body.companyId, st.ownerId)
    const me = team.find(m => m.id === caller.userId) || { id: caller.userId, name: caller.name, role: caller.role, locationId: caller.locationId, avatar: null, isOwner: caller.isOwner }
    const results = await sweepUser(db, body.companyId, st, me, hint)
    const wallet = results.length ? await walletOf(db, body.companyId, caller.userId) : null
    return json({ enabled: true, results, wallet: wallet && { coins: wallet.coins, xp: wallet.xp, level: wallet.level, title: wallet.title, progress: wallet.progress } })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not check.' }, 500)
  }
}
