import { NextRequest, NextResponse } from 'next/server'
import { adminDb, generalIntegration, integrationAccess } from '@/lib/integration-access'

export const dynamic = 'force-dynamic'

// GET ?companyId=&integrationId= → the latest deliveries to that integration.
export async function GET(req: NextRequest) {
  const db = adminDb()
  const companyId = req.nextUrl.searchParams.get('companyId') || ''
  const def = generalIntegration(req.nextUrl.searchParams.get('integrationId') || '')
  if (!def) return NextResponse.json({ error: 'Unknown integration' }, { status: 400 })
  const access = await integrationAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { data, error } = await db.from('integration_deliveries')
    .select('id, event, title, status, http_status, error, ref_url, test, duration_ms, created_at')
    .eq('company_id', companyId).eq('integration_id', def.id)
    .order('created_at', { ascending: false }).limit(25)
  if (error) return NextResponse.json({ deliveries: [], needsMigration: true })
  return NextResponse.json({ deliveries: data || [] })
}
