import { NextRequest } from 'next/server'
import { powersDb, powersCaller, loadPowers, roster, eligible, pay, todayIn, clip, isUuid, json } from '@/lib/powers/server'

export const dynamic = 'force-dynamic'

// POST { companyId, to, note } — say thanks to a teammate. They earn the
// "thanks" reward; you don't. Each person can thank a few teammates a day
// (the business sets how many) and the same teammate once a day.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = powersDb()
    const caller = await powersCaller(req, db, body.companyId)
    if (!caller.ok) return caller.response
    const st = await loadPowers(db, body.companyId)
    if (!st.enabled || st.missing) return json({ error: 'Colvy Powers is off for this workspace.' }, 409)
    if (!st.config.rules.thanks.on) return json({ error: 'Thanks rewards are switched off here.' }, 409)
    if (!isUuid(body.to) || body.to === caller.userId) return json({ error: 'Pick a teammate to thank.' }, 400)
    const note = clip(body.note, 140)
    if (note.length < 3) return json({ error: 'Add a few words about what they did.' }, 400)

    const team = await roster(db, body.companyId, st.ownerId)
    const from = team.find(m => m.id === caller.userId)
    const to = team.find(m => m.id === body.to)
    if (!eligible(st, from) || !eligible(st, to)) return json({ error: 'That teammate isn’t taking part in Colvy Powers.' }, 403)

    const today = todayIn(st.tz)
    const { count } = await db.from('powers_ledger').select('id', { count: 'exact', head: true })
      .eq('company_id', body.companyId).eq('rule', 'thanks').eq('kind', 'reward').eq('actor_id', caller.userId).eq('day', today)
    if ((count || 0) >= st.config.caps.thanks) return json({ error: `You’ve said thanks ${st.config.caps.thanks} times today. Try again tomorrow.` }, 429)

    const r = await pay(db, body.companyId, st, {
      userId: to!.id, rule: 'thanks', refType: 'thanks', refId: caller.userId, idem: `thanks:${caller.userId}:${to!.id}:${today}`,
      actorId: caller.userId, meta: { note, from: from!.name },
    })
    if (r.status === 'duplicate') return json({ error: `You’ve already thanked ${to!.name} today.` }, 409)
    if (r.status !== 'ok' && r.status !== 'capped') return json({ error: 'Could not send that just now.' }, 500)

    // A bell note for them (not a push: thanks can wait).
    try {
      await db.from('notifications').insert({
        company_id: body.companyId, user_id: to!.id, type: 'powers_thanks', title: `${from!.name} says thanks`,
        body: note, message: `${from!.name} says thanks: ${note}`.slice(0, 300), link: '/admin/powers', is_read: false,
      })
    } catch {}
    return json({ ok: true, to: { id: to!.id, name: to!.name }, coins: r.coins, xp: r.xp })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not send thanks.' }, 500)
  }
}
