// Command Centre: the server side (service-role reads behind an access check).
//
// The browser used to read `calls` straight from Supabase and work everything
// out itself: the caller's name only from the row (so an unknown caller showed
// the number twice), the location only from the caller's contact, "Today" in
// the browser's timezone, and every call counted however many rows it had.
// These helpers load calls once, de-duplicated and enriched:
//   • name      — the matching contact's name (by contact id, else by number),
//                 never a phone number standing in for one;
//   • location  — the store whose number was rung (phone_numbers / the store's
//                 phone), else the conversation's outlet, else the contact's;
//   • ai        — what the AI phone agent did, without sending its transcript.
// Plus the board's context (timezone, opening hours, missed calls nobody has
// returned), one call's full story for the drawer, an AI-drafted text back,
// and the AI summary of a period's calls.
//
// Who: the business's staff with the Command Centre or Call Logs permission.

import { requireCompanyAccess } from '@/lib/company-access'
import { canUseFeature, hasFullAccess } from '@/lib/permissions'
import { phoneKey } from '@/lib/phone'
import { missedCallOutcome } from '@/lib/outcomes/missed-calls'
import { loadBusinessHours, hoursOutlook, type BusinessHours } from '@/lib/business-hours'
import { missedCallTextSettings, renderMissedCallText, textableCaller } from '@/lib/missed-call-text-settings'
import { textOptOut } from '@/lib/sms-consent'
import { agentsPaused } from '@/lib/agent/pilot'
import { modelFor, trackAi } from '@/lib/ai-models'
import type { ModelClient } from '@/lib/agent/model'
import {
  normaliseCall, dedupeRows, callerName, looksLikePhone, otherNumber, aggregate, busiestHour, hourLabel, outcomeOf,
  validTz, zonedParts, dayStartOffset, isAiCall, formatPhone,
  type CcCall, type RecoveryItem,
} from '@/lib/command-centre'

type Db = any
const ms = (v: any) => Date.parse(v || '') || 0
const uniq = (a: any[]) => Array.from(new Set(a.filter(Boolean).map(String)))
const chunks = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out }
const clip = (v: any, n: number) => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

// ── Access ───────────────────────────────────────────────────────────────────

/** Staff with the Command Centre or Call Logs permission (owner, admins and the platform admin always). */
export async function requireCallsAccess(req: any, db: Db, companyId: string | null | undefined): Promise<{ ok: boolean; userId?: string }> {
  const a = await requireCompanyAccess(req, db, companyId)
  if (!a.ok || !a.userId || !companyId) return { ok: a.ok, userId: a.userId }
  try {
    const [{ data: co }, { data: rows }] = await Promise.all([
      db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
      db.from('team_members').select('role, status, permissions').eq('company_id', companyId).eq('user_id', a.userId).limit(5),
    ])
    if (co?.owner_id === a.userId) return a
    const row = (rows || []).find((r: any) => String(r.status || '').toLowerCase() !== 'removed')
    if (!row) return a   // the platform admin, who isn't on the team
    const role = String(row.role || 'viewer').toLowerCase()
    if (hasFullAccess(role)) return a
    const perms = row.permissions && typeof row.permissions === 'object' ? row.permissions : null
    return canUseFeature(role, perms, 'command_centre') || canUseFeature(role, perms, 'calls') ? a : { ok: false }
  } catch { return { ok: false } }
}

// ── Loading calls ────────────────────────────────────────────────────────────

// What the AI phone agent did, picked out of routing_state so the transcript
// (every turn of the call) never travels with the list.
const PA_COLS = 'pa_on:routing_state->phone_agent->>greeting, pa_reason:routing_state->phone_agent->setup->>reason, pa_msg:routing_state->phone_agent->>messageTaken, pa_about:routing_state->phone_agent->>messageAbout, pa_texts:routing_state->phone_agent->>textsSent, pa_booking:routing_state->phone_agent->>bookingLinks'
export const CALL_COLS_FULL = `id, direction, status, is_voicemail, duration_seconds, from_number, to_number, caller_name, contact_name, agent_name, answered_by_user_id, answered_at, contact_id, conversation_id, created_at, ended_at, recording_url, sentiment, ai_summary, cause, twilio_call_sid, telnyx_call_control_id, telnyx_call_session_id, ${PA_COLS}`
// Before V177/V249/V310 (no answered_at, answered_by_user_id, twilio_call_sid or routing_state).
export const CALL_COLS_BASIC = 'id, direction, status, is_voicemail, duration_seconds, from_number, to_number, caller_name, contact_name, agent_name, contact_id, conversation_id, created_at, ended_at, recording_url, sentiment, telnyx_call_control_id'
export const MAX_CALLS = 20000

