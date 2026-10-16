// Reads and writes for the Forms list page. Each takes its Supabase client as
// an argument (the page passes the signed-in one), so it can be tested with a
// fake. Everything goes through RLS as the signed-in member: forms and
// form_responses are readable by the workspace's own team only.

import { countByForm, embeddedCount, mapLimit, questionCount, type FormListItem } from './forms-list'

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
  const counts = await mapLimit(list, 6, async f => {
    try {
      const { count, error: e } = await db.from('form_responses').select('id', { count: 'exact', head: true }).eq('form_id', f.id)
      return e || typeof count !== 'number' ? null : count
    } catch { return null }
  })
  return list.map((f, i) => ({ ...f, response_count: counts[i] }))
}

/**
 * Responses created after `since`, counted per form. At most 1000 rows per
 * request; a form whose count may have been cut short is listed in `more`.
 */
export async function countNewSince(db: DbLike, formIds: string[], since: string): Promise<{ counts: Record<string, number>; more: Set<string> }> {
  const counts: Record<string, number> = {}
  const more = new Set<string>()
  await Promise.all(chunks(formIds, ID_CHUNK).map(async ids => {
    try {
      const { data, error } = await db.from('form_responses').select('form_id').in('form_id', ids).gt('created_at', since).limit(NEW_LIMIT)
      if (error || !Array.isArray(data)) return
      const c = countByForm(data)
      Object.assign(counts, c)
      if (data.length >= NEW_LIMIT) for (const id of Object.keys(c)) more.add(id)
    } catch { /* "new" is a nicety; leave it out */ }
  }))
  return { counts, more }
}

/**
 * Deletes the given drafts, but only those that are still empty when checked
 * again here: not live, no questions, no responses. Returns the ids actually
 * deleted (from the delete itself, so a row RLS kept is never reported gone).
 */
export async function deleteEmptyDrafts(db: DbLike, ids: string[]): Promise<{ deleted: string[]; error?: string }> {
  if (!ids.length) return { deleted: [] }
  const deleted: string[] = []
  for (const part of chunks(ids, ID_CHUNK)) {
    const [forms, resp] = await Promise.all([
      db.from('forms').select('id, questions, is_published').in('id', part),
      db.from('form_responses').select('form_id').in('form_id', part).limit(NEW_LIMIT),
    ])
    if (forms.error || resp.error) return { deleted, error: (forms.error || resp.error).message || 'Could not check the drafts' }
    const answered = new Set(Object.keys(countByForm(resp.data)))
    const safe = (forms.data || []).filter((f: any) => !f.is_published && questionCount(f) === 0 && !answered.has(f.id)).map((f: any) => f.id)
    if (!safe.length) continue
    const del = await db.from('forms').delete().in('id', safe).eq('is_published', false).select('id')
    if (del.error) return { deleted, error: del.error.message || 'Could not delete the drafts' }
    for (const r of del.data || []) if (r?.id) deleted.push(r.id)
  }
  return { deleted }
}
