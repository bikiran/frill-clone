import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { preflightCampaign, updateCampaign, CampaignNotReadyError, notReadyBody } from '@/lib/campaign-sender'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/campaigns/schedule — queue a campaign for a later time.
 *
 * The same checks as sending now, made at the moment it's scheduled: a
 * finished saved audience with someone in it, a message, and enough SMS
 * allowance for every part. They're made again when the time comes (people
 * unsubscribe, the allowance gets used) and the campaign pauses with the
 * reason if one fails then.
 *
 * Body: { companyId, campaignId, scheduledAt (ISO) }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, campaignId, scheduledAt } = await req.json()
    if (!companyId || !campaignId) return NextResponse.json({ error: 'Missing companyId or campaignId' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const at = new Date(String(scheduledAt || ''))
    if (isNaN(at.getTime())) return NextResponse.json({ error: 'Pick a date and time first.' }, { status: 400 })
    if (at.getTime() < Date.now() - 60_000) return NextResponse.json({ error: 'The scheduled time is in the past' }, { status: 400 })

    const { data: campaign } = await db.from('campaigns').select('*')
      .eq('id', campaignId).eq('company_id', companyId).maybeSingle()
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (['sending', 'sent'].includes(campaign.status) || (campaign.status === 'paused' && Number(campaign.recipients_total) > 0)) {
      return NextResponse.json({ error: `This campaign is already ${campaign.status === 'paused' ? 'part-way through' : campaign.status}` }, { status: 409 })
    }

    const pf = await preflightCampaign(db, companyId, campaign)
    await updateCampaign(db, campaignId, {
      status: 'scheduled',
      status_reason: null,
      scheduled_at: at.toISOString(),
      audience_count: pf.audience.recipients.length,
      excluded_count: pf.audience.excludedTotal,
      segments: pf.segments,
      updated_at: new Date().toISOString(),
    })
    return NextResponse.json({ ok: true, scheduledAt: at.toISOString(), recipients: pf.audience.recipients.length, parts: pf.parts, heldCents: pf.heldCents })
  } catch (e: any) {
    // Not enough credit / not on the plan / allowance reached → 402 with the
    // reason and shortfall, so the editor can offer a top-up.
    if (e instanceof CampaignNotReadyError) return NextResponse.json(notReadyBody(e), { status: e.paymentRequired ? 402 : 400 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
