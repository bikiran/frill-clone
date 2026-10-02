import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/integration-access'
import { requireCompanyAccess } from '@/lib/company-access'
import { emitIntegrationEvent, type EventPayload } from '@/lib/integration-events'

export const dynamic = 'force-dynamic'

// Events whose record is written from the browser (ideas, votes, comments,
// announcements, tasks). The browser only says WHAT happened and to which
// record; the server reads the record itself, so nothing in the payload is
// trusted. Ideas, votes and comments come from public board visitors, so those
// are accepted only for records created in the last few minutes and are sent
// once (dedupe). Status changes, announcements and tasks need a team member.

const RECENT_MS = 5 * 60_000
const recent = (iso?: string | null) => !!iso && Date.now() - Date.parse(iso) < RECENT_MS
const clip = (s: any, n = 400) => { const t = String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

async function statusName(db: any, key: string | null) {
  if (!key) return 'New'
  const pretty = key.replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase())
  try {
    const { data } = await db.from('statuses').select('label').eq('key', key).limit(1)
    return data?.[0]?.label || pretty
  } catch { return pretty }
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const b = await req.json().catch(() => ({}))
  const event = String(b.event || '')
  const id = String(b.id || '')
  const ok = NextResponse.json({ ok: true })

  if (event === 'idea.created' || event === 'idea.status_changed') {
    const { data: idea } = await db.from('ideas').select('id, title, description, status, votes, company_id, created_by_name, is_private, created_at').eq('id', id).maybeSingle()
    if (!idea?.company_id) return ok
    if (event === 'idea.created') {
      if (!recent(idea.created_at)) return ok
      emitIntegrationEvent(idea.company_id, event, {
        title: `New idea: ${clip(idea.title, 200)}`, summary: clip(idea.description), path: `/admin?idea=${idea.id}`,
        fields: { 'Submitted by': idea.created_by_name, Visibility: idea.is_private ? 'Private' : 'Public' },
        data: { idea: { id: idea.id, title: idea.title, description: idea.description, status: idea.status } },
        dedupeKey: `idea.created:${idea.id}`,
      }, { db })
      return ok
    }
    if (!(await requireCompanyAccess(req, db, idea.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const name = await statusName(db, idea.status)
    emitIntegrationEvent(idea.company_id, event, {
      title: `“${clip(idea.title, 160)}” is now ${name}`, path: `/admin?idea=${idea.id}`,
      fields: { 'New status': name, Votes: idea.votes ?? 0 },
      data: { idea: { id: idea.id, title: idea.title, status: idea.status, status_name: name, votes: idea.votes } },
      dedupeKey: `idea.status:${idea.id}:${idea.status}`,
    }, { db })
    return ok
  }

  if (event === 'idea.voted' || event === 'idea.commented') {
    const { data: idea } = await db.from('ideas').select('id, title, votes, company_id').eq('id', id).maybeSingle()
    if (!idea?.company_id) return ok
    if (event === 'idea.voted') {
      const { data: v } = await db.from('votes').select('id, user_name, created_at').eq('idea_id', id).order('created_at', { ascending: false }).limit(1)
      if (!v?.[0] || !recent(v[0].created_at)) return ok
      emitIntegrationEvent(idea.company_id, event, {
        title: `New vote on “${clip(idea.title, 160)}”`, path: `/admin?idea=${idea.id}`,
        fields: { 'Voted by': v[0].user_name, 'Total votes': idea.votes ?? null },
        data: { idea: { id: idea.id, title: idea.title, votes: idea.votes } },
        dedupeKey: `idea.voted:${v[0].id}`,
      }, { db })
    } else {
      const { data: c } = await db.from('comments').select('id, content, user_name, is_private, created_at').eq('idea_id', id).order('created_at', { ascending: false }).limit(1)
      if (!c?.[0] || c[0].is_private || !recent(c[0].created_at)) return ok
      emitIntegrationEvent(idea.company_id, event, {
        title: `New comment on “${clip(idea.title, 160)}”`, summary: `“${clip(c[0].content, 600)}”`, path: `/admin?idea=${idea.id}`,
        fields: { 'Comment by': c[0].user_name },
        data: { idea: { id: idea.id, title: idea.title }, comment: { id: c[0].id, content: c[0].content, author: c[0].user_name } },
        dedupeKey: `idea.commented:${c[0].id}`,
      }, { db })
    }
    return ok
  }

  if (event === 'announcement.published') {
    const { data: a } = await db.from('announcements').select('*').eq('id', id).maybeSingle()
    if (!a?.company_id || a.status !== 'published') return ok
    if (!(await requireCompanyAccess(req, db, a.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    emitIntegrationEvent(a.company_id, event, {
      title: `Announcement: ${clip(a.title, 200)}`, summary: clip(a.content || a.body || a.description, 600), path: '/admin/announcements',
      data: { announcement: { id: a.id, title: a.title } },
      dedupeKey: `announcement:${a.id}`,
    }, { db })
    return ok
  }

  if (event === 'task.created') {
    const companyId = String(b.companyId || '')
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const since = new Date(Date.now() - 2 * 60_000).toISOString()
    let q = db.from('conversation_tasks').select('id, title, text, due_date, priority, assigned_to, order_number, created_by, created_at')
      .eq('company_id', companyId).gte('created_at', since).order('created_at', { ascending: false }).limit(5)
    // With an id, that task; without one (bulk inserts), every task created in
    // the last two minutes. Each task is only ever sent once (dedupe).
    if (id) q = q.eq('id', id)
    const { data: tasks } = await q
    for (const t of tasks || []) {
      const p: EventPayload = {
        title: `New task: ${clip(t.title || t.text, 200)}`, path: '/admin/tasks',
        fields: {
          Due: t.due_date ? new Date(t.due_date).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'medium', timeStyle: 'short' }) : null,
          'Assigned to': t.assigned_to, Priority: t.priority && t.priority !== 'normal' ? t.priority : null, Order: t.order_number ? `#${t.order_number}` : null, 'Created by': t.created_by,
        },
        data: { task: { id: t.id, title: t.title || t.text, due_date: t.due_date } },
        dedupeKey: `task:${t.id}`,
      }
      emitIntegrationEvent(companyId, event, p, { db })
    }
    return ok
  }

  if (event === 'form.submitted') {
    // Public: someone filled in a form. Use the newest response, if it's fresh.
    const { data: form } = await db.from('forms').select('id, title, questions, company_id').eq('id', id).maybeSingle()
    if (!form?.company_id) return ok
    const { data: rs } = await db.from('form_responses').select('id, answers, created_at').eq('form_id', id).order('created_at', { ascending: false }).limit(1)
    const r = rs?.[0]
    if (!r || !recent(r.created_at)) return ok
    const qs: any[] = Array.isArray(form.questions) ? form.questions : []
    const answers = r.answers || {}
    const show = (v: any) => Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
    const fields: Record<string, string | null> = {}
    for (const q of qs.slice(0, 15)) {
      const v = answers[q.id] ?? answers[q.key]
      if (v !== undefined && v !== null && show(v).trim()) fields[clip(q.title || q.label || q.question || 'Answer', 80)] = clip(show(v), 300)
    }
    const find = (re: RegExp) => { const q = qs.find(x => re.test(String(x.type || '')) || re.test(String(x.title || x.label || ''))); const v = q ? answers[q.id] : null; return v ? String(v) : null }
    emitIntegrationEvent(form.company_id, event, {
      title: `New response to “${clip(form.title, 120)}”`,
      path: `/admin/forms/${form.id}/results`,
      customer: { name: find(/name/i), email: find(/email/i), phone: find(/phone|mobile/i) },
      fields,
      data: { form: { id: form.id, title: form.title, kind: 'form' }, response: { id: r.id, answers } },
      dedupeKey: `form:${r.id}`,
    }, { db })
    return ok
  }

  if (event === 'order.status_changed') {
    const { data: o } = await db.from('orders').select('*').eq('id', id).maybeSingle()
    if (!o?.company_id) return ok
    if (!(await requireCompanyAccess(req, db, o.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const { statusMeta } = await import('@/lib/orders')
    const label = statusMeta(o.status).label
    emitIntegrationEvent(o.company_id, event, {
      title: `Order #${o.order_number} is now ${label}`, path: `/admin/orders/${o.id}`,
      customer: { name: o.customer_name, email: o.customer_email, phone: o.customer_phone },
      fields: { 'New status': label, Total: o.total != null ? `$${Number(o.total).toFixed(2)}` : null, Tracking: o.tracking_number || null },
      data: { order: { id: o.id, number: o.order_number, channel: o.sales_channel, status: o.status, total: o.total, tracking_number: o.tracking_number || null } },
      dedupeKey: `order.status:${o.id}:${o.status}`,
    }, { db })
    return ok
  }

  return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
}
