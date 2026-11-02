import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
) as any

/**
 * GET ?companyId — which connections that hinge on a stored key are set up:
 * a legacy Telnyx integration (key + number) and Google Business Profile (a
 * token). Only yes / no leaves the server: the keys themselves are hidden
 * from the browser (V425), so the Channels page asks here instead of reading
 * them. Staff of the company only.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const db = admin()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: access.unavailable ? 503 : 403 })
  const one = async (q: PromiseLike<any>) => { try { return (await q)?.data ?? null } catch { return null } }
  const [telnyx, google] = await Promise.all([
    one(db.from('telnyx_integrations').select('api_key, phone_number').eq('company_id', companyId).maybeSingle()),
    one(db.from('google_business_accounts').select('access_token').eq('company_id', companyId).maybeSingle()),
  ])
  return NextResponse.json(
    { telnyx: !!(telnyx?.api_key && telnyx?.phone_number), google: !!google?.access_token },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
