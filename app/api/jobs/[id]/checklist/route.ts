import { NextRequest } from 'next/server'
import { jobsDb, json, logJobEvent, isUuid, isMissingJobsSchema, setupNeeded } from '@/lib/jobs/server'
import { jobContext } from '@/lib/jobs/field'
import { cleanChecklistText, cleanChecklistItems, MAX_CHECKLIST_ITEMS } from '@/lib/jobs/work'

export const dynamic = 'force-dynamic'

// POST { companyId, action, ... } on a job's checklist:
//   add { text }              a new item (or several, one per line)
//   toggle { itemId, done }   tick or untick (who and when are kept)
//   edit { itemId, text }
//   delete { itemId }
//   apply { checklistId }     add a saved checklist's items (skipping ones already there)
// One row per item, so two people ticking at once can't undo each other.

type Ctx = { params: Promise<{ id: string }> }
const COLS = 'id, text, done, done_by_id, done_by_name, done_at, sort_order'

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = jobsDb()
    const body = await req.json().catch(() => ({}))
    const c = await jobContext(req, db, body.companyId, id)
    if (c.response) return c.response
    const { access } = c
    const companyId = String(body.companyId)
    const list = () => db.from('job_checklist_items').select(COLS).eq('company_id', companyId).eq('job_id', id).order('sort_order').limit(200)

    switch (String(body.action)) {
      case 'add': {
        const texts = cleanChecklistItems(body.text)
        if (!texts.length) return json({ error: 'Write the item first.' }, 400)
        const { count } = await db.from('job_checklist_items').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('job_id', id)
        if ((count || 0) + texts.length > MAX_CHECKLIST_ITEMS) return json({ error: `A checklist can have up to ${MAX_CHECKLIST_ITEMS} items.` }, 400)
        const base = Date.now() / 1000
        const { error } = await db.from('job_checklist_items').insert(texts.map((t, i) => ({ company_id: companyId, job_id: id, text: t, sort_order: base + i / 1000, created_by: access.userId })))
        if (error) { if (isMissingJobsSchema(error)) return setupNeeded(); throw error }
        break
      }
      case 'toggle': {
        if (!isUuid(body.itemId)) return json({ error: 'Item not found.' }, 404)
        const done = body.done === true
        const patch = done ? { done: true, done_by_id: access.userId, done_by_name: access.name, done_at: new Date().toISOString() } : { done: false, done_by_id: null, done_by_name: null, done_at: null }
        const { data, error } = await db.from('job_checklist_items').update(patch).eq('company_id', companyId).eq('job_id', id).eq('id', body.itemId).select('id')
        if (error) throw error
        if (!data?.length) return json({ error: 'That item was just removed.' }, 404)
        break
      }
      case 'edit': {
        const text = cleanChecklistText(body.text)
        if (!isUuid(body.itemId) || !text) return json({ error: 'Write the item first.' }, 400)
        await db.from('job_checklist_items').update({ text }).eq('company_id', companyId).eq('job_id', id).eq('id', body.itemId)
        break
      }
      case 'delete': {
        if (!isUuid(body.itemId)) return json({ error: 'Item not found.' }, 404)
        await db.from('job_checklist_items').delete().eq('company_id', companyId).eq('job_id', id).eq('id', body.itemId)
        break
      }
      case 'apply': {
        if (!isUuid(body.checklistId)) return json({ error: 'Which checklist?' }, 400)
        const { data: tpl } = await db.from('job_checklists').select('id, name, items').eq('company_id', companyId).eq('id', body.checklistId).maybeSingle()
        if (!tpl) return json({ error: 'That checklist wasn’t found.' }, 404)
        const { data: have } = await list()
        const existing = new Set((have || []).map((x: any) => x.text.toLowerCase()))
        const add = cleanChecklistItems(tpl.items).filter(t => !existing.has(t.toLowerCase())).slice(0, Math.max(0, MAX_CHECKLIST_ITEMS - (have || []).length))
        if (add.length) {
          const base = Date.now() / 1000
          await db.from('job_checklist_items').insert(add.map((t, i) => ({ company_id: companyId, job_id: id, text: t, sort_order: base + i / 1000, created_by: access.userId })))
        }
        await logJobEvent(db, { companyId, jobId: id, type: 'checklist_added', actorId: access.userId, actorName: access.name, summary: `Added the “${tpl.name}” checklist (${add.length} item${add.length === 1 ? '' : 's'})` })
        break
      }
      default:
        return json({ error: 'Unknown action.' }, 400)
    }
    const { data: items } = await list()
    return json({ checklist: items || [] })
  } catch (e: any) {
    if (isMissingJobsSchema(e)) return setupNeeded()
    return json({ error: e?.message || 'Could not update the checklist.' }, 500)
  }
}
