import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const { data } = await db.auth.getUser(token)
    return data?.user?.email === SUPER_ADMIN
  } catch { return false }
}

// GET ?email= — given a person's email, which Colvy workspaces do they own or
// belong to? Lets a super-admin, while looking at a contact in any workspace,
// see and jump to the customer workspace that person administers. Super-admin
// only (403s for everyone, so it's invisible to normal agents).
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ workspaces: [] })

    // Find the auth user for this email (owner match runs off the user id).
    let userId: string | null = null
    try {
      for (let page = 1; page <= 25; page++) {
        const { data: list } = await (db.auth.admin as any).listUsers({ page, perPage: 200 })
        const batch = list?.users || []
        const hit = batch.find((u: any) => (u.email || '').toLowerCase() === email)
        if (hit) { userId = hit.id; break }
        if (batch.length < 200) break
      }
    } catch {}

    const found = new Map<string, any>() // company_id -> { …, role }

    // Owned workspaces.
    if (userId) {
      const { data: owned } = await db.from('companies')
        .select('id, name, slug, plan, trial_ends_at').eq('owner_id', userId)
      ;(owned || []).forEach((c: any) => found.set(c.id, { ...c, role: 'owner' }))
    }

    // Team memberships (matched by email — covers members who aren't the owner).
    const { data: members } = await db.from('team_members')
      .select('company_id, role, status').ilike('email', email)
    const memberIds = (members || []).map((m: any) => m.company_id).filter(Boolean)
    if (memberIds.length) {
      const { data: cos } = await db.from('companies')
        .select('id, name, slug, plan, trial_ends_at').in('id', memberIds)
      const roleById: Record<string, any> = {}
      ;(members || []).forEach((m: any) => { if (m.company_id) roleById[m.company_id] = m })
      ;(cos || []).forEach((c: any) => {
        if (!found.has(c.id)) found.set(c.id, { ...c, role: roleById[c.id]?.role || 'member' })
      })
    }

    return NextResponse.json({ workspaces: Array.from(found.values()) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed', workspaces: [] }, { status: 500 })
  }
}
