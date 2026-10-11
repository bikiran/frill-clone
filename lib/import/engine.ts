// The import engine. An import is a row in import_jobs (V350) that a worker
// moves forward in short steps, so it keeps going after the page is closed:
//
//   fetch  → read the source (Canny / Zendesk) into a payload. A CSV arrives
//            with its payload already, so it starts at write.
//   write  → ideas, then comments, then updates, then help articles, in batches.
//            Anything whose title already exists in the workspace is skipped.
//
// Each step claims the job with a short lease (updated_at), so the page's
// after() hook and the minute cron never write the same job at once. Every row
// created is tagged import_job_id, which is what Undo deletes.

import { titleKey, categorySlug, emptyPayload, STATUS_LABEL, type ImportPayload } from './normalize'
import { fetchCanny, fetchZendesk, SourceError, type FetchResult } from './sources'

export type Include = { ideas: boolean; comments: boolean; announcements: boolean; articles: boolean }
export type Counts = { ideas: number; comments: number; announcements: number; articles: number; skipped: number; fetched?: number }
const PHASES = ['ideas', 'comments', 'announcements', 'articles'] as const
type Phase = typeof PHASES[number]

const BATCH = 100
const LEASE_MS = 120_000
export const ACTIVE = ['queued', 'running']

export const zeroCounts = (): Counts => ({ ideas: 0, comments: 0, announcements: 0, articles: 0, skipped: 0 })
const nowIso = () => new Date().toISOString()

// ── Reading the source ───────────────────────────────────────────────────────
export async function readSource(source: string, options: any, deadline: number, onProgress?: (n: number) => any): Promise<FetchResult> {
  const include = options?.include
  if (source === 'canny') return fetchCanny(options?.apiKey, { deadline, include, onProgress })
  if (source === 'zendesk') return fetchZendesk(options?.url, { deadline, include, onProgress, publish: options?.publishArticles !== false })
  throw new SourceError('Unknown source.')
}

/** Only what was asked for. */
export function filterPayload(p: ImportPayload, inc: Include): ImportPayload {
  return {
    ideas: inc.ideas ? p.ideas : [],
    comments: inc.ideas && inc.comments ? p.comments : [],
    announcements: inc.announcements ? p.announcements : [],
    articles: inc.articles ? p.articles : [],
  }
}

/** Basic shape checks for a payload that came from the browser (CSV). */
export function sanitizePayload(raw: any): ImportPayload {
  const p = emptyPayload()
  const arr = (v: any) => (Array.isArray(v) ? v : [])
  const str = (v: any, max: number) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max)
  const okStatus = (s: any) => (['new', 'planned', 'in_progress', 'shipped'].includes(s) ? s : 'new')
  for (const i of arr(raw?.ideas).slice(0, 20000)) {
    const title = str(i?.title, 300); if (!title) continue
    p.ideas.push({
      sid: i?.sid ? str(i.sid, 80) : undefined, title, description: str(i?.description, 20000), status: okStatus(i?.status),
      rawStatus: i?.rawStatus ? str(i.rawStatus, 60) : undefined, votes: Math.max(0, Math.min(1e7, parseInt(i?.votes, 10) || 0)),
      author: str(i?.author, 120) || 'Imported', created_at: validIso(i?.created_at),
      topics: arr(i?.topics).map((t: any) => str(t, 40)).filter(Boolean).slice(0, 8),
    })
  }
  for (const a of arr(raw?.articles).slice(0, 5000)) {
    const title = str(a?.title, 300), content = str(a?.content, 200000); if (!title || !content) continue
    p.articles.push({ title, content, category: str(a?.category, 80) || 'General', status: a?.status === 'draft' ? 'draft' : 'published', created_at: validIso(a?.created_at) })
  }
  for (const a of arr(raw?.announcements).slice(0, 5000)) {
    const title = str(a?.title, 300); if (!title) continue
    p.announcements.push({ title, description: str(a?.description, 20000), created_at: validIso(a?.created_at) })
  }
  return p
}
function validIso(v: any): string | undefined {
  if (!v) return undefined
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

// ── Duplicates ───────────────────────────────────────────────────────────────
async function existingKeys(db: any, table: string, companyId: string): Promise<Set<string>> {
  const keys = new Set<string>()
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await db.from(table).select('title').eq('company_id', companyId).range(from, from + 999)
    if (error || !data?.length) break
    for (const r of data) keys.add(titleKey(r.title))
    if (data.length < 1000) break
  }
  return keys
}