async function pageAll(build: () => any, cap: number): Promise<{ rows: any[]; error: any; truncated: boolean }> {
  const rows: any[] = []
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build().range(from, Math.min(from + 999, cap - 1))
    if (error) return { rows, error, truncated: false }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) return { rows, error: null, truncated: false }
  }
  return { rows, error: null, truncated: rows.length >= cap }
}

/** Raw call rows created in [fromIso, toIso), newest first, de-duplicated. Falls back to the older columns on an older database. */
export async function loadCallRows(db: Db, companyId: string, fromIso: string, toIso: string | null, cap = MAX_CALLS): Promise<{ rows: any[]; truncated: boolean; removed: number }> {
  const run = (cols: string) => pageAll(() => {
    let q = db.from('calls').select(cols).eq('company_id', companyId).gte('created_at', fromIso)
    if (toIso) q = q.lt('created_at', toIso)
    return q.order('created_at', { ascending: false })
  }, cap)
  let r = await run(CALL_COLS_FULL)
  if (r.error) r = await run(CALL_COLS_BASIC)
  if (r.error) throw new Error(r.error.message || 'Couldn’t load calls')
  const d = dedupeRows(r.rows)
  return { rows: d.rows, truncated: r.truncated, removed: d.removed }
}

async function safeRows(q: any): Promise<any[]> {
  try { const { data, error } = await q; return error ? [] : (data || []) } catch { return [] }
}

/** Store id for each of the business's own numbers (phoneKey → location id). */
export async function lineLocations(db: Db, companyId: string): Promise<Map<string, string>> {
  const [nums, locs] = await Promise.all([
    safeRows(db.from('phone_numbers').select('phone_number, location_id').eq('company_id', companyId).limit(200)),
    safeRows(db.from('company_locations').select('id, phone').eq('company_id', companyId).limit(100)),
  ])
  const map = new Map<string, string>()
  for (const l of locs) { const k = phoneKey(l.phone); if (k.length >= 8 && l.id) map.set(k, String(l.id)) }
  for (const n of nums) { const k = phoneKey(n.phone_number); if (k.length >= 8 && n.location_id) map.set(k, String(n.location_id)) }
  return map
}

/** Names and stores for raw rows. Every lookup is best-effort: a missing table or column just leaves the field empty. */
export async function enrichCalls(db: Db, companyId: string, rows: any[], lines?: Map<string, string>): Promise<CcCall[]> {
  if (!rows.length) return []
  const contactIds = uniq(rows.map(r => r.contact_id))
  const convIds = uniq(rows.map(r => r.conversation_id))
  const [contactRows, convRows, lineMap] = await Promise.all([
    Promise.all(chunks(contactIds, 200).map(ids => safeRows(db.from('contacts').select('id, name, location_id').eq('company_id', companyId).in('id', ids)))).then(a => a.flat()),
    Promise.all(chunks(convIds, 200).map(ids => safeRows(db.from('conversations').select('id, location_id, assigned_location_id').eq('company_id', companyId).in('id', ids)))).then(a => a.flat()),
    lines ? Promise.resolve(lines) : lineLocations(db, companyId),
  ])
  const contacts = new Map<string, any>(contactRows.map((c: any) => [String(c.id), c]))
  const convs = new Map<string, any>(convRows.map((c: any) => [String(c.id), c]))

  // Callers with no named contact on the row: look the number up.
  const named = (r: any) => { const c = r.contact_id ? contacts.get(String(r.contact_id)) : null; return !!callerName({ name: c?.name || null, contact_name: r.contact_name, caller_name: r.caller_name }) }
  const tails = uniq(rows.filter(r => !named(r)).map(r => phoneKey(otherNumber(normaliseCall(r)))).filter(k => k.length >= 9))
  const byTail = new Map<string, any>()
  if (tails.length) {
    const found = (await Promise.all(chunks(tails, 200).map(t => safeRows(db.from('contacts').select('id, name, location_id, phone_norm').eq('company_id', companyId).in('phone_norm', t).limit(1000))))).flat()
    for (const c of found) if (c.name && !looksLikePhone(c.name) && !byTail.has(String(c.phone_norm))) byTail.set(String(c.phone_norm), c)
  }

  return rows.map(r => {
    const base = normaliseCall(r)
    const contact = r.contact_id ? contacts.get(String(r.contact_id)) : null
    const match = byTail.get(phoneKey(otherNumber(base)))
    const name = callerName({ name: contact?.name || null, contact_name: r.contact_name, caller_name: r.caller_name }) || (match?.name ?? null)
    const ownLine = base.direction === 'outbound' ? base.from_number : base.to_number
    const conv = r.conversation_id ? convs.get(String(r.conversation_id)) : null
    const location_id = lineMap.get(phoneKey(ownLine)) || conv?.assigned_location_id || conv?.location_id || contact?.location_id || match?.location_id || null
    return { ...base, name, location_id: location_id ? String(location_id) : null, contact_id: base.contact_id || (match?.id ? String(match.id) : null) }
  })
}

