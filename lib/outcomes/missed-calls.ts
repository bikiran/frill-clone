// "Missed calls recovered": of the calls nobody answered lately, how many the
// business got back to, and who is still waiting for a call back.
//
// A missed call (or voicemail) counts as recovered when, after it:
//   • the business rang that number (any outbound call to it), or
//   • a later call from that number was answered, or
//   • someone replied in the caller's conversation — a team member, or the AI
//     agent answering the customer's reply to the missed-call text. Automatic
//     messages (metadata.auto, including the missed-call text itself) don't
//     count: they don't answer anyone.
// "Missed" uses callOutcome(), the same rule as the home dashboard and the
// Command Centre. Hidden numbers can't be rung back, and calls from the
// business's own numbers or its team aren't customers, so neither is counted.
//
// Server only. Reads; never writes.

import { callOutcome } from '@/lib/dashboard-time'
import { phoneKey } from '@/lib/phone'
import { businessNumbers } from '@/lib/business-numbers'
import { isWithheldNumber } from '@/lib/missed-call-text-settings'

const DAY = 864e5
// A call still marked as ringing the team is live, not missed — for as long as
// a call can plausibly last (the Command Centre's cap, after which a row whose
// end webhook was lost is stale).
const LIVE_MS = 2 * 3600_000

export type CallToReturn = {
  number: string
  name: string | null
  contactId: string | null
  conversationId: string | null
  callId: string          // their latest missed call
  at: string              // when it was
  attempts: number        // missed calls from them not yet returned
  voicemail: boolean
  textedBack: boolean
}
export type MissedCallOutcome = { missed: number; recovered: number; textedBack: number; toReturn: CallToReturn[] }

export const NO_MISSED_CALLS: MissedCallOutcome = { missed: 0, recovered: 0, textedBack: 0, toReturn: [] }

const ms = (s: any) => Date.parse(s || '') || 0
const lower = (s: any) => String(s || '').toLowerCase()

/** An inbound call nobody answered (missed or voicemail), and no longer ringing. */
export function isMissedInbound(c: any, now: number = Date.now()): boolean {
  if (lower(c?.direction) !== 'inbound') return false
  const o = callOutcome(c)
  if (o !== 'missed' && o !== 'voicemail') return false
  if (lower(c.status) === 'ringing_agents' && !c.ended_at && now - ms(c.created_at) < LIVE_MS) return false
  return true
}

/**
 * Work out the outcome from rows already loaded.
 *   calls    — every call (both directions) since `since`
 *   replies  — messages sent by the business (sender_type 'agent') in the missed
 *              callers' conversations since `since`
 *   contactConvs — each caller contact's conversations, so a reply in another
 *              thread with the same person still counts
 *   ownKeys  — the business's own and team numbers (lib/business-numbers)
 */
