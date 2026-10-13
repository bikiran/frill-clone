import { NextRequest, NextResponse } from 'next/server'
import { PAUSE_ACTION } from '@/lib/agent/pilot'
import { adminDb, superAdmin, safe, countRows } from '../_lib/super-admin'
import { collectIntegrations } from '../_lib/integrations'

export const dynamic = 'force-dynamic'

const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

/**
 * GET /api/platform-admin/company-health?companyId= — a quick health picture
 * for the console's business drawer: what's connected (and what's broken),
 * whether the AI agents are on / paused / failing, recent errors, and a few
 * activity counts (bookings, payments, calls). Super admin only; read-only.
 */
export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!isUuid(companyId)) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const now = Date.now()
  const d7 = new Date(now - 7 * 86_400_000).toISOString()
  const d30 = new Date(now - 30 * 86_400_000).toISOString()
  const ahead7 = new Date(now + 7 * 86_400_000).toISOString()
  const nowIso = new Date(now).toISOString()

  const [integrations, roles, pause, runs7, failed7, failedRuns, pending, apiErrors, hookErrors, payments, bookings30, bookingsNext7, calls7, missed7, openConvos] = await Promise.all([
    collectIntegrations(db, companyId),
    safe<any[]>(db.from('agent_roles').select('role_key, enabled').eq('company_id', companyId), []),
    safe<any[]>(db.from('agent_policies').select('autonomy, limits, updated_at').eq('company_id', companyId).is('role_key', null).eq('action_key', PAUSE_ACTION), []),
    countRows(db.from('agent_runs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', d7)),
    countRows(db.from('agent_runs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'failed').gte('created_at', d7)),
    safe<any[]>(db.from('agent_runs').select('id, role_key, summary, error, created_at').eq('company_id', companyId).eq('status', 'failed').gte('created_at', d7).order('created_at', { ascending: false }).limit(5), []),
    countRows(db.from('agent_approvals').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending')),
    safe<any[]>(db.from('api_logs').select('id, source, message, route, created_at').eq('company_id', companyId).eq('level', 'error').gte('created_at', d7).order('created_at', { ascending: false }).limit(5), []),
    safe<any[]>(db.from('webhook_events').select('id, source, event_type, status, error, created_at').eq('company_id', companyId).in('status', ['error', 'rejected']).gte('created_at', d7).order('created_at', { ascending: false }).limit(5), []),
    safe<any[]>(db.from('chat_payments').select('amount_cents, status, currency').eq('company_id', companyId).gte('created_at', d30).limit(2000), []),
    countRows(db.from('bookings').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', d30)),
    countRows(db.from('bookings').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['pending', 'confirmed']).gte('starts_at', nowIso).lt('starts_at', ahead7)),
    countRows(db.from('calls').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', d7)),
    countRows(db.from('calls').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', d7).in('status', ['no-answer', 'failed', 'busy'])),
    countRows(db.from('conversations').select('id', { count: 'exact', head: true }).eq('company_id', companyId).not('status', 'in', '("closed","resolved")')),
  ])

  const pauseRow = pause.data.find((p: any) => p.autonomy === 'off')
  let paidCents = 0, paidN = 0, pendingN = 0
  for (const p of payments.data) {
    if (p.status === 'paid') { paidCents += p.amount_cents || 0; paidN++ }
    else if (p.status === 'pending') pendingN++
  }

  const channels: Record<string, { total: number; active: number; issues: number }> = {}
  for (const r of integrations.rows) {
    const c = channels[r.type] ||= { total: 0, active: 0, issues: 0 }
    c.total++; if (r.active) c.active++; if (r.active && r.note) c.issues++
  }

  return NextResponse.json({
    channels,
    connections: integrations.rows.filter(r => r.active && r.note).map(r => ({ type: r.type, detail: r.detail, note: r.note, error: r.error })),
    agents: {
      platformPaused: process.env.AGENTS_DISABLED === '1',
      tablesMissing: roles.missing,
      enabledRoles: roles.data.filter((r: any) => r.enabled).map((r: any) => r.role_key),
      paused: pauseRow ? { by: pauseRow.limits?.by_name || null, at: pauseRow.limits?.at || pauseRow.updated_at || null } : null,
      runs7d: runs7, failed7d: failed7, pendingApprovals: pending,
      recentFailures: failedRuns.data,
    },
    errors: {
      api: apiErrors.data,
      webhooks: hookErrors.data,
    },
    activity: {
      openConversations: openConvos,
      calls7d: calls7, missedCalls7d: missed7,
      bookings30d: bookings30, bookingsNext7d: bookingsNext7,
      payLinksPaid30d: paidN, payLinksPaidAmount30d: paidCents / 100, payLinksPending30d: pendingN,
    },
  })
}