/** Splits items into new and duplicate (already in the workspace, or repeated in the file). */
function splitDupes<T extends { title: string }>(items: T[], existing: Set<string>) {
  const seen = new Set(existing)
  const fresh: T[] = [], dupes: T[] = []
  for (const it of items) {
    const k = titleKey(it.title)
    if (!k || seen.has(k)) dupes.push(it)
    else { seen.add(k); fresh.push(it) }
  }
  return { fresh, dupes }
}

// ── Preview ──────────────────────────────────────────────────────────────────
export async function summarize(db: any, companyId: string, p: ImportPayload) {
  const [ideaKeys, annKeys, artKeys] = await Promise.all([
    p.ideas.length ? existingKeys(db, 'ideas', companyId) : Promise.resolve(new Set<string>()),
    p.announcements.length ? existingKeys(db, 'announcements', companyId) : Promise.resolve(new Set<string>()),
    p.articles.length ? existingKeys(db, 'help_articles', companyId) : Promise.resolve(new Set<string>()),
  ])
  const ideas = splitDupes(p.ideas, ideaKeys)
  const anns = splitDupes(p.announcements, annKeys)
  const arts = splitDupes(p.articles, artKeys)
  const freshSids = new Set(ideas.fresh.map(i => i.sid).filter(Boolean))
  const comments = p.comments.filter(c => freshSids.has(c.postSid)).length

  const statusMap = new Map<string, { from: string; to: string; count: number }>()
  for (const i of p.ideas) {
    const from = i.rawStatus || '(none)'
    const k = `${from.toLowerCase()}→${i.status}`
    const row = statusMap.get(k) || { from, to: STATUS_LABEL[i.status] || i.status, count: 0 }
    row.count++
    statusMap.set(k, row)
  }
  const categories = new Map<string, number>()
  for (const a of arts.fresh) categories.set(a.category, (categories.get(a.category) || 0) + 1)

  return {
    found: { ideas: p.ideas.length, comments: p.comments.length, announcements: p.announcements.length, articles: p.articles.length },
    toImport: { ideas: ideas.fresh.length, comments, announcements: anns.fresh.length, articles: arts.fresh.length },
    duplicates: { ideas: ideas.dupes.length, announcements: anns.dupes.length, articles: arts.dupes.length },
    samples: {
      ideas: ideas.fresh.slice(0, 5).map(i => ({ title: i.title, status: STATUS_LABEL[i.status] || i.status, votes: i.votes, topics: i.topics })),
      duplicates: [...ideas.dupes, ...arts.dupes, ...anns.dupes].slice(0, 5).map(i => i.title),
      articles: arts.fresh.slice(0, 5).map(a => ({ title: a.title, category: a.category, status: a.status })),
      announcements: anns.fresh.slice(0, 3).map(a => ({ title: a.title })),
    },
    statusMap: Array.from(statusMap.values()).sort((a, b) => b.count - a.count).slice(0, 12),
    categories: Array.from(categories.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12),
  }
}

// ── Claiming ─────────────────────────────────────────────────────────────────
/** Takes the job for this worker, or null when another worker holds it (or it's finished). */
export async function claim(db: any, jobId: string) {
  const stale = new Date(Date.now() - LEASE_MS).toISOString()
  const { data } = await db.from('import_jobs')
    .update({ status: 'running', updated_at: nowIso() })
    .eq('id', jobId)
    .or(`status.eq.queued,and(status.eq.running,updated_at.lt.${stale})`)
    .select('*')
    .maybeSingle()
  return data || null
}

