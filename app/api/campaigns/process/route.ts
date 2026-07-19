import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prepareCampaign, processCampaignBatch, isWithinSendingHours } from '@/lib/campaign-sender'

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
 * Two jobs, run every minute by cron:
 *   1. Start any scheduled campaign whose time has arrived.
 *   2. Push the next batch of any campaign already sending.
 *
 * Batching per invocation is what enforces the drip rate: with cron on a
 * one-minute schedule, a batch capped at rate_per_minute gives roughly that
 * many messages a minute.
 *
 * Protected by CRON_SECRET when set, since this endpoint spends money.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET
    if (secret) {
      const auth = req.headers.get('authorization')
      const provided = req.nextUrl.searchParams.get('secret')
      if (auth !== `Bearer ${secret}` && provided !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const db = admin()
    const results: any[] = []

    // ── 1. Scheduled campaigns that are now due ────────────────────────────
    const { data: due } = await db.from('campaigns')
      .select('id, company_id, name, scheduled_at, quiet_hours, timezone')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .limit(5)

    for (const c of (due || [])) {
      // Respect quiet hours — a campaign scheduled for 2am waits until 9am
      // rather than being sent because its time technically passed.
      if (c.quiet_hours !== false && !isWithinSendingHours(new Date(), c.timezone || 'Australia/Melbourne')) {
        results.push({ campaign: c.id, held: 'outside sending hours' })
        continue
      }
      try {
        const prepared = await prepareCampaign(c.company_id, c.id)
        results.push({ campaign: c.id, started: true, ...prepared })
      } catch (e: any) {
        results.push({ campaign: c.id, error: e.message })
        // Don't leave it retrying forever on a permanent problem.
        if (/no message|already|not found|no contacts/i.test(e.message)) {
          await db.from('campaigns').update({ status: 'failed' }).eq('id', c.id)
        }
      }
    }

    // ── 2. Campaigns mid-send ──────────────────────────────────────────────
    const { data: sending } = await db.from('campaigns')
      .select('id, rate_per_minute').eq('status', 'sending').limit(5)

    for (const c of (sending || [])) {
      try {
        const r = await processCampaignBatch(c.id, c.rate_per_minute || 60)
        results.push({ campaign: c.id, ...r })
      } catch (e: any) {
        results.push({ campaign: c.id, error: e.message })
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
