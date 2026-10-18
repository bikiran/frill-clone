import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { emailAdminDb } from '@/lib/email-db'
import { emailCampaignReport } from '@/lib/email-campaign-report'

export const dynamic = 'force-dynamic'

// GET /api/email-campaigns/report?companyId=&campaignId=
// An email campaign's numbers (lib/email-campaign-report): clicks first, opens
// with their caveat. Workspace staff only; the tables are server-read.
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const campaignId = req.nextUrl.searchParams.get('campaignId')
  if (!companyId || !campaignId) return NextResponse.json({ error: 'Missing companyId or campaignId' }, { status: 400 })
  const db = emailAdminDb()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data: campaign } = await db.from('campaigns').select('id, channel').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.channel !== 'email') return NextResponse.json({ error: 'Not an email campaign' }, { status: 400 })
  const report = await emailCampaignReport(companyId, campaignId, db)
  return NextResponse.json({ ok: true, report }, { headers: { 'Cache-Control': 'no-store' } })
}
