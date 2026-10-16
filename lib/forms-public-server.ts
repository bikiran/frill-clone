// Server side of the public form's two small routes:
//   GET  /api/forms/count/[id]  → { count } for the welcome screen's "N people have filled this out"
//   POST /api/forms/track       → view / start / abandon counters (form_stats, migration V376)
//
// Both use the service role and never fall back to the anon key: the browser
// must not read form_responses, and form_stats is service-role only. Both only
// act on PUBLISHED forms that are inside their schedule window, and neither
// ever returns response data.
//
// The handlers take their database, rate limiter and clock as optional deps so
// they can be tested with a fake. The claude/forms-lockdown branch adds a
// shared lib/forms-server.ts; whichever branch merges second can switch
// serviceDb() / isUuid() over to it.

import { createClient } from '@supabase/supabase-js'
import { checkBurst } from '@/lib/rate-limit'
import { readFormLogic, resolveWelcome } from '@/lib/form-logic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Form ids are always UUIDs (question ids are not). */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/** Minimal shape of the Supabase client these handlers use. */
export type FormsDb = {
  from: (table: string) => any
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>
}

/** Service-role client, or null when the key isn't configured. Never the anon key. */
export function serviceDb(): FormsDb | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) as unknown as FormsDb
}

/** Best-effort caller IP, used only as a rate-limit key. Never stored or logged. */
export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
}

// A clock time followed by Z or an offset: '…09:00:00+10', '…T09:00Z', '…09:00:00.5+05:30'.
const ZONED_RE = /\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(z|[+-]\d{2}(:?\d{2})?)$/i
const HOUR = 3_600_000
const EVERY_ZONE_MS = 14 * HOUR
const END_GRACE_MS = 30 * 60_000

/**
 * A schedule value as an instant, and whether it carried a time zone. A value
 * without one is read as UTC wall-clock (as Postgres does) and the caller
 * widens it by ±14h. Null when it doesn't parse.
 */
export function parseScheduleTime(v: unknown): { t: number; zoned: boolean } | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? { t: v.getTime(), zoned: true } : null
  if (typeof v !== 'string') return null
  let s = v.trim()
  if (!s) return null
  const zoned = ZONED_RE.test(s)
  s = s.replace(/^(\d{4}-\d{2}-\d{2})[ T]/, '$1T')
  if (zoned) {
    s = s.replace(/\s+(?=(z|[+-]\d{2}(:?\d{2})?)$)/i, '')                 // '09:00 +10' → '09:00+10'
      .replace(/([+-]\d{2})$/, '$1:00')                       // '+10'   → '+10:00'
      .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')                // '+1000' → '+10:00'
  } else if (/T\d/.test(s)) {
    s += 'Z'                                                  // datetime without a zone: UTC wall clock
  }
  // A date on its own ('2026-10-20') is already UTC midnight to Date.parse.
  const t = Date.parse(s)
  return Number.isFinite(t) ? { t, zoned } : null
}

/**
 * Inside scheduled_start / scheduled_end, with V375's rule (form_schedule_open):
 *   - a value with a time zone is exact;
 *   - one without (plain timestamp, date, datetime-local text) is a wall-clock
 *     time in a zone we can't know (the page reads it in the visitor's zone),
 *     so it only counts once it has passed in every zone (±14h);
 *   - the end gets 30 minutes' grace;
 *   - a value that doesn't parse doesn't block anything.
 * So the routes never refuse a visitor the page let in.
 */
export function inSchedule(form: { scheduled_start?: unknown; scheduled_end?: unknown }, now: number): boolean {
  const start = parseScheduleTime(form.scheduled_start)
  if (start && now < (start.zoned ? start.t : start.t - EVERY_ZONE_MS)) return false
  const end = parseScheduleTime(form.scheduled_end)
  if (end && now > (end.zoned ? end.t : end.t + EVERY_ZONE_MS) + END_GRACE_MS) return false
  return true
}

export type Deps = {
  db?: FormsDb | null
  burst?: (key: string, max: number) => boolean
  now?: () => number
}

function resolveDeps(deps: Deps) {
  return {
    db: deps.db === undefined ? serviceDb() : deps.db,
    burst: deps.burst || checkBurst,
    now: deps.now || Date.now,
  }
}

// ─── Count ──────────────────────────────────────────────────────────────────

const COUNT_TTL_MS = 60_000
const COUNT_CACHE_MAX = 500
const countCache = new Map<string, { count: number; at: number }>()

/** Test hook: empties the in-memory count cache. */
export function resetCountCache() {
  countCache.clear()
}

function cacheCount(id: string, count: number, at: number) {
  countCache.delete(id)
  while (countCache.size >= COUNT_CACHE_MAX) {
    const oldest = countCache.keys().next().value
    if (oldest === undefined) break
    countCache.delete(oldest)
  }
  countCache.set(id, { count, at })
}

