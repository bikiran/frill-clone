import { NextRequest, NextResponse } from 'next/server'
import { cronOr401 } from '@/lib/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { syncGmailChannel } from '@/lib/gmail'
import { logJobRun } from '@/lib/job-log'
import { retryPendingEmailBodies } from '@/lib/email-backfill'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/cron/email-sync
 *
 * Pulls new mail into every connected mailbox, then re-fetches the text of
 * customer emails the inbound webhook saved as 'pending' (lib/email-backfill
 * retryPendingEmailBodies).
 *
 * Pulls new mail into every connected mailbox. Email had NO automatic sync at
 * all — it only moved when someone pressed the button — so new customer email
 * simply sat in Gmail until an agent thought to check.
 *
 * Driven from the admin app every 2 minutes (see app/admin/layout.tsx). A Vercel
 * cron would be tidier, but the Hobby plan only allows DAILY crons — a
 * five-minute schedule is an invalid config and blocks the deployment entirely.
 *
 * On Vercel Pro, add a vercel.json with a crons entry pointing at this path on a
 * five-minute schedule, and set CRON_SECRET. Vercel then sends it in the Authorization header
 * (lib/cron-auth; with no CRON_SECRET it's refused in production).
 */
export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const db = admin()
  const { data: channels } = await db.from('email_channels')
    .select('id, company_id, provider, is_active, sync_interval_minutes, last_synced_at')
    .eq('provider', 'gmail')
    .neq('is_active', false)

  const results: any[] = []
  for (const ch of channels || []) {
    // Respect each mailbox's own interval (default 5 minutes).
    const every = Number(ch.sync_interval_minutes ?? 5)
    if (every <= 0) continue                          // 0 = auto-sync off
    if (ch.last_synced_at) {
      const mins = (Date.now() - new Date(ch.last_synced_at).getTime()) / 60000
      if (mins < every) continue                      // synced recently enough
    }
    try {
      // Share the function's time across mailboxes; each leaves a few seconds
      // spare and carries on next run if its inbox was busier than that.
      if (Date.now() - t0 > 50_000) break
      const r = await syncGmailChannel(ch.id, { deadline: t0 + 50_000 })
      results.push({ channel: ch.id, ...r })
    } catch (e: any) {
      results.push({ channel: ch.id, error: e.message })
    }
  }

  // Customer emails saved without their text (Resend didn't give it to the
  // webhook): try again, a few at a time, while there's time left.
  let pendingBodies: any = null
  if (Date.now() - t0 < 45_000) {
    try { pendingBodies = await retryPendingEmailBodies(db) } catch (e: any) { pendingBodies = { error: e?.message || 'retry failed' } }
  }

  const errored = results.filter(r => r.error).length
  await logJobRun({
    job: 'email-sync', startedAt, durationMs: Date.now() - t0,
    status: results.length === 0 && !pendingBodies?.filled ? 'idle' : (errored ? 'error' : 'success'),
    detail: { channels: (channels || []).length, ran: results.length, errored, ...(pendingBodies?.pending ? { pendingBodies } : {}) },
    error: errored ? results.find(r => r.error)?.error : null,
  })
  return NextResponse.json({ ok: true, ran: results.length, results, ...(pendingBodies ? { pendingBodies } : {}) })
}
