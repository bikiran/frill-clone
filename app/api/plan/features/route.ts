import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { GATED, planAllows, type GatedFeature } from '@/lib/plan-gate'

// GET ?companyId= → which Inbox-plan features this workspace has, and the words
// to show when one is locked. For the Colvy app, so it asks the same check the
// server's locks use (lib/plan-gate) instead of keeping its own copy of the
// plans. Members of the workspace only.
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId') || ''
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const keys = Object.keys(GATED) as GatedFeature[]
  const allowed = await Promise.all(keys.map(k => planAllows(db, companyId, k)))
  const features: Record<string, boolean> = {}
  const locked: Record<string, string> = {}
  keys.forEach((k, i) => { features[k] = allowed[i]; locked[k] = GATED[k].locked })
  return NextResponse.json({ features, locked }, { headers: { 'cache-control': 'private, max-age=60' } })
}
