import { NextRequest } from 'next/server'
import { randomInt } from 'crypto'
import { powersDb, powersCaller, loadPowers, roster, eligible, todayIn, clip, isUuid, json } from '@/lib/powers/server'
import { powerDef, COSMETICS } from '@/lib/powers/config'
import { canUseFeature, hasFullAccess } from '@/lib/permissions'
import { zonedToUtc } from '@/lib/booking-time'

export const dynamic = 'force-dynamic'

// POST { companyId, power, target?, conversationId?, note?, emoji?, text?, amount?, key }
// Use a power: the coins come off and it starts, in one step in the database
// (powers_buy), after the business's limits: on or off, price, cooldown,
// daily uses, and how often one teammate can be picked in an hour. `key` is
// the click, so a double click uses it once. Nothing here grants access to
// anything: a Priority Pin only points at a conversation the teammate can
// already open.

const STATUS_MSG: Record<string, string> = {
  short: 'Not enough coins for that yet.',
  cooldown: 'You used that one recently. Try again a bit later.',
  daily_limit: 'That’s today’s limit for this power.',
  target_busy: 'They’ve had a few of these this hour. Give them a breather.',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = powersDb()
    const companyId = body.companyId
    const caller = await powersCaller(req, db, companyId)
    if (!caller.ok) return caller.response
    const st = await loadPowers(db, companyId)
    if (!st.enabled || st.missing) return json({ error: 'Colvy Powers is off for this workspace.' }, 409)
    const def = powerDef(body.power)
    const set = def && st.config.powers[def.id]
    if (!def || !set?.on) return json({ error: 'That power isn’t available here.' }, 404)
    const key = clip(body.key, 80)
    if (key.length < 8) return json({ error: 'Missing click key.' }, 400)

    const team = await roster(db, companyId, st.ownerId)
    const me = team.find(m => m.id === caller.userId)
    if (!eligible(st, me)) return json({ error: 'You’re not taking part in Colvy Powers here.' }, 403)
    const today = todayIn(st.tz)

    // ── Who it's for ──
    let target: string | null = null
    if (def.target === 'teammate') {
      const t = team.find(m => m.id === body.target)
      if (!t || t.id === me!.id || !eligible(st, t)) return json({ error: 'Pick a teammate.' }, 400)
      target = t.id
    }

    // ── What it carries ──
    let ref: string | null = null
    const payload: Record<string, any> = {}
    if (def.id === 'priority_pin') {
      if (!isUuid(body.conversationId)) return json({ error: 'Pick a conversation to pin.' }, 400)
      const { data: conv } = await db.from('conversations').select('id, is_spam').eq('company_id', companyId).eq('id', body.conversationId).maybeSingle()
      if (!conv || conv.is_spam) return json({ error: 'That conversation isn’t in this workspace.' }, 404)
      // Only for someone who can already open the inbox.
      if (!(await canOpenInbox(db, companyId, target!, st.ownerId))) return json({ error: 'They don’t have access to the inbox, so it can’t be pinned for them.' }, 403)
      ref = conv.id
      payload.note = clip(body.note, 120)
    } else if (def.id === 'nudge' || def.id === 'spotlight' || def.id === 'confetti') {
      payload.note = clip(body.note, def.id === 'confetti' ? 80 : 140)
      if (def.id === 'spotlight' && payload.note.length < 3) return json({ error: 'Say what they did.' }, 400)
      if (isUuid(body.conversationId)) ref = body.conversationId
    } else if (def.id === 'custom_status') {
      const emoji = Array.from(String(body.emoji || '').trim()).slice(0, 2).join('')
      const text = clip(body.text, 40)
      if (!emoji && !text) return json({ error: 'Add an emoji or a few words.' }, 400)
      Object.assign(payload, { emoji, text })
    } else if (def.id === 'mystery_box') {
      payload.cosmetic = COSMETICS[randomInt(COSMETICS.length)]
    } else if (def.id === 'streak_saver') {
      const { data: w } = await db.from('powers_wallets').select('savers').eq('company_id', companyId).eq('user_id', me!.id).maybeSingle()
      if ((w?.savers || 0) >= 2) return json({ error: 'You already hold 2 Streak Savers.' }, 409)
    }

    // ── A coin gift is its own move: coins from me to them ──
    if (def.id === 'gift') {
      const amount = Math.round(Number(body.amount))
      if (!Number.isFinite(amount) || amount < 1 || amount > set.price) return json({ error: `Gift between 1 and ${set.price} coins.` }, 400)
      const { data, error } = await db.rpc('powers_gift', {
        p_company: companyId, p_from: me!.id, p_to: target, p_amount: amount, p_note: clip(body.note, 140) || null,
        p_idem: `gift:${key}`, p_day: today, p_daily_max: st.config.caps.gift,
      })
      if (error) throw error
      if (data?.status === 'daily_limit') return json({ error: `That’s more than today’s gift limit. You can gift ${data.left} more today.` }, 429)
      if (data?.status !== 'ok' && data?.status !== 'duplicate') return json({ error: STATUS_MSG[data?.status] || 'Could not send the gift.' }, 409)
      if (data.status === 'ok') await bell(db, companyId, target!, st, 'powers_gift', `${me!.name} sent you ${amount} coins`, clip(body.note, 140))
      return json({ ok: true, power: def.id, balance: data.balance })
    }

    const since = new Date(zonedToUtc(today, '00:00', st.tz)).toISOString()
    const { data, error } = await db.rpc('powers_buy', {
      p_company: companyId, p_user: me!.id, p_power: def.id, p_price: set.price, p_target: target, p_ref: ref,
      p_payload: payload, p_minutes: def.minutes, p_cooldown_min: set.cooldown, p_daily_limit: set.daily, p_since: since,
      p_target_hourly: target ? st.config.caps.targetHourly : 0, p_idem: `use:${key}`, p_day: today,
      p_savers: def.id === 'streak_saver' ? 1 : 0,
    })
    if (error) throw error
    if (data?.status !== 'ok' && data?.status !== 'duplicate') {
      return json({ error: STATUS_MSG[data?.status] || 'Could not use that just now.', status: data?.status, until: data?.until || null, balance: data?.balance }, 409)
    }

    if (data.status === 'ok') {
      if (def.id === 'priority_pin') await bell(db, companyId, target!, st, 'powers_pin', `${me!.name} pinned a conversation for you`, payload.note || 'It’s at the top of your inbox for 30 minutes.', `/admin/inbox?conversation=${ref}`)
      if (def.id === 'nudge') await bell(db, companyId, target!, st, 'powers_nudge', `${me!.name} nudged you`, payload.note || '👋', ref ? `/admin/inbox?conversation=${ref}` : '/admin/powers')
    }
    return json({ ok: true, power: def.id, activation: data.activation, balance: data.balance, cosmetic: payload.cosmetic || null })
  } catch (e: any) {
    return json({ error: e?.message || 'Could not use that power.' }, 500)
  }
}

