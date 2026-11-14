import { NextRequest, NextResponse } from 'next/server'
import { cronOr401 } from '@/lib/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { runPassSync, isMissingPassSchema } from '@/lib/passes/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Daily: class packs past their date expire, unfinished checkouts are
// cleared, and memberships due for renewal are checked with Stripe (a
// renewal, a failed payment or a cancellation the webhook didn't bring, as
// with a business on its own Stripe keys). Cron only.
export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    return NextResponse.json({ ok: true, ...(await runPassSync(db)) })
  } catch (e: any) {
    if (isMissingPassSchema(e)) return NextResponse.json({ ok: true, skipped: 'V436 not run' })
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
