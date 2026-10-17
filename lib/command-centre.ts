// Command Centre: the rules behind the numbers (browser + server + tests).
//
// One place decides what a call counts as, so the KPI cards, the call log, the
// live board, Insights and the AI summary can never disagree:
//
//   • Answered   an incoming call a person (or the AI phone agent) picked up.
//   • Voicemail  an incoming call nobody answered where the caller left a
//                message (there's a recording, or the provider said so).
//   • Missed     an incoming call nobody answered and no message was left:
//                it rang out, was declined, or the caller hung up during the
//                voicemail greeting. A missed status always wins over talk time
//                (a Telnyx caller leg answered only to play the greeting has a
//                duration, but nobody spoke to them).
//   • Live       still ringing or in progress (capped at two hours, so a call
//                whose end webhook was lost doesn't stay "live" for ever).
//
// Outgoing calls are never missed calls: one the customer didn't pick up is
// "No answer". So the miss rate is (missed + voicemail) ÷ incoming calls that
// have finished, which is what a customer experiences as "nobody answered".
//
// Pure functions only: no database, no React. "Today" and every hour bucket are
// in the business's timezone (companies.booking_settings.timezone), never the
// browser's or UTC.

export const AI_AGENT_NAME = 'AI phone agent'
export const DEFAULT_TZ = 'Australia/Melbourne'
export const MAX_LIVE_MS = 2 * 3600_000
// A Twilio caller who hangs up during the voicemail greeting leaves the row at
// "voicemail_greeting" with no recording. After this long with no recording it
// was a hang-up, not a message still uploading.
export const VOICEMAIL_SETTLE_MS = 5 * 60_000

export type Outcome = 'answered' | 'voicemail' | 'missed' | 'live'
export type AiOutcome = 'ai_message' | 'ai_handled' | 'ai_voicemail' | 'ai_missed'

export type AiCallInfo = {
  reason: string | null      // why the AI answered: test | after_hours | no_answer | always
  messageTaken: boolean      // took a message (a call-back task was made)
  about: string | null       // what the message was about
  texts: number              // texts sent to the caller during the call
  bookingLinks: number       // booking links texted
  test: boolean
}

export type CcCall = {
  id: string
  direction: 'inbound' | 'outbound'
  status: string
  is_voicemail: boolean
  duration_seconds: number
  from_number: string | null
  to_number: string | null
  caller_name: string | null
  contact_name: string | null
  agent_name: string | null
  answered_by_user_id: string | null
  answered_at: string | null
  contact_id: string | null
  conversation_id: string | null
  created_at: string
  ended_at: string | null
  has_recording: boolean
  sentiment: string | null
  ai_summary: string | null
  cause: string | null
  // Worked out on the server.
  name: string | null          // the caller's name, never a phone number
  location_id: string | null
  ai: AiCallInfo | null
  pkey?: string | null         // provider call id, so a duplicate row is recognised (see dedupeRows)
}

const s = (v: any): string | null => (v == null || v === '' ? null : String(v))
const lower = (v: any) => String(v ?? '').toLowerCase()
const ms = (v: any) => Date.parse(v || '') || 0
const digits = (v: any) => String(v ?? '').replace(/\D/g, '')

// ── Reading a row ────────────────────────────────────────────────────────────

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const truthy = (v: any) => v === true || v === 'true'

/** The AI phone agent's part in a call: from routing_state.phone_agent, or the pa_* columns the server selects instead (so the transcript isn't sent). */
export function aiInfoOf(raw: any): AiCallInfo | null {
  const st = raw?.routing_state?.phone_agent
  if (st && typeof st === 'object') {
    const reason = s(st.setup?.reason) || null
    return {
      reason, messageTaken: !!st.messageTaken, about: s(st.messageAbout), texts: num(st.textsSent),
      bookingLinks: num(st.bookingLinks), test: reason === 'test',
    }
  }
  if (raw && ('pa_reason' in raw || 'pa_msg' in raw || 'pa_on' in raw) && (raw.pa_on != null || raw.pa_reason != null || raw.pa_msg != null)) {
    const reason = s(raw.pa_reason)
    return { reason, messageTaken: truthy(raw.pa_msg), about: s(raw.pa_about), texts: num(raw.pa_texts), bookingLinks: num(raw.pa_booking), test: reason === 'test' }
  }
  if (raw?.agent_name === AI_AGENT_NAME || /^phone_agent:/.test(String(raw?.cause || ''))) {
    return { reason: null, messageTaken: false, about: null, texts: 0, bookingLinks: 0, test: false }
  }
  return null
}

