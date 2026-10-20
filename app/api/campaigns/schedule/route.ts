import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CampaignNotReadyError, notReadyBody } from '@/lib/campaign-sender'
import { CampaignActionError, scheduleCampaign } from '@/lib/campaign-control'

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
 * allowance for every part (email: a designed email with a subject, someone
 * emailable; no SMS credit). They're made again when the time comes (people
 * unsubscribe, the allowance gets used) and the campaign pauses with the
 * reason if one fails then. lib/campaign-control scheduleCampaign; the
 * status change is a compare-and-set, so a campaign the worker started a
 * moment ago is never put back to 'scheduled'.
 *
 * Body: { companyId, campaignId, scheduledAt (ISO) }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, campaignId, scheduledAt } = await req.json()
    if (!companyId || !campaignId) return NextResponse.json({ error: 'Missing companyId or campaignId' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const r = await scheduleCampaign(db, companyId, campaignId, new Date(String(scheduledAt || '')))
    if (r.channel === 'email') return NextResponse.json({ ok: true, channel: 'email', scheduledAt: r.scheduledAt, recipients: r.recipients, heldForSendingHours: r.heldForSendingHours })
    return NextResponse.json({ ok: true, scheduledAt: r.scheduledAt, recipients: r.recipients, parts: r.parts, heldCents: r.heldCents, heldForSendingHours: r.heldForSendingHours })
  } catch (e: any) {
    if (e instanceof CampaignActionError) return NextResponse.json({ error: e.message }, { status: e.status })
    // Not enough credit / not on the plan / allowance reached → 402 with the
    // reason and shortfall, so the editor can offer a top-up.
    if (e instanceof CampaignNotReadyError) return NextResponse.json(notReadyBody(e), { status: e.paymentRequired ? 402 : 400 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