/** Jobs a worker should pick up: queued, or running with an expired lease. */
export async function claimable(db: any, limit = 5) {
  const stale = new Date(Date.now() - LEASE_MS).toISOString()
  const { data } = await db.from('import_jobs').select('id')
    .or(`status.eq.queued,and(status.eq.running,updated_at.lt.${stale})`)
    .order('updated_at', { ascending: true }).limit(limit)
  return (data || []).map((r: any) => r.id as string)
}

// ── Running ──────────────────────────────────────────────────────────────────
const friendly = (msg: string) => {
  const m = String(msg || '')
  if (/PLAN_LIMIT/i.test(m)) return 'plan'
  if (/import_job_id/i.test(m) && /column|schema/i.test(m)) return 'Imports need a database update (COLVY_V350_IMPORT_JOBS.sql).'
  return m.slice(0, 240)
}
const PHASE_LABEL: Record<Phase, string> = { ideas: 'ideas', comments: 'comments', announcements: 'updates', articles: 'help articles' }

/** Inserts rows; on a failed batch, falls back to one-by-one so a single bad row
 *  doesn't sink the rest. Stops at the plan limit. */
async function insertRows(db: any, table: string, rows: any[], select = 'id') {
  const { data, error } = await db.from(table).insert(rows).select(select)
  if (!error) return { inserted: data || [], failed: 0, planLimit: false, errors: [] as string[] }
  const inserted: any[] = []
  const errors: string[] = []
  let failed = 0
  for (let i = 0; i < rows.length; i++) {
    const r = await db.from(table).insert(rows[i]).select(select).maybeSingle()
    if (!r.error) { if (r.data) inserted.push(r.data); continue }
    if (/PLAN_LIMIT/i.test(r.error.message || '')) return { inserted, failed: failed + (rows.length - i), planLimit: true, errors }
    if (/import_job_id/i.test(r.error.message || '')) throw new Error(friendly(r.error.message))
    failed++
    if (errors.length < 3) errors.push(friendly(r.error.message))
  }
  return { inserted, failed, planLimit: false, errors }
}

/** Moves a claimed job forward until it's finished or the deadline passes. */
export async function step(db: any, job: any, deadline: number): Promise<any> {
  const counts: Counts = { ...zeroCounts(), ...(job.counts || {}) }
  const errors: string[] = Array.isArray(job.errors) ? [...job.errors] : []
  let cursor: any = job.cursor || {}
  const save = async (patch: any = {}) => {
    const { data } = await db.from('import_jobs')
      .update({ counts, errors: errors.slice(0, 20), cursor, updated_at: nowIso(), ...patch })
      .eq('id', job.id).eq('status', 'running').select('id, status').maybeSingle()
    return !!data // false → someone cancelled it
  }
  const fail = async (msg: string) => {
    errors.unshift(msg)
    await db.from('import_jobs').update({
      status: 'failed', errors: errors.slice(0, 20), counts, cursor, payload: null,
      options: stripSecrets(job.options), finished_at: nowIso(), updated_at: nowIso(),
    }).eq('id', job.id).eq('status', 'running')
    return { ...job, status: 'failed' }
  }

  try {
    // ── fetch ──
    if (job.stage === 'fetch') {
      let lastBeat = 0
      const res = await readSource(job.source, job.options, deadline, async (n) => {
        counts.fetched = n
        if (Date.now() - lastBeat > 5000) { lastBeat = Date.now(); await save() }
      })
      const payload = filterPayload(res.payload, includeOf(job.options))
      const total = payload.ideas.length + payload.comments.length + payload.announcements.length + payload.articles.length
      if (!res.complete) errors.push('The source was very large, so only part of it could be read. Run the import again to bring in the rest — anything already imported is skipped.')
      errors.push(...res.warnings)
      if (!total) return fail('Nothing to import — the source has no items of the kinds you picked.')
      cursor = { phase: 'ideas', i: 0 }
      job = { ...job, payload, stage: 'write', total }
      // The API key isn't needed once the data is read.
      const ok = await save({ payload, stage: 'write', total, options: stripSecrets(job.options) })
      if (!ok) return job
    }

    // ── write ──
    const p: ImportPayload = job.payload || emptyPayload()
    let done = false
    while (Date.now() < deadline) {
      const phase: Phase = PHASES.includes(cursor.phase) ? cursor.phase : 'ideas'
      const list: any[] = (p as any)[phase] || []
      const start = Number(cursor.i) || 0
      if (start >= list.length || cursor.capped?.includes(phase)) {
        const next = PHASES[PHASES.indexOf(phase) + 1]
        if (!next) { done = true; break }
        cursor = { ...cursor, phase: next, i: 0 }
        continue
      }
      const batch = list.slice(start, start + BATCH)
      const r = await writeBatch(db, job, phase, batch)
      if (r.createdCategories?.length) cursor = { ...cursor, createdCategories: Array.from(new Set([...(cursor.createdCategories || []), ...r.createdCategories])) }
      counts[phase] += r.inserted
      counts.skipped += r.skipped
      for (const e of r.errors) if (errors.length < 20 && !errors.includes(e)) errors.push(e)
      if (r.planLimit) {
        const left = list.length - start - r.inserted - r.skipped
        errors.push(`Your plan’s limit for ${PHASE_LABEL[phase]} was reached, so ${Math.max(left, 0)} weren’t imported. Upgrade, then run the import again to add the rest.`)
        cursor = { ...cursor, capped: [...(cursor.capped || []), phase] }
      }
      cursor = { ...cursor, i: start + batch.length }
      if (!(await save())) return { ...job, status: 'cancelled' }
    }

    if (done) {
      await db.from('import_jobs').update({
        status: 'done', stage: null, counts, errors: errors.slice(0, 20), cursor, payload: null,
        options: stripSecrets(job.options), finished_at: nowIso(), updated_at: nowIso(),
      }).eq('id', job.id).eq('status', 'running')
      return { ...job, status: 'done', counts }
    }
    // Out of time: hand it back so the next tick (or the open page) carries on.
    await db.from('import_jobs').update({ status: 'queued', updated_at: nowIso() }).eq('id', job.id).eq('status', 'running')
    return { ...job, status: 'queued', counts }
  } catch (e: any) {
    if (e instanceof SourceError) return fail(e.message)
    return fail(friendly(e?.message || 'The import stopped unexpectedly.'))
  }
}

