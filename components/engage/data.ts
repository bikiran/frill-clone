// Reads and writes for the Polls and Surveys admin pages, as the signed-in
// member (RLS: is_company_member after V386). Deleting answers goes through
// /api/engage/responses because V386 leaves the answer tables server-write only.
// Every write drops columns an older database doesn't have yet (V386 adds
// settings / updated_at / description) and says which were dropped, so the
// page can tell the owner a setting needs the migration.

import { authFetch } from '@/lib/auth-fetch'
import { duplicateRow, pollListItem, surveyListItem, type EngageKind, type EngageListItem } from '@/lib/engage-core'

type Db = { from: (t: string) => any }

export const TABLE = { poll: 'polls', survey: 'surveys' } as const
export const ANSWERS = { poll: { table: 'poll_votes', col: 'poll_id' }, survey: { table: 'survey_responses', col: 'survey_id' } } as const

/** Optional columns, newest first: dropped one at a time when the database says they're missing. */
const OPTIONAL = ['settings', 'updated_at', 'description', 'image_url', 'poll_type', 'status', 'questions']

function missingColumn(error: any): string | null {
  const msg = String(error?.message || '')
  const m = /column "?(?:[a-z_]+\.)?([a-z_]+)"? (?:of relation "?[a-z_]+"? )?does not exist/i.exec(msg) || /Could not find the '([a-z_]+)' column/i.exec(msg)
  return m ? m[1] : null
}

async function withFallback(run: (row: Record<string, any>) => PromiseLike<{ data: any; error: any }>, row: Record<string, any>): Promise<{ data: any; error: any; dropped: string[] }> {
  let cur = { ...row }
  const dropped: string[] = []
  for (let i = 0; i < OPTIONAL.length + 1; i++) {
    const { data, error } = await run(cur)
    if (!error) return { data, error: null, dropped }
    const col = missingColumn(error)
    if (col && OPTIONAL.includes(col) && col in cur) { const next = { ...cur }; delete next[col]; cur = next; dropped.push(col); continue }
    return { data: null, error, dropped }
  }
  return { data: null, error: { message: 'Could not save' }, dropped }
}

export function insertItem(db: Db, kind: EngageKind, row: Record<string, any>) {
  return withFallback(r => db.from(TABLE[kind]).insert(r).select().single(), row)
}

export function updateItem(db: Db, kind: EngageKind, id: string, fields: Record<string, any>) {
  return withFallback(r => db.from(TABLE[kind]).update(r).eq('id', id).select().maybeSingle(), { ...fields, updated_at: new Date().toISOString() })
}

export function duplicateItem(db: Db, kind: EngageKind, row: Record<string, any>) {
  return insertItem(db, kind, duplicateRow(kind, row))
}

export async function deleteItem(db: Db, kind: EngageKind, id: string): Promise<boolean> {
  const { data, error } = await db.from(TABLE[kind]).delete().eq('id', id).select('id')
  return !error && Array.isArray(data) && data.length > 0
}

/** People who answered each item: rows sharing a voter_key are one person. Null where it couldn't be counted. */
export async function countPeople(db: Db, kind: EngageKind, ids: string[]): Promise<Record<string, number | null>> {
  const { table, col } = ANSWERS[kind]
  const out: Record<string, number | null> = Object.fromEntries(ids.map(id => [id, 0]))
  if (!ids.length) return out
  const seen: Record<string, Set<string>> = {}
  let cols = `id, ${col}, voter_key`
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    for (let from = 0; from < 20_000; from += 1000) {
      let res = await db.from(table).select(cols).in(col, chunk).range(from, from + 999)
      if (res.error && cols.includes('voter_key')) { cols = `id, ${col}`; res = await db.from(table).select(cols).in(col, chunk).range(from, from + 999) }
      if (res.error) { chunk.forEach(id => { out[id] = null }); break }
      for (const r of res.data || []) {
        const k = String(r[col]); (seen[k] ||= new Set()).add(r.voter_key ? `v:${r.voter_key}` : `r:${r.id}`)
      }
      if ((res.data || []).length < 1000) break
    }
  }
  for (const id of ids) if (out[id] !== null) out[id] = seen[id]?.size || 0
  return out
}

