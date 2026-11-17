// What's going on right now in a business's Colvy Powers: pins waiting in my
// inbox, nudges for me, crowns, statuses and spotlights on people's names,
// confetti, and whether my Focus Shield or an XP boost is on. Read by
// /api/powers/me for the top-bar chip and the inbox.

import { clip } from '@/lib/powers/server'

export type Live = {
  pins: { id: string; conversationId: string; from: string; endsAt: string }[]
  nudges: { id: string; from: string; note: string; at: string }[]
  confetti: { id: string; from: string; note: string; at: string }[]
  crowns: Record<string, string>                      // userId → ends at
  statuses: Record<string, { emoji: string; text: string }>
  spotlight: { id: string; userId: string; name: string; note: string; from: string; endsAt: string } | null
  focusUntil: string | null
  doubleXpUntil: string | null
  teamBoostUntil: string | null
  cosmetics: Record<string, { ring?: string; name?: string }>   // userId → looks from Mystery Boxes
}

export const EMPTY_LIVE: Live = { pins: [], nudges: [], confetti: [], crowns: {}, statuses: {}, spotlight: null, focusUntil: null, doubleXpUntil: null, teamBoostUntil: null, cosmetics: {} }

export async function liveFor(db: any, companyId: string, me: string, names: Map<string, string>): Promise<Live> {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const recent = new Date(now - 15 * 60_000).toISOString()
  const [running, instant, looks] = await Promise.all([
    db.from('powers_activations').select('id, power, user_id, target_user_id, ref_id, payload, ends_at, dismissed_at, created_at')
      .eq('company_id', companyId).gt('ends_at', nowIso).is('dismissed_at', null).order('created_at', { ascending: false }).limit(200),
    db.from('powers_activations').select('id, power, user_id, target_user_id, payload, dismissed_at, created_at')
      .eq('company_id', companyId).in('power', ['nudge', 'confetti']).gt('created_at', recent).is('dismissed_at', null).order('created_at', { ascending: false }).limit(50),
    db.from('powers_activations').select('user_id, payload, created_at').eq('company_id', companyId).eq('power', 'mystery_box').order('created_at', { ascending: true }).limit(500),
  ])
  const live: Live = { ...EMPTY_LIVE, pins: [], nudges: [], confetti: [], crowns: {}, statuses: {}, cosmetics: {} }
  const who = (id: string) => names.get(id) || 'A teammate'
  for (const a of running?.data || []) {
    const p = a.payload || {}
    if (a.power === 'priority_pin' && a.target_user_id === me && a.ref_id) live.pins.push({ id: a.id, conversationId: a.ref_id, from: who(a.user_id), endsAt: a.ends_at })
    else if (a.power === 'vip_crown') live.crowns[a.user_id] = a.ends_at
    else if (a.power === 'custom_status' && !live.statuses[a.user_id]) live.statuses[a.user_id] = { emoji: clip(p.emoji, 8), text: clip(p.text, 40) }
    else if (a.power === 'spotlight' && !live.spotlight && a.target_user_id) live.spotlight = { id: a.id, userId: a.target_user_id, name: who(a.target_user_id), note: clip(p.note, 140), from: who(a.user_id), endsAt: a.ends_at }
    else if (a.power === 'focus_shield' && a.user_id === me) live.focusUntil = a.ends_at
    else if (a.power === 'double_xp' && a.user_id === me) live.doubleXpUntil = a.ends_at
    else if (a.power === 'team_boost') live.teamBoostUntil = a.ends_at
  }
  for (const a of instant?.data || []) {
    const p = a.payload || {}
    if (a.power === 'nudge' && a.target_user_id === me) live.nudges.push({ id: a.id, from: who(a.user_id), note: clip(p.note, 140), at: a.created_at })
    // Confetti is for 2 minutes after it's thrown.
    if (a.power === 'confetti' && now - Date.parse(a.created_at) < 120_000) live.confetti.push({ id: a.id, from: who(a.user_id), note: clip(p.note, 80), at: a.created_at })
  }
  // Mystery Box looks: the latest of each kind wins.
  for (const a of looks?.data || []) {
    const c = a.payload?.cosmetic
    if (!c?.kind || !c?.value) continue
    const cur = live.cosmetics[a.user_id] || {}
    live.cosmetics[a.user_id] = { ...cur, [c.kind]: c.value }
  }
  return live
}
