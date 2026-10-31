import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { emailAdminDb } from '@/lib/email-db'
import { campaignInsights, INSIGHT_RANGES } from '@/lib/campaign-insights'

export const dynamic = 'force-dynamic'

// GET /api/campaigns/insights?companyId=&days=90
// Every email and SMS campaign sent in the last `days` days (0 = all time),
// compared (lib/campaign-insights). Workspace staff only.
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
  const asked = Number(req.nextUrl.searchParams.get('days') ?? 90)
  const days = (INSIGHT_RANGES as readonly number[]).includes(asked) ? asked : 90
  const db = emailAdminDb()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const out = await campaignInsights(companyId, days || null, db)
  return NextResponse.json({ ok: true, ...out }, { headers: { 'Cache-Control': 'no-store' } })
}
