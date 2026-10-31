import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { emailAdminDb } from '@/lib/email-db'
import { smsCampaignReport } from '@/lib/sms-campaign-report'

export const dynamic = 'force-dynamic'

// GET /api/campaigns/report?companyId=&campaignId=
// An SMS campaign's report and the people it went to (lib/sms-campaign-report).
// Workspace staff only. Email campaigns use /api/email-campaigns/report.
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const campaignId = req.nextUrl.searchParams.get('campaignId')
  if (!companyId || !campaignId) return NextResponse.json({ error: 'Missing companyId or campaignId' }, { status: 400 })
  const db = emailAdminDb()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data: campaign } = await db.from('campaigns').select('*').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.channel === 'email') return NextResponse.json({ error: 'Email campaigns have their own report' }, { status: 400 })
  const out = await smsCampaignReport(companyId, campaign, db)
  return NextResponse.json({ ok: true, ...out }, { headers: { 'Cache-Control': 'no-store' } })
}
