import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin, companyNames } from '../_lib/super-admin'
import { logSuperAdminAudit } from '@/lib/super-admin-audit'
import { backfillEmptyEmailBodies } from '@/lib/email-backfill'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/platform-admin/email-backfill — super admin → Overview → Email
 * health → "Recover empty email replies". The same job as
 * /api/email/backfill-bodies (lib/email-backfill), without needing CRON_SECRET.
 *
 *   body: { scan: true, days? }  → workspaces with empty replies (database only)
 *         { dryRun?: boolean, companyId?: string, days?: number (1–90, default 30), rethread?: boolean }
 *
 * Returns the job's totals plus the same numbers per workspace, so the page can
 * show a dry run per workspace and then run them one at a time with progress.
 * Real runs are written to the super admin audit log.
 */
export async function POST(req: NextRequest) {
  const db = adminDb()
  const who = await superAdmin(req, db)
  if (!who) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY is not set, so received emails can’t be fetched.' }, { status: 400 })
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body?.companyId ? String(body.companyId) : null
    const dryRun = body?.dryRun !== false
    const rethread = !!body?.rethread
    const days = Math.min(Math.max(Number(body?.days) || 30, 1), 90)

    // { scan: true }: which workspaces have empty replies, from the database
    // only (the same rows the job picks up), so the page can then dry-run and
    // run one workspace per request instead of every workspace in one go.
    if (body?.scan) {
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const { data, error } = await db.from('messages').select('company_id')
        .eq('sender_type', 'visitor').eq('delivery_channel', 'email').is('gmail_message_id', null)
        .or('content.is.null,content.eq.').is('email_html', null).is('metadata->inbound_email->>backfilled_at', null)
        .gte('created_at', since).limit(5000)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const counts: Record<string, number> = {}
      for (const m of data || []) if (m.company_id) counts[m.company_id] = (counts[m.company_id] || 0) + 1
      const names = await companyNames(db, Object.keys(counts))
      const workspaces = Object.entries(counts)
        .map(([id, n]) => ({ companyId: id, name: names[id]?.name || id, slug: names[id]?.slug || null, empty: n }))
        .sort((a, b) => b.empty - a.empty)
      return NextResponse.json({ ok: true, days, workspaces, capped: (data || []).length >= 5000 }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const result = await backfillEmptyEmailBodies(db, { companyId, days, dryRun, rethread })

    // Which workspace each row belongs to (by its original conversation).
    const convIds = Array.from(new Set(result.rows.map(r => r.conversationId).filter(Boolean)))
    const convCompany: Record<string, string> = {}
    for (let i = 0; i < convIds.length; i += 200) {
      const { data } = await db.from('conversations').select('id, company_id').in('id', convIds.slice(i, i + 200))
      for (const c of data || []) convCompany[c.id] = c.company_id
    }
    const per: Record<string, { companyId: string; candidates: number; filled: number; rethreaded: number; notFound: number; stillEmpty: number }> = {}
    for (const r of result.rows) {
      const co = companyId || convCompany[r.conversationId] || 'unknown'
      const p = per[co] ||= { companyId: co, candidates: 0, filled: 0, rethreaded: 0, notFound: 0, stillEmpty: 0 }
      p.candidates++
      if (r.outcome.startsWith('filled')) p.filled++
      if (r.outcome.includes('+moved')) p.rethreaded++
      if (['not-found-on-resend', 'fetch-failed', 'mismatch'].includes(r.outcome)) p.notFound++
      if (r.outcome === 'email-has-no-body') p.stillEmpty++
    }
    const names = await companyNames(db, Object.keys(per).filter(k => k !== 'unknown'))
    const workspaces = Object.values(per)
      .map(p => ({ ...p, name: names[p.companyId]?.name || (p.companyId === 'unknown' ? 'Unknown workspace' : p.companyId), slug: names[p.companyId]?.slug || null }))
      .sort((a, b) => b.candidates - a.candidates)

    if (!dryRun) {
      await logSuperAdminAudit(db, {
        adminId: who.id, adminEmail: who.email, companyId,
        action: 'email_backfill_run', summary: `Recovered empty email replies${companyId ? ` for ${workspaces[0]?.name || 'one workspace'}` : ''}: ${result.filled} filled, ${result.rethreaded} re-threaded`,
        detail: { days, rethread, filled: result.filled, rethreaded: result.rethreaded, notFound: result.notFound, stillEmpty: result.stillEmpty },
      })
    }
    const { scanned, candidates, filled, rethreaded, notFound, stillEmpty } = result
    return NextResponse.json({ ok: true, dryRun, scanned, candidates, filled, rethreaded, notFound, stillEmpty, days, rethread, workspaces }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Recovery failed' }, { status: 500 })
  }
}
