// Colvy Powers on the server: who's asking, the business's settings, paying
// and taking back rewards, and the checks that decide whether a piece of work
// earns one. Every reward comes from here, after reading the work itself from
// the database (a closed conversation with a real reply, a ticked task you
// were assigned, a completed job, a review that names you); the browser only
// ever says "check my recent work". docs/plans/colvy-powers.md has the plan.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { bearerToken, verifyToken, SUPER_ADMIN, isStaffRow } from '@/lib/company-access'
import { hasFullAccess } from '@/lib/permissions'
import { loadStaffRows } from '@/lib/team-list'
import { dateInTz, isValidTimeZone } from '@/lib/booking-time'
import {
  cleanConfig, canTakePart, levelFor, boostedXp, isMeaningfulReply, isTrivialSelfTask, teammateNamedIn,
  creditReplies, ruleAvailable, ALL_FEATURES, type PowersConfig, type RuleId, type Features,
} from '@/lib/powers/config'
import { jobsEnabled } from '@/lib/modules'

export const powersDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export const MIGRATION_HINT = 'Colvy Powers needs a database update: run migrations/COLVY_V438_COLVY_POWERS.sql in the Supabase SQL editor.'
export const json = (body: any, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export function isMissingPowersSchema(e: any): boolean {
  const m = `${e?.message || ''} ${e?.code || ''} ${e?.details || ''}`
  return /42P01|42883|PGRST205|PGRST202|does not exist|could not find the|schema cache/i.test(m) && /powers/i.test(m)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: any): v is string => typeof v === 'string' && UUID.test(v)
export const clip = (v: any, n: number) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n)

// ── Who's asking ─────────────────────────────────────────────────────────────
export type PowersCaller =
  | { ok: true; userId: string; name: string; role: string; isOwner: boolean; isAdmin: boolean; locationId: string | null; response?: undefined }
  | { ok: false; response: NextResponse; userId?: undefined; name?: undefined; role?: undefined; isOwner?: undefined; isAdmin?: undefined; locationId?: undefined }

const CALLER_TTL = 20_000
const callers = new Map<string, { c: PowersCaller; at: number }>()

/** Signed in, and staff of THIS workspace (owner, admin or team member). */
export async function powersCaller(req: Request, db: any, companyId: any): Promise<PowersCaller> {
  const deny = (status: number, error: string): PowersCaller => ({ ok: false, response: json({ error }, status) })
  if (!isUuid(companyId)) return deny(400, 'A workspace is needed.')
  const token = bearerToken(req as any)
  if (!token) return deny(401, 'Please sign in again.')
  const key = `${token}:${companyId}`
  const hit = callers.get(key)
  if (hit && Date.now() - hit.at < CALLER_TTL) return hit.c
  const user = await verifyToken(db, token).catch(() => null)
  if (!user) return deny(401, 'Please sign in again.')
  const meta = user.user_metadata || {}
  const fallback = String(meta.display_name || meta.full_name || String(user.email || '').split('@')[0] || 'Team')
  let c: PowersCaller
  try {
    const [own, team] = await Promise.all([
      db.from('companies').select('id').eq('id', companyId).eq('owner_id', user.id).maybeSingle(),
      db.from('team_members').select('*').eq('company_id', companyId).eq('user_id', user.id).limit(5),
    ])
    const rows = (team?.data || []).filter(isStaffRow)
    const isOwner = !!own?.data
    const superAdmin = String(user.email || '').toLowerCase() === SUPER_ADMIN
    if (!isOwner && !rows.length && !superAdmin) return deny(403, 'Not authorized for this workspace.')
    const row = rows[0] || {}
    const role = isOwner || superAdmin ? 'owner' : String(row.role || 'editor').toLowerCase()
    c = {
      ok: true, userId: user.id, name: clip(row.name || row.display_name || fallback, 80), role, isOwner: isOwner || superAdmin,
      isAdmin: isOwner || superAdmin || hasFullAccess(role), locationId: isUuid(row.default_location_id) ? row.default_location_id : null,
    }
  } catch {
    return deny(503, 'Colvy couldn’t check your access just now. Please try again.')
  }
  if (callers.size > 500) callers.clear()
  callers.set(key, { c, at: Date.now() })
  return c
}

