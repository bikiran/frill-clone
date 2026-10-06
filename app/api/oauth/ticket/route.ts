import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { signValue } from '@/lib/oauth-state'

export const dynamic = 'force-dynamic'

const PURPOSES = ['meta', 'instagram', 'gmail', 'google_reviews']

// POST { companyId, purpose } → { ticket }. A member of the workspace gets a
// 10-minute ticket that the Connect start routes require (see lib/oauth-state).
export async function POST(req: NextRequest) {
  const { companyId, purpose } = await req.json().catch(() => ({}))
  if (!companyId || !PURPOSES.includes(purpose)) return NextResponse.json({ error: 'companyId and purpose required' }, { status: 400 })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  return NextResponse.json({ ticket: signValue({ kind: 'ticket', purpose, companyId, userId: access.userId }, 10 * 60 * 1000) })
}
