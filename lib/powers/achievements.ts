// Colvy Powers achievements: badges for milestones. Looks only: no coins, no
// permissions. Worked out from the reward totals (powers_leaderboard over all
// time) and the wallet, and stored once in powers_user_achievements.

import { levelFor, ALL_FEATURES, type Feature, type Features } from '@/lib/powers/config'

export type Achievement = { code: string; name: string; hint: string; icon: string; needs?: Feature; test: (t: Totals) => boolean }
type Totals = { resolve: number; reply: number; call: number; task: number; job: number; order: number; thanks: number; feedback: number; challenge: number; streak: number; bestStreak: number; xp: number }

export const ACHIEVEMENTS: Achievement[] = [
  { code: 'first_resolve', name: 'First resolve', hint: 'Resolve your first conversation.', icon: '💬', test: t => t.resolve >= 1 },
  { code: 'resolve_50', name: 'Problem solver', hint: 'Resolve 50 conversations.', icon: '🧩', test: t => t.resolve >= 50 },
  { code: 'resolve_250', name: 'Inbox hero', hint: 'Resolve 250 conversations.', icon: '🦸', test: t => t.resolve >= 250 },
  { code: 'reply_250', name: 'Quick to answer', hint: 'Answer 250 customer messages.', icon: '💌', test: t => t.reply >= 250 },
  { code: 'call_50', name: 'On the line', hint: 'Answer 50 customer calls.', icon: '📞', needs: 'calls', test: t => t.call >= 50 },
  { code: 'order_50', name: 'Out the door', hint: 'Fulfil 50 orders.', icon: '📦', needs: 'orders', test: t => t.order >= 50 },
  { code: 'task_25', name: 'Task tamer', hint: 'Complete 25 assigned tasks.', icon: '✅', test: t => t.task >= 25 },
  { code: 'task_100', name: 'Gets things done', hint: 'Complete 100 assigned tasks.', icon: '📋', test: t => t.task >= 100 },
  { code: 'job_10', name: 'On the tools', hint: 'Complete 10 jobs.', icon: '🧰', needs: 'jobs', test: t => t.job >= 10 },
  { code: 'thanked_10', name: 'Team favourite', hint: 'Be thanked by teammates 10 times.', icon: '🙌', test: t => t.thanks >= 10 },
  { code: 'feedback_1', name: 'Customer favourite', hint: 'Get named in a happy review.', icon: '⭐', needs: 'reviews', test: t => t.feedback >= 1 },
  { code: 'challenge_1', name: 'Challenger', hint: 'Finish a challenge.', icon: '🎯', test: t => t.challenge >= 1 },
  { code: 'streak_7', name: 'Week streak', hint: 'Earn something 7 days in a row.', icon: '🔥', test: t => t.bestStreak >= 7 },
  { code: 'streak_30', name: 'Month streak', hint: 'Earn something 30 days in a row.', icon: '🌋', test: t => t.bestStreak >= 30 },
  { code: 'level_5', name: 'Rising Star', hint: 'Reach level 5.', icon: '🌟', test: t => levelFor(t.xp).level >= 5 },
  { code: 'level_10', name: 'Specialist', hint: 'Reach level 10.', icon: '🎓', test: t => levelFor(t.xp).level >= 10 },
  { code: 'level_20', name: 'Champion', hint: 'Reach level 20.', icon: '🏆', test: t => levelFor(t.xp).level >= 20 },
]

const lastCheck = new Map<string, number>()

/**
 * Award any badges this person has newly reached; answers the new ones (for
 * a small celebration) and everything they hold. Checked at most every two
 * minutes per person.
 */
export async function checkAchievements(db: any, companyId: string, userId: string, wallet: { xp: number; streak: number; best_streak: number }, force = false, features: Features = ALL_FEATURES) {
  // Badges for something the business doesn't use aren't offered (one already earned stays).
  const offered = ACHIEVEMENTS.filter(a => !a.needs || features[a.needs] !== false)
  const key = `${companyId}:${userId}`
  const { data: held } = await db.from('powers_user_achievements').select('code, earned_at').eq('company_id', companyId).eq('user_id', userId)
  const have = new Set<string>((held || []).map((h: any) => h.code))
  const fresh: string[] = []
  if (force || Date.now() - (lastCheck.get(key) || 0) > 120_000) {
    lastCheck.set(key, Date.now())
    if (lastCheck.size > 5000) lastCheck.clear()
    const { data: rows } = await db.rpc('powers_leaderboard', { p_company: companyId, p_since: '2000-01-01', p_until: null, p_user: userId })
    const r = rows?.[0] || {}
    const totals: Totals = {
      resolve: Number(r.resolve || 0), reply: Number(r.reply || 0), call: Number(r.call || 0), task: Number(r.task || 0),
      job: Number(r.job || 0), order: Number(r.order || 0), thanks: Number(r.thanks || 0),
      feedback: Number(r.feedback || 0), challenge: Number(r.challenge || 0),
      streak: wallet.streak || 0, bestStreak: Math.max(wallet.best_streak || 0, wallet.streak || 0), xp: wallet.xp || 0,
    }
    const add = offered.filter(a => !have.has(a.code) && a.test(totals)).map(a => a.code)
    if (add.length) {
      const { error } = await db.from('powers_user_achievements').upsert(add.map(code => ({ company_id: companyId, user_id: userId, code })), { onConflict: 'company_id,user_id,code', ignoreDuplicates: true })
      if (!error) { fresh.push(...add); add.forEach(c => have.add(c)) }
    }
  }
  const earned = new Map<string, string>((held || []).map((h: any) => [h.code, h.earned_at]))
  return {
    fresh,
    list: ACHIEVEMENTS.filter(a => offered.includes(a) || have.has(a.code)).map(a => ({ code: a.code, name: a.name, hint: a.hint, icon: a.icon, earned: have.has(a.code), at: earned.get(a.code) || null })),
  }
}
