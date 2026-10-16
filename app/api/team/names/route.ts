import { callerUser, isStaffRow } from '@/lib/company-access'
import { isUuid } from '@/lib/team-management'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// The most ids one request resolves. A page builds its list from one read,
// which returns at most 1,000 rows; ids past this come back without a name.
const MAX_IDS = 1000
// Ids per team_members lookup, so the request URL stays short.
const CHUNK = 200

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
    const ids = Array.from(new Set(userIds.filter(isUuid))).slice(0, MAX_IDS)
    const [{ data: owned }, { data: mine }] = await Promise.all([
      admin.from('companies').select('id').eq('owner_id', caller.id),
      admin.from('team_members').select('company_id, role, status').eq('user_id', caller.id),
    ])
    const myCompanies = Array.from(new Set([...(owned || []).map((c: any) => c.id), ...(mine || []).filter(isStaffRow).map((m: any) => m.company_id)].filter(Boolean)))
    // Look up only the ids asked about. Reading the whole team stopped at 1,000
    // rows, and every visitor who signs in on a board gets a 'viewer' row, so
    // on a busy board staff who joined later were left out: no name on Team,
    // and "System" against their changes in Audit Logs.
    const allowed = new Set<string>([caller.id])
    const rows: any[] = []
    if (myCompanies.length && ids.length) {
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))
      const [{ data: owners }, ...found] = await Promise.all([
        admin.from('companies').select('owner_id').in('id', myCompanies),
        // select('*') keeps this working before COLVY_V307 adds name/avatar_url.
        ...chunks.map(chunk => admin.from('team_members').select('*').in('company_id', myCompanies).in('user_id', chunk)),
      ])
      for (const o of owners || []) if ((o as any).owner_id) allowed.add((o as any).owner_id)
      for (const { data } of found) for (const m of data || []) {
        if (!(m as any).user_id) continue
        allowed.add((m as any).user_id)
        rows.push(m)
      }
    }
    const wanted = ids.filter(id => allowed.has(id))

    // getUserById is the precise lookup, but only when we have a real UUID.
    await Promise.all(wanted.map(async (id) => {
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
    // shows everywhere this resolver is used. Only rows in the caller's own
    // workspaces: another business's name for the same person isn't theirs to see.
    for (const m of rows) {
      const id = (m as any).user_id
      const prev = names[id] || { name: null, avatar_url: null, email: (m as any).email || null }
      names[id] = {
        name: (m as any).name || prev.name,
        avatar_url: (m as any).avatar_url || prev.avatar_url,
        email: prev.email || (m as any).email || null,
      }
    }

    return NextResponse.json({ names })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, names: {} }, { status: 500 })
  }
}