// ── The business's settings ──────────────────────────────────────────────────
export type PowersState = { missing?: boolean; enabled: boolean; enabledAt: string | null; config: PowersConfig; tz: string; ownerId: string | null; features: Features }
const SETTINGS_TTL = 15_000
const states = new Map<string, { s: PowersState; at: number }>()
export const forgetPowers = (companyId: string) => { states.delete(companyId) }

export async function loadPowers(db: any, companyId: string): Promise<PowersState> {
  const hit = states.get(companyId)
  if (hit && Date.now() - hit.at < SETTINGS_TTL) return hit.s
  const [set, co, features] = await Promise.all([
    db.from('powers_settings').select('enabled, enabled_at, config').eq('company_id', companyId).maybeSingle(),
    db.from('companies').select('owner_id, booking_settings, modules, industry').eq('id', companyId).maybeSingle(),
    featuresOf(db, companyId),
  ])
  const tzRaw = String(co?.data?.booking_settings?.timezone || '')
  const s: PowersState = {
    missing: !!(set?.error && isMissingPowersSchema(set.error)),
    enabled: !!set?.data?.enabled,
    enabledAt: set?.data?.enabled_at || null,
    config: cleanConfig(set?.data?.config),
    tz: tzRaw && isValidTimeZone(tzRaw) ? tzRaw : 'Australia/Melbourne',
    ownerId: co?.data?.owner_id || null,
    features: { ...features, jobs: co?.data ? jobsEnabled(co.data) : true },
  }
  if (states.size > 500) states.clear()
  states.set(companyId, { s, at: Date.now() })
  return s
}

export const todayIn = (tz: string, at = Date.now()) => dateInTz(at, tz)

// What the business has set up. A rule about something it doesn't use (jobs
// without the Jobs module, orders with no store, calls with no Colvy number,
// reviews with no Google profile) isn't shown and never pays. A read that
// fails counts as "set up", so nothing disappears on a hiccup.
async function featuresOf(db: any, companyId: string): Promise<Features> {
  const any = (q: PromiseLike<any>) => Promise.resolve(q).then((r: any) => (r?.error ? null : (r?.data?.length || 0) > 0), () => null)
  const active = (t: string) => any(db.from(t).select('id').eq('company_id', companyId).eq('is_active', true).limit(1))
  const [woo, shopify, prexty, numbers, recentCall, google] = await Promise.all([
    active('woocommerce_integrations'), active('shopify_integrations'), active('prexty_integrations'),
    any(db.from('phone_numbers').select('id').eq('company_id', companyId).neq('status', 'released').limit(1)),
    any(db.from('calls').select('id').eq('company_id', companyId).gt('started_at', new Date(Date.now() - 60 * 864e5).toISOString()).limit(1)),
    any(db.from('google_business_accounts').select('id').eq('company_id', companyId).or('is_active.is.null,is_active.eq.true').limit(1)),
  ])
  const yes = (...v: (boolean | null)[]) => v.some(x => x === true) || v.every(x => x === null)
  return { ...ALL_FEATURES, orders: yes(woo, shopify, prexty), calls: yes(numbers, recentCall), reviews: google !== false }
}

/** On, and about something this business uses. */
export const ruleOn = (st: PowersState, id: RuleId) => !!st.config.rules[id]?.on && ruleAvailable(id, st.features || ALL_FEATURES)

// ── The team ─────────────────────────────────────────────────────────────────
export type Member = { id: string; name: string; role: string; locationId: string | null; avatar: string | null; isOwner: boolean }
const rosters = new Map<string, { m: Member[]; at: number }>()