/** A calls row (any shape the server or a realtime event hands over) as the Command Centre reads it. Keeps enrichment already worked out. */
export function normaliseCall(raw: any, keep?: Partial<CcCall> | null): CcCall {
  const dir = lower(raw?.direction).startsWith('out') ? 'outbound' : 'inbound'
  return {
    id: String(raw?.id || ''),
    direction: dir,
    status: lower(raw?.status),
    is_voicemail: !!raw?.is_voicemail,
    duration_seconds: Math.max(0, Math.round(num(raw?.duration_seconds))),
    from_number: s(raw?.from_number),
    to_number: s(raw?.to_number),
    caller_name: s(raw?.caller_name),
    contact_name: s(raw?.contact_name),
    agent_name: s(raw?.agent_name),
    answered_by_user_id: s(raw?.answered_by_user_id),
    answered_at: s(raw?.answered_at),
    contact_id: s(raw?.contact_id),
    conversation_id: s(raw?.conversation_id),
    created_at: String(raw?.created_at || new Date(0).toISOString()),
    ended_at: s(raw?.ended_at),
    has_recording: !!(raw?.has_recording ?? raw?.recording_url),
    sentiment: s(raw?.sentiment),
    ai_summary: raw?.ai_summary != null ? String(raw.ai_summary).slice(0, 400) : (keep?.ai_summary ?? null),
    cause: s(raw?.cause),
    name: raw?.name !== undefined ? s(raw.name) : (keep?.name ?? null),
    location_id: raw?.location_id !== undefined ? s(raw.location_id) : (keep?.location_id ?? null),
    ai: aiInfoOf(raw) ?? keep?.ai ?? null,
    pkey: providerKey(raw) ?? raw?.pkey ?? keep?.pkey ?? null,
  }
}

// ── What a call counts as ────────────────────────────────────────────────────

const UNANSWERED = new Set(['missed', 'no_answer', 'no-answer', 'busy', 'failed', 'canceled', 'cancelled', 'rejected'])
const LIVE_STATES = new Set(['initiated', 'queued', 'ringing', 'in_progress', 'in-progress', 'ringing_agents', 'dialing_agent', 'dialing_customer', 'voicemail_greeting', 'recording_voicemail'])

type OutcomeRow = Pick<CcCall, 'direction' | 'status' | 'is_voicemail' | 'duration_seconds' | 'answered_at' | 'answered_by_user_id' | 'created_at' | 'ended_at' | 'has_recording'> & { ai?: AiCallInfo | null }

export function outcomeOf(c: OutcomeRow, now: number = Date.now()): Outcome {
  const st = lower(c.status)
  const created = ms(c.created_at)
  const age = now - created
  const vmish = c.is_voicemail || st.startsWith('voicemail') || st === 'recording_voicemail'
  // A message was left: the recording is in, or the provider marked it done.
  const messageLeft = st === 'voicemail' || c.has_recording || (c.is_voicemail && st === 'completed')
  // answered_at: an agent (or the AI receptionist) was connected. On an
  // outgoing row answered_by_user_id is who placed the call, not an answer.
  // Checked before the voicemail state, so a call the AI answered stays
  // answered whether or not the sweep has tidied its row since: only a
  // voicemail actually left afterwards (and no message the AI took) makes it
  // a voicemail to return.
  if (c.answered_at || (c.direction !== 'outbound' && c.answered_by_user_id)) {
    return vmish && messageLeft && !c.ai?.messageTaken ? 'voicemail' : 'answered'
  }
  if (vmish) {
    if (messageLeft) return 'voicemail'
    // Still on the greeting or recording (a row with no start time is never "fresh").
    if (!c.ended_at && created > 0 && age < VOICEMAIL_SETTLE_MS) return 'live'
    // Hung up during the greeting: no message, so it's a missed call.
    return 'missed'
  }
  if (UNANSWERED.has(st)) return 'missed'
  if (st === 'answered' || st === 'completed' || (c.duration_seconds || 0) > 0) return 'answered'
  if (LIVE_STATES.has(st) && !c.ended_at && age < MAX_LIVE_MS) return 'live'
  return 'missed'
}

