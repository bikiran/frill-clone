import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prepareCampaign, processCampaignBatch, campaignMaySendNow, pauseCampaign, updateCampaignIf, CampaignNotReadyError, CampaignStateChangedError, BATCH_BUDGET_MS } from '@/lib/campaign-sender'
import { logJobRun } from '@/lib/job-log'
import { isEmailCampaign, startEmailCampaign, emailBatch } from '@/lib/campaign-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/campaigns/process — the campaign worker.
 *
 * Both channels: an email campaign is started and sent by the email sender
 * (startEmailCampaign / sendEmailBatch), an SMS one by the SMS sender — the
 * SMS batch never sees an email campaign (it would mark it 'sent' with
 * nothing sent).
 *
 * Two jobs, run every 2 minutes by cron (vercel.json):
 *   1. Start any scheduled campaign whose time has arrived.
 *   2. Push the next batch of any campaign already sending.
 *
 * Batching per invocation is what enforces the drip rate: each run sends up
 * to two minutes' worth at the campaign's rate_per_minute, so the rate the
 * editor states is the average actually achieved. The whole run stops taking
 * new recipients about 45 seconds in, inside the 60-second function limit.
 *
 * Protected by CRON_SECRET when set, since this endpoint spends money.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET
    if (secret) {
      // Header only: a ?secret= in the URL ends up in logs.
      const auth = req.headers.get('authorization')
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const startedAt = new Date().toISOString()
    const t0 = Date.now()
    const deadline = t0 + BATCH_BUDGET_MS
    const db = admin()
    const results: any[] = []

    // ── 0. Cheap idle check ────────────────────────────────────────────────
    // This runs on a schedule whether or not there's anything to do, and most
    // runs have nothing. One tiny count query decides that, instead of paying
    // for the full pass — which is the difference between a few milliseconds
    // and hundreds, every single run, forever.
    {
      const { count } = await db.from('campaigns')
        .select('id', { count: 'exact', head: true })
        .in('status', ['scheduled', 'sending'])
      if (!count) {
        // Idle runs are the common case; record them cheaply so the jobs page
        // can show the worker is alive and ticking, not silently dead.
        await logJobRun({ job: 'campaigns-process', startedAt, durationMs: Date.now() - t0, status: 'idle', detail: { processed: 0 } })
        return NextResponse.json({ ok: true, processed: 0, idle: true })
      }
    }

    // ── 1. Scheduled campaigns that are now due ────────────────────────────
    const { data: due } = await db.from('campaigns')
      .select('id, company_id, name, channel, scheduled_at, quiet_hours, timezone')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .limit(5)

    for (const c of (due || [])) {
      if (Date.now() >= deadline) break
      // Respect quiet hours — a campaign scheduled for 2am waits until 9am
      // rather than being sent because its time technically passed.
      if (!campaignMaySendNow(c)) {
        results.push({ campaign: c.id, held: 'outside sending hours' })
        continue
      }
      try {
        // Only while it's still scheduled: it may have been unscheduled (or
        // rescheduled) since it was listed above.
        const prepared = isEmailCampaign(c)
          ? await startEmailCampaign(c.company_id, c.id, { db, expectStatus: ['scheduled'] })
          : await prepareCampaign(c.company_id, c.id, { expectStatus: ['scheduled'] })
        results.push({ campaign: c.id, channel: c.channel || 'sms', started: true, ...prepared })
      } catch (e: any) {
        if (e instanceof CampaignStateChangedError) {
          // Unscheduled / stopped under us: nothing to do, nothing was sent.
          results.push({ campaign: c.id, skipped: e.message })
          continue
        }
        results.push({ campaign: c.id, error: e.message })
        if (e instanceof CampaignNotReadyError) {
          // Something the owner can fix (the audience, the allowance, nobody
          // left to text): pause with the reason rather than retrying forever.
          await pauseCampaign(db, c.id, e.message, ['scheduled'])
        } else if (/already|not found/i.test(e.message)) {
          await updateCampaignIf(db, c.id, ['scheduled'], { status: 'failed' })
        }
      }
    }

    // ── 2. Campaigns mid-send ──────────────────────────────────────────────
    const { data: sending } = await db.from('campaigns')
      .select('id, channel, quiet_hours, timezone').eq('status', 'sending').limit(5)

    for (const c of (sending || [])) {
      if (Date.now() >= deadline) break
      try {
        if (isEmailCampaign(c)) {
          // Quiet hours only when the email campaign has them switched on.
          if (!campaignMaySendNow(c)) { results.push({ campaign: c.id, channel: 'email', held: 'outside sending hours' }); continue }
          const r = await emailBatch(c.id, deadline - Date.now(), { db })
          results.push({ campaign: c.id, channel: 'email', ...r })
          continue
        }
        const r = await processCampaignBatch(c.id, { deadline })
        results.push({ campaign: c.id, channel: 'sms', ...r })
      } catch (e: any) {
        results.push({ campaign: c.id, error: e.message })
      }
    }

    const errored = results.filter(r => r.error).length
    await logJobRun({
      job: 'campaigns-process', startedAt, durationMs: Date.now() - t0,
      status: errored ? 'error' : 'success',
      detail: { processed: results.length, errored },
      error: errored ? results.find(r => r.error)?.error : null,
    })
    return NextResponse.json({ ok: true, processed: results.length, results })
  } catch (e: any) {
    await logJobRun({ job: 'campaigns-process', status: 'error', error: e?.message })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
