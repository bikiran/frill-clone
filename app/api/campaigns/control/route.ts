import { requireCompanyAccess, callerUser } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CampaignNotReadyError, notReadyBody } from '@/lib/campaign-sender'
import { CampaignActionError, scheduleCampaign, unscheduleCampaign, stopCampaign } from '@/lib/campaign-control'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/campaigns/control — change a queued or sending campaign, SMS or
 * email alike (lib/campaign-control). Same access as scheduling.
 *
 * Body: { companyId, campaignId, action, scheduledAt? }
 *   action 'unschedule'  scheduled → draft (content and audience kept; held
 *                        credit / a prepared email list released)
 *   action 'reschedule'  a scheduled campaign to `scheduledAt` (ISO), with
 *                        the same checks as scheduling
 *   action 'stop'        stop one that's sending: nobody else is sent to
 *
 * A campaign the worker started a moment ago answers 409 rather than being
 * flipped back.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, campaignId, action, scheduledAt } = await req.json().catch(() => ({}))
    if (!companyId || !campaignId) return NextResponse.json({ error: 'Missing companyId or campaignId' }, { status: 400 })
    const db = admin()
    // Same access as scheduling: whoever can schedule a campaign can take it
    // back, move it or stop it.
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: access.unavailable ? 503 : 403 })
    if (action === 'unschedule') {
      const r = await unscheduleCampaign(db, companyId, campaignId)
      return NextResponse.json({ ok: true, action, ...r })
    }
    if (action === 'reschedule') {
      const r = await scheduleCampaign(db, companyId, campaignId, new Date(String(scheduledAt || '')), { reschedule: true })
      return NextResponse.json({ ok: true, action, ...r })
    }
    if (action === 'stop') {
      const who = await callerUser(req, db)
      const r = await stopCampaign(db, companyId, campaignId, { by: who?.email?.split('@')[0] || null })
      return NextResponse.json({ ok: true, action, ...r })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    if (e instanceof CampaignActionError) return NextResponse.json({ error: e.message }, { status: e.status })
    if (e instanceof CampaignNotReadyError) return NextResponse.json(notReadyBody(e), { status: e.paymentRequired ? 402 : 400 })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
