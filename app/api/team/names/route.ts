import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/team/names  { userIds: string[] }
 *
 * Returns { [userId]: { name, avatar_url } } from auth user_metadata.
 *
 * Display names live in each user's auth metadata (display_name), which the
 * client can only read for the CURRENT user. team_members.name is usually
 * blank, so the team list fell back to the email username. This resolves the
 * real profile names server-side with the service-role key.
 */
export async function POST(req: NextRequest) {
  try {
    const { userIds } = await req.json()
    if (!Array.isArray(userIds) || userIds.length === 0) return NextResponse.json({ names: {} })
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key) return NextResponse.json({ names: {} })

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const names: Record<string, { name: string | null; avatar_url: string | null }> = {}
    const wanted = new Set(userIds.filter(Boolean))

    // getUserById is the precise lookup, but only when we have a real UUID.
    await Promise.all(Array.from(wanted).map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id)
        const u = data?.user
        if (u) {
          names[id] = {
            name: (u.user_metadata?.display_name as string) || (u.user_metadata?.full_name as string) || null,
            avatar_url: (u.user_metadata?.avatar_url as string) || null,
          }
        }
      } catch { /* skip ids that aren't auth users */ }
    }))

    return NextResponse.json({ names })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, names: {} }, { status: 500 })
  }
}
