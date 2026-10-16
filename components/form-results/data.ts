// Data access for the Results page. Every function takes its client as an
// argument (the page passes the signed-in Supabase client and authFetch), so it
// stays testable and never reaches the database by itself.
//
// Reads only, all members-only: form_responses, chat_payments and
// calendar_events are readable by the business's own team through RLS. The one
// write (deleting responses) goes through the existing server route.

import {
  mergeRows, sanitizeStats, sanitizeClaims, RESPONSE_CAP, PAGE_SIZE, DELETE_CHUNK, UUID_RE,
  type ResultRow, type StatsResult, type VerifyState, type PayRecord, type EventRecord, type Claims,
} from './aggregate'

export type DbLike = { from(table: string): any }
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export const RESPONSE_COLUMNS = 'id, created_at, answers, response_time_seconds, language, screen_width, screen_height, referrer, user_agent, city, country'

const missingColumn = (e: any) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(String(e.message || '')))

export type LoadResult = { rows: ResultRow[]; capped: boolean; total: number | null; error?: string }

/**
 * Responses newest first, 1000 per page, de-duplicated by id, up to the cap.
 * `from` / `to` (ISO instants, `to` exclusive) narrow the query on the server so
 * older responses stay reachable when the cap is hit. `onPage` fires after every
 * page so the page can render the first one straight away.
 */
export async function loadResponses(db: DbLike, formId: string, opts: {
  from?: string; to?: string; cap?: number
  onPage?: (rows: ResultRow[], info: { done: boolean }) => void
  isCancelled?: () => boolean
} = {}): Promise<LoadResult> {
  const cap = opts.cap ?? RESPONSE_CAP
  const ranged = (q: any) => {
    let x = q.eq('form_id', formId)
    if (opts.from) x = x.gte('created_at', opts.from)
    if (opts.to) x = x.lt('created_at', opts.to)
    return x
  }
  // The exact total runs alongside the first page (head request, no rows).
  const totalP: Promise<number | null> = Promise.resolve()
    .then(() => ranged(db.from('form_responses').select('id', { count: 'exact', head: true })))
    .then((r: any) => (r && !r.error && typeof r.count === 'number' ? r.count : null), () => null)

  let cols = RESPONSE_COLUMNS
  let rows: ResultRow[] = []
  let offset = 0
  let lastFull = false
  for (;;) {
    if (opts.isCancelled?.()) break
    const res = await ranged(db.from('form_responses').select(cols))
      .order('created_at', { ascending: false }).order('id')
      .range(offset, offset + PAGE_SIZE - 1)
    if (res.error) {
      if (cols !== '*' && missingColumn(res.error)) { cols = '*'; continue }
      const total = await totalP
      opts.onPage?.(rows, { done: true })
      return { rows, capped: false, total, error: res.error.message || 'Could not load responses' }
    }
    const page: ResultRow[] = Array.isArray(res.data) ? res.data : []
    rows = mergeRows(rows, page, cap)
    lastFull = page.length >= PAGE_SIZE
    const done = !lastFull || rows.length >= cap
    if (!done) opts.onPage?.(rows, { done: false })
    if (done) break
    offset += PAGE_SIZE
  }
  if (opts.isCancelled?.()) return { rows, capped: false, total: null }
  const total = await totalP
  const capped = rows.length >= cap && (total === null ? lastFull : total > rows.length)
  opts.onPage?.(rows, { done: true })
  return { rows, capped, total }
}

async function readIn<T>(db: DbLike, table: string, cols: string[], optional: string[], companyId: string, ids: string[]): Promise<{ rows: T[]; error: boolean }> {
  const out: T[] = []
  let select = [...cols, ...optional].join(', ')
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    let res = await db.from(table).select(select).eq('company_id', companyId).in('id', chunk)
    // Columns added by later migrations (refunded_cents V288, form_id/question_id V380) may not exist yet.
    if (res.error && missingColumn(res.error) && optional.length && select !== cols.join(', ')) {
      select = cols.join(', ')
      res = await db.from(table).select(select).eq('company_id', companyId).in('id', chunk)
    }
    if (res.error) return { rows: out, error: true }
    out.push(...(Array.isArray(res.data) ? res.data : []))
  }
  return { rows: out, error: false }
}

/** Which response first claimed each payment / booking, across every form of the company (POST /api/forms/claims). */
export async function fetchClaims(fetcher: Fetcher, args: { formId: string; paymentIds: string[]; eventIds: string[] }): Promise<Claims | null> {
  try {
    const res = await fetcher('/api/forms/claims', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formId: args.formId, paymentIds: args.paymentIds, eventIds: args.eventIds }),
    })
    if (!res || res.status !== 200) return null
    return sanitizeClaims(await res.json())
  } catch {
    return null
  }
}