export const isAiCall = (c: Pick<CcCall, 'ai' | 'agent_name'>) => !!c.ai || c.agent_name === AI_AGENT_NAME

export function aiOutcomeOf(c: CcCall, now: number = Date.now()): AiOutcome | null {
  if (c.direction !== 'inbound' || !isAiCall(c)) return null
  const o = outcomeOf(c, now)
  if (o === 'voicemail') return 'ai_voicemail'
  if (o === 'missed') return 'ai_missed'
  if (o === 'live') return null
  return c.ai?.messageTaken ? 'ai_message' : 'ai_handled'
}

export const AI_OUTCOME_LABEL: Record<AiOutcome, string> = {
  ai_message: 'AI took a message', ai_handled: 'Handled by AI', ai_voicemail: 'AI passed to voicemail', ai_missed: 'Hung up on AI',
}

/** The label the call log shows. */
export function outcomeLabel(c: CcCall, now: number = Date.now()): { key: Outcome | 'no_answer' | 'connected'; label: string } {
  const o = outcomeOf(c, now)
  if (c.direction === 'outbound') {
    if (o === 'answered') return { key: 'connected', label: 'Connected' }
    if (o === 'live') return { key: 'live', label: 'Live' }
    return { key: 'no_answer', label: 'No answer' }
  }
  return { key: o, label: o === 'answered' ? 'Answered' : o === 'voicemail' ? 'Voicemail' : o === 'live' ? 'Live' : 'Missed' }
}

// ── Duplicate rows ───────────────────────────────────────────────────────────
//
// One phone call is one row by design, but a provider retrying a webhook (or two
// arriving at once) can insert the same call twice. Rows sharing a provider
// call id are one call: the most complete row wins (answered over voicemail
// over missed over live), so a duplicate never counts a call twice.

const RANK: Record<Outcome, number> = { answered: 3, voicemail: 2, missed: 1, live: 0 }

export function providerKey(raw: any): string | null {
  const k = raw?.twilio_call_sid || raw?.telnyx_call_control_id || raw?.telnyx_call_session_id
  return k ? `${lower(raw?.direction).startsWith('out') ? 'o' : 'i'}:${k}` : null
}

export function dedupeRows<T extends Record<string, any>>(rows: T[], now: number = Date.now()): { rows: T[]; removed: number } {
  const best = new Map<string, T>()
  const out: T[] = []
  let removed = 0
  for (const r of rows) {
    const k = providerKey(r)
    if (!k) { out.push(r); continue }
    const prev = best.get(k)
    if (!prev) { best.set(k, r); continue }
    removed++
    const a = RANK[outcomeOf(normaliseCall(prev), now)], b = RANK[outcomeOf(normaliseCall(r), now)]
    if (b > a || (b === a && num(r.duration_seconds) > num(prev.duration_seconds))) best.set(k, r)
  }
  const merged = [...out, ...best.values()]
  merged.sort((x, y) => ms(y.created_at) - ms(x.created_at))
  return { rows: merged, removed }
}

// ── Names and numbers ────────────────────────────────────────────────────────

/** "+61 412 345 678", "0412345678", "(03) 9123 4567": a phone number, not a name. */
export function looksLikePhone(v: string | null | undefined): boolean {
  const t = String(v || '').trim()
  if (!t) return false
  return /^[+\d\s().-]+$/.test(t) && digits(t).length >= 6
}

export function isPrivateNumber(raw: string | null | undefined): boolean {
  const t = String(raw || '').trim()
  return !t || /[a-z]/i.test(t) || digits(t).length < 3
}

