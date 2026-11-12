import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { companyLimit } from '@/lib/plan'
import { forwardingUsage } from '@/lib/forwarding-usage'

export const dynamic = 'force-dynamic'

// This month's forwarded call minutes against the plan's allowance
// (lib/forwarding-usage), for Billing and the Call routing card.
//
// GET ?companyId= → { usage: { period, minutes, calls, included, over, overCents, rateCents } }
//   `included` is null when the plan doesn't meter forwarding (Inbox and up).
// Staff of the business.

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId') || ''
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db: any = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const included = await companyLimit(db, companyId, 'forwardMinutes')
    const u = await forwardingUsage(db, companyId, included)
    return NextResponse.json({ usage: { ...u, included: Number.isFinite(u.included) ? u.included : null } })
  } catch (err: any) {
    return NextResponse.json({ error: 'Couldn’t load this month’s forwarded minutes.' }, { status: 500 })
  }
}
