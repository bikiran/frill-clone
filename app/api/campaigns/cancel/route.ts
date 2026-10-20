import { requireCompanyAccess, requireCompanyAdmin } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cancelCampaign, CampaignNotReadyError } from '@/lib/campaign-sender'
import { CampaignActionError, unscheduleCampaign } from '@/lib/campaign-control'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/campaigns/cancel — with delete: true, delete a campaign that
 * hasn't started (workspace staff); without it, unschedule a campaign (back
 * to a draft; the owner or an admin, as /api/campaigns/control does it).
 * Either way any SMS credit held for it is given back.
 *
 * Body: { companyId, campaignId, delete?: true }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, campaignId, delete: remove } = await req.json()
    if (!companyId || !campaignId) return NextResponse.json({ error: 'Missing companyId or campaignId' }, { status: 400 })
    const db = admin()
    if (remove) {
      if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      const r = await cancelCampaign(companyId, campaignId, { db, remove: true })
      return NextResponse.json({ ok: true, deleted: true, releasedCents: r.releasedCents })
    }
    const access = await requireCompanyAdmin(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: access.notAdmin ? 'Only the workspace owner or an admin can unschedule a campaign.' : 'Not authorized' }, { status: 403 })
    const r = await unscheduleCampaign(db, companyId, campaignId)
    return NextResponse.json({ ok: true, deleted: false, releasedCents: r.releasedCents })
  } catch (e: any) {
    if (e instanceof CampaignActionError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e.message }, { status: e instanceof CampaignNotReadyError ? 409 : 500 })
  }
}
