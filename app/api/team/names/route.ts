import { callerUser, isStaffRow } from '@/lib/company-access'
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

    const names: Record<string, { name: string | null; avatar_url: string | null; email: string | null }> = {}

    // Only people who share a workspace with the signed-in caller (this resolved
    // any user id on the platform to an email address for anyone).
    const caller = await callerUser(req, admin)
    if (!caller) return NextResponse.json({ names: {} }, { status: 401 })
    const [{ data: owned }, { data: mine }] = await Promise.all([
      admin.from('companies').select('id').eq('owner_id', caller.id),
      admin.from('team_members').select('company_id, role, status').eq('user_id', caller.id),
    ])
    const myCompanies = Array.from(new Set([...(owned || []).map((c: any) => c.id), ...(mine || []).filter(isStaffRow).map((m: any) => m.company_id)].filter(Boolean)))
    const allowed = new Set<string>([caller.id])
    if (myCompanies.length) {
      const [{ data: owners }, { data: mates }] = await Promise.all([
        admin.from('companies').select('owner_id').in('id', myCompanies),
        admin.from('team_members').select('user_id').in('company_id', myCompanies),
      ])
      for (const o of owners || []) if ((o as any).owner_id) allowed.add((o as any).owner_id)
      for (const m of mates || []) if ((m as any).user_id) allowed.add((m as any).user_id)
    }
    const wanted = new Set(userIds.filter((id: any) => id && allowed.has(id)))

    // getUserById is the precise lookup, but only when we have a real UUID.
    await Promise.all(Array.from(wanted).map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id)
        const u = data?.user
        if (u) {
          names[id] = {
            name: (u.user_metadata?.display_name as string) || (u.user_metadata?.full_name as string) || null,
            avatar_url: (u.user_metadata?.avatar_url as string) || null,
            email: (u.email as string) || null,
          }
        }
      } catch { /* skip ids that aren't auth users */ }
    }))

    // Owner-set overrides (COLVY_V307): a name/photo the owner set on the
    // team_members row wins over the member's own account values, so the edit
    // shows everywhere this resolver is used. select('*') keeps this working even
    // before the migration adds the columns.
    try {
      const { data: members } = await admin
        .from('team_members').select('*').in('user_id', Array.from(wanted))
      for (const m of members || []) {
        const id = (m as any).user_id
        if (!id) continue
        const prev = names[id] || { name: null, avatar_url: null, email: (m as any).email || null }
        names[id] = {
          name: (m as any).name || prev.name,
          avatar_url: (m as any).avatar_url || prev.avatar_url,
          email: prev.email || (m as any).email || null,
        }
      }
    } catch { /* columns may not exist yet — fall back to auth values */ }

    return NextResponse.json({ names })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, names: {} }, { status: 500 })
  }
}