/** Can this teammate open the inbox already? Owners and admins can; others need the inbox permission. */
async function canOpenInbox(db: any, companyId: string, userId: string, ownerId: string | null) {
  if (userId === ownerId) return true
  const { data } = await db.from('team_members').select('role, status, permissions').eq('company_id', companyId).eq('user_id', userId).limit(5)
  return (data || []).some((r: any) => {
    const role = String(r.role || 'editor').toLowerCase()
    if (role === 'viewer' || String(r.status || '').toLowerCase() === 'removed') return false
    return hasFullAccess(role) || canUseFeature(role as any, r.permissions && typeof r.permissions === 'object' ? r.permissions : null, 'inbox')
  })
}

/** A bell note for a power aimed at someone. Skipped while their Focus Shield is up: playful pings wait, real work doesn't. */
async function bell(db: any, companyId: string, userId: string, st: any, type: string, title: string, body: string, link = '/admin/powers') {
  try {
    const { data: shield } = await db.from('powers_activations').select('id').eq('company_id', companyId).eq('user_id', userId)
      .eq('power', 'focus_shield').gt('ends_at', new Date().toISOString()).is('dismissed_at', null).limit(1)
    if (shield?.length && type !== 'powers_pin') return
    await db.from('notifications').insert({
      company_id: companyId, user_id: userId, type, title: title.slice(0, 200), body: (body || '').slice(0, 300),
      message: `${title}${body ? `: ${body}` : ''}`.slice(0, 300), link, is_read: false,
    })
  } catch {}
}
