import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { emailAdminDb } from '@/lib/email-db'
import { emailCampaignPeople } from '@/lib/email-campaign-people'

export const dynamic = 'force-dynamic'

// GET /api/email-campaigns/people?companyId=&campaignId=
// Everyone an email campaign went to and what they did (lib/email-campaign-people),
// plus its orders and revenue. Workspace staff only.
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const campaignId = req.nextUrl.searchParams.get('campaignId')
  if (!companyId || !campaignId) return NextResponse.json({ error: 'Missing companyId or campaignId' }, { status: 400 })
  const db = emailAdminDb()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data: campaign } = await db.from('campaigns').select('id, channel').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.channel !== 'email') return NextResponse.json({ error: 'Not an email campaign' }, { status: 400 })
  const out = await emailCampaignPeople(companyId, campaignId, db)
  return NextResponse.json({ ok: true, ...out }, { headers: { 'Cache-Control': 'no-store' } })
}
