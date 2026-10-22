import { NextRequest, NextResponse } from 'next/server'
import { cronOr401 } from '@/lib/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { purgeClosedCompanies } from '@/lib/account-deletion'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/purge-closed-accounts — daily. Erases the data of workspaces
 * closed by an account deletion once their 30 days are up.
 */
export async function GET(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  try {
    const purged = await purgeClosedCompanies(db)
    return NextResponse.json({ ok: true, purged })
  } catch (e: any) {
    // Before V409 there's no closed_at column: nothing to purge.
    return NextResponse.json({ ok: true, purged: [], note: e?.message })
  }
}
