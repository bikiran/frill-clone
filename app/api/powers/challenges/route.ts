import { NextRequest } from 'next/server'
import { powersDb, powersCaller, loadPowers, clip, isUuid, json, MIGRATION_HINT } from '@/lib/powers/server'
import { challengesFor } from '@/lib/powers/challenges'

export const dynamic = 'force-dynamic'

// Challenges.
//   GET    ?companyId                 the active ones, with my (and the team's) progress
//   GET    ?companyId&all=1           every challenge, for Settings (owners and admins)
//   POST   { companyId, title, scope, metric, target, rewardCoins, rewardXp }   add one (admins)
//   PATCH  { companyId, id, active }  pause or resume (admins)
//   DELETE ?companyId&id              remove (admins)

const SCOPES = ['daily', 'weekly', 'team']
const METRICS = ['resolve', 'task', 'job', 'thanks', 'feedback']
const n = (v: any, lo: number, hi: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null }

export async function GET(req: NextRequest) {
  try {
    const db = powersDb()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    const caller = await powersCaller(req, db, companyId)
    if (!caller.ok) return caller.response
    const st = await loadPowers(db, companyId!)
    if (st.missing) return json({ setup: true, error: MIGRATION_HINT }, 503)
    if (sp.get('all') === '1') {
      if (!caller.isAdmin) return json({ error: 'Only owners and admins can manage challenges.' }, 403)
      const { data } = await db.from('powers_challenges').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100)
      return json({ challenges: data || [] })
    }
    if (!st.enabled) return json({ challenges: [] })
    return json({ challenges: await challengesFor(db, companyId!, st, caller.userId) })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not load challenges.' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = powersDb()
    const caller = await powersCaller(req, db, body.companyId)
    if (!caller.ok) return caller.response
    if (!caller.isAdmin) return json({ error: 'Only owners and admins can manage challenges.' }, 403)
    const title = clip(body.title, 80)
    if (title.length < 3) return json({ error: 'Give the challenge a short name.' }, 400)
    if (!SCOPES.includes(body.scope)) return json({ error: 'Pick daily, weekly or team.' }, 400)
    if (!METRICS.includes(body.metric)) return json({ error: 'Pick what counts toward it.' }, 400)
    const target = n(body.target, 1, 10000)
    if (!target) return json({ error: 'Set a target of at least 1.' }, 400)
    const { count } = await db.from('powers_challenges').select('id', { count: 'exact', head: true }).eq('company_id', body.companyId).eq('active', true)
    if ((count || 0) >= 12) return json({ error: 'That’s 12 active challenges. Pause one first; fewer is better.' }, 409)
    const { data, error } = await db.from('powers_challenges').insert({
      company_id: body.companyId, title, scope: body.scope, metric: body.metric, target,
      reward_coins: n(body.rewardCoins, 0, 5000) ?? 50, reward_xp: n(body.rewardXp, 0, 5000) ?? 50, created_by: caller.userId,
    }).select('*').single()
    if (error) throw error
    return json({ challenge: data })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not add the challenge.' }, 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = powersDb()
    const caller = await powersCaller(req, db, body.companyId)
    if (!caller.ok) return caller.response
    if (!caller.isAdmin) return json({ error: 'Only owners and admins can manage challenges.' }, 403)
    if (!isUuid(body.id) || typeof body.active !== 'boolean') return json({ error: 'Nothing to change.' }, 400)
    const { data, error } = await db.from('powers_challenges').update({ active: body.active }).eq('company_id', body.companyId).eq('id', body.id).select('*').maybeSingle()
    if (error) throw error
    if (!data) return json({ error: 'Not found.' }, 404)
    return json({ challenge: data })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not change the challenge.' }, 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = powersDb()
    const sp = req.nextUrl.searchParams
    const caller = await powersCaller(req, db, sp.get('companyId'))
    if (!caller.ok) return caller.response
    if (!caller.isAdmin) return json({ error: 'Only owners and admins can manage challenges.' }, 403)
    if (!isUuid(sp.get('id'))) return json({ error: 'Nothing to remove.' }, 400)
    const { error } = await db.from('powers_challenges').delete().eq('company_id', sp.get('companyId')).eq('id', sp.get('id'))
    if (error) throw error
    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not remove the challenge.' }, 500)
  }
}