export async function roster(db: any, companyId: string, ownerId: string | null): Promise<Member[]> {
  const hit = rosters.get(companyId)
  if (hit && Date.now() - hit.at < 60_000) return hit.m
  const out: Member[] = []
  try {
    const rows = await loadStaffRows(db, companyId, 'user_id, name, email, avatar_url, status, role, default_location_id').catch(() => [] as any[])
    for (const r of rows) {
      if (!r.user_id || out.some(m => m.id === r.user_id) || !isStaffRow(r)) continue
      if (['invited', 'pending', 'inactive', 'disabled', 'removed', 'suspended'].includes(String(r.status || '').toLowerCase())) continue
      out.push({ id: r.user_id, name: clip(r.name || String(r.email || '').split('@')[0] || 'Teammate', 60), role: String(r.role || 'editor').toLowerCase(), locationId: isUuid(r.default_location_id) ? r.default_location_id : null, avatar: r.avatar_url || null, isOwner: r.user_id === ownerId })
    }
    if (ownerId && !out.some(m => m.id === ownerId)) {
      let name = 'Owner'
      try {
        const { data } = await (db.auth.admin as any).getUserById(ownerId)
        const meta = data?.user?.user_metadata || {}
        name = clip(meta.display_name || meta.full_name || meta.name || String(data?.user?.email || '').split('@')[0] || 'Owner', 60)
      } catch {}
      out.unshift({ id: ownerId, name, role: 'owner', locationId: null, avatar: null, isOwner: true })
    } else if (ownerId) {
      const o = out.find(m => m.id === ownerId); if (o) o.isOwner = true
    }
  } catch {}
  if (rosters.size > 300) rosters.clear()
  rosters.set(companyId, { m: out, at: Date.now() })
  return out
}

export const eligible = (st: PowersState, m: Member | undefined | null) => !!m && canTakePart(st.config, { role: m.role, locationId: m.locationId, isOwner: m.isOwner })

// ── Paying and taking back ───────────────────────────────────────────────────
export type Paid = { status: string; rule: RuleId; coins: number; xp: number; balance?: number; totalXp?: number; level?: number; title?: string; leveledUp?: boolean; streak?: number; ref?: string }

async function boostsFor(db: any, companyId: string, userId: string) {
  const now = new Date().toISOString()
  const { data } = await db.from('powers_activations').select('power, user_id, dismissed_at')
    .eq('company_id', companyId).in('power', ['double_xp', 'team_boost']).gt('ends_at', now).limit(20)
  const rows = (data || []).filter((a: any) => !a.dismissed_at)
  return { double: rows.some((a: any) => a.power === 'double_xp' && a.user_id === userId), team: rows.some((a: any) => a.power === 'team_boost') }
}

/**
 * Pay a rule's reward once per idempotency key, inside the day's caps. The
 * database does the locking (powers_award); this works out the amounts.
 */
export async function pay(db: any, companyId: string, st: PowersState, o: {
  userId: string; rule: RuleId; refType: string; refId: string; idem: string; meta?: Record<string, any>; coins?: number; xp?: number
  actorId?: string | null; uncapped?: boolean   // uncapped: a challenge's own reward, set by the business
}): Promise<Paid> {
  const rule = st.config.rules[o.rule]
  if (!st.enabled || !ruleOn(st, o.rule)) return { status: 'off', rule: o.rule, coins: 0, xp: 0 }
  // How many times a day this rule pays one person (0 = no limit). The day's
  // coin and XP caps, checked inside the database, stay the hard limit.
  if (rule.max > 0) {
    const { count } = await db.from('powers_ledger').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('user_id', o.userId).eq('rule', o.rule).eq('kind', 'reward').eq('day', todayIn(st.tz)).is('reversed_at', null)
    if ((count || 0) >= rule.max) return { status: 'capped', rule: o.rule, coins: 0, xp: 0, ref: o.refId }
  }
  const coins = o.coins ?? rule.coins
  const boosts = await boostsFor(db, companyId, o.userId).catch(() => ({ double: false, team: false }))
  const xp = boostedXp(o.xp ?? rule.xp, boosts)
  const { data, error } = await db.rpc('powers_award', {
    p_company: companyId, p_user: o.userId, p_coins: coins, p_xp: xp, p_kind: 'reward', p_rule: o.rule,
    p_ref_type: o.refType, p_ref_id: o.refId, p_idem: o.idem, p_day: todayIn(st.tz),
    p_cap_coins: o.uncapped ? null : st.config.caps.coins, p_cap_xp: o.uncapped ? null : st.config.caps.xp, p_actor: o.actorId || null, p_reason: null,
    p_meta: { ...(o.meta || {}), ...(boosts.double || boosts.team ? { boosts } : {}) },
  })
  if (error) throw error
  const r = data || {}
  const out: Paid = { status: r.status, rule: o.rule, coins: r.coins || 0, xp: r.xp || 0, balance: r.balance, totalXp: r.total_xp, streak: r.streak, ref: o.refId }
  if (r.status === 'ok') {
    const after = levelFor(r.total_xp), before = levelFor((r.total_xp || 0) - (r.xp || 0))
    out.level = after.level; out.title = after.title; out.leveledUp = after.level > before.level
    await bumpChallenges(db, companyId, st, o.userId, o.rule).catch(() => {})
  }
  return out
}