/**
 * One batched members-only read per table (the payments and bookings that
 * answers claim), then the company-wide "first claim" check for the ones that
 * exist. Any failure → status 'error' (everything shows as unverified, with a
 * retry banner), never a guess.
 */
export async function loadVerification(db: DbLike, companyId: string | null, ids: { paymentIds: string[]; eventIds: string[] },
  claims?: { fetcher: Fetcher; formId: string }): Promise<VerifyState> {
  const paymentIds = ids.paymentIds.filter(id => UUID_RE.test(id))
  const eventIds = ids.eventIds.filter(id => UUID_RE.test(id))
  if (!paymentIds.length && !eventIds.length) return { status: 'done', payments: {}, events: {}, claims: { payments: {}, events: {} } }
  if (!companyId) return { status: 'error', payments: {}, events: {}, claims: null }
  try {
    const [p, e] = await Promise.all([
      paymentIds.length
        ? readIn<PayRecord>(db, 'chat_payments', ['id', 'company_id', 'status', 'amount_cents', 'currency', 'conversation_id', 'description'], ['refunded_cents', 'form_id', 'question_id'], companyId, paymentIds)
        : Promise.resolve({ rows: [] as PayRecord[], error: false }),
      eventIds.length
        ? readIn<EventRecord>(db, 'calendar_events', ['id', 'company_id', 'event_type', 'status', 'starts_at', 'ends_at', 'title'], [], companyId, eventIds)
        : Promise.resolve({ rows: [] as EventRecord[], error: false }),
    ])
    const payments: Record<string, PayRecord> = {}
    for (const r of p.rows) if (r && typeof r.id === 'string') payments[r.id.toLowerCase()] = r
    const events: Record<string, EventRecord> = {}
    for (const r of e.rows) if (r && typeof r.id === 'string') events[r.id.toLowerCase()] = r
    if (p.error || e.error) return { status: 'error', payments, events, claims: null }
    // Only ids that are real records can be "Paid"/"Booked", so only those need the company-wide check.
    const found = { paymentIds: Object.keys(payments), eventIds: Object.keys(events) }
    let c: Claims | null = { payments: {}, events: {} }
    if (found.paymentIds.length || found.eventIds.length) {
      c = claims ? await fetchClaims(claims.fetcher, { formId: claims.formId, ...found }) : null
    }
    return { status: c ? 'done' : 'error', payments, events, claims: c }
  } catch {
    return { status: 'error', payments: {}, events: {}, claims: null }
  }
}

/** Views/starts from the members-only stats route. Any failure → not tracked (never blocks the page). */
export async function fetchStats(fetcher: Fetcher, params: { formId: string; from?: string; to?: string; tz?: string }): Promise<StatsResult> {
  try {
    const q = new URLSearchParams({ formId: params.formId })
    if (params.from) q.set('from', params.from)
    if (params.to) q.set('to', params.to)
    if (params.tz) q.set('tz', params.tz)
    const res = await fetcher(`/api/forms/stats?${q.toString()}`)
    if (!res || res.status !== 200) return { tracked: false }
    return sanitizeStats(await res.json())
  } catch {
    return { tracked: false }
  }
}

/**
 * Deletes through the existing server route, 200 ids per call one after
 * another (the route's `.in('id', ids)` goes into the request URL). Stops at
 * the first failure; `deleted` lists the ids of every chunk that succeeded.
 */
export async function deleteInChunks(fetcher: Fetcher, args: {
  formId: string; companyId: string; ids: string[]; chunk?: number
  onChunk?: (ids: string[]) => void
}): Promise<{ deleted: string[]; error?: string }> {
  const size = args.chunk ?? DELETE_CHUNK
  const deleted: string[] = []
  for (let i = 0; i < args.ids.length; i += size) {
    const ids = args.ids.slice(i, i + size)
    try {
      const res = await fetcher('/api/forms/responses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', formId: args.formId, companyId: args.companyId, ids }),
      })
      let body: any = null
      try { body = await res.json() } catch {}
      if (!res.ok) return { deleted, error: (body && typeof body.error === 'string' && body.error) || 'Delete failed' }
    } catch (e: any) {
      return { deleted, error: e?.message || 'Delete failed' }
    }
    deleted.push(...ids)
    args.onChunk?.(ids)
  }
  return { deleted }
}
