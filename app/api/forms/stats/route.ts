import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleStatsRequest } from '@/components/form-results/stats-core'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Views, starts and drop-off for a form's Results page (members of the form's
// workspace only).
//
// GET /api/forms/stats?formId=<uuid>&from=<ISO>&to=<ISO>&tz=<IANA>
//   200 { tracked: true, since, views, starts, byDay, abandons, submitted? }
//   200 { tracked: false }   (V376 not run yet, nothing tracked, or any error)
//   400 { error }            (formId isn't a uuid)
//   403 { error }            (no such form, or the caller isn't a member)
//
// Service role, built here with no anon-key fallback (lib/forms-server.ts isn't
// on this branch). form_stats has no policies, so only this route reads it.
export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ tracked: false }, { headers: NO_STORE })
  try {
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const out = await handleStatsRequest(req.nextUrl.searchParams, {
      db: db as any,
      access: companyId => requireCompanyAccess(req, db, companyId),
    })
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch {
    return NextResponse.json({ tracked: false }, { headers: NO_STORE })
  }
}
