import { NextRequest } from 'next/server'
import { powersDb, powersCaller, isUuid, json } from '@/lib/powers/server'

export const dynamic = 'force-dynamic'

// POST { companyId, id } — dismiss a power that's in your way: unpin a
// Priority Pin, clear a nudge, end your own Focus Shield or status early.
// Only the person it's aimed at (or who used it on themselves) can. Coins
// aren't refunded; the point is that nothing playful ever blocks real work.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = powersDb()
    const caller = await powersCaller(req, db, body.companyId)
    if (!caller.ok) return caller.response
    if (!isUuid(body.id)) return json({ error: 'Nothing to dismiss.' }, 400)
    const { data: a } = await db.from('powers_activations').select('id, user_id, target_user_id, power, dismissed_at')
      .eq('company_id', body.companyId).eq('id', body.id).maybeSingle()
    if (!a) return json({ error: 'Not found.' }, 404)
    const mine = a.target_user_id ? a.target_user_id === caller.userId : a.user_id === caller.userId
    // Confetti is for the whole team: anyone can clear it from their own screen (nothing to store).
    if (a.power === 'confetti') return json({ ok: true })
    if (!mine) return json({ error: 'Only the person it’s for can dismiss it.' }, 403)
    if (!a.dismissed_at) await db.from('powers_activations').update({ dismissed_at: new Date().toISOString() }).eq('company_id', body.companyId).eq('id', a.id)
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not dismiss it.' }, 500)
  }
}
