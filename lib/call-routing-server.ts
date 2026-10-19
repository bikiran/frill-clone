// The server side of call routing (lib/call-routing): reading a number's saved
// routing, who can be rung right now, whether forwarding is allowed, what a
// call did (kept on its row), and the phone menu's "text me the details".
// Server only (service-role client). Nothing here throws into a call route:
// every failure falls back to how calls were handled before routing existed.

import { loadStaffRows } from '@/lib/team-list'
import { isStaffRow } from '@/lib/company-access'
import { filterUsersByFeature } from '@/lib/feature-access'
import { toE164, phoneKey } from '@/lib/phone'
import { companyFlagEnabled } from '@/lib/feature-flags'
import { companyHasFeature } from '@/lib/plan'
import { businessNumbers } from '@/lib/business-numbers'
import { isExternalSendBlocked } from '@/lib/demo-guard'
import { resolveAutomatedSmsSender } from '@/lib/sms-consent'
import { textableCaller } from '@/lib/missed-call-text-settings'
import { cleanRouting, fillBusiness, stepLabel, type CallRouting, type StepResult } from '@/lib/call-routing'

type Db = any

/** A table or column that isn't there yet (V399 not run): PostgREST's and Postgres's codes and wording. */
export const isMissing = (e: any) =>
  /^(42P01|42703|PGRST204|PGRST205)$/.test(String(e?.code || '')) || /does not exist|could not find|schema cache/i.test(String(e?.message || ''))

/**
 * The routing saved for this business number, or null (none saved, the table
 * isn't there yet, or it can't be read): then calls ring everyone at once, as
 * before.
 */
export async function getCallRouting(db: Db, companyId: string, number: string): Promise<CallRouting | null> {
  const e164 = toE164(number)
  if (!companyId || !e164) return null
  try {
    const { data, error } = await db.from('call_routing').select('config').eq('company_id', companyId).eq('phone_number', e164).limit(1)
    if (error || !data?.[0]?.config) return null
    const c = cleanRouting(data[0].config)
    return c.strategy === 'simultaneous' ? null : c
  } catch { return null }
}

export type RingTargets = {
  /** Who to ring, in the order the webhook has always rung them. */
  ringUsers: string[]
  /** For Call Diagnostics: fresh heartbeats and devices with a push token. */
  onlineCount: number
  pushCount: number
}

/**
 * Who an incoming call can ring right now. Moved here unchanged from the
 * inbound webhook (see its comments for the history of each rule):
 *   • web/foreground agents with a heartbeat in the last 2 minutes, unless
 *     they've said they're unavailable (on a call, or calls off);
 *   • every staff member (and the owner) with a mobile push token, always,
 *     because Twilio's push wakes a closed app and a stale "busy" from an
 *     OS-killed app must not silence the phone;
 *   • the owner's browser, unless explicitly busy;
 *   • only people allowed calls or chats (Team permissions).
 */