/** Take back a reward (its work was undone or deleted). */
export async function takeBack(db: any, companyId: string, st: PowersState, idem: string, reason: string) {
  const { data, error } = await db.rpc('powers_reverse', { p_company: companyId, p_idem: idem, p_reason: reason, p_day: todayIn(st.tz) })
  if (error) throw error
  return data || { status: 'none' }
}

// Challenges count rewards as they're paid (lib/powers/challenges.ts). Loaded
// lazily so the reward path doesn't pull it in when there are none.
async function bumpChallenges(db: any, companyId: string, st: PowersState, userId: string, rule: RuleId) {
  if (rule === 'challenge') return
  const { progressChallenges } = await import('@/lib/powers/challenges')
  await progressChallenges(db, companyId, st, userId, rule)
}

// ── Resolving a conversation ─────────────────────────────────────────────────
// Pays the person who closed it (or, from the background sweep, whoever it's
// assigned to, else the last person who really replied), once per round of
// the customer writing in: the key is the customer's latest message, so
// reopening and closing again pays nothing. A fresh reward also needs a fresh
// real reply, written after the last time this conversation paid.
export async function resolveCheck(db: any, companyId: string, st: PowersState, convId: string, closer: string | null) {
  const { data: conv } = await db.from('conversations').select('*').eq('company_id', companyId).eq('id', convId).maybeSingle()
  if (!conv) return { ok: false as const, why: 'not_found' }
  if (!['closed', 'resolved'].includes(String(conv.status || ''))) return { ok: false as const, why: 'not_closed' }
  if (conv.is_spam || conv.merged_into || conv.is_internal) return { ok: false as const, why: 'not_customer' }
  const [lastIn, lastPaid] = await Promise.all([
    db.from('messages').select('id, created_at').eq('conversation_id', convId).eq('sender_type', 'visitor').order('created_at', { ascending: false }).limit(1),
    db.from('powers_ledger').select('created_at').eq('company_id', companyId).eq('ref_type', 'conversation').eq('ref_id', convId).eq('kind', 'reward').is('reversed_at', null).order('created_at', { ascending: false }).limit(1),
  ])
  const m = lastIn?.data?.[0]
  if (!m) return { ok: false as const, why: 'no_customer_message' }
  const floor = Math.max(Date.parse(lastPaid?.data?.[0]?.created_at || '') || 0, Date.parse(st.enabledAt || '') || 0, Date.now() - 14 * 864e5)
  const { data: replies } = await db.from('messages').select('sender_id, content, is_internal, metadata, created_at')
    .eq('conversation_id', convId).eq('sender_type', 'agent').gt('created_at', new Date(floor).toISOString())
    .order('created_at', { ascending: false }).limit(60)
  const real = (replies || []).filter((r: any) => !r.is_internal && isUuid(r.sender_id) && !r.metadata?.tracking && !r.metadata?.auto && isMeaningfulReply(r.content))
  const repliers = new Set<string>(real.map((r: any) => r.sender_id))
  let who: string | null = null
  if (closer) who = repliers.has(closer) ? closer : null
  else if (conv.assigned_to && repliers.has(conv.assigned_to)) who = conv.assigned_to
  else who = real[0]?.sender_id || null
  if (!who) return { ok: false as const, why: 'no_real_reply' }
  return { ok: true as const, userId: who, idem: `resolve:${convId}:${m.id}` }
}

// ── Tasks ────────────────────────────────────────────────────────────────────
const assigneeIds = (t: any): string[] => {
  const ids: string[] = []
  if (isUuid(t.assigned_to_id)) ids.push(t.assigned_to_id)
  for (const a of Array.isArray(t.assignees) ? t.assignees : []) {
    const id = typeof a === 'string' ? a : a?.id
    if (isUuid(id) && !ids.includes(id)) ids.push(id)
  }
  return ids
}
const isDone = (t: any) => (t.status ? t.status === 'done' : !!t.done)

