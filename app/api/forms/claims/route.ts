import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleClaimsRequest } from '@/components/form-results/claims-core'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Which response first claimed each payment / booking, across every form of
// the caller's company, so Results only count a real payment once (members of
// the form's workspace only). POST because the id lists can be long.
//
// POST { formId, paymentIds: uuid[], eventIds: uuid[] }
//   200 { payments: { <id>: { responseId, formId, questionId, createdAt } }, events: { … } }
//   400 { error }   bad formId or id lists (at most 10,000 each)
//   403 { error }   no such form, or the caller isn't a member
//   502 { error }   a read failed (Results then show payments as unverified)
//
// Service role, built here with no anon-key fallback; scoped to the form's company.
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 502, headers: NO_STORE })
  let body: unknown
  try {
    const text = await req.text()
    if (text.length > 1_000_000) return NextResponse.json({ error: 'Too many ids' }, { status: 400, headers: NO_STORE })
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE })
  }
  try {
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const out = await handleClaimsRequest(body, { db: db as any, access: companyId => requireCompanyAccess(req, db, companyId) })
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Could not check' }, { status: 502, headers: NO_STORE })
  }
}
