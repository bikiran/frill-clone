import { NextRequest, NextResponse } from 'next/server'
import { prepareCampaign, processCampaignBatch, isWithinSendingHours } from '@/lib/campaign-sender'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/campaigns/send
 *
 * Starts a campaign. This is the only endpoint that can message an audience,
 * so it requires an explicit confirmation token from the UI rather than being
 * callable by accident.
 *
 * Body: { companyId, campaignId, confirm: 'SEND' }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, campaignId, confirm } = await req.json()
    if (!companyId || !campaignId) {
      return NextResponse.json({ error: 'Missing companyId or campaignId' }, { status: 400 })
    }
    // A deliberate speed bump — nothing sends without this.
    if (confirm !== 'SEND') {
      return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
    }

    // Freeze the recipient list, re-checking consent against live data.
    const prepared = await prepareCampaign(companyId, campaignId)

    // Send the first batch immediately so the user sees progress; cron picks up
    // the rest. If we're outside sending hours it stays queued instead.
    let firstBatch: any = { skipped: 'outside sending hours' }
    if (isWithinSendingHours()) {
      firstBatch = await processCampaignBatch(campaignId)
    }

    return NextResponse.json({ ok: true, ...prepared, firstBatch })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
