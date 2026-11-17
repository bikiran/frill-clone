// Colvy Powers challenges: daily, weekly and team targets a business sets
// ("close 10 conversations today", "the team finishes 40 tasks this week").
// Each reward that's paid counts one toward the matching challenges; the one
// count that reaches the target pays the challenge's reward, once
// (powers_bump_progress decides that inside the database).

import { pay, todayIn, type PowersState } from '@/lib/powers/server'
import { weekKey, type RuleId } from '@/lib/powers/config'

export const periodFor = (scope: string, today: string) => (scope === 'daily' ? today : weekKey(today))

export async function progressChallenges(db: any, companyId: string, st: PowersState, userId: string, rule: RuleId) {
  const { data: list, error } = await db.from('powers_challenges').select('id, title, scope, metric, target, reward_coins, reward_xp')
    .eq('company_id', companyId).eq('active', true).eq('metric', rule).limit(20)
  if (error || !list?.length) return
  const today = todayIn(st.tz)
  for (const ch of list) {
    const period = periodFor(ch.scope, today)
    const reward = (u: string) => pay(db, companyId, st, {
      userId: u, rule: 'challenge', refType: 'challenge', refId: ch.id, idem: `challenge:${ch.id}:${period}:${u}`,
      coins: ch.reward_coins, xp: ch.reward_xp, uncapped: true, meta: { title: ch.title, period },
    })
    if (ch.scope === 'team') {
      // My share (never "done" on its own), then the team's shared count.
      await db.rpc('powers_bump_progress', { p_company: companyId, p_challenge: ch.id, p_user: userId, p_period: period, p_target: 1_000_000 })
      const { data } = await db.rpc('powers_bump_progress', { p_company: companyId, p_challenge: ch.id, p_user: null, p_period: period, p_target: ch.target })
      if (data?.done_now) {
        const { data: helped } = await db.from('powers_challenge_progress').select('user_id').eq('challenge_id', ch.id).eq('period', period).not('user_id', 'is', null)
        for (const h of helped || []) await reward(h.user_id).catch(() => {})
      }
    } else {
      const { data } = await db.rpc('powers_bump_progress', { p_company: companyId, p_challenge: ch.id, p_user: userId, p_period: period, p_target: ch.target })
      if (data?.done_now) await reward(userId)
    }
  }
}

/** The active challenges with this person's (and the team's) progress for the current period. */
export async function challengesFor(db: any, companyId: string, st: PowersState, userId: string) {
  const { data: list } = await db.from('powers_challenges').select('id, title, scope, metric, target, reward_coins, reward_xp, active, created_at')
    .eq('company_id', companyId).eq('active', true).order('created_at', { ascending: true }).limit(30)
  if (!list?.length) return []
  const today = todayIn(st.tz)
  const periods = Array.from(new Set(list.map((c: any) => periodFor(c.scope, today))))
  const { data: rows } = await db.from('powers_challenge_progress').select('challenge_id, user_id, period, progress, completed_at')
    .eq('company_id', companyId).in('challenge_id', list.map((c: any) => c.id)).in('period', periods)
  return list.map((c: any) => {
    const period = periodFor(c.scope, today)
    const mine = (rows || []).find((r: any) => r.challenge_id === c.id && r.period === period && r.user_id === userId)
    const team = (rows || []).find((r: any) => r.challenge_id === c.id && r.period === period && r.user_id == null)
    const row = c.scope === 'team' ? team : mine
    return {
      id: c.id, title: c.title, scope: c.scope, metric: c.metric, target: c.target,
      rewardCoins: c.reward_coins, rewardXp: c.reward_xp, period,
      progress: Math.min(c.target, row?.progress || 0), done: !!row?.completed_at,
      mine: c.scope === 'team' ? (mine?.progress || 0) : undefined,
      ends: endsAt(c.scope, today),
    }
  })
}

/** The local date the period ends on (the day after its last day). */
function endsAt(scope: string, today: string) {
  const d = new Date(today + 'T00:00:00Z')
  if (scope === 'daily') d.setUTCDate(d.getUTCDate() + 1)
  else d.setUTCDate(d.getUTCDate() + (7 - ((d.getUTCDay() + 6) % 7)))
  return d.toISOString().slice(0, 10)
}