export async function ringTargets(db: Db, companyId: string): Promise<RingTargets> {
  // Who's online? (heartbeat in the last 2 minutes.)
  const cutoff = new Date(Date.now() - 120000).toISOString()
  const { data: online } = await db.from('agent_presence')
    .select('user_id').eq('company_id', companyId)
    .gte('last_seen_at', cutoff).neq('available', false)

  // Mobile agents also, even when the app is closed. Their presence heartbeat
  // only beats while the app is foregrounded and is cleared on close, so a
  // closed/screen-off phone dropped out of `online` and the call went straight
  // to voicemail. But a registered push token means Twilio's own Voice push
  // can wake the app and deliver the invite — so include every agent that has
  // one. Twilio rings all identities at once and cancels the losers.
  //
  // Match on MEMBERSHIP, not on the token's stored company_id. A teammate's
  // push token and Voice-SDK identity (u_<userId>) are per-USER and
  // company-agnostic — one device receives calls for every workspace the user
  // belongs to. But the token row only records the workspace the app was LAST
  // active in, so filtering push_tokens by company_id missed a device whenever
  // the agent was currently in a DIFFERENT workspace: the call for THIS
  // workspace rang nobody and went straight to voicemail. Instead, ring every
  // member of this company (team_members) that holds a push token on any
  // workspace. Staff only: a customer's call never rings a board visitor.
  const members = (await loadStaffRows(db, companyId, 'user_id, role, status').catch(() => []))
    .filter((m: any) => m.user_id && isStaffRow(m))
  // The workspace OWNER (companies.owner_id) is a full member of the company but
  // is NOT necessarily a row in team_members — so selecting mobiles by
  // team_members alone stopped ringing an owner's phone entirely (every call
  // went to voicemail for an owner-only account). Include the owner explicitly.
  const { data: ownerRow } = await db.from('companies')
    .select('owner_id').eq('id', companyId).maybeSingle()
  const memberIds = Array.from(new Set([
    ...((members || []).map((m: any) => m.user_id)),
    ...(ownerRow?.owner_id ? [ownerRow.owner_id] : []),
  ].filter(Boolean))) as string[]
  const { data: mobileTokens } = memberIds.length
    ? await db.from('push_tokens')
        .select('user_id').in('user_id', memberIds).not('user_id', 'is', null)
    : { data: [] as any[] }

  // "Unavailable" = presence explicitly reported available=false (on a call, or
  // calls turned off). This is only reliable for WEB agents, whose tab stays
  // alive to clear it. A MOBILE app can be killed by the OS mid-call (Samsung
  // does this aggressively) and never gets to flip back to available — leaving a
  // stale available=false that would then silence the phone for EVERY future
  // call (straight to voicemail, no ring). So apply this set ONLY to the
  // web/online agents below, never to push-token devices.
  const { data: away } = await db.from('agent_presence')
    .select('user_id').eq('company_id', companyId)
    .gte('last_seen_at', cutoff).eq('available', false)
  const unavailable = new Set<string>(((away || []).map((a: any) => a.user_id)).filter(Boolean))

  const userIds = new Set<string>([
    // Web/foreground agents: honour the explicit "unavailable" flag.
    ...((online || []).map((a: any) => a.user_id)).filter((id: any) => id && !unavailable.has(id)),
    // Mobile devices with a push token: ALWAYS ring. Twilio's push wakes a
    // closed app, and a stale "busy" flag from an OS-killed app must not skip
    // the phone. If the agent really is on a call, the app auto-rejects the
    // second invite, so the call still falls through to voicemail/other agents —
    // no double-ring, but no silent miss either.
    ...((mobileTokens || []).map((t: any) => t.user_id)).filter(Boolean),
  ])
  // Always ring the workspace OWNER's browser Client — the owner is the primary
  // agent and must not be missed just because their presence heartbeat lapsed
  // (a throttled/occluded tab can fall outside the 2-minute window even while
  // it's open and able to ring). Twilio rings their <Client identity>; if the
  // Device isn't actually registered the leg simply no-answers and falls through
  // to voicemail, so this can't cause a phantom ring. Skip only when the owner
  // is explicitly busy (on a call → available:false with a fresh heartbeat).
  if (ownerRow?.owner_id && !unavailable.has(ownerRow.owner_id)) userIds.add(ownerRow.owner_id)

  // Only members allowed calls or chats (Team page permissions) — someone
  // limited to, say, Tasks and Calendar shouldn't have their phone ring.
  // Owners and admins always ring.
  const permitted = await filterUsersByFeature(db, companyId, Array.from(userIds), ['calls', 'inbox'])
  return {
    ringUsers: Array.from(userIds).filter(uid => permitted.has(uid)),
    onlineCount: (online || []).length,
    pushCount: (mobileTokens || []).length,
  }
}

/** Team members who can take calls at all (the owner and staff allowed calls or chats): who a ring order may list. */
export async function callTakers(db: Db, companyId: string): Promise<string[] | null> {
  try {
    const [{ data: co, error }, rows] = await Promise.all([
      db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
      loadStaffRows(db, companyId, 'user_id, role, status'),
    ])
    if (error) return null
    const ids = Array.from(new Set<string>([co?.owner_id || '', ...rows.filter((r: any) => r.user_id && isStaffRow(r)).map((r: any) => String(r.user_id))].filter(Boolean)))
    const ok = await filterUsersByFeature(db, companyId, ids, ['calls', 'inbox'])
    return ids.filter(id => ok.has(id))
  } catch { return null }
}

/** Colvy's switch for forwarding (platform admin → company → Entitlements), default on. */
export const FORWARDING_FLAG = 'call_forwarding'

/**
 * May this business forward calls to outside numbers? Each forwarded minute is
 * an outbound call on Colvy's Twilio account, so it needs a plan with phone
 * channels, and the platform admin can switch it off per company.
 */
export async function forwardingAllowed(db: Db, companyId: string): Promise<boolean> {
  try {
    const [flag, plan] = await Promise.all([companyFlagEnabled(db, companyId, FORWARDING_FLAG), companyHasFeature(db, companyId, 'channels')])
    return flag && plan
  } catch { return false }
}

/** What routing did on a call, kept on calls.routing_state.routing (V285's column) so nothing depends on V399. */
export type RoutingNote = {
  route?: string
  menu?: 'main' | 'ah'
  choice?: { key: string | null; label: string | null; at: string }
  path?: string[]
  forward?: { to: string; step: number; route: string; accepted?: boolean; acceptedSid?: string; seconds?: number }
  texted?: boolean
  voicemailBox?: string
}

