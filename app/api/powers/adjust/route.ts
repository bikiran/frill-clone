import { NextRequest } from 'next/server'
import { powersDb, powersCaller, loadPowers, roster, todayIn, clip, isUuid, json, MIGRATION_HINT } from '@/lib/powers/server'
import { audit } from '@/lib/activity-logging'

export const dynamic = 'force-dynamic'

// POST { companyId, userId, mode: 'grant' | 'revoke', amount, reason }
// An owner or admin gives or takes back coins, with a reason. Coins only (XP
// is earned, never handed out). A revoke never takes a balance below zero.
// Both land in the ledger with who did it, and in the activity log.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = powersDb()
    const caller = await powersCaller(req, db, body.companyId)
    if (!caller.ok) return caller.response
    if (!caller.isAdmin) return json({ error: 'Only owners and admins can give or take coins.' }, 403)
    const st = await loadPowers(db, body.companyId)
    if (st.missing) return json({ setup: true, error: MIGRATION_HINT }, 503)
    const mode = body.mode === 'revoke' ? 'revoke' : 'grant'
    const amount = Math.round(Number(body.amount))
    if (!Number.isFinite(amount) || amount < 1 || amount > 5000) return json({ error: 'Enter between 1 and 5,000 coins.' }, 400)
    const reason = clip(body.reason, 200)
    if (reason.length < 3) return json({ error: 'Add a reason. It’s kept with the change.' }, 400)
    if (!isUuid(body.userId)) return json({ error: 'Pick a teammate.' }, 400)
    const team = await roster(db, body.companyId, st.ownerId)
    const who = team.find(m => m.id === body.userId)
    if (!who) return json({ error: 'That person isn’t on this team.' }, 404)
    if (mode === 'grant' && who.id === caller.userId) return json({ error: 'You can’t give coins to yourself. Another owner or admin can.' }, 403)

    const { data, error } = await db.rpc('powers_award', {
      p_company: body.companyId, p_user: who.id, p_coins: amount, p_xp: 0, p_kind: mode, p_rule: mode,
      p_ref_type: 'user', p_ref_id: who.id, p_idem: null, p_day: todayIn(st.tz), p_cap_coins: null, p_cap_xp: null,
      p_actor: caller.userId, p_reason: reason, p_meta: {},
    })
    if (error) throw error
    const moved = Math.abs(data?.coins || 0)
    await audit(req, db, body.companyId, 'powers_coins_adjusted', `${mode === 'grant' ? 'Gave' : 'Took back'} ${moved} coins ${mode === 'grant' ? 'to' : 'from'} ${who.name}: ${reason}`, { user_id: who.id, coins: data?.coins || 0 })
    if (mode === 'grant') {
      try {
        await db.from('notifications').insert({
          company_id: body.companyId, user_id: who.id, type: 'powers_coins', title: `${caller.name} gave you ${moved} coins`,
          body: reason, message: `${caller.name} gave you ${moved} coins: ${reason}`.slice(0, 300), link: '/admin/powers', is_read: false,
        })
      } catch {}
    }
    return json({ ok: true, coins: data?.coins || 0, balance: data?.balance ?? null })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not change the coins.' }, 500)
  }
}
