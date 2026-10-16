// Reads and writes for the Forms list page. Each takes its Supabase client as
// an argument (the page passes the signed-in one), so it can be tested with a
// fake. Everything goes through RLS as the signed-in member: forms and
// form_responses are readable by the workspace's own team only.

import { countByForm, embeddedCount, isEmptyDraft, mapLimit, type FormListItem } from './forms-list'

export type DbLike = { from(table: string): any }

const NEW_LIMIT = 1000
const ID_CHUNK = 100   // .in('form_id', ids) goes into the request URL

const chunks = <T,>(list: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * The workspace's forms with their response counts, newest first. One request:
 * PostgREST counts each form's responses in the same select. If that embed
 * isn't available, falls back to one head count per form, six at a time. A
 * count that fails is null ("not available"), never a guess.
 */
export async function loadForms(db: DbLike, companyId: string): Promise<FormListItem[]> {
  const embedded = await db.from('forms').select('*, form_responses(count)').eq('company_id', companyId).order('created_at', { ascending: false })
  if (!embedded.error && Array.isArray(embedded.data)) {
    return embedded.data.map((f: any) => {
      const row = { ...f, response_count: embeddedCount(f) }
      delete row.form_responses
      return row as FormListItem
    })
  }
  const { data, error } = await db.from('forms').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load forms')
  const list: any[] = Array.isArray(data) ? data : []
  const counts = await mapLimit(list, 6, f => exactCount(db, f.id))
  return list.map((f, i) => ({ ...f, response_count: counts[i] }))
}

/**
 * Responses created after `since`, counted per form. At most 1000 rows per
 * request; a form whose count may have been cut short is listed in `more`.
 * `ok` is false if any request failed (the page then keeps the old last visit).
 */
export async function countNewSince(db: DbLike, formIds: string[], since: string): Promise<{ counts: Record<string, number>; more: Set<string>; ok: boolean }> {
  const counts: Record<string, number> = {}
  const more = new Set<string>()
  let ok = true
  await Promise.all(chunks(formIds, ID_CHUNK).map(async ids => {
    try {
      const { data, error } = await db.from('form_responses').select('form_id').in('form_id', ids).gt('created_at', since).limit(NEW_LIMIT)
      if (error || !Array.isArray(data)) { ok = false; return }
      const c = countByForm(data)
      Object.assign(counts, c)
      if (data.length >= NEW_LIMIT) for (const id of Object.keys(c)) more.add(id)
    } catch { ok = false /* "new" is a nicety; leave it out */ }
  }))
  return { counts, more, ok }
}

/** Exact response count for one form, or null when it can't be counted. */
async function exactCount(db: DbLike, formId: string): Promise<number | null> {
  try {
    const { count, error } = await db.from('form_responses').select('id', { count: 'exact', head: true }).eq('form_id', formId)
    return error || typeof count !== 'number' ? null : count
  } catch { return null }
}

export const RECHECK_COLUMNS = 'id, title, questions, is_published, theme, welcome_message, thank_you_message, end_actions, updated_at'

/**
 * Deletes the given drafts, but only those that are still empty when checked
 * again here (isEmptyDraft on a fresh read plus an exact response count). Each
 * delete also requires the row to be unchanged since that read: still a draft,
 * still no questions, same updated_at (every builder save and rename bumps it).
 * Returns the ids actually deleted, taken from the delete itself, so a row RLS
 * kept, or one edited meanwhile, is never reported gone.
 */
export async function deleteEmptyDrafts(db: DbLike, ids: string[]): Promise<{ deleted: string[]; error?: string }> {
  if (!ids.length) return { deleted: [] }
  const deleted: string[] = []
  for (const part of chunks(ids, ID_CHUNK)) {
    const fresh = await db.from('forms').select(RECHECK_COLUMNS).in('id', part)
    if (fresh.error) return { deleted, error: fresh.error.message || 'Could not check the drafts' }
    const rows: any[] = Array.isArray(fresh.data) ? fresh.data : []
    const counts = await mapLimit(rows, 6, r => exactCount(db, r.id))
    const safe = rows.filter((r, i) => counts[i] === 0 && isEmptyDraft({ ...r, response_count: counts[i] }))
    let failed: string | undefined
    await mapLimit(safe, 4, async r => {
      try {
        let q = db.from('forms').delete().eq('id', r.id).eq('is_published', false).eq('questions', '[]')
        q = r.updated_at ? q.eq('updated_at', r.updated_at) : q.is('updated_at', null)
        const del = await q.select('id')
        if (del.error) { failed = del.error.message || 'Could not delete the drafts'; return }
        for (const d of del.data || []) if (d?.id) deleted.push(d.id)
      } catch (e: any) { failed = e?.message || 'Could not delete the drafts' }
    })
    if (failed) return { deleted, error: failed }
  }
  return { deleted }
}
