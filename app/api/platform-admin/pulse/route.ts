import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin, safe, countRows, companyNames } from '../_lib/super-admin'
import { collectIntegrations } from '../_lib/integrations'
import { emailWebhookSigned } from '@/lib/email-webhook'
import { signupPulse } from '@/lib/signup-attempts'

export const dynamic = 'force-dynamic'

/**
 * GET /api/platform-admin/pulse — real platform health signals for the console
 * overview and its top-bar status (replaces hard-coded "all healthy" numbers):
 * failures in the last 24h across background jobs, API logs, webhooks and AI
 * agent runs, stuck agent runs, broken connections, plus the latest admin
 * actions and signups. Super admin only; read-only.
 */
export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const stuckBefore = new Date(Date.now() - 15 * 60_000).toISOString()
  const head = { count: 'exact' as const, head: true }

  const [jobRuns, jobErrors, apiErrors, apiWarns, hooks, hookErrors, agentRuns, agentFailed, agentStuck, stripeEvents, audit, signups, integrations, apiErrorRows, hookErrorRows, jobErrorRows, signupLeads] = await Promise.all([
    countRows(db.from('job_runs').select('id', head).gte('created_at', since)),
    countRows(db.from('job_runs').select('id', head).eq('status', 'error').gte('created_at', since)),
    countRows(db.from('api_logs').select('id', head).eq('level', 'error').gte('created_at', since)),
    countRows(db.from('api_logs').select('id', head).eq('level', 'warn').gte('created_at', since)),
    countRows(db.from('webhook_events').select('id', head).gte('created_at', since)),
    countRows(db.from('webhook_events').select('id', head).in('status', ['error', 'rejected']).gte('created_at', since)),
    countRows(db.from('agent_runs').select('id', head).gte('created_at', since)),
    countRows(db.from('agent_runs').select('id', head).eq('status', 'failed').gte('created_at', since)),
    countRows(db.from('agent_runs').select('id', head).in('status', ['queued', 'running']).lt('updated_at', stuckBefore)),
    countRows(db.from('stripe_events').select('id', head).gte('created_at', since)),
    safe<any[]>(db.from('super_admin_audit').select('id, created_at, admin_email, company_id, action, summary').order('created_at', { ascending: false }).limit(8), []),
    safe<any[]>(db.from('companies').select('id, name, slug, plan, created_at').order('created_at', { ascending: false }).limit(5), []),
    collectIntegrations(db),
    // The latest failures themselves, so the health page says what went wrong.
    safe<any[]>(db.from('api_logs').select('id, source, message, route, company_id, created_at').eq('level', 'error').gte('created_at', since).order('created_at', { ascending: false }).limit(5), []),
    safe<any[]>(db.from('webhook_events').select('id, source, event_type, status, error, company_id, created_at').in('status', ['error', 'rejected']).gte('created_at', since).order('created_at', { ascending: false }).limit(5), []),
    safe<any[]>(db.from('job_runs').select('id, job, error, created_at').eq('status', 'error').gte('created_at', since).order('created_at', { ascending: false }).limit(5), []),
    // Sign-ups that stopped before an account was made (super admin → Signups).
    signupPulse(db),
  ])
  const broken = integrations.rows.filter(r => r.active && r.note)
  const names = await companyNames(db, [...audit.data.map((a: any) => a.company_id), ...broken.map(b => b.company_id || ''), ...apiErrorRows.data.map((r: any) => r.company_id), ...hookErrorRows.data.map((r: any) => r.company_id)].filter(Boolean))

  const issues: string[] = []
  if (jobErrors) issues.push(`${jobErrors} failed job run${jobErrors === 1 ? '' : 's'}`)
  if (apiErrors) issues.push(`${apiErrors} API error${apiErrors === 1 ? '' : 's'}`)
  if (hookErrors) issues.push(`${hookErrors} webhook error${hookErrors === 1 ? '' : 's'}`)
  if (agentFailed) issues.push(`${agentFailed} failed agent run${agentFailed === 1 ? '' : 's'}`)
  if (agentStuck) issues.push(`${agentStuck} stuck agent run${agentStuck === 1 ? '' : 's'}`)
  if (broken.length) issues.push(`${broken.length} connection${broken.length === 1 ? '' : 's'} need attention`)
  // Inbound email still works unsigned (each email is re-fetched from Resend
  // and the payload ignored), but the secret should be set.
  const emailSigned = emailWebhookSigned()
  if (!emailSigned) issues.push('Inbound email webhook isn’t signed: set RESEND_WEBHOOK_SECRET (emails are being re-fetched from Resend instead)')

  return NextResponse.json({
    window: '24h',
    jobs: { runs: jobRuns, errors: jobErrors },
    api: { errors: apiErrors, warnings: apiWarns },
    webhooks: { total: hooks, errors: hookErrors },
    emailWebhook: { signed: emailSigned },
    agents: { runs: agentRuns, failed: agentFailed, stuck: agentStuck, platformPaused: process.env.AGENTS_DISABLED === '1' },
    stripe: { events: stripeEvents },
    connections: { total: integrations.rows.filter(r => r.active).length, broken: broken.length, sample: broken.slice(0, 6).map(b => ({ type: b.type, note: b.note, detail: b.detail, company: b.company_id ? names[b.company_id]?.name || null : null })) },
    issues,
    audit: audit.data.map((a: any) => ({ ...a, company: a.company_id ? names[a.company_id]?.name || null : null })),
    auditMissing: audit.missing,
    signups: signups.data,
    signupLeads,
    recentErrors: {
      api: apiErrorRows.data.map((r: any) => ({ at: r.created_at, source: r.source || null, route: r.route || null, message: String(r.message || '').slice(0, 300), company: r.company_id ? names[r.company_id]?.name || null : null })),
      webhooks: hookErrorRows.data.map((r: any) => ({ at: r.created_at, source: r.source, event: r.event_type || null, status: r.status, error: String(r.error || '').slice(0, 300), company: r.company_id ? names[r.company_id]?.name || null : null })),
      jobs: jobErrorRows.data.map((r: any) => ({ at: r.created_at, job: r.job || null, error: String(r.error || '').slice(0, 300) })),
    },
  })
}