const NO_STORE = 'no-store'
const SHARED_60 = 'public, s-maxage=60, stale-while-revalidate=300'

function json(body: unknown, status: number, cache: string): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': cache } })
}

/**
 * GET /api/forms/count/<formId>
 *   200 { count: number }   published, in schedule, welcome.showResponseCount on
 *   200 { count: null }     published but the toggle is off, or a database error
 *   400 / 404 / 429         bad id / not found, unpublished or out of schedule / burst limit
 */
export async function handleFormCount(req: Request, id: string, deps: Deps = {}): Promise<Response> {
  try {
    if (!isUuid(id)) return json({ error: 'formId required' }, 400, NO_STORE)
    const { db, burst, now } = resolveDeps(deps)
    if (!burst(`form-count:${clientIp(req)}`, 60)) return json({ error: 'Too many requests' }, 429, NO_STORE)

    if (!db) return json({ count: null }, 200, NO_STORE)

    // The form row is re-read on every request (a primary-key lookup), so a
    // form that was unpublished, closed or had the toggle switched off stops
    // showing its count straight away; only the response count is cached.
    const t = now()
    const { data: form, error } = await db.from('forms')
      .select('id, is_published, theme, scheduled_start, scheduled_end')
      .eq('id', id).maybeSingle()
    if (error) return json({ count: null }, 200, NO_STORE)
    if (!form || form.is_published !== true || !inSchedule(form, t)) return json({ error: 'Not found' }, 404, NO_STORE)
    if (!resolveWelcome(form.theme).showResponseCount) return json({ count: null }, 200, SHARED_60)

    const key = id.toLowerCase()
    const hit = countCache.get(key)
    if (hit && t - hit.at < COUNT_TTL_MS) return json({ count: hit.count }, 200, SHARED_60)

    const { count, error: countError } = await db.from('form_responses')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', id)
    if (countError || typeof count !== 'number') return json({ count: null }, 200, NO_STORE)

    cacheCount(key, count, t)
    return json({ count }, 200, SHARED_60)
  } catch {
    return json({ count: null }, 200, NO_STORE)
  }
}

// ─── Track ──────────────────────────────────────────────────────────────────

const TRACK_EVENTS = ['view', 'start', 'abandon'] as const
type TrackEvent = typeof TRACK_EVENTS[number]
const MAX_BODY = 2048
let bumpFailureLogged = false

/** Test hook: lets the "rpc failed" warning print again. */
export function resetTrackLog() {
  bumpFailureLogged = false
}

const noContent = () => new Response(null, { status: 204 })

/** The body as text, or null once it passes `max` bytes (stops reading there, even without a Content-Length). */
async function readCapped(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) return null
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) { all.set(c, at); at += c.byteLength }
  return new TextDecoder().decode(all)
}

/**
 * POST /api/forms/track { formId, event: 'view'|'start'|'abandon', questionId? }
 * Always 204, whatever happens (including before V376 has run). Only bumps a
 * counter; no IP, user agent or answer is stored.
 */
export async function handleFormTrack(req: Request, deps: Deps = {}): Promise<Response> {
  try {
    const text = await readCapped(req, MAX_BODY)
    if (!text) return noContent()

    let body: any
    try { body = JSON.parse(text) } catch { return noContent() }
    if (!body || typeof body !== 'object') return noContent()

    const formId = body.formId
    const event = body.event as TrackEvent
    if (!isUuid(formId) || !TRACK_EVENTS.includes(event)) return noContent()
    const questionId = event === 'abandon' ? body.questionId : undefined
    if (event === 'abandon' && (typeof questionId !== 'string' || !questionId || questionId.length > 200)) return noContent()

    const { db, burst, now } = resolveDeps(deps)
    const fid = formId.toLowerCase()
    // Per visitor first, then per form (blunts one attacker rotating IPs).
    if (!burst(`form-track:${clientIp(req)}:${fid}:${event}`, 10)) return noContent()
    if (!burst(`form-track:${fid}`, 600)) return noContent()
    if (!db) return noContent()

    const { data: form, error } = await db.from('forms')
      .select('id, is_published, scheduled_start, scheduled_end, questions')
      .eq('id', formId).maybeSingle()
    if (error || !form || form.is_published !== true || !inSchedule(form, now())) return noContent()
    // The page sends the engine's question ids (readFormLogic), so check against those.
    if (event === 'abandon' && !Object.prototype.hasOwnProperty.call(readFormLogic(form).indexOf, questionId)) return noContent()

    const { error: rpcError } = await db.rpc('form_stats_bump', {
      p_form_id: form.id,
      p_metric: event,
      p_key: event === 'abandon' ? questionId : '',
    })
    if (rpcError && !bumpFailureLogged) {
      bumpFailureLogged = true
      console.warn('[forms/track] form_stats_bump failed (has COLVY_V376_FORM_STATS.sql run?):', rpcError.message || rpcError)
    }
  } catch {
    // Tracking must never break anything.
  }
  return noContent()
}