/** Who a completed task pays (one person per task), or why not. */
export function taskCredit(t: any, st: PowersState, claimer: string | null) {
  if (!isDone(t)) return { ok: false as const, why: 'not_done' }
  const ids = assigneeIds(t)
  if (!ids.length) return { ok: false as const, why: 'unassigned' }
  const done = Date.parse(t.completed_at || '')
  if (st.enabledAt && Number.isFinite(done) && done < Date.parse(st.enabledAt)) return { ok: false as const, why: 'before_enabled' }
  const who = claimer ? (ids.includes(claimer) ? claimer : null) : ids[0]
  if (!who) return { ok: false as const, why: 'not_assignee' }
  if (isTrivialSelfTask(t, who)) return { ok: false as const, why: 'too_quick' }
  return { ok: true as const, userId: who, idem: `task:${t.id}` }
}

const TASK_COLS = 'id, company_id, status, done, completed_at, created_at, created_by_id, assigned_to_id, assignees'

// ── Checking recent work ─────────────────────────────────────────────────────
// The browser asks after closing a conversation or ticking a task ("check my
// recent work"); the cron sweep asks for everyone. Both read the work from the
// database, so nothing here trusts what the browser says happened.

export type Hint = { type?: 'resolve' | 'task'; id?: string } | null

export async function sweepUser(db: any, companyId: string, st: PowersState, me: Member, hint: Hint): Promise<Paid[]> {
  const out: Paid[] = []
  if (!st.enabled || !eligible(st, me)) return out
  const since = new Date(Math.max(Date.now() - 24 * 3600_000, Date.parse(st.enabledAt || '') || 0)).toISOString()

  // Conversations: the one just closed, then any I replied to in the last day that are closed now.
  const convIds: string[] = []
  if (hint?.type === 'resolve' && isUuid(hint.id)) convIds.push(hint.id)
  const { data: mine } = await db.from('messages').select('conversation_id').eq('company_id', companyId)
    .eq('sender_type', 'agent').eq('sender_id', me.id).gt('created_at', since).order('created_at', { ascending: false }).limit(200)
  for (const r of mine || []) if (isUuid(r.conversation_id) && !convIds.includes(r.conversation_id)) convIds.push(r.conversation_id)
  if (convIds.length) {
    const { data: closed } = await db.from('conversations').select('id').eq('company_id', companyId).in('id', convIds.slice(0, 60)).in('status', ['closed', 'resolved'])
    for (const c of closed || []) {
      const v = await resolveCheck(db, companyId, st, c.id, me.id)
      if (!v.ok) continue
      const r = await pay(db, companyId, st, { userId: v.userId, rule: 'resolve', refType: 'conversation', refId: c.id, idem: v.idem })
      if (r.status === 'ok') out.push(r)
    }
  }

  // Tasks: ticked in the last day where I'm assigned. The one I just ticked
  // pays me if I'm any of its assignees; others pay their first assignee.
  const { data: tasks } = await db.from('conversation_tasks').select(TASK_COLS).eq('company_id', companyId).gt('completed_at', since).order('completed_at', { ascending: false }).limit(300)
  for (const t of tasks || []) {
    const claimer = hint?.type === 'task' && hint.id === t.id ? me.id : null
    const v = taskCredit(t, st, claimer)
    if (!v.ok || v.userId !== me.id) continue
    const r = await pay(db, companyId, st, { userId: me.id, rule: 'task', refType: 'task', refId: t.id, idem: v.idem })
    if (r.status === 'ok') out.push(r)
  }

  // Tasks I was paid for that are no longer done (unticked or deleted): take it back.
  out.push(...await reverseUndoneTasks(db, companyId, st, me.id))

  // Replies, calls and orders from the last day.
  const replyConvs = (mine || []).map((r: any) => r.conversation_id).filter(isUuid)
  out.push(...await payReplies(db, companyId, st, Array.from(new Set<string>(replyConvs)).slice(0, 60), Date.parse(since), me.id))
  out.push(...await payCalls(db, companyId, st, since, me.id))
  out.push(...await payOrders(db, companyId, st, since, me.id))
  out.push(...await reverseUndoneOrders(db, companyId, st, me.id))
  return out
}

