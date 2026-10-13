import { NextRequest, NextResponse } from 'next/server'
import { adminDb, superAdmin, companyNames } from '../_lib/super-admin'
import { collectIntegrations, INTEGRATION_TYPES } from '../_lib/integrations'

export const dynamic = 'force-dynamic'

/**
 * GET /api/platform-admin/integrations — every connected channel, store and
 * outside tool across all businesses, with a health note per connection.
 * Super admin only. Secrets are stripped server-side (the console used to read
 * some of these tables straight from the browser with select('*')).
 */
export async function GET(req: NextRequest) {
  const db = adminDb()
  if (!(await superAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const { rows, missing } = await collectIntegrations(db)
    const cos = await companyNames(db, rows.map(r => r.company_id || ''))
    return NextResponse.json({
      types: INTEGRATION_TYPES,
      rows: rows.map(r => ({ ...r, company: r.company_id ? cos[r.company_id] || null : null })),
      missing,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load integrations' }, { status: 500 })
  }
}
