import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const uuid = (v: any): string | null =>
  (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null

/**
 * GET /api/team/profile?username=&companyId=
 *
 * One public profile, by the username in the URL.
 *
 * The page used to read `team_members` straight from the browser on the anon
 * key, which meant that table had to be readable by anyone — and `SELECT *`
 * against it returned every staff member of every company on the platform:
 * email, role, user_id, company. A profile page needing one row kept the whole
 * directory open.
 *
 * This returns that one row, for a username the caller already knows, in a
 * company they already named. The email is included because the profile page
 * displays it and filters the person's ideas and announcements by it — the
 * behaviour is unchanged on purpose. What goes away is the ability to
 * enumerate.
 */
export async function GET(req: NextRequest) {
  const username = (req.nextUrl.searchParams.get('username') || '').trim()
  const companyId = uuid(req.nextUrl.searchParams.get('companyId'))
  if (!username || !companyId) return NextResponse.json({ member: null }, { status: 400 })

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ member: null }, { status: 500 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any

  const { data } = await db.from('team_members')
    .select('email, username, role, created_at')
    .eq('username', username)
    .eq('company_id', companyId)
    .maybeSingle()

  return NextResponse.json({ member: data || null })
}
