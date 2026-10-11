import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { ensurePluginKey } from '@/lib/company-secrets'

export const dynamic = 'force-dynamic'

/**
 * GET /api/company/plugin-key?companyId=
 *
 * The business's Colvy plugin / API key (Settings → WordPress plugin & API),
 * created the first time it's asked for. Team members only — the key lives in
 * company_secrets now, not on the publicly readable companies row.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const key = await ensurePluginKey(companyId!)
  if (!key) return NextResponse.json({ error: 'Couldn’t load the key. Try again.' }, { status: 500 })
  return NextResponse.json({ key })
}