/** An Australian number written the way Australians write it; anything else as given. */
export function formatPhone(raw: string | null | undefined): string {
  if (isPrivateNumber(raw)) return 'Private number'
  const t = String(raw).trim()
  let d = digits(t)
  let national: string | null = null
  if (t.startsWith('+')) { if (d.startsWith('61')) national = d.slice(2) }
  else if (d.startsWith('61') && d.length === 11) national = d.slice(2)
  else if (d.startsWith('0') && d.length === 10) national = d.slice(1)
  else if (d.length === 9 && /^[2378]|^4/.test(d)) national = d
  else if (/^1[38]00\d{6}$/.test(d) || /^13\d{4}$/.test(d)) national = d
  if (national == null) return t.startsWith('+') ? `+${d}` : t
  d = national
  if (/^4\d{8}$/.test(d)) return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  if (/^[2378]\d{8}$/.test(d)) return `(0${d[0]}) ${d.slice(1, 5)} ${d.slice(5)}`
  if (/^1[38]00\d{6}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  if (/^13\d{4}$/.test(d)) return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4)}`
  return `+61 ${d}`
}

/** The other party's number: who rang in, or who we rang. */
export const otherNumber = (c: Pick<CcCall, 'direction' | 'from_number' | 'to_number'>) => (c.direction === 'outbound' ? c.to_number : c.from_number)

/** The best real name we have for the caller: never a number standing in for one. */
export function callerName(c: Pick<CcCall, 'name' | 'contact_name' | 'caller_name'>): string | null {
  for (const n of [c.name, c.contact_name, c.caller_name]) {
    const t = String(n || '').trim()
    if (t && !looksLikePhone(t) && !/^(unknown|anonymous|restricted|private)$/i.test(t)) return t
  }
  return null
}

/** Two lines for a call row: a name and its number, or the number once and "Unknown caller". */
export function callerDisplay(c: CcCall, locationName?: string | null): { title: string; subtitle: string; known: boolean } {
  const name = callerName(c)
  const number = formatPhone(otherNumber(c))
  if (name) return { title: name, subtitle: number, known: true }
  const who = c.direction === 'outbound' ? 'Not in contacts' : 'Unknown caller'
  return { title: number, subtitle: locationName ? `${who} · ${locationName}` : who, known: false }
}

// ── Time, in the business's timezone ─────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>()
export function validTz(tz: string | null | undefined): string {
  const t = String(tz || '').trim()
  if (!t) return DEFAULT_TZ
  try { new Intl.DateTimeFormat('en-US', { timeZone: t }); return t } catch { return DEFAULT_TZ }
}
function partsFmt(tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
    fmtCache.set(tz, f)
  }
  return f
}
const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** Wall-clock parts of an instant in `tz`. dow: 0 = Monday … 6 = Sunday. */
export function zonedParts(t: number, tz: string): { y: number; m: number; d: number; h: number; mi: number; s: number; dow: number } {
  const p: Record<string, string> = {}
  for (const x of partsFmt(tz).formatToParts(new Date(t))) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, h: (+p.hour) % 24, mi: +p.minute, s: +p.second, dow: DOW[p.weekday] ?? 0 }
}
function offsetAt(t: number, tz: string): number {
  const p = zonedParts(t, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000
}
/** The instant a wall-clock time happens in `tz` (month 1–12; overflowing days/months roll over). */
export function zonedTime(y: number, m: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, h, mi)
  let t = guess - offsetAt(guess, tz)
  const again = guess - offsetAt(t, tz)
  if (again !== t) t = again
  return t
}
export function startOfDayTz(t: number, tz: string): number {
  const p = zonedParts(t, tz)
  return zonedTime(p.y, p.m, p.d, 0, 0, tz)
}
/** Local midnight `n` days before the day `t` falls on (n may be negative). Safe across daylight saving. */
export function dayStartOffset(t: number, tz: string, n: number): number {
  const p = zonedParts(t, tz)
  return zonedTime(p.y, p.m, p.d - n, 0, 0, tz)
}
export function dayKeyTz(t: number, tz: string): string {
  const p = zonedParts(t, tz)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

export type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'lastmonth' | 'all' | 'custom'
export const RANGES: [RangeKey, string][] = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'],
  ['month', 'This month'], ['lastmonth', 'Last month'], ['all', 'All time'], ['custom', 'Custom range'],
]
export const isRangeKey = (v: any): v is RangeKey => RANGES.some(([k]) => k === v)

export type BoardWindow = { from: number; to: number; prevFrom: number; prevTo: number; days: number }

/**
 * The selected period and the one before it, for "vs previous". An open-ended
 * period (today, last 7 days, this month) is compared with the same elapsed
 * time before it, so 10am today is set against 10am yesterday, not all of
 * yesterday. `to` is Infinity for "up to now and still counting".
 */
export function boardWindow(range: RangeKey, now: number, tz: string, custom?: { from?: string; to?: string }): BoardWindow {
  const today = startOfDayTz(now, tz)
  const p = zonedParts(now, tz)
  const open = (from: number, prevFrom: number, days: number): BoardWindow => ({ from, to: Infinity, prevFrom, prevTo: prevToFor(range, now, tz, from), days })
  switch (range) {
    case 'yesterday': { const from = dayStartOffset(now, tz, 1); return { from, to: today, prevFrom: dayStartOffset(now, tz, 2), prevTo: from, days: 1 } }
    case '7d': return open(dayStartOffset(now, tz, 6), dayStartOffset(now, tz, 13), 7)
    case '30d': return open(dayStartOffset(now, tz, 29), dayStartOffset(now, tz, 59), 30)
    case 'month': return open(zonedTime(p.y, p.m, 1, 0, 0, tz), zonedTime(p.y, p.m - 1, 1, 0, 0, tz), p.d)
    case 'lastmonth': {
      const from = zonedTime(p.y, p.m - 1, 1, 0, 0, tz), to = zonedTime(p.y, p.m, 1, 0, 0, tz)
      return { from, to, prevFrom: zonedTime(p.y, p.m - 2, 1, 0, 0, tz), prevTo: from, days: Math.round((to - from) / 864e5) }
    }
    case 'all': return { from: 0, to: Infinity, prevFrom: 0, prevTo: 0, days: 0 }
    case 'custom': {
      const ymd = (v?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); return m ? [+m[1], +m[2], +m[3]] as const : null }
      let a = ymd(custom?.from), b = ymd(custom?.to)
      if (!a || !b) return { from: today, to: Infinity, prevFrom: dayStartOffset(now, tz, 1), prevTo: prevToFor('today', now, tz, today), days: 1 }
      // Picked the wrong way round: the earlier date is the start.
      if (a.join('-') > b.join('-')) [a, b] = [b, a]
      const from = zonedTime(a[0], a[1], a[2], 0, 0, tz)
      const to = zonedTime(b[0], b[1], b[2] + 1, 0, 0, tz)
      const days = Math.round((Date.UTC(b[0], b[1] - 1, b[2] + 1) - Date.UTC(a[0], a[1] - 1, a[2])) / 864e5)
      return { from, to, prevFrom: zonedTime(a[0], a[1], a[2] - days, 0, 0, tz), prevTo: from, days }
    }
    default: return open(today, dayStartOffset(now, tz, 1), 1)
  }
}

/**
 * What the board reads for a period: the period and the one before it (for
 * "vs previous"), as epoch ms, `to` null for "up to now". The page and /board
 * both work it out with this, so a period read in the business's timezone on
 * the server is exactly the one the page shows once it knows that timezone.
 */
export function boardSpan(range: RangeKey, now: number, tz: string, custom?: { from?: string; to?: string }): { from: number; to: number | null } {
  return spanOf(boardWindow(range, now, tz, custom))
}
export const spanOf = (w: BoardWindow): { from: number; to: number | null } => ({
  from: w.prevFrom > 0 && w.prevTo > 0 ? Math.min(w.prevFrom, w.from) : w.from,
  to: Number.isFinite(w.to) ? w.to : null,
})

/**
 * Where "the period before, up to the same point" ends for an open period, by
 * the clock on the wall: 4pm today is set against 4pm yesterday even on a day
 * daylight saving starts or ends (when 4pm is 15 or 17 hours after midnight).
 * Never past the start of the current period.
 */
export function prevToFor(range: RangeKey, now: number, tz: string, from: number): number {
  const p = zonedParts(now, tz)
  const back = (days: number) => zonedTime(p.y, p.m, p.d - days, p.h, p.mi, tz) + p.s * 1000
  const t = range === '7d' ? back(7) : range === '30d' ? back(30)
    : range === 'month' ? zonedTime(p.y, p.m - 1, p.d, p.h, p.mi, tz) + p.s * 1000
      : back(1)
  return Math.min(from, t)
}

export const inWindow = (c: { created_at: string }, from: number, to: number) => { const t = ms(c.created_at); return t >= from && t < to }

// ── Numbers for a set of calls ───────────────────────────────────────────────

export type CallStats = {
  total: number; inbound: number; outbound: number
  answered: number; missed: number; voicemail: number; live: number
  inboundDone: number            // incoming calls that have finished (the miss rate's base)
  outboundConnected: number
  missRate: number               // (missed + voicemail) ÷ inboundDone, as a whole percent
  avgTalk: number                // seconds, over connected calls with talk time
  talkSecs: number
  ai: { calls: number; handled: number; messages: number; voicemail: number; missed: number; bookingLinks: number; texts: number }
}

export function aggregate(calls: CcCall[], now: number = Date.now()): CallStats {
  const st: CallStats = { total: calls.length, inbound: 0, outbound: 0, answered: 0, missed: 0, voicemail: 0, live: 0, inboundDone: 0, outboundConnected: 0, missRate: 0, avgTalk: 0, talkSecs: 0, ai: { calls: 0, handled: 0, messages: 0, voicemail: 0, missed: 0, bookingLinks: 0, texts: 0 } }
  let talkN = 0
  for (const c of calls) {
    const o = outcomeOf(c, now)
    if (o === 'live') st.live++
    if (c.direction === 'outbound') {
      st.outbound++
      if (o === 'answered') st.outboundConnected++
    } else {
      st.inbound++
      if (o === 'answered') st.answered++
      else if (o === 'missed') st.missed++
      else if (o === 'voicemail') st.voicemail++
      if (o !== 'live') st.inboundDone++
      const ao = aiOutcomeOf(c, now)
      if (isAiCall(c)) {
        st.ai.calls++
        st.ai.bookingLinks += c.ai?.bookingLinks || 0
        st.ai.texts += c.ai?.texts || 0
      }
      if (ao === 'ai_handled') st.ai.handled++
      if (ao === 'ai_message') st.ai.messages++
      if (ao === 'ai_voicemail') st.ai.voicemail++
      if (ao === 'ai_missed') st.ai.missed++
    }
    // Average talk time leaves out 0-second rows (no talk time recorded).
    if (o === 'answered' && c.duration_seconds > 0) { st.talkSecs += c.duration_seconds; talkN++ }
  }
  st.missRate = st.inboundDone ? Math.round((st.missed + st.voicemail) / st.inboundDone * 100) : 0
  st.avgTalk = talkN ? Math.round(st.talkSecs / talkN) : 0
  return st
}

/** Calls by hour of day (0–23), local to the business. */
export function byHour(calls: { created_at: string }[], tz: string): number[] {
  const out = Array.from({ length: 24 }, () => 0)
  for (const c of calls) out[zonedParts(ms(c.created_at), tz).h]++
  return out
}

/** Weekday × hour grid of call volume and unanswered incoming calls. Rows Monday first. */
export function heatmap(calls: CcCall[], tz: string, now: number = Date.now()): { n: number; miss: number }[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, miss: 0 })))
  for (const c of calls) {
    const p = zonedParts(ms(c.created_at), tz)
    const cell = grid[p.dow][p.h]
    cell.n++
    if (c.direction === 'inbound') { const o = outcomeOf(c, now); if (o === 'missed' || o === 'voicemail') cell.miss++ }
  }
  return grid
}

export function busiestHour(calls: { created_at: string }[], tz: string): { hour: number; count: number } | null {
  const h = byHour(calls, tz)
  let best = -1
  h.forEach((n, i) => { if (n > 0 && (best < 0 || n > h[best])) best = i })
  return best < 0 ? null : { hour: best, count: h[best] }
}

export function hourLabel(h: number, hour12 = true): string {
  if (!hour12) return `${String(h).padStart(2, '0')}:00`
  const suffix = h < 12 ? 'am' : 'pm'
  return `${h % 12 || 12}${suffix}`
}

// ── Team members ─────────────────────────────────────────────────────────────

export const normName = (v: string | null | undefined) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')

export type AgentOption = { key: string; id: string | null; name: string }

/** Who the call belongs to, for the team member filter: the user who answered or placed it, else their name. */
export function callAgentMatches(c: Pick<CcCall, 'answered_by_user_id' | 'agent_name'>, opt: AgentOption | null): boolean {
  if (!opt) return true
  if (opt.id && c.answered_by_user_id) return c.answered_by_user_id === opt.id
  return !!c.agent_name && normName(c.agent_name) === normName(opt.name)
}

export type LeaderRow = { key: string; id: string | null; name: string; answered: number; made: number; connected: number; talkSecs: number; avgTalk: number; callBacks: number }

/**
 * The team, ranked by calls they handled: incoming calls they answered plus
 * outgoing calls that connected. Call-backs are outgoing calls to someone whose
 * call was missed earlier in the period. The AI phone agent has its own panel.
 */
export function leaderboard(calls: CcCall[], now: number = Date.now()): LeaderRow[] {
  const byKey = new Map<string, LeaderRow & { talkN: number; returned: Set<string> }>()
  const missedAt = new Map<string, number>()   // phone key → first unanswered call
  const sorted = [...calls].sort((a, b) => ms(a.created_at) - ms(b.created_at))
  for (const c of sorted) {
    const o = outcomeOf(c, now)
    if (c.direction === 'inbound' && (o === 'missed' || o === 'voicemail')) {
      const k = digits(c.from_number).slice(-9)
      if (k.length >= 8 && !missedAt.has(k)) missedAt.set(k, ms(c.created_at))
    }
    if (isAiCall(c) || !c.agent_name || normName(c.agent_name) === 'agent') continue
    if (c.direction === 'inbound' && o !== 'answered') continue
    const key = c.answered_by_user_id ? `u:${c.answered_by_user_id}` : `n:${normName(c.agent_name)}`
    const row = byKey.get(key) || { key, id: c.answered_by_user_id, name: c.agent_name, answered: 0, made: 0, connected: 0, talkSecs: 0, avgTalk: 0, callBacks: 0, talkN: 0, returned: new Set<string>() }
    if (c.direction === 'inbound') row.answered++
    else {
      row.made++
      if (o === 'answered') row.connected++
      const k = digits(c.to_number).slice(-9)
      const missed = missedAt.get(k)
      if (missed != null && missed < ms(c.created_at) && !row.returned.has(k)) { row.returned.add(k); row.callBacks++ }
    }
    if (o === 'answered' && c.duration_seconds > 0) { row.talkSecs += c.duration_seconds; row.talkN++ }
    byKey.set(key, row)
  }
  // Rows by name and by user id for the same person (older rows have no id) merge.
  const out = new Map<string, LeaderRow & { talkN: number }>()
  for (const r of byKey.values()) {
    const nk = normName(r.name)
    const prev = out.get(nk)
    if (prev) {
      prev.answered += r.answered; prev.made += r.made; prev.connected += r.connected; prev.talkSecs += r.talkSecs; prev.talkN += r.talkN; prev.callBacks += r.callBacks
      prev.id = prev.id || r.id
    } else out.set(nk, { ...r })
  }
  return Array.from(out.values()).map(({ talkN, returned: _r, ...r }: any) => ({ ...r, avgTalk: talkN ? Math.round(r.talkSecs / talkN) : 0 }))
    .sort((a, b) => (b.answered + b.connected) - (a.answered + a.connected) || b.talkSecs - a.talkSecs || a.name.localeCompare(b.name))
}

// ── Search ───────────────────────────────────────────────────────────────────

/** Name, number (any way it's written), team member, location, or what the call was about. */
export function matchesSearch(c: CcCall, q: string, locationName?: string | null): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  const hay = [callerName(c), c.caller_name, c.contact_name, c.agent_name, locationName, c.ai_summary, c.ai?.about, formatPhone(otherNumber(c))]
    .filter(Boolean).join(' ').toLowerCase()
  if (hay.includes(t)) return true
  const qd = digits(t)
  if (qd.length >= 3 && qd.length >= t.replace(/[\s()+-]/g, '').length) {
    for (const n of [c.from_number, c.to_number]) {
      const d = digits(n)
      if (!d) continue
      const local = d.startsWith('61') ? `0${d.slice(2)}` : d
      if (d.includes(qd) || local.includes(qd)) return true
    }
  }
  return false
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export type RecoveryItem = {
  number: string; name: string | null; contactId: string | null; conversationId: string | null
  callId: string; at: string; attempts: number; voicemail: boolean; textedBack: boolean
  duringOpenHours: boolean | null; textable: boolean
}

export type CcAlert = { id: string; tone: 'red' | 'amber'; title: string; body: string; why: string; action?: 'recovery' | 'live' | 'logs_unanswered' }

export function buildAlerts(p: {
  stats: CallStats; recovery: RecoveryItem[]; live: CcCall[]; available: number; now: number; tz: string; isToday: boolean
}): CcAlert[] {
  const out: CcAlert[] = []
  const waiting = p.live.filter(c => c.direction === 'inbound' && ['ringing', 'ringing_agents'].includes(c.status) && p.now - ms(c.created_at) > 45_000)
  if (waiting.length && p.available === 0) {
    out.push({ id: 'waiting', tone: 'red', action: 'live', title: waiting.length === 1 ? 'A caller is waiting' : `${waiting.length} callers are waiting`,
      body: 'Ringing for more than 45 seconds and nobody on the team is showing as available.',
      why: 'An incoming call has been ringing for over 45 seconds and no team member is online and available in Colvy right now.' })
  }
  const today0 = startOfDayTz(p.now, p.tz)
  const openMisses = p.recovery.filter(r => r.duringOpenHours === true && ms(r.at) >= today0)
  if (openMisses.length) {
    out.push({ id: 'open-hours', tone: 'red', action: 'recovery',
      title: `${openMisses.length} ${openMisses.length === 1 ? 'caller' : 'callers'} missed while you were open`,
      body: 'Unanswered today during opening hours, and not called or texted back yet.',
      why: 'Incoming calls today that rang out, went to voicemail or were hung up, at a time your opening hours say you were open, from people nobody has rung or texted since. Automatic missed-call texts don’t count as a reply.' })
  }
  const vms = p.recovery.filter(r => r.voicemail)
  if (vms.length) {
    out.push({ id: 'voicemail', tone: 'amber', action: 'recovery', title: `${vms.length} ${vms.length === 1 ? 'voicemail' : 'voicemails'} not returned`,
      body: 'From the last 7 days. Listen, then call or text back.',
      why: 'Voicemails left in the last 7 days by callers nobody has rung back, or replied to in their conversation, since.' })
  }
  if (p.stats.inboundDone >= 5 && p.stats.missRate >= 20) {
    out.push({ id: 'miss-rate', tone: 'amber', action: 'logs_unanswered', title: `Miss rate is ${p.stats.missRate}%`,
      body: `${p.stats.missed + p.stats.voicemail} of ${p.stats.inboundDone} incoming calls ${p.isToday ? 'today ' : ''}weren’t answered.`,
      why: 'Missed calls plus voicemails, out of incoming calls that have finished in the selected period. Flagged at 20% or more once there are at least 5 incoming calls.' })
  }
  return out
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function fmtDur(secs: number): string {
  const t = Math.max(0, Math.round(secs || 0))
  if (t < 60) return `${t}s`
  const m = Math.floor(t / 60)
  if (m < 60) return `${m}m ${t % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
export function fmtClock(secs: number): string {
  const t = Math.max(0, Math.floor(secs || 0))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`
}
export function fmtTalk(secs: number): string {
  const t = Math.round(secs || 0)
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${t}s`
}
export function timeAgo(v: string, now: number = Date.now()): string {
  const d = ms(v); if (!d) return ''
  const mins = Math.floor((now - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