export async function companyTimezone(db: Db, companyId: string): Promise<string> {
  try {
    const { data } = await db.from('companies').select('booking_settings').eq('id', companyId).maybeSingle()
    return validTz(data?.booking_settings?.timezone)
  } catch { return validTz(null) }
}

// ── The board's context ──────────────────────────────────────────────────────

/** Opening hours with Google if it answers quickly, else the hours saved in Colvy. */
async function hoursQuick(db: Db, companyId: string, waitMs = 2500): Promise<BusinessHours | null> {
  const local = () => loadBusinessHours(db, companyId, { google: false }).catch(() => null)
  try {
    let timer: any
    const late = new Promise<null>(r => { timer = setTimeout(() => r(null), waitMs) })
    const h = await Promise.race([loadBusinessHours(db, companyId).catch(() => null), late])
    clearTimeout(timer)
    return h && h.places.length ? h : (await local())
  } catch { return local() }
}

export function openAt(h: BusinessHours | null, at: Date): boolean | null {
  if (!h || !h.places.length) return null
  const places = hoursOutlook(h, { at, days: 1 }).places
  if (places.some(p => p.openNow === true)) return true
  if (places.every(p => p.openNow === null)) return null
  return false
}

export type Overview = {
  timezone: string
  openNow: boolean | null
  hoursToday: string | null
  locations: { id: string; name: string }[]
  recovery: { missed: number; recovered: number; textedBack: number; items: RecoveryItem[] }
  missedCallText: { enabled: boolean; when: 'always' | 'after_hours' }
  phoneAgent: { enabled: boolean; mode: string | null }
  aiPaused: boolean
}

