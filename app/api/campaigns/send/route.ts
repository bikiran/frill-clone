import { memberOr403 } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prepareCampaign, processCampaignBatch, resumeCampaign, CampaignNotReadyError, notReadyBody, BATCH_BUDGET_MS, campaignMaySendNow } from '@/lib/campaign-sender'
import { isEmailCampaign, startEmailCampaign, emailBatch } from '@/lib/campaign-email'
import { isExternalSendBlocked, DEMO_BLOCK_MESSAGE, logBlockedSend } from '@/lib/demo-guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/campaigns/send
 *
 * Starts a campaign (or resumes one that paused part-way). This is the only
 * endpoint that can message an audience, so it requires an explicit
 * confirmation token from the UI rather than being callable by accident.
 *
 * Refuses — with words the editor shows — when the saved audience is missing
 * or unfinished, nobody matches, or the month's SMS allowance can't cover
 * every part of every message.
 *
 * An email campaign goes to the email sender instead (startEmailCampaign →
 * sendEmailBatch): no SMS credit or allowance involved.
 *
 * Body: { companyId, campaignId, confirm: 'SEND', resume?: true }
 */
const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  try {
    const { companyId, campaignId, confirm, resume } = await req.json()
    if (!companyId || !campaignId) {
      return NextResponse.json({ error: 'Missing companyId or campaignId' }, { status: 400 })
    }
    // Workspace members only (this texts / emails the whole audience).
    { const deny = await memberOr403(req, companyId); if (deny) return deny }
    // A deliberate speed bump — nothing sends without this.
    if (confirm !== 'SEND') {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
    }
    if (await isExternalSendBlocked(companyId)) { logBlockedSend(companyId, 'campaign'); return NextResponse.json({ error: DEMO_BLOCK_MESSAGE }, { status: 403 }) }

    const db = admin()
    const { data: campaign } = await db.from('campaigns').select('id, channel, quiet_hours, timezone')
      .eq('id', campaignId).eq('company_id', companyId).maybeSingle()
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    if (isEmailCampaign(campaign)) {
      if (resume) return NextResponse.json({ error: 'Email campaigns carry on by themselves; there\u2019s nothing to resume.' }, { status: 400 })
      const prepared = await startEmailCampaign(companyId, campaignId, { db })
      // The first batches now (Resend, 100 an API call), unless quiet hours
      // are on and it's outside them; the worker sends the rest.
      const firstBatch = campaignMaySendNow(campaign)
        ? await emailBatch(campaignId, t0 + BATCH_BUDGET_MS - Date.now(), { db })
        : { done: false, paused: true, reason: 'outside sending hours' }
      return NextResponse.json({ ok: true, channel: 'email', ...prepared, firstBatch })
    }

    // Freeze the recipient list, re-checking consent against live data — or,
    // for a paused campaign, check the allowance covers what's left.
    const prepared: any = resume
      ? await resumeCampaign(companyId, campaignId)
      : await prepareCampaign(companyId, campaignId)

    // Send the first minute's worth now so the user sees progress; cron picks
    // up the rest. The batch applies the campaign's own time zone and quiet
    // hours, so outside them it simply stays queued.
    const firstBatch = await processCampaignBatch(campaignId, {
      minutes: 1,
      deadline: t0 + BATCH_BUDGET_MS,
    })

    return NextResponse.json({ ok: true, ...prepared, firstBatch })
  } catch (e: any) {
    // Not enough credit / not on the plan / allowance reached → 402 with the
    // reason and shortfall, so the editor can offer a top-up.
    if (e instanceof CampaignNotReadyError) return NextResponse.json(notReadyBody(e), { status: e.paymentRequired ? 402 : 400 })
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
