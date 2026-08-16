import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * TEMPORARY diagnostic for web↔mobile pin sync.
 * GET /api/debug/pins?email=<login email>   (or ?companyId=<uuid>)
 *
 * Returns the conversation_pins rows so we can see whether a pin made on the
 * mobile app actually reached the shared table, and under which user_id — the
 * two things that decide whether the web inbox will show it. Remove once the
 * pin-sync issue is resolved.
 */
export async function GET(req: NextRequest) {
  try {
    const email = (req.nextUrl.searchParams.get('email') || '').toLowerCase().trim()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const db = admin()

    // Resolve the auth user id from the login email (so you don't need to know
    // your UUID). Pages through the auth user list until it finds a match.
    let resolvedUserId: string | null = null
    if (email) {
      for (let page = 1; page <= 20 && !resolvedUserId; page++) {
        const { data } = await (db as any).auth.admin.listUsers({ page, perPage: 200 })
        const users = data?.users || []
        const u = users.find((x: any) => (x.email || '').toLowerCase() === email)
        if (u) resolvedUserId = u.id
        if (users.length < 200) break
      }
    }

    let q = (db as any).from('conversation_pins')
      .select('user_id, conversation_id, company_id, created_at')
      .order('created_at', { ascending: false }).limit(500)
    if (resolvedUserId) q = q.eq('user_id', resolvedUserId)
    else if (companyId) q = q.eq('company_id', companyId)

    const { data: pins, error } = await q

    // ALSO fetch the newest rows table-wide, regardless of user_id — so a pin the
    // mobile app wrote under a DIFFERENT user_id (a mismatch the email filter
    // above would hide) still shows up here. After pinning once on mobile, the
    // newest row appears at the top; compare its user_id to resolvedUserId.
    const { data: recentAnyUser } = await (db as any).from('conversation_pins')
      .select('user_id, conversation_id, company_id, created_at')
      .order('created_at', { ascending: false }).limit(30)

    // Summarise per user_id / company_id so a mismatch is obvious at a glance.
    const byUser: Record<string, number> = {}
    const byCompany: Record<string, number> = {}
    for (const p of pins || []) {
      byUser[p.user_id] = (byUser[p.user_id] || 0) + 1
      byCompany[String(p.company_id)] = (byCompany[String(p.company_id)] || 0) + 1
    }

    return NextResponse.json({
      queriedEmail: email || null,
      resolvedUserId,
      totalRowsForThisUser: pins?.length || 0,
      countByUserId: byUser,
      countByCompanyId: byCompany,
      pinsForThisUser: pins || [],
      recentAnyUser: recentAnyUser || [],
      error: error?.message || null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