export async function loadOverview(db: Db, companyId: string, now: Date = new Date(), deps: { phoneAgent?: (db: Db, id: string) => Promise<any> } = {}): Promise<Overview> {
  const [co, locs, hours, paused, agent] = await Promise.all([
    db.from('companies').select('name, inbox_settings, booking_settings').eq('id', companyId).maybeSingle().then((r: any) => r?.data || null, () => null),
    safeRows(db.from('company_locations').select('id, label, suburb, is_primary').eq('company_id', companyId).order('is_primary', { ascending: false })),
    hoursQuick(db, companyId),
    agentsPaused(db, companyId).catch(() => ({ paused: false })),
    (deps.phoneAgent || (async (d: Db, id: string) => (await import('@/lib/phone-agent')).getPhoneAgent(d, id)))(db, companyId).catch(() => null),
  ])
  const timezone = validTz(co?.booking_settings?.timezone)
  // The last 7 days, as the home dashboard counts them (today and the six before).
  const since = new Date(dayStartOffset(now.getTime(), timezone, 6))
  const outcome = await missedCallOutcome(db, companyId, { since, now }).catch(() => null)
  const items = outcome?.toReturn || []
  // Names: the caller's contact, else a contact with that number.
  const ids = uniq(items.map(i => i.contactId))
  const named = new Map<string, string>()
  for (const ch of chunks(ids, 200)) for (const c of await safeRows(db.from('contacts').select('id, name').eq('company_id', companyId).in('id', ch))) if (c.name && !looksLikePhone(c.name)) named.set(String(c.id), c.name)
  const outlook = hours && hours.places.length ? hoursOutlook(hours, { at: now, days: 1 }) : null
  const todayLines = outlook ? outlook.places.map(p => `${outlook.places.length > 1 ? `${p.store}: ` : ''}${p.days[0]?.hours || 'unknown'}`) : []
  return {
    timezone,
    openNow: openAt(hours, now),
    hoursToday: todayLines.length ? todayLines.join(' · ') : null,
    locations: locs.map((l: any) => ({ id: String(l.id), name: l.label || l.suburb || 'Store' })),
    recovery: {
      missed: outcome?.missed || 0, recovered: outcome?.recovered || 0, textedBack: outcome?.textedBack || 0,
      items: items.slice(0, 100).map(i => ({
        number: i.number, callId: i.callId, at: i.at, attempts: i.attempts, voicemail: i.voicemail, textedBack: i.textedBack,
        contactId: i.contactId, conversationId: i.conversationId,
        name: (i.contactId && named.get(i.contactId)) || callerName({ name: null, contact_name: i.name, caller_name: null }),
        duringOpenHours: openAt(hours, new Date(i.at)),
        textable: textableCaller(i.number, null).ok,
      })),
    },
    missedCallText: (() => { const s = missedCallTextSettings(co?.inbox_settings); return { enabled: s.enabled, when: s.when } })(),
    phoneAgent: { enabled: !!agent?.enabled, mode: agent?.mode || null },
    aiPaused: !!paused?.paused,
  }
}

// ── One call, for the drawer ─────────────────────────────────────────────────

