import { NextRequest, NextResponse } from 'next/server'
import { setPaused, PAUSE_ACTION } from '@/lib/agent/pilot'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { adminDb, superAdmin, safe, companyNames, hostOnly } from '../_lib/super-admin'

export const dynamic = 'force-dynamic'

const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const STUCK_MS = 15 * 60_000

// Role-less agent_policies rows that hold per-business settings (lib/agent/pilot).
const DIGEST_ACTION = 'weekly_digest'
const ALERTS_ACTION = 'needs_you_alerts'

/**
 * The AI Agent Engine across every business (super admin only).
 *
 * GET  ?days=7         → per-business agent state (roles on, paused, runs,
 *                        failures, approvals waiting, tokens, weekly digest,
 *                        Needs-you alerts, outside tools) + recent failed /
 *                        stuck runs.
 * GET  ?runId=<uuid>   → one run with every step and approval.
 * POST { action: 'pause' | 'resume', companyId, reason }
 *                      → the business's "Pause all agents" switch (audited).
 */
export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const runId = req.nextUrl.searchParams.get('runId')
  if (runId) {
    if (!isUuid(runId)) return NextResponse.json({ error: 'Bad runId' }, { status: 400 })
    const run = await safe<any>(db.from('agent_runs').select('*').eq('id', runId).maybeSingle(), null)
    if (!run.data) return NextResponse.json({ error: run.missing ? 'Agent engine tables are missing (COLVY_V353_AGENT_ENGINE.sql).' : 'Run not found' }, { status: 404 })
    const [steps, approvals, cos] = await Promise.all([
      safe<any[]>(db.from('agent_steps').select('id, seq, kind, action_key, input, output, reason, decision, decision_reason, autonomy, status, duration_ms, tokens_in, tokens_out, created_at').eq('run_id', runId).order('seq', { ascending: true }).limit(200), []),
      safe<any[]>(db.from('agent_approvals').select('id, action_key, status, created_at, expires_at, decided_at, result').eq('run_id', runId).order('created_at', { ascending: true }), []),
      companyNames(db, [run.data.company_id]),
    ])
    return NextResponse.json({ run: { ...run.data, company: cos[run.data.company_id] || null }, steps: steps.data, approvals: approvals.data })
  }

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 7, 1), 90)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  // Runs in the window — only the columns the summary needs, paged.
  const runs: any[] = []
  let missing = false
  for (let from = 0; from < 50_000; from += 1000) {
    const r = await safe<any[]>(db.from('agent_runs').select('id, company_id, role_key, mode, trigger_type, status, outcome, summary, error, tokens_in, tokens_out, created_at, updated_at, finished_at').gte('created_at', since).order('created_at', { ascending: false }).range(from, from + 999), [])
    if (r.error) { missing = r.missing; break }
    runs.push(...r.data)
    if (r.data.length < 1000) break
  }
  if (missing) return NextResponse.json({ missing: true, days, platformPaused: process.env.AGENTS_DISABLED === '1', companies: [], failures: [], stuck: [], recent: [], totals: null })

  const [roles, policies, approvals, stuckRows, conns] = await Promise.all([
    safe<any[]>(db.from('agent_roles').select('company_id, role_key, enabled, updated_at'), []),
    safe<any[]>(db.from('agent_policies').select('company_id, role_key, action_key, autonomy, limits, updated_at').is('role_key', null).in('action_key', [PAUSE_ACTION, DIGEST_ACTION, ALERTS_ACTION]), []),
    safe<any[]>(db.from('agent_approvals').select('company_id, created_at, expires_at').eq('status', 'pending').limit(5000), []),
    // Older than the window too: anything still queued/running a while later is stuck.
    safe<any[]>(db.from('agent_runs').select('id, company_id, role_key, trigger_type, status, summary, error, created_at, updated_at').in('status', ['queued', 'running']).lt('updated_at', new Date(Date.now() - STUCK_MS).toISOString()).order('updated_at', { ascending: true }).limit(100), []),
    safe<any[]>(db.from('agent_connections').select('id, company_id, name, url, enabled, status, last_error, server_name, synced_at, roles, tools'), []),
  ])

  type Co = {
    id: string; name: string; slug: string
    enabledRoles: string[]; roleCount: number
    paused: { paused: boolean; byName?: string | null; at?: string | null }
    runs: number; completed: number; failed: number; escalated: number; awaiting: number; cancelled: number
    tokensIn: number; tokensOut: number; lastRunAt: string | null
    pendingApprovals: number; oldestApprovalAt: string | null
    digest: { enabled: boolean; lastWeek: string | null }
    alerts: { enabled: boolean; notified7d: number; lastNotifiedAt: string | null }
    connections: { total: number; enabled: number; errors: number }
  }
  const map: Record<string, Co> = {}
  const co = (id: string): Co => map[id] ||= {
    id, name: '', slug: '', enabledRoles: [], roleCount: 0, paused: { paused: false },
    runs: 0, completed: 0, failed: 0, escalated: 0, awaiting: 0, cancelled: 0, tokensIn: 0, tokensOut: 0, lastRunAt: null,
    pendingApprovals: 0, oldestApprovalAt: null,
    digest: { enabled: true, lastWeek: null }, alerts: { enabled: true, notified7d: 0, lastNotifiedAt: null },
    connections: { total: 0, enabled: 0, errors: 0 },
  }

  for (const r of roles.data) { if (!r.company_id) continue; const c = co(r.company_id); c.roleCount++; if (r.enabled) c.enabledRoles.push(r.role_key) }
  const weekAgo = Date.now() - 7 * 86_400_000
  for (const p of policies.data) {
    if (!p.company_id) continue
    const c = co(p.company_id), l = p.limits || {}
    if (p.action_key === PAUSE_ACTION && p.autonomy === 'off') c.paused = { paused: true, byName: l.by_name || null, at: l.at || p.updated_at || null }
    if (p.action_key === DIGEST_ACTION) c.digest = { enabled: l.enabled !== false, lastWeek: l.last_week || null }
    if (p.action_key === ALERTS_ACTION) {
      const stamps = Object.values(l.notified && typeof l.notified === 'object' ? l.notified : {}).map(v => new Date(String(v)).getTime()).filter(n => Number.isFinite(n))
      c.alerts = { enabled: l.enabled !== false, notified7d: stamps.filter(t => t > weekAgo).length, lastNotifiedAt: stamps.length ? new Date(Math.max(...stamps)).toISOString() : null }
    }
  }
  for (const a of approvals.data) {
    if (!a.company_id) continue
    const c = co(a.company_id); c.pendingApprovals++
    if (!c.oldestApprovalAt || a.created_at < c.oldestApprovalAt) c.oldestApprovalAt = a.created_at
  }
  for (const r of runs) {
    if (!r.company_id) continue
    const c = co(r.company_id); c.runs++
    if (r.status === 'completed') c.completed++
    else if (r.status === 'failed') c.failed++
    else if (r.status === 'escalated') c.escalated++
    else if (r.status === 'awaiting_approval') c.awaiting++
    else if (r.status === 'cancelled') c.cancelled++
    c.tokensIn += r.tokens_in || 0; c.tokensOut += r.tokens_out || 0
    if (!c.lastRunAt || r.created_at > c.lastRunAt) c.lastRunAt = r.created_at
  }
  const connections = conns.data.map((x: any) => ({
    id: x.id, company_id: x.company_id, name: x.name, host: hostOnly(x.url), server_name: x.server_name || null,
    enabled: x.enabled !== false, status: x.status || 'new', last_error: x.last_error || null, synced_at: x.synced_at || null,
    roles: Array.isArray(x.roles) ? x.roles : [],
    tools: Array.isArray(x.tools) ? x.tools.length : 0,
    toolsOn: Array.isArray(x.tools) ? x.tools.filter((t: any) => t?.mode && t.mode !== 'off').length : 0,
  }))
  for (const x of connections) {
    if (!x.company_id) continue
    const c = co(x.company_id); c.connections.total++
    if (x.enabled) c.connections.enabled++
    if (x.status === 'error' || x.last_error) c.connections.errors++
  }

  const failures = runs.filter(r => r.status === 'failed').slice(0, 60)
  const recent = runs.slice(0, 100)
  const names = await companyNames(db, [...Object.keys(map), ...stuckRows.data.map((r: any) => r.company_id), ...connections.map(c => c.company_id)])
  for (const id of Object.keys(map)) { map[id].name = names[id]?.name || 'Deleted business'; map[id].slug = names[id]?.slug || '' }
  const withCo = (r: any) => ({ ...r, company: names[r.company_id] || null })

  const companies = Object.values(map).sort((a, b) =>
    (Number(b.paused.paused) - Number(a.paused.paused)) || (b.failed - a.failed) || (b.runs - a.runs) || a.name.localeCompare(b.name))
  const sum = (k: keyof Co) => companies.reduce((n, c) => n + (Number(c[k]) || 0), 0)
  return NextResponse.json({
    missing: false, days,
    platformPaused: process.env.AGENTS_DISABLED === '1',
    totals: {
      runs: runs.length, completed: sum('completed'), failed: sum('failed'), escalated: sum('escalated'),
      awaiting: sum('awaiting'), cancelled: sum('cancelled'), tokensIn: sum('tokensIn'), tokensOut: sum('tokensOut'),
      pendingApprovals: sum('pendingApprovals'), stuck: stuckRows.data.length,
      companiesWithAgents: companies.filter(c => c.enabledRoles.length > 0).length,
      paused: companies.filter(c => c.paused.paused).length,
      sandboxRuns: runs.filter(r => r.mode === 'sandbox').length,
    },
    companies,
    failures: failures.map(withCo),
    stuck: stuckRows.data.map(withCo),
    recent: recent.map(withCo),
    connections: connections.map(withCo),
    connectionsMissing: conns.missing,
  })
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const who = await superAdmin(req, db)
  if (!who) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { action, companyId } = body || {}
  const reason = String(body?.reason || '').trim()
  if (!isUuid(companyId)) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  if (action !== 'pause' && action !== 'resume') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (action === 'pause' && !reason) return NextResponse.json({ error: 'A reason is required (audited).' }, { status: 400 })

  const { data: company } = await safe<any>(db.from('companies').select('id, name').eq('id', companyId).maybeSingle(), null)
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  try {
    // Shown to the business as "Agents were paused by Colvy support."
    const state = await setPaused(db, companyId, action === 'pause', { id: who.id, name: 'Colvy support' })
    await logSuperAdminAudit(db, {
      adminId: who.id, adminEmail: who.email, companyId,
      action: action === 'pause' ? 'agents.pause' : 'agents.resume',
      summary: action === 'pause' ? `Paused all agents for ${company.name} — ${reason}` : `Resumed agents for ${company.name}${reason ? ` — ${reason}` : ''}`,
      detail: { reason: reason || null },
    })
    return NextResponse.json({ ok: true, paused: state })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not change the pause switch' }, { status: 500 })
  }
}
