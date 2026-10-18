import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cancelCampaign, CampaignNotReadyError } from '@/lib/campaign-sender'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/campaigns/cancel — unschedule a campaign (back to a draft) or,
 * with delete: true, delete a campaign that hasn't started. Either way any
 * SMS credit held for it is given back. Workspace staff only.
 *
 * Body: { companyId, campaignId, delete?: true }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, campaignId, delete: remove } = await req.json()
    if (!companyId || !campaignId) return NextResponse.json({ error: 'Missing companyId or campaignId' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const r = await cancelCampaign(companyId, campaignId, { db, remove: !!remove })
    return NextResponse.json({ ok: true, deleted: !!remove, releasedCents: r.releasedCents })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof CampaignNotReadyError ? 409 : 500 })
  }
}