// ── Replies ──────────────────────────────────────────────────────────────────
// Each customer message is answered once, by whoever sent the first real reply
// after it (lib/powers/config creditReplies). Reads a week of the
// conversations so a reply to an older message still finds it; pays only
// replies from the window. `only` limits it to one person (the in-app check).
async function payReplies(db: any, companyId: string, st: PowersState, convIds: string[], sinceMs: number, only: string | null, byId?: Map<string, Member>): Promise<Paid[]> {
  const out: Paid[] = []
  if (!ruleOn(st, 'reply') || !convIds.length) return out
  // The customer may have written before Powers was on; only replies after
  // it (sinceMs is never earlier than switching on) are paid.
  const week = new Date(Date.now() - 7 * 864e5).toISOString()
  const [{ data: msgs }, { data: convs }] = await Promise.all([
    db.from('messages').select('id, conversation_id, sender_type, sender_id, content, is_internal, metadata, created_at')
      .in('conversation_id', convIds).gt('created_at', week).order('created_at', { ascending: true }).limit(4000),
    db.from('conversations').select('id, is_spam, merged_into').eq('company_id', companyId).in('id', convIds),
  ])
  const real = new Set<string>((convs || []).filter((c: any) => !c.is_spam && !c.merged_into).map((c: any) => c.id))
  for (const c of creditReplies((msgs || []).filter((m: any) => real.has(m.conversation_id)))) {
    if (Date.parse(c.at) <= sinceMs) continue
    if (only && c.userId !== only) continue
    if (byId && !eligible(st, byId.get(c.userId))) continue
    const r = await pay(db, companyId, st, { userId: c.userId, rule: 'reply', refType: 'conversation', refId: c.conversationId, idem: c.idem })
    if (r.status === 'ok') out.push(r)
  }
  return out
}

// ── Calls: an incoming call someone picked up and talked on (20 s or more) ──
async function payCalls(db: any, companyId: string, st: PowersState, since: string, only: string | null, byId?: Map<string, Member>): Promise<Paid[]> {
  const out: Paid[] = []
  if (!ruleOn(st, 'call')) return out
  let q = db.from('calls').select('id, answered_by_user_id, duration_seconds, is_voicemail, direction, started_at')
    .eq('company_id', companyId).eq('direction', 'inbound').gte('duration_seconds', 20).gt('started_at', since).limit(300)
  q = only ? q.eq('answered_by_user_id', only) : q.not('answered_by_user_id', 'is', null)
  const { data: calls } = await q
  for (const c of calls || []) {
    if (c.is_voicemail || Number(c.duration_seconds) < 20 || !isUuid(c.answered_by_user_id)) continue
    if (byId && !eligible(st, byId.get(c.answered_by_user_id))) continue
    const r = await pay(db, companyId, st, { userId: c.answered_by_user_id, rule: 'call', refType: 'call', refId: c.id, idem: `call:${c.id}`, meta: { seconds: c.duration_seconds } })
    if (r.status === 'ok') out.push(r)
  }
  return out
}

// ── Orders: whoever marked it shipped, collected or completed in Colvy ──────
// Orders that arrive already complete from a store or the till have no
// person behind the change, so they pay nobody.
const ORDER_DONE_EVENTS = ['shipped', 'collected', 'delivered', 'status_changed']
const orderDone = (o: any) => o && (o.status === 'shipped' || o.fulfilment_status === 'fulfilled') && !['cancelled', 'refunded'].includes(String(o.status || ''))

async function payOrders(db: any, companyId: string, st: PowersState, since: string, only: string | null, byId?: Map<string, Member>): Promise<Paid[]> {
  const out: Paid[] = []
  if (!ruleOn(st, 'order')) return out
  let q = db.from('order_events').select('order_id, actor_id, type, created_at').eq('company_id', companyId)
    .in('type', ORDER_DONE_EVENTS).gt('created_at', since).order('created_at', { ascending: false }).limit(500)
  if (only) q = q.eq('actor_id', only)
  const { data: mineEv } = await q
  const ids = Array.from(new Set<string>((mineEv || []).map((e: any) => e.order_id).filter(isUuid))).slice(0, 200)
  if (!ids.length) return out
  // Everyone's events on these orders: the last person to move it gets it.
  const [{ data: orders }, { data: evs }] = await Promise.all([
    db.from('orders').select('id, status, fulfilment_status').eq('company_id', companyId).in('id', ids),
    db.from('order_events').select('order_id, actor_id, type, created_at').eq('company_id', companyId).in('order_id', ids).in('type', ORDER_DONE_EVENTS).order('created_at', { ascending: false }).limit(2000),
  ])
  const lastBy = new Map<string, any>()
  for (const e of evs || []) if (isUuid(e.actor_id) && !lastBy.has(e.order_id)) lastBy.set(e.order_id, e)
  for (const o of orders || []) {
    if (!orderDone(o)) continue
    const e = lastBy.get(o.id)
    if (!e || Date.parse(e.created_at) <= Date.parse(since)) continue
    if (only && e.actor_id !== only) continue
    if (byId && !eligible(st, byId.get(e.actor_id))) continue
    const r = await pay(db, companyId, st, { userId: e.actor_id, rule: 'order', refType: 'order', refId: o.id, idem: `order:${o.id}` })
    if (r.status === 'ok') out.push(r)
  }
  return out
}