type BatchResult = { inserted: number; skipped: number; planLimit: boolean; errors: string[]; createdCategories?: string[] }
async function writeBatch(db: any, job: any, phase: Phase, batch: any[]): Promise<BatchResult> {
  const companyId = job.company_id
  const tag = { company_id: companyId, import_job_id: job.id }

  if (phase === 'comments') {
    // Comments go only on ideas this import created (not on skipped duplicates).
    const sids = new Set(batch.map(c => c.postSid))
    const sidToKey = new Map<string, string>()
    for (const i of (job.payload?.ideas || [])) if (i.sid && sids.has(i.sid)) sidToKey.set(i.sid, titleKey(i.title))
    const { data: mine } = await db.from('ideas').select('id, title').eq('company_id', companyId).eq('import_job_id', job.id).limit(20000)
    const keyToId = new Map<string, string>((mine || []).map((r: any) => [titleKey(r.title), r.id]))
    const rows = batch.map(c => {
      const ideaId = keyToId.get(sidToKey.get(c.postSid) || '')
      return ideaId ? { ...tag, idea_id: ideaId, user_id: null, user_name: c.author, content: c.content, is_private: !!c.isPrivate, ...(c.created_at ? { created_at: c.created_at } : {}) } : null
    }).filter(Boolean) as any[]
    if (!rows.length) return { inserted: 0, skipped: batch.length, planLimit: false, errors: [] }
    const r = await insertRows(db, 'comments', rows)
    return { inserted: r.inserted.length, skipped: batch.length - rows.length + r.failed, planLimit: r.planLimit, errors: r.errors }
  }

  const table = phase === 'ideas' ? 'ideas' : phase === 'announcements' ? 'announcements' : 'help_articles'
  const { fresh, dupes } = splitDupes(batch, await existingKeys(db, table, companyId))
  if (!fresh.length) return { inserted: 0, skipped: dupes.length, planLimit: false, errors: [] }

  let rows: any[]
  let createdCategories: string[] = []
  if (phase === 'ideas') {
    rows = fresh.map(i => ({
      ...tag, title: i.title, description: i.description || '', status: i.status, votes: i.votes || 0,
      created_by_name: i.author || 'Imported', topics: i.topics || [], ...(i.created_at ? { created_at: i.created_at } : {}),
    }))
  } else if (phase === 'announcements') {
    rows = fresh.map(a => ({ ...tag, title: a.title, description: a.description || '', tag: 'improvement', status: 'published', ...(a.created_at ? { created_at: a.created_at } : {}) }))
  } else {
    const { slugs, created } = await ensureCategories(db, job.company_id, fresh.map(a => a.category))
    createdCategories = created
    rows = fresh.map(a => ({
      ...tag, title: a.title, content: a.content, category: slugs.get(a.category) || categorySlug(a.category), status: a.status,
      featured: false, media: [], views: 0, likes: 0, ...(a.created_at ? { created_at: a.created_at } : {}),
    }))
  }
  const r = await insertRows(db, table, rows)
  return { inserted: r.inserted.length, skipped: dupes.length + (r.planLimit ? 0 : r.failed), planLimit: r.planLimit, errors: r.errors, createdCategories }
}

