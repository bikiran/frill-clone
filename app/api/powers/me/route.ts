import { NextRequest } from 'next/server'
import { powersDb, powersCaller, loadPowers, roster, eligible, walletOf, todayIn, json, MIGRATION_HINT } from '@/lib/powers/server'
import { liveFor, EMPTY_LIVE } from '@/lib/powers/live'
import { addDays } from '@/lib/booking-time'
import { POWERS, RULES } from '@/lib/powers/config'
import { checkAchievements } from '@/lib/powers/achievements'

export const dynamic = 'force-dynamic'

// GET ?companyId — my Colvy Powers: wallet, level, today's earnings, recent
// activity and what's live right now (pins for me, nudges, crowns…). A
// business that hasn't turned Powers on gets { enabled: false } and nothing
// else, so the rest of the app stays exactly as it was.
export async function GET(req: NextRequest) {
  try {
    const db = powersDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const caller = await powersCaller(req, db, companyId)
    if (!caller.ok) return caller.response
    const st = await loadPowers(db, companyId!)
    if (st.missing) return json({ enabled: false, isAdmin: caller.isAdmin, setup: caller.isAdmin ? MIGRATION_HINT : null })
    if (!st.enabled) return json({ enabled: false, isAdmin: caller.isAdmin })

    const team = await roster(db, companyId!, st.ownerId)
    const me = team.find(m => m.id === caller.userId) || { id: caller.userId, name: caller.name, role: caller.role, locationId: caller.locationId, avatar: null, isOwner: caller.isOwner }
    const names = new Map(team.map(m => [m.id, m.name]))
    const today = todayIn(st.tz)
    const [wallet, todayRows, recent, live] = await Promise.all([
      walletOf(db, companyId!, caller.userId),
      db.from('powers_ledger').select('coins, xp').eq('company_id', companyId).eq('user_id', caller.userId).eq('day', today).eq('kind', 'reward').is('reversed_at', null),
      db.from('powers_ledger').select('id, kind, rule, coins, xp, reason, meta, actor_id, ref_type, created_at').eq('company_id', companyId).eq('user_id', caller.userId).order('created_at', { ascending: false }).limit(20),
      liveFor(db, companyId!, caller.userId, names).catch(() => EMPTY_LIVE),
    ])
    const badges = await checkAchievements(db, companyId!, caller.userId, wallet).catch(() => ({ fresh: [] as string[], list: [] as any[] }))
    // A streak that missed yesterday (and today) is over, unless a Streak Saver covers one day.
    const last = wallet.streak_day as string | null
    const alive = !!last && (last >= addDays(today, -1) || (last === addDays(today, -2) && wallet.savers > 0))
    const sum = (k: 'coins' | 'xp') => (todayRows.data || []).reduce((n: number, r: any) => n + (r[k] || 0), 0)
    const cfg = st.config
    return json({
      enabled: true,
      eligible: eligible(st, me),
      isAdmin: caller.isAdmin,
      me: { id: caller.userId, name: me.name },
      wallet: { coins: wallet.coins, xp: wallet.xp, level: wallet.level, title: wallet.title, from: wallet.from, to: wallet.to, progress: wallet.progress, streak: alive ? wallet.streak : 0, bestStreak: wallet.best_streak, savers: wallet.savers, earned: wallet.earned_coins },
      today: { coins: sum('coins'), xp: sum('xp'), capCoins: cfg.caps.coins, capXp: cfg.caps.xp },
      recent: (recent.data || []).map((r: any) => ({ ...r, actor: r.actor_id ? names.get(r.actor_id) || null : null })),
      live,
      achievements: badges.list, freshAchievements: badges.fresh,
      rules: RULES.filter(r => cfg.rules[r.id].on).map(r => ({ id: r.id, label: r.label, coins: cfg.rules[r.id].coins, xp: cfg.rules[r.id].xp })),
      powers: POWERS.filter(p => cfg.powers[p.id].on).map(p => ({ id: p.id, price: cfg.powers[p.id].price, cooldown: cfg.powers[p.id].cooldown, daily: cfg.powers[p.id].daily })),
      leaderboard: cfg.leaderboard,
      team: team.filter(m => eligible(st, m)).map(m => ({ id: m.id, name: m.name, avatar: m.avatar })),
    })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not load Colvy Powers.' }, 500)
  }
}