export async function loadCallDetail(db: Db, companyId: string, callId: string, now: Date = new Date()) {
  const { data: raw } = await db.from('calls').select('*').eq('id', callId).eq('company_id', companyId).maybeSingle()
  if (!raw) return null
  const [call] = await enrichCalls(db, companyId, [raw])
  const at = ms(raw.created_at)
  const winFrom = new Date(at - 2 * 60_000).toISOString(), winTo = new Date(at + 24 * 3600_000).toISOString()
  const convId = raw.conversation_id || null
  const contactId = call.contact_id || null
  const key = phoneKey(otherNumber(call))

  const [contact, conv, tasks, waitlist, messages, later] = await Promise.all([
    contactId ? db.from('contacts').select('id, name, phone, email, location_id').eq('id', contactId).eq('company_id', companyId).maybeSingle().then((r: any) => r?.data || null, () => null) : null,
    convId ? db.from('conversations').select('id, subject, channel, status').eq('id', convId).eq('company_id', companyId).maybeSingle().then((r: any) => r?.data || null, () => null) : null,
    convId ? safeRows(db.from('conversation_tasks').select('id, title, text, status, done, priority, due_date, created_at, created_by, source').eq('company_id', companyId).eq('conversation_id', convId).gte('created_at', winFrom).lte('created_at', winTo).order('created_at', { ascending: true }).limit(20)) : [],
    (convId || contactId) ? safeRows((() => {
      let q = db.from('stock_waitlist').select('id, item_name, status, created_at, agent_run_id, added_by, conversation_id, contact_id').eq('company_id', companyId).gte('created_at', winFrom).lte('created_at', winTo)
      q = convId && contactId ? q.or(`conversation_id.eq.${convId},contact_id.eq.${contactId}`) : convId ? q.eq('conversation_id', convId) : q.eq('contact_id', contactId)
      return q.order('created_at', { ascending: true }).limit(20)
    })()) : [],
    convId ? safeRows(db.from('messages').select('id, content, created_at, metadata, sender_type, sender_name, is_internal, delivery_channel').eq('conversation_id', convId).gte('created_at', winFrom).order('created_at', { ascending: true }).limit(80)) : [],
    key.length >= 8 ? safeRows(db.from('calls').select('id, direction, status, is_voicemail, duration_seconds, from_number, to_number, agent_name, answered_by_user_id, answered_at, created_at, ended_at, recording_url').eq('company_id', companyId).gt('created_at', raw.created_at).lte('created_at', new Date(at + 7 * 864e5).toISOString()).order('created_at', { ascending: true }).limit(200)) : [],
  ])

  // What happened after: the automatic text, replies, and calls with this number.
  const follow: { kind: 'auto_text' | 'reply' | 'call_back' | 'called_again'; at: string; label: string; by?: string | null }[] = []
  let aiTranscriptId: string | null = null
  for (const m of messages) {
    const meta = m.metadata || {}
    if (meta.phone_agent && String(meta.call_id || '') === callId) aiTranscriptId = m.id
    if (ms(m.created_at) <= at) continue
    if (meta.missed_call_text && String(meta.call_id || '') === callId) follow.push({ kind: 'auto_text', at: m.created_at, label: 'Automatic missed-call text sent', by: null })
    else if (m.sender_type === 'agent' && !meta.auto && !m.is_internal && !meta.phone_agent) follow.push({ kind: 'reply', at: m.created_at, label: `Replied${m.delivery_channel === 'sms' ? ' by text' : ''}`, by: m.sender_name || null })
  }
  for (const c of later) {
    const n = normaliseCall(c)
    if (n.direction === 'outbound' && phoneKey(n.to_number) === key) follow.push({ kind: 'call_back', at: n.created_at, label: outcomeOf(n, now.getTime()) === 'answered' ? 'Called back and got through' : 'Called back, no answer', by: n.agent_name })
    else if (n.direction === 'inbound' && phoneKey(n.from_number) === key) follow.push({ kind: 'called_again', at: n.created_at, label: outcomeOf(n, now.getTime()) === 'answered' ? 'Called again and was answered' : 'Called again, not answered', by: n.agent_name })
  }
  follow.sort((a, b) => ms(a.at) - ms(b.at))

  const st = raw.routing_state?.phone_agent
  const phoneAgent = st ? {
    reason: st.setup?.reason || null, realtime: !!st.realtime, messageTaken: !!st.messageTaken, about: st.messageAbout || null,
    texts: Number(st.textsSent) || 0, bookingLinks: Number(st.bookingLinks) || 0,
    turns: (Array.isArray(st.turns) ? st.turns : []).slice(0, 80).map((t: any) => ({ who: t.who === 'agent' ? 'agent' : 'caller', text: clip(t.text, 600) })),
    transcriptMessageId: aiTranscriptId,
  } : null

  const textable = call.direction === 'inbound' ? textableCaller(call.from_number, call.to_number) : textableCaller(call.to_number, call.from_number)
  return {
    call,
    hasTranscript: !!(raw.transcription || raw.transcript_en),
    contact, conversation: conv,
    tasks: tasks.map((t: any) => ({ id: t.id, title: t.title || t.text, status: t.status || (t.done ? 'done' : 'todo'), priority: t.priority || null, due: t.due_date || null, at: t.created_at, source: t.source || null, by: t.created_by || null })),
    waitlist: waitlist.map((w: any) => ({ id: w.id, item: w.item_name, status: w.status, at: w.created_at, runId: w.agent_run_id || null, by: w.added_by || null })),
    followUps: follow.slice(0, 20),
    phoneAgent,
    textable: textable.ok,
    textableReason: 'reason' in textable ? textable.reason : null,
  }
}

// ── A text back, drafted (the team approves it) ──────────────────────────────

export type TextBackDraft = {
  ok: true
  text: string
  source: 'ai' | 'template'
  why: string[]
  to: string
  toDisplay: string
  conversationId: string | null
  contactId: string | null
  consent: 'ok' | 'unknown'
  autoTexted: boolean
} | { ok: false; reason: string; message: string }

const SKIP_MSG: Record<string, string> = {
  withheld: 'The caller’s number is hidden, so there’s nothing to text.',
  short_code: 'That isn’t a number that can get texts.',
  international: 'It’s an overseas number. Texts back only go to numbers in your country.',
  not_mobile: 'It’s a landline, so it can’t get texts. Call them back instead.',
  opted_out: 'This customer has opted out of texts (they replied STOP). Call them back instead.',
  not_found: 'Couldn’t find that call.',
}

