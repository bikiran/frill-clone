// Server-side core of POST /api/forms/claims (members only): for a list of
// payment ids and calendar event ids, which response FIRST claimed each one,
// across every form of the company. Results use it so a real payment or
// booking pasted into a second response (on this form or any other) only ever
// counts once, even when the original isn't among the loaded rows (the 10,000
// cap, a date filter, another form). Kept out of the route file so it can be
// tested with a fake database; the route supplies the service-role client and
// the company-access check.

import { UUID_RE, type Claim } from './aggregate'

export type ClaimsDeps = {
  db: { from(table: string): any }
  access: (companyId: string) => Promise<{ ok: boolean }>
}
export type ClaimsReply = { status: number; body: { payments: Record<string, Claim>; events: Record<string, Claim> } | { error: string } }

export const MAX_CLAIM_IDS = 10000
const ID_CHUNK = 80              // ids per query: the in() list goes into the request URL
const MAX_PAIRS = 300            // payment / scheduler questions looked at across the company
const MAX_PAGES = 20             // per query, 1000 rows a page
const CONCURRENCY = 4
/** Question ids are used inside a JSON path in the query, so only plain ones. */
const SAFE_KEY = /^[A-Za-z0-9_-]{1,100}$/

function cleanIds(v: unknown): string[] | null {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) return null
  const out = new Set<string>()
  for (const x of v) if (typeof x === 'string' && UUID_RE.test(x)) out.add(x.toLowerCase())
  return out.size > MAX_CLAIM_IDS ? null : [...out]
}

const earlier = (a: { created_at: string; id: string }, b: Claim) => {
  const ta = Date.parse(a.created_at), tb = Date.parse(b.createdAt)
  if (ta !== tb) return ta < tb
  return a.id < b.responseId
}

async function pool<T>(tasks: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length)
  let next = 0
  const worker = async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i]() } }
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker))
  return out
}

export async function handleClaimsRequest(body: unknown, deps: ClaimsDeps): Promise<ClaimsReply> {
  const b = body && typeof body === 'object' ? (body as any) : {}
  const formId = typeof b.formId === 'string' ? b.formId : ''
  if (!UUID_RE.test(formId)) return { status: 400, body: { error: 'formId required' } }
  const paymentIds = cleanIds(b.paymentIds)
  const eventIds = cleanIds(b.eventIds)
  if (!paymentIds || !eventIds) return { status: 400, body: { error: `paymentIds and eventIds must be lists of at most ${MAX_CLAIM_IDS} ids` } }

  const { data: form, error: formErr } = await deps.db.from('forms').select('id, company_id').eq('id', formId).maybeSingle()
  if (formErr) return { status: 502, body: { error: 'Could not check' } }
  if (!form || !form.company_id) return { status: 403, body: { error: 'Not authorized' } }
  if (!(await deps.access(form.company_id)).ok) return { status: 403, body: { error: 'Not authorized' } }

  const empty = { payments: {} as Record<string, Claim>, events: {} as Record<string, Claim> }
  if (!paymentIds.length && !eventIds.length) return { status: 200, body: empty }

  // Every payment / scheduler question on every form of this company.
  const pairs: { formId: string; qid: string; kind: 'payments' | 'events' }[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await deps.db.from('forms').select('id, questions').eq('company_id', form.company_id)
      .order('id').range(page * 1000, page * 1000 + 999)
    if (error) return { status: 502, body: { error: 'Could not check' } }
    const list = Array.isArray(data) ? data : []
    for (const f of list) {
      for (const q of Array.isArray(f?.questions) ? f.questions : []) {
        if (!q || typeof q.id !== 'string' || !SAFE_KEY.test(q.id)) continue
        if (q.type === 'payment' && paymentIds.length) pairs.push({ formId: f.id, qid: q.id, kind: 'payments' })
        if (q.type === 'scheduler' && eventIds.length) pairs.push({ formId: f.id, qid: q.id, kind: 'events' })
      }
    }
    if (list.length < 1000) break
  }

  const tasks: (() => Promise<boolean>)[] = []
  for (const p of pairs.slice(0, MAX_PAIRS)) {
    const ids = p.kind === 'payments' ? paymentIds : eventIds
    // The key is quoted so ids with dashes (uuids) parse as one JSON key in PostgREST.
    const path = `answers->"${p.qid}"->>${p.kind === 'payments' ? 'payment_id' : 'calendar_event_id'}`
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const chunk = ids.slice(i, i + ID_CHUNK)
      tasks.push(async () => {
        for (let page = 0; page < MAX_PAGES; page++) {
          const { data, error } = await deps.db.from('form_responses').select(`id, created_at, ref:${path}`)
            .eq('form_id', p.formId).in(path, chunk)
            .order('created_at', { ascending: true }).order('id').range(page * 1000, page * 1000 + 999)
          if (error) return false
          const list = Array.isArray(data) ? data : []
          for (const r of list) {
            const ref = typeof r?.ref === 'string' ? r.ref.toLowerCase() : ''
            if (!ref || typeof r.id !== 'string' || typeof r.created_at !== 'string') continue
            const map = empty[p.kind]
            const cur = map[ref]
            if (!cur || earlier(r, cur)) map[ref] = { responseId: r.id, formId: p.formId, questionId: p.qid, createdAt: r.created_at }
          }
          if (list.length < 1000) break
        }
        return true
      })
    }
  }
  const results = await pool(tasks, CONCURRENCY)
  if (results.some(ok => !ok)) return { status: 502, body: { error: 'Could not check' } }
  return { status: 200, body: empty }
}