export async function readCallRow(db: Db, callRowId: string): Promise<any | null> {
  if (!callRowId) return null
  try {
    const { data } = await db.from('calls').select('*').eq('id', callRowId).maybeSingle()
    return data || null
  } catch { return null }
}

/** Merge into the call's routing note; `path` entries are appended. Returns the new routing_state. Best-effort. */
export async function noteRouting(db: Db, callRowId: string, patch: RoutingNote & { pathAdd?: string }, current?: any): Promise<Record<string, unknown> | null> {
  if (!callRowId) return null
  try {
    const row = current !== undefined ? current : await readCallRow(db, callRowId)
    const state = row?.routing_state && typeof row.routing_state === 'object' ? row.routing_state : {}
    const prev: RoutingNote = state.routing && typeof state.routing === 'object' ? state.routing : {}
    const { pathAdd, ...rest } = patch
    const next: RoutingNote = { ...prev, ...rest, ...(pathAdd ? { path: [...(prev.path || []), pathAdd].slice(-20) } : {}) }
    const routing_state = { ...state, routing: next }
    await db.from('calls').update({ routing_state }).eq('id', callRowId)
    if (row) row.routing_state = routing_state
    // The same trail in words, for the call history (V399 column).
    if (pathAdd) await setRoutingColumns(db, callRowId, { routing_path: (next.path || []).join(' → ') })
    return routing_state
  } catch { return null }
}

/** A ring step has started: add it to the trail, and remember a forward's target (forward-screen and the Dial's callback read it). */
export function noteStep(db: Db, callRowId: string, route: string, step: StepResult, current?: any) {
  return noteRouting(db, callRowId, {
    route, pathAdd: stepLabel(step),
    ...(step.forwardTo ? { forward: { to: step.forwardTo, step: step.index, route } } : {}),
  }, current)
}

/** V399's call columns (ivr_choice, routing_path, forwarded_to, forwarded_seconds, voicemail_box). Their own write, so a missing column never costs the main update. */
export async function setRoutingColumns(db: Db, callRowId: string, patch: Record<string, unknown>): Promise<void> {
  if (!callRowId || !Object.keys(patch).length) return
  try { await db.from('calls').update(patch).eq('id', callRowId) } catch {}
}

export type MenuTextResult = 'sent' | 'not_textable' | 'already' | 'opted_out' | 'no_sms' | 'blocked' | 'failed'

/**
 * The phone menu's "text me": one text to the caller from the business's
 * texting number. The caller asked for it on this call, so it's a
 * transactional reply, but the usual rules still apply: only Australian
 * mobiles (no hidden numbers, landlines, 13/1300/1800 or overseas numbers),
 * never to the business's own lines, not to anyone who opted out (the sender
 * checks: lib/sms-consent assertMayText), once per call, and paid for like any
 * text (allowance, then credit: the metered sender's payForText). Saved in the
 * caller's conversation like any automatic text.
 */
export async function textCallerFromMenu(db: Db, p: { companyId: string; call: any; text: string; businessName: string }): Promise<MenuTextResult> {
  const { companyId, call } = p
  try {
    if (call?.routing_state?.routing?.texted) return 'already'
    const caller = textableCaller(call?.from_number, call?.to_number)
    if ('reason' in caller) return 'not_textable'
    const own = await businessNumbers(db, companyId)
    if (own.lines.has(phoneKey(caller.e164))) return 'not_textable'
    if (await isExternalSendBlocked(companyId, db)) return 'blocked'
    const sender = await resolveAutomatedSmsSender(db, companyId, { contactId: call.contact_id || null })
    if (!sender) return 'no_sms'
    await noteRouting(db, call.id, { texted: true }, call)
    const text = fillBusiness(p.text, p.businessName)
    let sent: { id: string | null } | null = null
    try { sent = await sender.send({ to: caller.e164, text }) } catch (e: any) {
      return e?.name === 'SmsOptOutError' ? 'opted_out' : 'failed'
    }
    if (call.conversation_id) {
      try {
        const nowIso = new Date().toISOString()
        await db.from('messages').insert({
          conversation_id: call.conversation_id, company_id: companyId,
          sender_type: 'agent', sender_name: p.businessName || 'Auto-reply',
          content: text, message_type: 'text', delivery_channel: 'sms', is_read: true,
          telnyx_message_id: sent?.id || null,
          metadata: { auto: true, ivr_text: true, call_id: call.id },
        })
        await db.from('conversations').update({ last_message: text.slice(0, 200), last_message_at: nowIso, updated_at: nowIso }).eq('id', call.conversation_id)
      } catch {}
    }
    return 'sent'
  } catch { return 'failed' }
}