/** Plain text a phone can send as one or two messages: no quotes around it, no emoji, no sign-off clutter. */
export function cleanSms(v: string, max = 320): string {
  let t = String(v || '').trim().replace(/^["“']+|["”']+$/g, '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?])/g, '$1').trim()
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t
}

export async function draftTextBack(db: Db, companyId: string, callId: string, opts: { model?: ModelClient | null; now?: Date } = {}): Promise<TextBackDraft> {
  const now = opts.now || new Date()
  const { data: raw } = await db.from('calls').select('*').eq('id', callId).eq('company_id', companyId).maybeSingle()
  if (!raw) return { ok: false, reason: 'not_found', message: SKIP_MSG.not_found }
  const call = normaliseCall(raw)
  const theirs = call.direction === 'outbound' ? call.to_number : call.from_number
  const ours = call.direction === 'outbound' ? call.from_number : call.to_number
  const verdict = textableCaller(theirs, ours)
  if ('reason' in verdict) return { ok: false, reason: verdict.reason, message: SKIP_MSG[verdict.reason] }
  const consent = await textOptOut(db, companyId, verdict.e164, call.contact_id)
  if (consent.state === 'opted_out') return { ok: false, reason: 'opted_out', message: SKIP_MSG.opted_out }

  const [{ data: co }, paused, [enriched], autoMsgs, hours] = await Promise.all([
    db.from('companies').select('name, inbox_settings, booking_settings').eq('id', companyId).maybeSingle(),
    agentsPaused(db, companyId).catch(() => ({ paused: false })),
    enrichCalls(db, companyId, [raw]),
    call.conversation_id ? safeRows(db.from('messages').select('metadata, created_at').eq('conversation_id', call.conversation_id).gte('created_at', call.created_at).limit(100)) : Promise.resolve([] as any[]),
    loadBusinessHours(db, companyId, { google: false }).catch(() => null),
  ])
  const business = String(co?.name || '').trim() || 'our team'
  const settings = missedCallTextSettings(co?.inbox_settings)
  const template = renderMissedCallText(settings.message, business)
  const autoTexted = autoMsgs.some((m: any) => m?.metadata?.missed_call_text && String(m.metadata.call_id || '') === callId)
  const tz = validTz(co?.booking_settings?.timezone)
  const name = callerName(enriched)
  const first = name ? name.split(/\s+/)[0] : null
  const outcome = outcomeOf(call, now.getTime())
  const heard = clip(raw.transcript_en || raw.transcription, 1500)
  const about = clip(raw.routing_state?.phone_agent?.messageAbout || raw.ai_summary, 400)
  const when = new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(ms(call.created_at)))
  const open = openAt(hours, now)

  const why: string[] = [
    `${name || formatPhone(theirs)} ${outcome === 'voicemail' ? 'left a voicemail' : outcome === 'missed' ? 'called and nobody answered' : 'called'} on ${when}.`,
    consent.state === 'ok' ? 'They haven’t opted out of texts.' : 'Colvy couldn’t check their text opt-out just now; it’s checked again when you send.',
  ]
  if (autoTexted) why.push('Your automatic missed-call text already went to them for this call.')

  const base = { ok: true as const, to: verdict.e164, toDisplay: formatPhone(verdict.e164), conversationId: call.conversation_id, contactId: enriched.contact_id, consent: consent.state === 'ok' ? 'ok' as const : 'unknown' as const, autoTexted }
  const model = opts.model === undefined ? (process.env.ANTHROPIC_API_KEY ? (await import('@/lib/agent/model')).getModelClient() : null) : opts.model
  if (paused?.paused || !model) {
    why.push(paused?.paused ? 'AI agents are paused, so this is your missed-call message rather than an AI draft.' : 'This is your missed-call message (Settings → Calls & SMS).')
    return { ...base, text: cleanSms(template), source: 'template', why }
  }
  try {
    const facts = [
      `Business: ${business}`,
      `Caller: ${name || 'unknown name'} (${outcome === 'voicemail' ? 'left a voicemail' : 'call was missed'} on ${when})`,
      heard ? `What they said in their voicemail: ${heard}` : null,
      about ? `What the call was about: ${about}` : null,
      open === true ? 'The business is open right now.' : open === false ? 'The business is closed right now.' : null,
      `The business's usual missed-call text, for tone: ${template}`,
    ].filter(Boolean).join('\n')
    const r = await model.generate({
      tier: 'fast', job: 'reply_draft', companyId, maxTokens: 300,
      system: 'You write one SMS from a small Australian business to a customer whose phone call it missed. Plain Australian English, warm and brief, under 300 characters. Use their first name if you have it. If they left a voicemail, show you heard what they asked and say what happens next (you will call back, or ask them to reply here). Never promise prices, stock, times or anything the facts do not say. No emoji, no hashtags, no links, no quotation marks. Reply with the SMS text only.',
      messages: [{ role: 'user', content: [{ type: 'text', text: `${facts}\n\n${first ? `Their first name: ${first}` : 'No name: do not guess one.'}` }] }],
    })
    const text = cleanSms(r.text)
    if (!text || text.length < 12) throw new Error('empty draft')
    why.push(heard ? 'Drafted by AI from their voicemail.' : about ? 'Drafted by AI from the call’s summary.' : 'Drafted by AI from the call details and your missed-call message.')
    return { ...base, text, source: 'ai', why }
  } catch {
    why.push('The AI draft didn’t come through, so this is your missed-call message.')
    return { ...base, text: cleanSms(template), source: 'template', why }
  }
}

