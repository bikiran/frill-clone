import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cachedFormsHealth } from '@/lib/forms-mail'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?companyId — is the shared forms domain receiving mail right now? The
// same check as super admin → Web Forms, without the DNS detail (that's
// Colvy's job, not the business's). Staff of the company only.
export async function GET(req: NextRequest) {
  const db = admin()
  const companyId = req.nextUrl.searchParams.get('companyId')
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: access.unavailable ? 503 : 403 })
  try {
    const h = await cachedFormsHealth()
    return NextResponse.json({ domain: h.domain, ready: h.ready }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ domain: null, ready: null })
  }
}
