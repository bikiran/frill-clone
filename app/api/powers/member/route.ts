import { NextRequest } from 'next/server'
import { powersDb, powersCaller, loadPowers, roster, eligible, walletOf, isUuid, json } from '@/lib/powers/server'
import { ACHIEVEMENTS } from '@/lib/powers/achievements'

export const dynamic = 'force-dynamic'

// GET ?companyId&userId — a teammate's Colvy Powers profile: level, streak
// and badges. Not their coins (that's their business) and nothing about
// customers or their work beyond the badge names.
export async function GET(req: NextRequest) {
  try {
    const db = powersDb()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId'), userId = sp.get('userId')
    const caller = await powersCaller(req, db, companyId)
    if (!caller.ok) return caller.response
    const st = await loadPowers(db, companyId!)
    if (!st.enabled || st.missing) return json({ error: 'Colvy Powers is off for this workspace.' }, 409)
    if (!isUuid(userId)) return json({ error: 'Pick a teammate.' }, 400)
    const team = await roster(db, companyId!, st.ownerId)
    const m = team.find(x => x.id === userId)
    if (!m || !eligible(st, m)) return json({ error: 'Not found.' }, 404)
    const [w, held] = await Promise.all([
      walletOf(db, companyId!, m.id),
      db.from('powers_user_achievements').select('code, earned_at').eq('company_id', companyId).eq('user_id', m.id),
    ])
    const have = new Map<string, string>((held.data || []).map((h: any) => [h.code, h.earned_at]))
    return json({
      id: m.id, name: m.name, avatar: m.avatar, level: w.level, title: w.title, progress: w.progress, xp: w.xp,
      streak: w.streak, bestStreak: w.best_streak,
      badges: ACHIEVEMENTS.filter(a => have.has(a.code)).map(a => ({ code: a.code, name: a.name, icon: a.icon, at: have.get(a.code) })),
    })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not load the profile.' }, 500)
  }
}