// ── The AI summary of a period's calls ───────────────────────────────────────

export type Insights = {
  facts: { label: string; value: string }[]
  headline: string | null
  topics: { name: string; count: number; callIds: string[] }[]
  suggestions: string[]
  based: { summaries: number; calls: number }
  note: string | null
}

const insightsCache = new Map<string, { at: number; v: Insights }>()
const INSIGHTS_TTL = 10 * 60_000

type Ask = (prompt: string, companyId: string) => Promise<string | null>

/** The call_summary job on the AI switchboard (the model Platform admin picked for call summaries). */
const askSwitchboard: Ask = async (prompt, companyId) => {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: await modelFor('call_summary'), max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) return null
  const data = await res.json()
  await trackAi('call_summary', companyId, data)
  return String(data.content?.[0]?.text || '')
}

export async function buildInsights(db: Db, companyId: string, p: { from: number; to: number | null; tz: string; now?: Date; ask?: Ask; fresh?: boolean }): Promise<Insights> {
  const now = (p.now || new Date()).getTime()
  const fromIso = new Date(p.from).toISOString(), toIso = p.to ? new Date(p.to).toISOString() : null
  const { rows } = await loadCallRows(db, companyId, fromIso, toIso, 5000)
  const calls = rows.map(r => normaliseCall(r))
  const st = aggregate(calls, now)
  const busy = busiestHour(calls, p.tz)
  // Who answered most (people only).
  const byAgent = new Map<string, number>()
  for (const c of calls) if (c.direction === 'inbound' && !isAiCall(c) && c.agent_name && outcomeOf(c, now) === 'answered') byAgent.set(c.agent_name, (byAgent.get(c.agent_name) || 0) + 1)
  const top = Array.from(byAgent.entries()).sort((a, b) => b[1] - a[1])[0]
  // Unanswered by hour: where the misses bunch up.
  const missByHour = Array.from({ length: 24 }, () => 0)
  for (const c of calls) if (c.direction === 'inbound') { const o = outcomeOf(c, now); if (o === 'missed' || o === 'voicemail') missByHour[zonedParts(ms(c.created_at), p.tz).h]++ }
  const worst = missByHour.reduce((b, n, i) => (n > (missByHour[b] || 0) ? i : b), 0)

  const facts: Insights['facts'] = [
    { label: 'Calls', value: `${st.total} (${st.inbound} in, ${st.outbound} out)` },
    { label: 'Answered', value: st.inboundDone ? `${st.answered} of ${st.inboundDone} incoming (${100 - st.missRate}%)` : 'No incoming calls' },
  ]
  if (busy) facts.push({ label: 'Busiest hour', value: `${hourLabel(busy.hour)} to ${hourLabel((busy.hour + 1) % 24)} · ${busy.count} call${busy.count === 1 ? '' : 's'}` })
  if (missByHour[worst] > 0) facts.push({ label: 'Most missed', value: `${hourLabel(worst)} to ${hourLabel((worst + 1) % 24)} · ${missByHour[worst]} unanswered` })
  if (top) facts.push({ label: 'Answered the most', value: `${top[0]} · ${top[1]}` })
  if (st.ai.calls) facts.push({ label: 'AI phone agent', value: `${st.ai.calls} call${st.ai.calls === 1 ? '' : 's'}: ${st.ai.handled} handled, ${st.ai.messages} message${st.ai.messages === 1 ? '' : 's'} taken${st.ai.bookingLinks ? `, ${st.ai.bookingLinks} booking link${st.ai.bookingLinks === 1 ? '' : 's'} sent` : ''}` })

  // What each call was about: its summary, the AI agent's message, or the voicemail.
  const about = rows.map(r => ({ id: String(r.id), text: clip(r.ai_summary || r.pa_about || r.routing_state?.phone_agent?.messageAbout || '', 220) })).filter(x => x.text).slice(0, 250)
  const empty = { facts, headline: null, topics: [], suggestions: [], based: { summaries: about.length, calls: calls.length } }
  if (!about.length) return { ...empty, note: calls.length ? 'None of these calls has a summary yet. Summaries come from recorded calls, voicemails and the AI phone agent.' : 'No calls in this period.' }

  const lastAt = rows[0]?.created_at || ''
  const ck = `${companyId}:${p.from}:${p.to || 'open'}:${about.length}:${lastAt}`
  const hit = insightsCache.get(ck)
  if (!p.fresh && hit && now - hit.at < INSIGHTS_TTL) return { ...hit.v, facts }

  const ask = p.ask || askSwitchboard
  let out: Insights = { ...empty, note: 'AI summaries aren’t set up, so only the numbers are shown.' }
  try {
    const prompt = `These are short summaries of phone calls to a small Australian business. Group them into the main reasons people called (at most 8 topics, each a few plain words like "Stock questions" or "Order status"), count the calls in each, and write one headline sentence about the period. Add up to 3 short practical suggestions for the team, only if the calls clearly point to them. Plain Australian English, no emoji.\n\nRespond ONLY with JSON: {"headline":"...","topics":[{"name":"...","ids":["call id", ...]}],"suggestions":["..."]}\n\nCalls:\n${about.map(a => `[${a.id}] ${a.text}`).join('\n')}`
    const text = await ask(prompt, companyId)
    if (text) {
      const parsed = JSON.parse(String(text).replace(/```json|```/g, '').trim())
      const valid = new Set(about.map(a => a.id))
      const topics = (Array.isArray(parsed.topics) ? parsed.topics : []).map((t: any) => {
        const ids = uniq((Array.isArray(t?.ids) ? t.ids : []).map((x: any) => String(x))).filter(id => valid.has(id))
        return { name: clip(t?.name, 48), count: ids.length, callIds: ids }
      }).filter((t: any) => t.name && t.count > 0).sort((a: any, b: any) => b.count - a.count).slice(0, 8)
      out = {
        ...empty, note: null,
        headline: parsed.headline ? cleanSms(String(parsed.headline), 240) : null,
        topics,
        suggestions: (Array.isArray(parsed.suggestions) ? parsed.suggestions : []).map((x: any) => cleanSms(String(x), 200)).filter(Boolean).slice(0, 3),
      }
      insightsCache.set(ck, { at: now, v: out })
      if (insightsCache.size > 200) insightsCache.delete(insightsCache.keys().next().value as string)
    }
  } catch {
    out = { ...empty, note: 'The AI summary didn’t come through this time. The numbers above are up to date.' }
  }
  return out
}

/** The period's bounds from query values (epoch ms), checked. */
export function parseWindow(fromRaw: any, toRaw: any, now: number = Date.now()): { from: number; to: number | null } | null {
  const from = Number(fromRaw)
  if (!Number.isFinite(from) || from < 0 || from > now + 864e5) return null
  const to = toRaw == null || toRaw === '' || toRaw === 'open' ? null : Number(toRaw)
  if (to !== null && (!Number.isFinite(to) || to <= from)) return null
  return { from, to }
}

