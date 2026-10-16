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

/** Inside scheduled_start / scheduled_end when set (unparseable dates are ignored, as the public page does). */
export function inSchedule(form: { scheduled_start?: unknown; scheduled_end?: unknown }, now: number): boolean {
  const at = (v: unknown) => (v ? new Date(v as string).getTime() : NaN)
  const start = at(form.scheduled_start)
  const end = at(form.scheduled_end)
  if (Number.isFinite(start) && now < start) return false
  if (Number.isFinite(end) && now > end) return false
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
const countCache = new Map<string, { count: number | null; at: number }>()

/** Test hook: empties the in-memory count cache. */
export function resetCountCache() {
  countCache.clear()
}

function cacheCount(id: string, count: number | null, at: number) {
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

    const key = id.toLowerCase()
    const t = now()
    const hit = countCache.get(key)
    if (hit && t - hit.at < COUNT_TTL_MS) return json({ count: hit.count }, 200, SHARED_60)

    if (!db) return json({ count: null }, 200, NO_STORE)

    const { data: form, error } = await db.from('forms')
      .select('id, is_published, theme, scheduled_start, scheduled_end')
      .eq('id', id).maybeSingle()
    if (error) return json({ count: null }, 200, NO_STORE)
    if (!form || form.is_published !== true || !inSchedule(form, t)) return json({ error: 'Not found' }, 404, NO_STORE)

    if (!resolveWelcome(form.theme).showResponseCount) {
      cacheCount(key, null, t)
      return json({ count: null }, 200, SHARED_60)
    }

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