export async function loadList(db: Db, kind: EngageKind, companyId: string): Promise<EngageListItem[]> {
  const { data, error } = await db.from(TABLE[kind]).select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  const rows: any[] = data || []
  const counts = await countPeople(db, kind, rows.map(r => r.id)).catch(() => ({} as Record<string, number | null>))
  const now = Date.now()
  return rows.map(r => (kind === 'poll' ? pollListItem(r, counts[r.id] ?? null, now) : surveyListItem(r, counts[r.id] ?? null, now)))
}

/** Every vote / response of one item, newest first (capped). */
export async function loadAnswers(db: Db, kind: EngageKind, id: string, cap = 10_000): Promise<{ rows: any[]; capped: boolean; error?: string }> {
  const { table, col } = ANSWERS[kind]
  const rows: any[] = []
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await db.from(table).select('*').eq(col, id).order('created_at', { ascending: false }).range(from, from + 999)
    if (error) return { rows, capped: false, error: error.message || 'Couldn’t load the answers' }
    rows.push(...(data || []))
    if ((data || []).length < 1000) return { rows, capped: false }
  }
  return { rows, capped: true }
}

export async function deleteAnswers(kind: EngageKind, id: string, companyId: string, opts: { ids?: string[]; all?: boolean }): Promise<{ deleted: number; error?: string }> {
  try {
    const res = await authFetch('/api/engage/responses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id, companyId, ...opts }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return { deleted: Number(d?.deleted) || 0, error: d?.error || 'Couldn’t delete them just now.' }
    return { deleted: Number(d?.deleted) || 0 }
  } catch {
    return { deleted: 0, error: 'Couldn’t reach Colvy. Check your connection and try again.' }
  }
}

/**
 * "Send by SMS": a campaign draft with the poll / survey as its tracked link,
 * opened in the campaign builder, which handles the audience (segments, tags,
 * outlets), marketing consent, opt-outs, quiet hours and cost. Each recipient
 * gets their own short link, so their vote is matched to them.
 */
export async function createCampaignDraft(db: Db, args: { companyId: string; kind: EngageKind; id: string; title: string; url: string; user?: any }): Promise<{ id?: string; error?: string }> {
  const noun = args.kind === 'poll' ? 'poll' : 'survey'
  const message = args.kind === 'poll'
    ? `Hi {{first_name}}, quick question from {{store_name}}: ${args.title.slice(0, 90)} Have your say: {{short_link}}`
    : `Hi {{first_name}}, {{store_name}} would love your feedback. It takes less than a minute: {{short_link}}`
  const { data, error } = await db.from('campaigns').insert({
    company_id: args.companyId,
    name: `${noun === 'poll' ? 'Poll' : 'Survey'}: ${args.title}`.slice(0, 120),
    channel: 'sms',
    status: 'draft',
    message,
    attachments: [{ kind: noun, id: args.id, label: args.title.slice(0, 120), url: args.url }],
    created_by: args.user?.user_metadata?.display_name || args.user?.email?.split('@')[0] || null,
    created_by_id: args.user?.id || null,
  }).select('id').maybeSingle()
  if (error || !data?.id) return { error: error?.message || 'Couldn’t start the campaign.' }
  return { id: data.id }
}

/** The public address of a poll / survey on the workspace's own subdomain when it has one. */
export function publicUrl(kind: EngageKind, id: string, slug?: string | null): string {
  const path = `/${kind === 'poll' ? 'polls' : 'surveys'}/${id}`
  if (typeof window === 'undefined') return path
  const host = window.location.hostname
  if (slug && (host === 'colvy.com' || host === 'www.colvy.com')) return `https://${slug}.colvy.com${path}`
  return `${window.location.origin}${path}`
}