/** Help categories by name: reuse ones that exist, create the rest (remembered on the job for Undo). */
async function ensureCategories(db: any, companyId: string, names: string[]) {
  const slugs = new Map<string, string>()
  const created: string[] = []
  const wanted = Array.from(new Set(names.filter(Boolean)))
  if (!wanted.length) return { slugs, created }
  const { data: existing } = await db.from('help_categories').select('id, name, slug, position').eq('company_id', companyId)
  let pos = Math.max(0, ...(existing || []).map((c: any) => Number(c.position) || 0))
  for (const name of wanted) {
    const slug = categorySlug(name)
    const hit = (existing || []).find((c: any) => c.slug === slug || String(c.name).toLowerCase() === name.toLowerCase())
    if (hit) { slugs.set(name, hit.slug); continue }
    const { error } = await db.from('help_categories').insert({ company_id: companyId, name, slug, position: ++pos })
    if (!error) created.push(slug)
    slugs.set(name, slug)
  }
  return { slugs, created }
}

// ── Undo ─────────────────────────────────────────────────────────────────────
export async function undo(db: any, job: any) {
  const where = (t: string) => db.from(t).delete().eq('company_id', job.company_id).eq('import_job_id', job.id)
  for (const t of ['comments', 'ideas', 'announcements', 'help_articles']) {
    const { error } = await where(t)
    if (error) throw new Error(friendly(error.message))
  }
  // Categories this import created, if nothing else uses them now.
  const { data: fresh } = await db.from('import_jobs').select('cursor').eq('id', job.id).maybeSingle()
  for (const slug of (fresh?.cursor?.createdCategories || []) as string[]) {
    const { count } = await db.from('help_articles').select('id', { count: 'exact', head: true }).eq('company_id', job.company_id).eq('category', slug)
    if (!count) await db.from('help_categories').delete().eq('company_id', job.company_id).eq('slug', slug)
  }
  await db.from('import_jobs').update({ status: 'undone', undone_at: nowIso(), updated_at: nowIso(), payload: null }).eq('id', job.id)
}

export function includeOf(options: any): Include {
  const i = options?.include || {}
  return { ideas: i.ideas !== false, comments: i.comments !== false, announcements: i.announcements !== false, articles: i.articles !== false }
}
export function stripSecrets(options: any) {
  const { apiKey: _drop, ...rest } = options || {}
  return rest
}

/** What the admin page sees — never the payload or credentials. */
export function publicJob(j: any) {
  if (!j) return null
  return {
    id: j.id, source: j.source, status: j.status, stage: j.stage, counts: { ...zeroCounts(), ...(j.counts || {}) }, total: j.total || 0,
    errors: j.errors || [], label: j.options?.label || null, include: includeOf(j.options),
    created_by_name: j.created_by_name, created_at: j.created_at, updated_at: j.updated_at, finished_at: j.finished_at, undone_at: j.undone_at,
    phase: j.cursor?.phase || null,
  }
}