export function computeMissedCallOutcome(inp: {
  calls: any[]; replies: any[]; contactConvs?: Record<string, string[]>; ownKeys?: Set<string>; since: number; now: number
}): MissedCallOutcome {
  const { calls, replies, contactConvs = {}, ownKeys = new Set<string>(), since, now } = inp
  const push = (m: Map<string, number[]>, k: string, v: number) => { if (k) (m.get(k) || m.set(k, []).get(k)!).push(v) }

  // When the business got through to (or tried) each number.
  const reached = new Map<string, number[]>()
  for (const c of calls) {
    const dir = lower(c.direction)
    if (dir === 'outbound') push(reached, phoneKey(c.to_number), ms(c.created_at))
    else if (dir === 'inbound' && callOutcome(c) === 'answered') push(reached, phoneKey(c.from_number), ms(c.created_at))
  }
  // When someone replied in each conversation, and which calls were texted back.
  const replied = new Map<string, number[]>()
  const texted = new Set<string>()
  for (const m of replies) {
    const meta = m?.metadata || {}
    if (meta.missed_call_text) { if (meta.call_id) texted.add(String(meta.call_id)); continue }
    if (meta.auto) continue
    push(replied, String(m.conversation_id || ''), ms(m.created_at))
  }
  const later = (arr: number[] | undefined, at: number) => !!arr && arr.some(x => x > at)

  const missed = calls
    .filter(c => isMissedInbound(c, now) && ms(c.created_at) >= since && !isWithheldNumber(c.from_number))
    .filter(c => { const k = phoneKey(c.from_number); return k.length >= 6 && !ownKeys.has(k) })
    .sort((a, b) => ms(a.created_at) - ms(b.created_at))

  let recovered = 0, textedBack = 0
  const open = new Map<string, CallToReturn>()
  for (const c of missed) {
    const at = ms(c.created_at), key = phoneKey(c.from_number)
    const wasTexted = texted.has(String(c.id))
    if (wasTexted) textedBack++
    const convs = [c.conversation_id, ...(c.contact_id ? contactConvs[c.contact_id] || [] : [])].filter(Boolean)
    if (later(reached.get(key), at) || convs.some(id => later(replied.get(id), at))) { recovered++; continue }
    // Still waiting: one entry per caller, carrying their latest missed call.
    const prev = open.get(key)
    open.set(key, {
      number: c.from_number,
      name: c.contact_name || c.caller_name || prev?.name || null,
      contactId: c.contact_id || prev?.contactId || null,
      conversationId: c.conversation_id || prev?.conversationId || null,
      callId: c.id, at: c.created_at,
      attempts: (prev?.attempts || 0) + 1,
      voicemail: callOutcome(c) === 'voicemail' || !!prev?.voicemail,
      textedBack: wasTexted || !!prev?.textedBack,
    })
  }
  const toReturn = Array.from(open.values()).sort((a, b) => ms(b.at) - ms(a.at))
  return { missed: missed.length, recovered, textedBack, toReturn }
}

const uniq = (a: any[]) => Array.from(new Set(a.filter(Boolean))) as string[]

// PostgREST hands back at most 1000 rows a request, so page through.
async function pages(build: () => any, cap = 10000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/** Missed calls since `since` (default: the last 7 days), and which were recovered. */
export async function missedCallOutcome(db: any, companyId: string, opts: { since?: Date; now?: Date } = {}): Promise<MissedCallOutcome> {
  const now = (opts.now || new Date()).getTime()
  const since = opts.since ? opts.since.getTime() : now - 7 * DAY
  const sinceIso = new Date(since).toISOString()

  const calls = await pages(() => db.from('calls')
    .select('id, direction, status, is_voicemail, duration_seconds, from_number, to_number, caller_name, contact_name, contact_id, conversation_id, created_at, ended_at')
    .eq('company_id', companyId).gte('created_at', sinceIso).order('created_at', { ascending: true }))
  const missed = calls.filter(c => isMissedInbound(c, now))
  if (!missed.length) return NO_MISSED_CALLS

  // The callers' other conversations, and the business's own numbers.
  const contactIds = uniq(missed.map(c => c.contact_id))
  const contactConvs: Record<string, string[]> = {}
  const [own] = await Promise.all([
    businessNumbers(db, companyId),
    (async () => {
      for (let i = 0; i < contactIds.length; i += 100) {
        const { data } = await db.from('conversations').select('id, contact_id')
          .eq('company_id', companyId).in('contact_id', contactIds.slice(i, i + 100)).limit(1000)
        for (const r of data || []) (contactConvs[r.contact_id] ||= []).push(r.id)
      }
    })(),
  ])

  // What the business sent in those conversations since the window began.
  const convIds = uniq([...missed.map(c => c.conversation_id), ...Object.values(contactConvs).flat()])
  const replies: any[] = []
  for (let i = 0; i < convIds.length; i += 100) {
    const chunk = convIds.slice(i, i + 100)
    replies.push(...await pages(() => db.from('messages').select('conversation_id, created_at, metadata')
      .in('conversation_id', chunk).eq('sender_type', 'agent').gte('created_at', sinceIso)
      .order('created_at', { ascending: true }), 5000))
  }
  return computeMissedCallOutcome({ calls, replies, contactConvs, ownKeys: own.all, since, now })
}