/** Orders I was paid for that aren't done any more (cancelled, refunded, moved back): take it back. */
async function reverseUndoneOrders(db: any, companyId: string, st: PowersState, userId: string | null): Promise<Paid[]> {
  const out: Paid[] = []
  let q = db.from('powers_ledger').select('ref_id, idem_key').eq('company_id', companyId).eq('kind', 'reward').eq('rule', 'order')
    .is('reversed_at', null).gt('created_at', new Date(Date.now() - 14 * 864e5).toISOString()).limit(300)
  if (userId) q = q.eq('user_id', userId)
  const { data: paid } = await q
  const ids = (paid || []).map((p: any) => p.ref_id).filter(isUuid)
  if (!ids.length) return out
  const { data: orders } = await db.from('orders').select('id, status, fulfilment_status').eq('company_id', companyId).in('id', ids)
  const byId = new Map<string, any>((orders || []).map((o: any) => [o.id, o]))
  for (const p of paid || []) {
    if (orderDone(byId.get(p.ref_id))) continue
    const r = await takeBack(db, companyId, st, p.idem_key, byId.get(p.ref_id) ? 'The order isn’t complete any more.' : 'The order was deleted.')
    if (r.status === 'ok') out.push({ status: 'reversed', rule: 'order', coins: r.coins, xp: r.xp, ref: p.ref_id })
  }
  return out
}

async function reverseUndoneTasks(db: any, companyId: string, st: PowersState, userId: string | null): Promise<Paid[]> {
  const out: Paid[] = []
  let q = db.from('powers_ledger').select('ref_id, idem_key, user_id').eq('company_id', companyId).eq('kind', 'reward').eq('rule', 'task')
    .is('reversed_at', null).gt('created_at', new Date(Date.now() - 14 * 864e5).toISOString()).limit(300)
  if (userId) q = q.eq('user_id', userId)
  const { data: paid } = await q
  const ids = (paid || []).map((p: any) => p.ref_id).filter(isUuid)
  if (!ids.length) return out
  const { data: tasks } = await db.from('conversation_tasks').select('id, status, done').eq('company_id', companyId).in('id', ids)
  const byId = new Map<string, any>((tasks || []).map((t: any) => [t.id, t]))
  for (const p of paid || []) {
    const t = byId.get(p.ref_id)
    if (t && isDone(t)) continue
    const r = await takeBack(db, companyId, st, p.idem_key, t ? 'The task was reopened.' : 'The task was deleted.')
    if (r.status === 'ok') out.push({ status: 'reversed', rule: 'task', coins: r.coins, xp: r.xp, ref: p.ref_id })
  }
  return out
}

