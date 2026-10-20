import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin } from '../_lib/super-admin'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { computeStatus } from '@/lib/status-server'
import { createIncident, deleteIncident, getIncident, listIncidents, updateIncident } from '@/lib/status-incidents'
import { expirePublicStatus } from '@/lib/status-cached'
import { toPublicStatus } from '@/lib/status-health'

export const dynamic = 'force-dynamic'

// Super admin → Status & incidents.
//
// GET   the live status (computed now, uncached) exactly as the public page
//       would show it, plus each component's internal reasoning (platform
//       counts, never shown publicly), and every incident from the last 90
//       days including drafts.
// POST { action, … }
//   create  { title, impact, components, message, status?, published?, startedAt? }
//   update  { id, title?, impact?, components?, published?, startedAt?, status?, message? }
//           (a status change needs a message; resolving stamps the time)
//   delete  { id }
// Every write is audit-logged (super_admin_audit) and expires the public
// status cache so customers see it on their next load.
export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const [full, inc] = await Promise.all([computeStatus(db), listIncidents(db, { days: 90 })])
  return NextResponse.json({
    public: toPublicStatus(full),
    reasons: Object.fromEntries(full.components.map(c => [c.key, c.detail || []])),
    incidents: inc.incidents,
    unavailable: inc.unavailable,
    historyAvailable: !!full.history,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const me = await superAdmin(req, db)
  if (!me) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const audit = (action: string, summary: string, detail: any) =>
    logSuperAdminAudit(db, { adminId: me.id, adminEmail: me.email, action: `status.incident.${action}`, summary, detail })

  if (body.action === 'create') {
    const r = await createIncident(db, body, me.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 400 })
    await audit('create', `Incident opened: ${r.incident!.title}`, { id: r.incident!.id, impact: r.incident!.impact, status: r.incident!.status, components: r.incident!.components, published: r.incident!.published })
    expirePublicStatus()
    return NextResponse.json({ ok: true, incident: r.incident })
  }
  if (body.action === 'update') {
    const id = String(body.id || '')
    const { id: _id, action: _a, ...patch } = body
    const before = (await getIncident(db, id)).incident
    const r = await updateIncident(db, id, patch)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 400 })
    const verb = r.incident!.status === 'resolved' && before?.status !== 'resolved' ? 'resolve' : 'update'
    await audit(verb, `Incident ${verb === 'resolve' ? 'resolved' : 'updated'}: ${r.incident!.title}`, {
      id, from: before ? { status: before.status, impact: before.impact, published: before.published } : null,
      to: { status: r.incident!.status, impact: r.incident!.impact, published: r.incident!.published, components: r.incident!.components },
      posted: !!patch.message,
    })
    expirePublicStatus()
    return NextResponse.json({ ok: true, incident: r.incident })
  }
  if (body.action === 'delete') {
    const id = String(body.id || '')
    const before = (await getIncident(db, id)).incident
    const r = await deleteIncident(db, id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 400 })
    await audit('delete', `Incident deleted: ${before?.title || id}`, { id })
    expirePublicStatus()
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
