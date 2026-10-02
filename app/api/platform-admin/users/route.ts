import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

// GET: list all auth users, enriched with the companies they own.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    // Page through all auth users.
    const users: any[] = []
    for (let page = 1; page <= 25; page++) {
      const { data: list } = await (db.auth.admin as any).listUsers({ page, perPage: 200 })
      const batch = list?.users || []
      users.push(...batch)
      if (batch.length < 200) break
    }

    // Map owned companies per user.
    const { data: companies } = await db.from('companies').select('id, name, slug, owner_id, plan')
    const byId: Record<string, any> = {}
    const byOwner: Record<string, any[]> = {}
    ;(companies || []).forEach((c: any) => {
      byId[c.id] = c
      if (c.owner_id) { (byOwner[c.owner_id] = byOwner[c.owner_id] || []).push(c) }
    })

    // Map workspace MEMBERSHIPS per user (team_members), so an account that owns
    // nothing but belongs to a workspace is visible — and, crucially, so an
    // ORPHANED account (created but never linked to any workspace) stands out.
    const { data: memberRows } = await db.from('team_members')
      .select('user_id, company_id, role, status').not('user_id', 'is', null)
    const byMember: Record<string, any[]> = {}
    ;(memberRows || []).forEach((m: any) => {
      const co = m.company_id ? byId[m.company_id] : null
      if (!co) return
      ;(byMember[m.user_id] = byMember[m.user_id] || []).push({ id: co.id, name: co.name, slug: co.slug, role: m.role, status: m.status })
    })

    const result = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.display_name || u.user_metadata?.full_name || (u.email || '').split('@')[0],
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      confirmed: !!u.email_confirmed_at || !!u.confirmed_at,
      companies: byOwner[u.id] || [],
      memberships: byMember[u.id] || [],
    }))
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ users: result, total: result.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, users: [] }, { status: 500 })
  }
}