/** The background sweep for one business: everyone's recent work, reviews, undone tasks. */
export async function sweepCompany(db: any, companyId: string, st: PowersState) {
  const counts = { resolve: 0, task: 0, feedback: 0, reply: 0, call: 0, order: 0, reversed: 0 }
  if (!st.enabled) return counts
  const team = await roster(db, companyId, st.ownerId)
  const byId = new Map(team.map(m => [m.id, m]))
  const since = new Date(Math.max(Date.now() - 3 * 3600_000, Date.parse(st.enabledAt || '') || 0)).toISOString()

  const { data: events } = await db.from('conversation_events').select('conversation_id').eq('company_id', companyId).eq('event_type', 'closed').gt('created_at', since).limit(300)
  const convIds = Array.from(new Set<string>((events || []).map((e: any) => e.conversation_id).filter(isUuid)))
  for (const id of convIds) {
    const v = await resolveCheck(db, companyId, st, id, null)
    if (!v.ok || !eligible(st, byId.get(v.userId))) continue
    const r = await pay(db, companyId, st, { userId: v.userId, rule: 'resolve', refType: 'conversation', refId: id, idem: v.idem })
    if (r.status === 'ok') counts.resolve++
  }

  const { data: tasks } = await db.from('conversation_tasks').select(TASK_COLS).eq('company_id', companyId).gt('completed_at', since).limit(500)
  for (const t of tasks || []) {
    const v = taskCredit(t, st, null)
    if (!v.ok || !eligible(st, byId.get(v.userId))) continue
    const r = await pay(db, companyId, st, { userId: v.userId, rule: 'task', refType: 'task', refId: t.id, idem: v.idem })
    if (r.status === 'ok') counts.task++
  }
  counts.reversed += (await reverseUndoneTasks(db, companyId, st, null)).length

  // Replies, calls and orders, everyone's.
  const { data: replied } = await db.from('messages').select('conversation_id').eq('company_id', companyId).eq('sender_type', 'agent').gt('created_at', since).limit(1000)
  const replyConvs = Array.from(new Set<string>((replied || []).map((m: any) => m.conversation_id).filter(isUuid))).slice(0, 200)
  counts.reply += (await payReplies(db, companyId, st, replyConvs, Date.parse(since), null, byId)).length
  counts.call += (await payCalls(db, companyId, st, since, null, byId)).length
  counts.order += (await payOrders(db, companyId, st, since, null, byId)).length
  counts.reversed += (await reverseUndoneOrders(db, companyId, st, null)).length

  // Happy reviews that name one teammate.
  if (ruleOn(st, 'feedback')) {
    const rsince = new Date(Math.max(Date.now() - 3 * 864e5, Date.parse(st.enabledAt || '') || 0)).toISOString()
    const { data: reviews } = await db.from('google_reviews').select('id, star_rating, comment, created_at').eq('company_id', companyId).gte('star_rating', 4).gt('created_at', rsince).limit(100)
    for (const rv of reviews || []) {
      const who = teammateNamedIn(rv.comment, team)
      if (!who || !eligible(st, byId.get(who))) continue
      const r = await pay(db, companyId, st, { userId: who, rule: 'feedback', refType: 'review', refId: rv.id, idem: `review:${rv.id}`, meta: { stars: rv.star_rating } })
      if (r.status === 'ok') counts.feedback++
    }
  }
  return counts
}

// ── Jobs (called by the jobs routes when a job moves) ────────────────────────
export async function jobMoved(db: any, companyId: string, job: any, from: string, to: string) {
  try {
    const st = await loadPowers(db, companyId)
    if (!st.enabled || st.missing) return
    const ids = assigneeIds(job)
    if (to === 'completed') {
      const team = await roster(db, companyId, st.ownerId)
      for (const uid of ids) {
        const m = team.find(x => x.id === uid)
        if (!eligible(st, m)) continue
        if (ids.length === 1 && isTrivialSelfTask({ created_by_id: job.created_by, created_at: job.created_at, completed_at: job.completed_at || new Date().toISOString() }, uid)) continue
        await pay(db, companyId, st, { userId: uid, rule: 'job', refType: 'job', refId: job.id, idem: `job:${job.id}:${uid}` })
      }
    } else if (from === 'completed') {
      const { data: paid } = await db.from('powers_ledger').select('idem_key').eq('company_id', companyId).eq('ref_type', 'job').eq('ref_id', job.id).eq('kind', 'reward').is('reversed_at', null)
      for (const p of paid || []) await takeBack(db, companyId, st, p.idem_key, 'The job was reopened.')
    }
  } catch (e: any) {
    console.error('[powers] job reward', e?.message)
  }
}

// ── Reading a wallet ─────────────────────────────────────────────────────────
export async function walletOf(db: any, companyId: string, userId: string) {
  const { data } = await db.from('powers_wallets').select('coins, xp, earned_coins, streak, best_streak, streak_day, savers').eq('company_id', companyId).eq('user_id', userId).maybeSingle()
  const w = data || { coins: 0, xp: 0, earned_coins: 0, streak: 0, best_streak: 0, streak_day: null, savers: 0 }
  return { ...w, ...levelFor(w.xp) }
}
