import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { loadOpenTasks, findMatch, newStepsFor, nameTokens, upsertTask } from '@/lib/task-dedupe'

export const dynamic = 'force-dynamic'

// The "Draft tasks" card (call summary / chat summary action items).
//
//   POST { action: 'match', companyId, conversationId, drafts: [{ title, steps }] }
//     → { matches: [{ taskId, title, checklistCount, newSteps } | null, …] }
//     Which drafts an open task already covers ("Already a task: …").
//
//   POST { action: 'apply', companyId, conversationId, source, actorName?, drafts: [{
//          title, steps, priority?, assigneeId?, assigneeName?, locationId?, dueDate?,
//          mode: 'add' | 'create', taskId? }] }
//     → { results: [{ action: 'created' | 'updated' | 'skipped', taskId, title, added, summary }, …] }
//     "Add as checklist" puts the steps on that task (skipping ones it has);
//     "Create" makes one task per draft, its steps as the checklist.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const str = (v: unknown, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const isUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''))

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { companyId, conversationId } = body || {}
    const db = admin()
    if (!companyId || !conversationId) return NextResponse.json({ error: 'companyId and conversationId are required' }, { status: 400 })
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: access.unavailable ? 503 : 403 })

    const { data: conv } = await db.from('conversations').select('id, contact_id').eq('company_id', companyId).eq('id', conversationId).maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    let contactName: string | null = null
    if (conv.contact_id) {
      const { data: ct } = await db.from('contacts').select('name').eq('company_id', companyId).eq('id', conv.contact_id).maybeSingle()
      contactName = ct?.name || null
    }

    const drafts = (Array.isArray(body.drafts) ? body.drafts : []).slice(0, 10).map((d: any) => ({
      ...d,
      title: str(d?.title, 200),
      steps: (Array.isArray(d?.steps) ? d.steps : []).map((s: any) => str(s)).filter(Boolean).slice(0, 20),
    })).filter((d: any) => d.title)

    if (body.action === 'match') {
      const open = await loadOpenTasks(db, { companyId, conversationId, contactId: conv.contact_id || null })
      const matches = drafts.map((d: any) => {
        const t = findMatch(open, { title: d.title, steps: d.steps }, contactName)
        if (!t) return null
        return { taskId: t.id, title: t.title, checklistCount: (t.checklist || []).length, newSteps: newStepsFor(t, d.steps.length ? d.steps : [d.title], nameTokens(contactName)).length }
      })
      return NextResponse.json({ matches })
    }

    if (body.action === 'apply') {
      const source = body.source === 'call_summary' ? 'call_summary' : 'ai_summary'
      const actorName = str(body.actorName, 80) || null
      const results = []
      for (const d of drafts) {
        const assignee = isUuid(d.assigneeId) ? [{ id: String(d.assigneeId), name: str(d.assigneeName, 80) || 'Team member' }] : []
        const r = await upsertTask(db, {
          companyId, conversationId, contactId: conv.contact_id || null, contactName,
          title: d.title, steps: d.steps,
          priority: ['low', 'normal', 'high'].includes(d.priority) ? d.priority : 'normal',
          dueDate: d.dueDate && !isNaN(new Date(d.dueDate).getTime()) ? new Date(d.dueDate).toISOString() : null,
          locationId: isUuid(d.locationId) ? d.locationId : null,
          assignees: assignee,
          createdBy: actorName, createdById: access.userId || null, source,
          // A person chose: add to the task they were shown, or a new one.
          mode: d.mode === 'add' && d.taskId ? 'add' : 'create', existingTaskId: d.mode === 'add' ? d.taskId : null,
          actorName, actorId: access.userId || null, sourceLabel: source === 'call_summary' ? 'call summary' : 'chat summary',
        })
        results.push({ action: r.action, taskId: r.taskId || null, title: r.title, added: r.added, summary: r.summary, ...(r.error ? { error: r.error } : {}) })
      }
      const failed = results.filter(r => (r as any).error)
      return NextResponse.json({ results }, { status: failed.length && failed.length === results.length ? 500 : 200 })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
